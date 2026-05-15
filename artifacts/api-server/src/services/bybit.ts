import crypto from "crypto";
import { logger } from "../lib/logger.js";
import { getCryptoPredictions } from "./predictions.js";
import { analyzeSymbol } from "./analysis.js";

const BYBIT_BASE = "https://api.bybit.com";
const API_KEY = process.env.BYBIT_API_KEY ?? "";
const API_SECRET = process.env.BYBIT_API_SECRET ?? "";
const RECV_WINDOW = "5000";

// ─── Auto-trading state (in-memory) ───────────────────────────────────────────

export interface AutoTradingConfig {
  enabled: boolean;
  mode: "auto" | "semi";
  minConfidence: number;
  maxPositionUSDT: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPositions: number;
  leverage: number;
  intervalMs: number;
  orderType: "Market" | "Limit";
  limitOffsetPct: number; // buy this % below current price for limit orders
  scanSource: "universe" | "predictions";
}

export const autoConfig: AutoTradingConfig = {
  enabled: false,
  mode: "semi",
  minConfidence: 80,
  maxPositionUSDT: 50,
  stopLossPct: 2,
  takeProfitPct: 4,
  maxPositions: 5,
  leverage: 1,
  intervalMs: 60_000,
  orderType: "Market",
  limitOffsetPct: 0.3,
  scanSource: "universe",
};

export const tradeLog: TradeLogEntry[] = [];

export interface TradeLogEntry {
  id: string;
  timestamp: number;
  symbol: string;
  side: "Buy" | "Sell";
  qty: string;
  price: number;
  confidence: number;
  signal: string;
  status: "executed" | "pending" | "rejected" | "cancelled";
  reason?: string;
  orderId?: string;
}

// ─── Signing helpers ───────────────────────────────────────────────────────────

function sign(timestamp: string, params: string): string {
  const raw = `${timestamp}${API_KEY}${RECV_WINDOW}${params}`;
  return crypto.createHmac("sha256", API_SECRET).update(raw).digest("hex");
}

async function bybitGet<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(query).toString();
  const timestamp = String(Date.now());
  const signature = sign(timestamp, qs);

  const url = `${BYBIT_BASE}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: {
      "X-BAPI-API-KEY": API_KEY,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
    },
  });

  const data = (await res.json()) as { retCode: number; retMsg: string; result: T };
  if (data.retCode !== 0) throw new Error(`Bybit: ${data.retMsg} (${data.retCode})`);
  return data.result;
}

async function bybitPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const timestamp = String(Date.now());
  const bodyStr = JSON.stringify(body);
  const signature = sign(timestamp, bodyStr);

  const res = await fetch(`${BYBIT_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": API_KEY,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
    },
    body: bodyStr,
  });

  const data = (await res.json()) as { retCode: number; retMsg: string; result: T };
  if (data.retCode !== 0) throw new Error(`Bybit: ${data.retMsg} (${data.retCode})`);
  return data.result;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function getWalletBalance() {
  return bybitGet<unknown>("/v5/account/wallet-balance", { accountType: "UNIFIED" });
}

export async function getPositions() {
  return bybitGet<unknown>("/v5/position/list", {
    category: "linear",
    settleCoin: "USDT",
  });
}

export async function getOpenOrders() {
  return bybitGet<unknown>("/v5/order/realtime", {
    category: "linear",
    settleCoin: "USDT",
  });
}

// ─── Price formatting ──────────────────────────────────────────────────────────

/**
 * Format price to the correct decimal precision for Bybit.
 * Uses price magnitude to guess tick size — avoids needing instrument info API.
 */
export function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(1);
  if (price >= 1000) return price.toFixed(2);
  if (price >= 10) return price.toFixed(3);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(5);
  return price.toFixed(6);
}

/**
 * Format quantity respecting Bybit's minimum lot sizes.
 * Rounds to appropriate precision based on coin price (proxy for step size).
 */
export function formatQty(rawQty: number, coinPrice: number): string {
  let qty: number;
  if (coinPrice >= 10000) {
    // BTC-like: step 0.001, min 0.001
    qty = Math.max(0.001, Math.floor(rawQty * 1000) / 1000);
    return qty.toFixed(3);
  }
  if (coinPrice >= 100) {
    // ETH/BNB-like: step 0.01, min 0.01
    qty = Math.max(0.01, Math.floor(rawQty * 100) / 100);
    return qty.toFixed(2);
  }
  if (coinPrice >= 1) {
    // UNI/SOL/LINK-like: step 0.1, min 1
    qty = Math.max(1, Math.floor(rawQty * 10) / 10);
    return qty.toFixed(1);
  }
  // DOGE/XRP/ADA-like: step 1, min 10
  qty = Math.max(10, Math.floor(rawQty));
  return qty.toFixed(0);
}

// ─── Order placement ───────────────────────────────────────────────────────────

export interface PlaceOrderParams {
  symbol: string;
  side: "Buy" | "Sell";
  qty: string;
  orderType?: "Market" | "Limit";
  price?: number; // required for Limit orders
}

/**
 * Place a market or limit order — NO inline TP/SL.
 * TP/SL must be set separately via setPositionTPSL after fill.
 */
export async function placeOrder(params: PlaceOrderParams) {
  const type = params.orderType ?? "Market";

  const body: Record<string, unknown> = {
    category: "linear",
    symbol: params.symbol,
    side: params.side,
    orderType: type,
    qty: params.qty,
    timeInForce: type === "Limit" ? "GTC" : "IOC",
  };

  if (type === "Limit" && params.price != null && params.price > 0) {
    body.price = formatPrice(params.price);
  }

  if (autoConfig.leverage > 1) {
    await bybitPost("/v5/position/set-leverage", {
      category: "linear",
      symbol: params.symbol,
      buyLeverage: String(autoConfig.leverage),
      sellLeverage: String(autoConfig.leverage),
    }).catch(() => {});
  }

  return bybitPost<{ orderId: string }>("/v5/order/create", body);
}

// ─── Position TP/SL ────────────────────────────────────────────────────────────

export interface SetTPSLParams {
  symbol: string;
  takeProfit?: number;
  stopLoss?: number;
}

/**
 * Set TP/SL on an existing position.
 * Uses /v5/position/trading-stop which is the correct endpoint.
 */
export async function setPositionTPSL(params: SetTPSLParams) {
  const body: Record<string, unknown> = {
    category: "linear",
    symbol: params.symbol,
    tpslMode: "Full",
    tpOrderType: "Market",
    slOrderType: "Market",
  };

  if (params.takeProfit !== undefined && params.takeProfit > 0) {
    body.takeProfit = formatPrice(params.takeProfit);
  }
  if (params.stopLoss !== undefined && params.stopLoss > 0) {
    body.stopLoss = formatPrice(params.stopLoss);
  }

  return bybitPost<unknown>("/v5/position/trading-stop", body);
}

export async function cancelOrder(orderId: string, symbol: string) {
  return bybitPost<unknown>("/v5/order/cancel", {
    category: "linear",
    symbol,
    orderId,
  });
}

// ─── Symbol mapping ────────────────────────────────────────────────────────────

const SYMBOL_MAP: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT",
  XRP: "XRPUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT", MATIC: "MATICUSDT",
  DOT: "DOTUSDT", LINK: "LINKUSDT", AVAX: "AVAXUSDT", UNI: "UNIUSDT",
  ATOM: "ATOMUSDT", LTC: "LTCUSDT", ETC: "ETCUSDT", BCH: "BCHUSDT",
  NEAR: "NEARUSDT", APT: "APTUSDT", OP: "OPUSDT", ARB: "ARBUSDT",
  FIL: "FILUSDT", HBAR: "HBARUSDT", VET: "VETUSDT", TRX: "TRXUSDT",
  TON: "TONUSDT", SUI: "SUIUSDT", SEI: "SEIUSDT", INJ: "INJUSDT",
  PEPE: "PEPEUSDT", WIF: "WIFUSDT", FET: "FETUSDT", RENDER: "RENDERUSDT",
};

export function toBybitSymbol(symbol: string): string | null {
  const s = symbol.toUpperCase();
  return SYMBOL_MAP[s] ?? (s.endsWith("USDT") ? s : null);
}

// ─── Signal scanner (predictions-based) ───────────────────────────────────────

export async function getHighConfidenceSignals() {
  const preds = await getCryptoPredictions(50);
  return preds
    .filter(
      (p) =>
        (p.signal === "strong_buy" || p.signal === "buy") &&
        p.confidence >= autoConfig.minConfidence &&
        toBybitSymbol(p.symbol) !== null &&
        p.currentPrice > 0
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
    .map((p) => ({
      assetId: p.assetId,
      symbol: p.symbol,
      bybitSymbol: toBybitSymbol(p.symbol)!,
      signal: p.signal as "strong_buy" | "buy",
      confidence: p.confidence,
      price: p.currentPrice,
      riskLevel: p.riskLevel,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
    }));
}

// ─── Bybit Universe Scanner ────────────────────────────────────────────────────

interface BybitTicker {
  symbol: string;
  lastPrice: string;
  price24hPcnt: string;
  turnover24h: string;
  highPrice24h: string;
  lowPrice24h: string;
  volume24h: string;
}

export interface UniverseCandidate {
  symbol: string;
  price: number;
  change24h: number;
  volume24hUsdt: number;
  score: number;
  signal: "strong_buy" | "buy";
  confidence: number;
  limitPrice: number;
}

// Skip coins with known lot-size / liquidity issues
const UNIVERSE_BLACKLIST = new Set([
  "LUNA2USDT", "LUNAUSDT", "USTCUSDT", "BTTUSDT", "BTTCUSDT",
  "SHIBUSDT", "PEPE1000USDT", "LUNCUSDT",
]);

// Cache for 45 seconds to avoid hammering the public endpoint
let universeCache: { list: UniverseCandidate[]; at: number } | null = null;
const UNIVERSE_TTL = 45_000;

export async function scanBybitUniverse(): Promise<UniverseCandidate[]> {
  if (universeCache && Date.now() - universeCache.at < UNIVERSE_TTL) {
    return universeCache.list;
  }

  // Public endpoint — no auth needed
  const res = await fetch(`${BYBIT_BASE}/v5/market/tickers?category=linear`);
  const data = (await res.json()) as {
    retCode: number;
    result: { list: BybitTicker[] };
  };
  if (data.retCode !== 0) throw new Error(`Bybit tickers: retCode ${data.retCode}`);

  const candidates: UniverseCandidate[] = [];

  for (const t of data.result.list) {
    if (!t.symbol.endsWith("USDT")) continue;
    if (t.symbol.includes("PERP")) continue;
    if (UNIVERSE_BLACKLIST.has(t.symbol)) continue;

    const price      = parseFloat(t.lastPrice);
    const change24h  = parseFloat(t.price24hPcnt) * 100; // → %
    const turnover   = parseFloat(t.turnover24h);         // USDT volume
    const high24h    = parseFloat(t.highPrice24h);
    const low24h     = parseFloat(t.lowPrice24h);

    if (price < 0.001)          continue; // too cheap → lot-size problems
    if (turnover < 2_000_000)   continue; // min 2M USDT/day liquidity
    if (change24h < 0.5)        continue; // must be moving up
    if (change24h > 30)         continue; // skip extreme pumps

    // Recovery = where is current price in today's range (0=at low, 1=at high)
    const range    = high24h - low24h;
    const recovery = range > 0 ? (price - low24h) / range : 0.5;

    // Score: momentum × volume_weight × range_position
    const score = change24h * Math.log10(Math.max(turnover, 1)) * (0.4 + recovery * 0.6);

    const signal: "strong_buy" | "buy" = change24h >= 4 ? "strong_buy" : "buy";
    const confidence = Math.min(99, Math.round(45 + score * 0.7));

    // Limit price: offset % below current market price
    const limitPrice = price * (1 - autoConfig.limitOffsetPct / 100);

    candidates.push({ symbol: t.symbol, price, change24h, volume24hUsdt: turnover, score, signal, confidence, limitPrice });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 20);
  universeCache = { list: top, at: Date.now() };
  logger.info({ total: data.result.list.length, passed: candidates.length, top: top.length }, "Bybit universe scan complete");
  return top;
}

// ─── Engine status tracking ────────────────────────────────────────────────────

export interface EngineStatus {
  running: boolean;
  analyzing: boolean;
  lastCycleAt: number | null;
  nextCycleAt: number | null;
  cycleCount: number;
  lastSignalsFound: number;
  lastOrdersPlaced: number;
  lastError: string | null;
  totalScanned: number;
  scanSource: "universe" | "predictions";
  orderType: "Market" | "Limit";
}

export const engineStatus: EngineStatus = {
  running: false,
  analyzing: false,
  lastCycleAt: null,
  nextCycleAt: null,
  cycleCount: 0,
  lastSignalsFound: 0,
  lastOrdersPlaced: 0,
  lastError: null,
  totalScanned: 0,
  scanSource: "universe",
  orderType: "Market",
};

// ─── Auto-trading engine ───────────────────────────────────────────────────────

let autoInterval: ReturnType<typeof setInterval> | null = null;

async function runAutoTradeCycle() {
  if (!autoConfig.enabled || autoConfig.mode !== "auto") return;

  engineStatus.analyzing = true;
  engineStatus.lastError = null;
  engineStatus.scanSource = autoConfig.scanSource;
  engineStatus.orderType = autoConfig.orderType;
  logger.info({ scanSource: autoConfig.scanSource, orderType: autoConfig.orderType }, "Auto-trade cycle started");

  try {
    // ── 1. Scan for candidates ───────────────────────────────────────────────
    let candidates: Array<{
      symbol: string; price: number; confidence: number;
      signal: string; limitPrice: number;
    }>;

    if (autoConfig.scanSource === "universe") {
      const raw = await scanBybitUniverse();
      engineStatus.totalScanned = raw.length;
      candidates = raw
        .filter((c) => c.confidence >= autoConfig.minConfidence)
        .map((c) => ({
          symbol: c.symbol,
          price: c.price,
          confidence: c.confidence,
          signal: c.signal,
          limitPrice: c.limitPrice,
        }));
    } else {
      const raw = await getHighConfidenceSignals();
      engineStatus.totalScanned = raw.length;
      candidates = raw.map((c) => ({
        symbol: c.bybitSymbol,
        price: c.price,
        confidence: c.confidence,
        signal: c.signal,
        limitPrice: c.price * (1 - autoConfig.limitOffsetPct / 100),
      }));
    }

    engineStatus.lastSignalsFound = candidates.length;
    if (candidates.length === 0) {
      logger.info("No candidates found this cycle");
      return;
    }

    // ── 2. Get current state ─────────────────────────────────────────────────
    const posResult = await getPositions() as { list: { symbol: string }[] };
    const activeSymbols = new Set((posResult.list ?? []).map((p) => p.symbol));

    const balResult = await getWalletBalance() as {
      list: { coin: { coin: string; walletBalance: string }[] }[];
    };
    const usdtCoin = balResult.list?.[0]?.coin?.find((c) => c.coin === "USDT");
    const availableUSDT = parseFloat(usdtCoin?.walletBalance ?? "0");

    // Max per trade: smaller of config limit or 20% of available balance
    const maxPerTrade = Math.min(autoConfig.maxPositionUSDT, availableUSDT * 0.2);

    // ── 3. Execute orders (with full AI analysis gate) ───────────────────────
    let ordersPlaced = 0;

    for (const cand of candidates) {
      if (activeSymbols.size >= autoConfig.maxPositions) break;
      if (activeSymbols.has(cand.symbol)) continue;

      // ── Full technical analysis gate ─────────────────────────────────────
      let analysis: Awaited<ReturnType<typeof analyzeSymbol>> | null = null;
      try {
        analysis = await analyzeSymbol(cand.symbol);
      } catch (err) {
        logger.warn({ err, symbol: cand.symbol }, "Analysis unavailable, skipping");
        tradeLog.unshift({
          id: crypto.randomUUID(), timestamp: Date.now(),
          symbol: cand.symbol, side: "Buy", qty: "0", price: cand.price,
          confidence: cand.confidence, signal: cand.signal,
          status: "rejected", reason: `Analysis failed: ${String(err)}`,
        });
        if (tradeLog.length > 200) tradeLog.splice(200);
        continue;
      }

      if (!analysis.shouldEnter) {
        logger.info({ symbol: cand.symbol, reason: analysis.waitReason }, "Entry skipped by analysis");
        tradeLog.unshift({
          id: crypto.randomUUID(), timestamp: Date.now(),
          symbol: cand.symbol, side: "Buy", qty: "0", price: cand.price,
          confidence: analysis.overallConfidence, signal: cand.signal,
          status: "rejected",
          reason: analysis.waitReason ?? "Kondisi belum optimal",
        });
        if (tradeLog.length > 200) tradeLog.splice(200);
        continue;
      }

      const execPrice = autoConfig.orderType === "Limit" ? cand.limitPrice : cand.price;
      const qty = formatQty(maxPerTrade / execPrice, execPrice);
      const slPrice = analysis.stopLoss > 0 ? analysis.stopLoss : execPrice * (1 - autoConfig.stopLossPct / 100);
      const tpPrice = analysis.takeProfit > 0 ? analysis.takeProfit : execPrice * (1 + autoConfig.takeProfitPct / 100);
      const reasonSummary = analysis.reasons.slice(0, 2).join(" | ");

      const logEntry: TradeLogEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        symbol: cand.symbol,
        side: "Buy",
        qty,
        price: execPrice,
        confidence: analysis.overallConfidence,
        signal: cand.signal,
        status: "pending",
        reason: reasonSummary,
      };

      try {
        const order = await placeOrder({
          symbol: cand.symbol,
          side: "Buy",
          qty,
          orderType: autoConfig.orderType,
          price: autoConfig.orderType === "Limit" ? cand.limitPrice : undefined,
        });

        if (autoConfig.orderType === "Market") {
          await setPositionTPSL({ symbol: cand.symbol, takeProfit: tpPrice, stopLoss: slPrice })
            .catch((e) => logger.warn({ e, symbol: cand.symbol }, "Failed to set TP/SL"));
        }

        logEntry.status = "executed";
        logEntry.orderId = order.orderId;
        activeSymbols.add(cand.symbol);
        ordersPlaced++;
        logger.info(
          { symbol: cand.symbol, qty, orderType: autoConfig.orderType, orderId: order.orderId,
            confidence: analysis.overallConfidence, confirmations: analysis.confirmations },
          "Auto-trade placed (passed full analysis)"
        );
      } catch (err) {
        logEntry.status = "rejected";
        logEntry.reason = String(err);
        logger.warn({ err, symbol: cand.symbol }, "Auto-trade order failed");
      }

      tradeLog.unshift(logEntry);
      if (tradeLog.length > 200) tradeLog.splice(200);
    }

    engineStatus.lastOrdersPlaced = ordersPlaced;
  } catch (err) {
    logger.error({ err }, "Auto-trade cycle error");
    engineStatus.lastError = String(err);
  } finally {
    engineStatus.analyzing = false;
    engineStatus.lastCycleAt = Date.now();
    engineStatus.cycleCount++;
    engineStatus.nextCycleAt = Date.now() + autoConfig.intervalMs;
  }
}

export function startAutoEngine() {
  if (autoInterval) clearInterval(autoInterval);
  engineStatus.running = true;
  engineStatus.nextCycleAt = Date.now() + autoConfig.intervalMs;
  autoInterval = setInterval(() => {
    engineStatus.nextCycleAt = Date.now() + autoConfig.intervalMs;
    void runAutoTradeCycle();
  }, autoConfig.intervalMs);
  logger.info({ intervalMs: autoConfig.intervalMs }, "Auto-trading engine started");
}

export function stopAutoEngine() {
  if (autoInterval) {
    clearInterval(autoInterval);
    autoInterval = null;
  }
  engineStatus.running = false;
  engineStatus.analyzing = false;
  engineStatus.nextCycleAt = null;
  logger.info("Auto-trading engine stopped");
}
