import crypto from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import { getCryptoPredictions } from "./predictions.js";
import { analyzeSymbol } from "./analysis.js";
import { logActivity } from "./activity-log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const CONFIG_FILE = join(DATA_DIR, "trading-config.json");
const TRADE_LOG_FILE = join(DATA_DIR, "trade-log.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

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
  limitOffsetPct: number;
  scanSource: "universe" | "predictions";
  // ── Scalping ──────────────────────────────────────────────────────────────
  scalpEnabled: boolean;    // auto-close all positions when net profit >= target
  scalpTargetUSDT: number;  // net profit target after Bybit taker fees
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
  scalpEnabled: false,
  scalpTargetUSDT: 1.0,
};

export const tradeLog: TradeLogEntry[] = [];

// ─── Config + TradeLog Persistence ────────────────────────────────────────────

(function loadTradingConfig() {
  try {
    ensureDataDir();
    if (!existsSync(CONFIG_FILE)) return;
    const saved = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Partial<AutoTradingConfig>;
    Object.assign(autoConfig, saved);
    logger.info({ config: autoConfig }, "Trading config loaded from disk");
  } catch (err) {
    logger.warn({ err }, "Failed to load trading config");
  }
})();

export function saveTradingConfig() {
  try {
    ensureDataDir();
    writeFileSync(CONFIG_FILE, JSON.stringify(autoConfig, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to save trading config");
  }
}

(function loadTradeLog() {
  try {
    ensureDataDir();
    if (!existsSync(TRADE_LOG_FILE)) return;
    const saved = JSON.parse(readFileSync(TRADE_LOG_FILE, "utf-8")) as TradeLogEntry[];
    tradeLog.push(...saved.slice(0, 500));
    logger.info({ count: tradeLog.length }, "Trade log loaded from disk");
  } catch (err) {
    logger.warn({ err }, "Failed to load trade log");
  }
})();

export function saveTradeLog() {
  try {
    ensureDataDir();
    writeFileSync(TRADE_LOG_FILE, JSON.stringify(tradeLog.slice(0, 500), null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to save trade log");
  }
}

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
 * Ensures order value >= MIN_ORDER_USDT ($5) to avoid Bybit error 110094.
 */
const MIN_ORDER_USDT = 5.5; // slightly above $5 to give headroom

export function formatQty(rawQty: number, coinPrice: number): string {
  // Ensure raw qty is enough to clear the $5 minimum
  const minQtyForMinOrder = coinPrice > 0 ? MIN_ORDER_USDT / coinPrice : rawQty;
  const safeRaw = Math.max(rawQty, minQtyForMinOrder);

  let qty: number;
  if (coinPrice >= 10000) {
    qty = Math.max(0.001, Math.floor(safeRaw * 1000) / 1000);
    return qty.toFixed(3);
  }
  if (coinPrice >= 100) {
    qty = Math.max(0.01, Math.floor(safeRaw * 100) / 100);
    return qty.toFixed(2);
  }
  if (coinPrice >= 1) {
    qty = Math.max(1, Math.floor(safeRaw * 10) / 10);
    return qty.toFixed(1);
  }
  qty = Math.max(10, Math.floor(safeRaw));
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
 * Set TP/SL on an existing position via /v5/position/trading-stop.
 * positionIdx=0 = one-way mode (default for most accounts).
 * Waits `delayMs` before calling to let a freshly placed market order settle.
 */
export async function setPositionTPSL(params: SetTPSLParams, delayMs = 0) {
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

  const body: Record<string, unknown> = {
    category: "linear",
    symbol: params.symbol,
    positionIdx: 0,          // one-way mode — required by Bybit
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

/**
 * Close an existing position by placing a reduceOnly opposite order.
 * side = the NEW order side (opposite of position):
 *   to close a LONG (Buy position) → pass side="Sell"
 *   to close a SHORT (Sell position) → pass side="Buy"
 */
export async function closePosition(symbol: string, side: "Buy" | "Sell", qty: string) {
  return bybitPost<{ orderId: string }>("/v5/order/create", {
    category: "linear",
    symbol,
    side,
    orderType: "Market",
    qty,
    timeInForce: "IOC",
    reduceOnly: true,
  });
}

/**
 * Close ALL open positions — fetches current positions and places a reduceOnly
 * opposite market order for each one.
 */
export async function closeAllPositions(): Promise<{ closed: number; errors: string[] }> {
  const result = await bybitGet<{ list: Array<{ symbol: string; side: string; size: string }> }>(
    "/v5/position/list",
    { category: "linear", settleCoin: "USDT" }
  );
  const positions = (result.list ?? []).filter((p) => parseFloat(p.size) > 0);
  const errors: string[] = [];
  let closed = 0;

  await Promise.allSettled(
    positions.map(async (p) => {
      try {
        const closeSide = p.side === "Buy" ? "Sell" : "Buy";
        await closePosition(p.symbol, closeSide as "Buy" | "Sell", p.size);
        closed++;
        logger.info({ symbol: p.symbol, side: p.side, size: p.size }, "closeAllPositions: closed");
      } catch (err) {
        logger.error({ symbol: p.symbol, err }, "closeAllPositions: failed to close");
        errors.push(`${p.symbol}: ${String(err)}`);
      }
    })
  );

  return { closed, errors };
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
  const mapped = preds
    .filter(
      (p) =>
        (p.signal === "strong_buy" || p.signal === "buy" || p.signal === "strong_sell" || p.signal === "sell") &&
        p.confidence >= autoConfig.minConfidence &&
        toBybitSymbol(p.symbol) !== null &&
        p.currentPrice > 0
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20)
    .map((p) => {
      const isSell = p.signal === "strong_sell" || p.signal === "sell";
      return {
        assetId: p.assetId,
        symbol: p.symbol,
        bybitSymbol: toBybitSymbol(p.symbol)!,
        signal: p.signal as "strong_buy" | "buy" | "strong_sell" | "sell",
        side: (isSell ? "Sell" : "Buy") as "Buy" | "Sell",
        confidence: p.confidence,
        price: p.currentPrice,
      };
    });
  return mapped;
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
  signal: "strong_buy" | "buy" | "strong_sell" | "sell";
  side: "Buy" | "Sell";
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

  const res = await fetch(`${BYBIT_BASE}/v5/market/tickers?category=linear`);
  const data = (await res.json()) as { retCode: number; result: { list: BybitTicker[] } };
  if (data.retCode !== 0) throw new Error(`Bybit tickers: retCode ${data.retCode}`);

  const longs: UniverseCandidate[] = [];
  const shorts: UniverseCandidate[] = [];

  for (const t of data.result.list) {
    if (!t.symbol.endsWith("USDT")) continue;
    if (t.symbol.includes("PERP")) continue;
    if (UNIVERSE_BLACKLIST.has(t.symbol)) continue;

    const price     = parseFloat(t.lastPrice);
    const change24h = parseFloat(t.price24hPcnt) * 100;
    const turnover  = parseFloat(t.turnover24h);
    const high24h   = parseFloat(t.highPrice24h);
    const low24h    = parseFloat(t.lowPrice24h);

    if (price < 0.001)       continue;
    if (turnover < 2_000_000) continue;

    const range    = high24h - low24h;
    const recovery = range > 0 ? (price - low24h) / range : 0.5;

    // ── LONG candidates: moving up ──────────────────────────────────────────
    if (change24h >= 0.5 && change24h <= 30) {
      const score = change24h * Math.log10(Math.max(turnover, 1)) * (0.4 + recovery * 0.6);
      const signal: "strong_buy" | "buy" = change24h >= 4 ? "strong_buy" : "buy";
      const confidence = Math.min(99, Math.round(45 + score * 0.7));
      const limitPrice = price * (1 - autoConfig.limitOffsetPct / 100);
      longs.push({ symbol: t.symbol, price, change24h, volume24hUsdt: turnover, score, signal, side: "Buy", confidence, limitPrice });
    }

    // ── SHORT candidates: moving down ────────────────────────────────────────
    if (change24h <= -0.5 && change24h >= -25) {
      const drop = Math.abs(change24h);
      // Range position inverted: 0=at high (worst short), 1=at low (best short — already committed)
      const shortPos = range > 0 ? 1 - recovery : 0.5;
      const score = drop * Math.log10(Math.max(turnover, 1)) * (0.4 + shortPos * 0.6);
      const signal: "strong_sell" | "sell" = drop >= 4 ? "strong_sell" : "sell";
      const confidence = Math.min(99, Math.round(45 + score * 0.7));
      // Limit price: slightly above current for short entry
      const limitPrice = price * (1 + autoConfig.limitOffsetPct / 100);
      shorts.push({ symbol: t.symbol, price, change24h, volume24hUsdt: turnover, score, signal, side: "Sell", confidence, limitPrice });
    }
  }

  longs.sort((a, b) => b.score - a.score);
  shorts.sort((a, b) => b.score - a.score);
  const top = [...longs.slice(0, 10), ...shorts.slice(0, 10)];
  universeCache = { list: top, at: Date.now() };
  logger.info({ total: data.result.list.length, longs: longs.length, shorts: shorts.length, top: top.length }, "Bybit universe scan complete (bidirectional)");
  return top;
}

// ─── Engine status tracking ────────────────────────────────────────────────────

// Bybit taker fee rate (0.055% per side, so close-leg fee = value × 0.00055)
const BYBIT_TAKER_FEE = 0.00055;

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
  // Scalp monitor
  scalpMonitoring: boolean;
  scalpLastCheckAt: number | null;
  scalpCurrentNetPnl: number;
  scalpLastTriggerAt: number | null;
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
  scalpMonitoring: false,
  scalpLastCheckAt: null,
  scalpCurrentNetPnl: 0,
  scalpLastTriggerAt: null,
};

// ─── Scalp monitor ────────────────────────────────────────────────────────────

let scalpInterval: ReturnType<typeof setInterval> | null = null;

async function runScalpMonitor() {
  if (!autoConfig.scalpEnabled) return;
  if (engineStatus.analyzing) return; // don't interfere with a running cycle

  try {
    engineStatus.scalpMonitoring = true;
    const posResult = await getPositions() as {
      list: { symbol: string; side: string; size: string; avgPrice: string; unrealisedPnl: string; markPrice: string }[]
    };
    const positions = (posResult.list ?? []).filter((p) => parseFloat(p.size) > 0);

    if (positions.length === 0) {
      engineStatus.scalpCurrentNetPnl = 0;
      engineStatus.scalpLastCheckAt = Date.now();
      return;
    }

    // Net PnL = unrealisedPnl − close-leg taker fee for each position
    // Close fee = size × markPrice × BYBIT_TAKER_FEE
    let totalNetPnl = 0;
    for (const pos of positions) {
      const pnl = parseFloat(pos.unrealisedPnl ?? "0");
      const size = parseFloat(pos.size ?? "0");
      const mark = parseFloat(pos.markPrice ?? "0");
      const closeFee = size * mark * BYBIT_TAKER_FEE;
      totalNetPnl += pnl - closeFee;
    }

    engineStatus.scalpCurrentNetPnl = totalNetPnl;
    engineStatus.scalpLastCheckAt = Date.now();

    logger.debug({ totalNetPnl, target: autoConfig.scalpTargetUSDT, positions: positions.length }, "Scalp monitor check");

    if (totalNetPnl < autoConfig.scalpTargetUSDT) return;

    // ── Target reached — close ALL positions ──────────────────────────────────
    logger.info({ totalNetPnl, target: autoConfig.scalpTargetUSDT }, "Scalp target reached — closing all positions");

    for (const pos of positions) {
      const closeSide: "Buy" | "Sell" = pos.side === "Buy" ? "Sell" : "Buy";
      try {
        const order = await closePosition(pos.symbol, closeSide, pos.size);
        const fee = parseFloat(pos.size) * parseFloat(pos.markPrice) * BYBIT_TAKER_FEE;
        const net = parseFloat(pos.unrealisedPnl) - fee;
        tradeLog.unshift({
          id: crypto.randomUUID(), timestamp: Date.now(),
          symbol: pos.symbol, side: closeSide, qty: pos.size,
          price: parseFloat(pos.markPrice),
          confidence: 100, signal: "scalp_close",
          status: "executed",
          reason: `Scalp target $${autoConfig.scalpTargetUSDT} reached — net $${net.toFixed(3)} (fee $${fee.toFixed(4)})`,
          orderId: order.orderId,
        });
        if (tradeLog.length > 200) tradeLog.splice(200);
        logger.info({ symbol: pos.symbol, closeSide, net: net.toFixed(3) }, "Scalp close executed");
      } catch (err) {
        logger.warn({ err, symbol: pos.symbol }, "Scalp close failed");
      }
    }

    engineStatus.scalpLastTriggerAt = Date.now();
    engineStatus.scalpCurrentNetPnl = 0;

    // ── Immediately trigger a new analysis cycle to find the next trade ───────
    setTimeout(() => {
      logger.info("Scalp: triggering new entry cycle after close");
      void runAutoTradeCycle();
    }, 3000); // wait 3s for positions to fully close before scanning

  } catch (err) {
    logger.warn({ err }, "Scalp monitor error");
  } finally {
    engineStatus.scalpMonitoring = false;
  }
}

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
      signal: string; side: "Buy" | "Sell"; limitPrice: number;
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
          side: c.side,
          limitPrice: c.limitPrice,
        }));
    } else {
      const raw = await getHighConfidenceSignals();
      engineStatus.totalScanned = raw.length;
      candidates = raw.map((c) => {
        const isSell = c.signal === "strong_sell" || c.signal === "sell";
        return {
          symbol: c.bybitSymbol,
          price: c.price,
          confidence: c.confidence,
          signal: c.signal,
          side: (isSell ? "Sell" : "Buy") as "Buy" | "Sell",
          limitPrice: isSell
            ? c.price * (1 + autoConfig.limitOffsetPct / 100)
            : c.price * (1 - autoConfig.limitOffsetPct / 100),
        };
      });
    }

    engineStatus.lastSignalsFound = candidates.length;

    // ── 2. Get current state ─────────────────────────────────────────────────
    const posResult = await getPositions() as {
      list: { symbol: string; side: string; size: string; avgPrice: string }[]
    };
    const openPositions = posResult.list ?? [];
    const activeSymbols = new Set(openPositions.map((p) => p.symbol));

    const balResult = await getWalletBalance() as {
      list: { coin: { coin: string; walletBalance: string }[] }[];
    };
    const usdtCoin = balResult.list?.[0]?.coin?.find((c) => c.coin === "USDT");
    const availableUSDT = parseFloat(usdtCoin?.walletBalance ?? "0");
    const maxPerTrade = Math.min(autoConfig.maxPositionUSDT, availableUSDT * 0.2);

    // ── 3. Position management — auto close/reverse on trend change ──────────
    let ordersPlaced = 0;

    for (const pos of openPositions) {
      if (!pos.size || parseFloat(pos.size) === 0) continue;

      let posAnalysis: Awaited<ReturnType<typeof analyzeSymbol>> | null = null;
      try { posAnalysis = await analyzeSymbol(pos.symbol); }
      catch (err) { logger.warn({ err, symbol: pos.symbol }, "Analysis failed for position monitoring"); continue; }

      const isLong = pos.side === "Buy";
      const shouldClose = isLong ? posAnalysis.shouldExitLong : posAnalysis.shouldExitShort;

      if (!shouldClose) continue;

      // Close the existing position
      const closeSide: "Buy" | "Sell" = isLong ? "Sell" : "Buy";
      try {
        const closeOrder = await closePosition(pos.symbol, closeSide, pos.size);
        const closeMsg = posAnalysis.exitReason ?? `Tren berbalik — auto close ${isLong ? "LONG" : "SHORT"}`;
        logger.info({ symbol: pos.symbol, closeSide, size: pos.size, orderId: closeOrder.orderId }, closeMsg);
        tradeLog.unshift({
          id: crypto.randomUUID(), timestamp: Date.now(),
          symbol: pos.symbol, side: closeSide, qty: pos.size,
          price: parseFloat(pos.avgPrice), confidence: posAnalysis.overallConfidence,
          signal: "close", status: "executed", reason: closeMsg, orderId: closeOrder.orderId,
        });
        if (tradeLog.length > 200) tradeLog.splice(200);
        activeSymbols.delete(pos.symbol);

        // Immediately open opposite direction if analysis has a clear new entry
        if (posAnalysis.shouldEnter && posAnalysis.side && posAnalysis.side !== pos.side) {
          const reversePrice = posAnalysis.entryPrice;
          const reverseQty = formatQty(maxPerTrade / reversePrice, reversePrice);
          const reverseSL = posAnalysis.stopLoss;
          const reverseTP = posAnalysis.takeProfit;

          try {
            const reverseOrder = await placeOrder({
              symbol: pos.symbol, side: posAnalysis.side,
              qty: reverseQty, orderType: "Market",
            });
            await setPositionTPSL({ symbol: pos.symbol, takeProfit: reverseTP, stopLoss: reverseSL })
              .catch((e) => logger.warn({ e, symbol: pos.symbol }, "Failed to set TP/SL on reverse"));
            const reverseLabel = posAnalysis.side === "Buy" ? "LONG" : "SHORT";
            const reverseMsg = `Reverse ke ${reverseLabel} — ${posAnalysis.reasons[0] ?? "tren baru terkonfirmasi"}`;
            tradeLog.unshift({
              id: crypto.randomUUID(), timestamp: Date.now(),
              symbol: pos.symbol, side: posAnalysis.side, qty: reverseQty,
              price: reversePrice, confidence: posAnalysis.overallConfidence,
              signal: reverseLabel.toLowerCase(), status: "executed",
              reason: reverseMsg, orderId: reverseOrder.orderId,
            });
            if (tradeLog.length > 200) tradeLog.splice(200);
            activeSymbols.add(pos.symbol);
            ordersPlaced++;
            logger.info({ symbol: pos.symbol, side: posAnalysis.side, qty: reverseQty, orderId: reverseOrder.orderId }, `Auto-reversed to ${reverseLabel}`);
          } catch (err) {
            logger.warn({ err, symbol: pos.symbol }, "Failed to place reverse order");
          }
        }
      } catch (err) {
        logger.warn({ err, symbol: pos.symbol }, "Failed to close position for reversal");
      }
    }

    // ── 4. Open new positions from candidate signals ─────────────────────────
    if (candidates.length === 0) {
      logger.info("No new candidates this cycle");
      engineStatus.lastOrdersPlaced = ordersPlaced;
      logActivity({ source: "auto", level: "scan", message: `Siklus #${engineStatus.cycleCount + 1} · dipindai: ${engineStatus.totalScanned} · tidak ada kandidat ≥${autoConfig.minConfidence}%` });
      return;
    }

    let skippedAuto = 0;

    for (const cand of candidates) {
      if (activeSymbols.size >= autoConfig.maxPositions) break;
      if (activeSymbols.has(cand.symbol)) continue;

      // Full AI analysis gate — must confirm the candidate's intended direction
      let analysis: Awaited<ReturnType<typeof analyzeSymbol>> | null = null;
      try {
        analysis = await analyzeSymbol(cand.symbol);
      } catch (err) {
        logger.warn({ err, symbol: cand.symbol }, "Analysis unavailable, skipping");
        tradeLog.unshift({
          id: crypto.randomUUID(), timestamp: Date.now(),
          symbol: cand.symbol, side: cand.side ?? "Buy", qty: "0", price: cand.price,
          confidence: cand.confidence, signal: cand.signal,
          status: "rejected", reason: `Analysis failed: ${String(err)}`,
        });
        if (tradeLog.length > 200) tradeLog.splice(200);
        skippedAuto++;
        continue;
      }

      // Analysis must agree with the candidate's direction
      if (!analysis.shouldEnter || analysis.side !== cand.side) {
        const reason = !analysis.shouldEnter
          ? (analysis.waitReason ?? "Kondisi belum optimal")
          : `Arah berbeda (kandidat: ${cand.side}, analisis: ${analysis.side ?? "sideways"})`;
        logger.info({ symbol: cand.symbol, reason }, "Entry skipped by analysis");
        tradeLog.unshift({
          id: crypto.randomUUID(), timestamp: Date.now(),
          symbol: cand.symbol, side: cand.side ?? "Buy", qty: "0", price: cand.price,
          confidence: analysis.overallConfidence, signal: cand.signal,
          status: "rejected", reason,
        });
        if (tradeLog.length > 200) tradeLog.splice(200);
        skippedAuto++;
        continue;
      }

      const tradeSide = analysis.side; // "Buy" or "Sell"
      const execPrice = autoConfig.orderType === "Limit" ? cand.limitPrice : cand.price;
      const qty = formatQty(maxPerTrade / execPrice, execPrice);

      // Direction-aware SL/TP fallback
      const slPrice = analysis.stopLoss > 0
        ? analysis.stopLoss
        : tradeSide === "Sell"
          ? execPrice * (1 + autoConfig.stopLossPct / 100)
          : execPrice * (1 - autoConfig.stopLossPct / 100);
      const tpPrice = analysis.takeProfit > 0
        ? analysis.takeProfit
        : tradeSide === "Sell"
          ? execPrice * (1 - autoConfig.takeProfitPct / 100)
          : execPrice * (1 + autoConfig.takeProfitPct / 100);

      const reasonSummary = analysis.reasons.slice(0, 2).join(" | ");
      const logEntry: TradeLogEntry = {
        id: crypto.randomUUID(), timestamp: Date.now(),
        symbol: cand.symbol, side: tradeSide, qty, price: execPrice,
        confidence: analysis.overallConfidence, signal: cand.signal,
        status: "pending", reason: reasonSummary,
      };

      const direction = tradeSide === "Sell" ? "SHORT" : "LONG";
      logActivity({ source: "auto", level: "signal", message: `⚡ Membuka posisi ${direction} ${cand.symbol} @ $${execPrice.toFixed(4)} (confidence: ${analysis.overallConfidence}% | ${autoConfig.orderType})`, symbol: cand.symbol, confidence: analysis.overallConfidence });

      try {
        const order = await placeOrder({
          symbol: cand.symbol, side: tradeSide, qty,
          orderType: autoConfig.orderType,
          price: autoConfig.orderType === "Limit" ? cand.limitPrice : undefined,
        });

        // Wait 1.5s for market order to fill before setting TP/SL
        await setPositionTPSL({ symbol: cand.symbol, takeProfit: tpPrice, stopLoss: slPrice }, 1500)
          .catch((e) => logger.warn({ e, symbol: cand.symbol }, "Failed to set TP/SL"));

        logEntry.status = "executed";
        logEntry.orderId = order.orderId;
        activeSymbols.add(cand.symbol);
        ordersPlaced++;
        logActivity({ source: "auto", level: "success", message: `✓ Posisi ${direction} ${cand.symbol} berhasil dibuka | TP: $${tpPrice.toFixed(4)} | SL: $${slPrice.toFixed(4)}`, symbol: cand.symbol, confidence: analysis.overallConfidence });
        logger.info(
          { symbol: cand.symbol, side: tradeSide, qty, orderId: order.orderId,
            confidence: analysis.overallConfidence, confirmations: analysis.confirmations, slPrice, tpPrice },
          `Auto-trade ${direction} placed`
        );
      } catch (err) {
        logEntry.status = "rejected";
        logEntry.reason = String(err);
        logActivity({ source: "auto", level: "error", message: `✕ Gagal membuka posisi ${cand.symbol}: ${String(err)}`, symbol: cand.symbol });
        logger.warn({ err, symbol: cand.symbol }, "Auto-trade order failed");
      }

      tradeLog.unshift(logEntry);
      if (tradeLog.length > 200) tradeLog.splice(200);
      saveTradeLog();
    }

    const summaryParts: string[] = [];
    summaryParts.push(`Siklus #${engineStatus.cycleCount + 1}`);
    summaryParts.push(`dipindai: ${engineStatus.totalScanned}`);
    summaryParts.push(`kandidat ≥${autoConfig.minConfidence}%: ${candidates.length}`);
    if (skippedAuto > 0) summaryParts.push(`dianalisis/skip: ${skippedAuto}`);
    if (ordersPlaced > 0) summaryParts.push(`order: ${ordersPlaced}`);
    summaryParts.push(`posisi: ${activeSymbols.size}`);

    const summaryLvl = ordersPlaced > 0 ? "success" : candidates.length > 0 ? "info" : "scan";
    logActivity({ source: "auto", level: summaryLvl, message: summaryParts.join(" · ") });

    engineStatus.lastOrdersPlaced = ordersPlaced;
  } catch (err) {
    logger.error({ err }, "Auto-trade cycle error");
    engineStatus.lastError = String(err);
    logActivity({ source: "auto", level: "error", message: `Error siklus trading: ${String(err)}` });
  } finally {
    engineStatus.analyzing = false;
    engineStatus.lastCycleAt = Date.now();
    engineStatus.cycleCount++;
    engineStatus.nextCycleAt = Date.now() + autoConfig.intervalMs;
  }
}

export function startAutoEngine() {
  if (autoInterval) clearInterval(autoInterval);
  if (scalpInterval) clearInterval(scalpInterval);

  engineStatus.running = true;
  engineStatus.nextCycleAt = Date.now() + autoConfig.intervalMs;

  // Main trade cycle
  autoInterval = setInterval(() => {
    engineStatus.nextCycleAt = Date.now() + autoConfig.intervalMs;
    void runAutoTradeCycle();
  }, autoConfig.intervalMs);

  // Scalp monitor — runs every 10 seconds independently
  scalpInterval = setInterval(() => {
    void runScalpMonitor();
  }, 10_000);

  // Run both immediately on start
  void runAutoTradeCycle();
  void runScalpMonitor();

  logger.info({ intervalMs: autoConfig.intervalMs, scalpEnabled: autoConfig.scalpEnabled }, "Auto-trading engine started");
}

export function stopAutoEngine() {
  if (autoInterval) { clearInterval(autoInterval); autoInterval = null; }
  if (scalpInterval) { clearInterval(scalpInterval); scalpInterval = null; }
  engineStatus.running = false;
  engineStatus.analyzing = false;
  engineStatus.scalpMonitoring = false;
  engineStatus.nextCycleAt = null;
  logger.info("Auto-trading engine stopped");
}
