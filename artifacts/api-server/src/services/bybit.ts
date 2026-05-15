import crypto from "crypto";
import { logger } from "../lib/logger.js";
import { getCryptoPredictions } from "./predictions.js";

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
}

/**
 * Place a clean market order — NO inline TP/SL.
 * TP/SL must be set separately via setPositionTPSL after fill.
 */
export async function placeOrder(params: PlaceOrderParams) {
  const body: Record<string, unknown> = {
    category: "linear",
    symbol: params.symbol,
    side: params.side,
    orderType: "Market",
    qty: params.qty,
  };

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

// ─── Signal scanner ────────────────────────────────────────────────────────────

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
      signal: p.signal,
      confidence: p.confidence,
      price: p.currentPrice,
      riskLevel: p.riskLevel,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
    }));
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
};

// ─── Auto-trading engine ───────────────────────────────────────────────────────

let autoInterval: ReturnType<typeof setInterval> | null = null;

async function runAutoTradeCycle() {
  if (!autoConfig.enabled || autoConfig.mode !== "auto") return;

  engineStatus.analyzing = true;
  engineStatus.lastError = null;
  logger.info("Auto-trade cycle started");

  try {
    const signals = await getHighConfidenceSignals();
    if (signals.length === 0) return;

    const posResult = await getPositions() as { list: { symbol: string }[] };
    const activeSymbols = new Set((posResult.list ?? []).map((p) => p.symbol));

    const balResult = await getWalletBalance() as {
      list: { coin: { coin: string; walletBalance: string }[] }[];
    };
    const usdtCoin = balResult.list?.[0]?.coin?.find((c) => c.coin === "USDT");
    const availableUSDT = parseFloat(usdtCoin?.walletBalance ?? "0");

    const maxPerTrade = Math.min(autoConfig.maxPositionUSDT, availableUSDT * 0.05);

    engineStatus.lastSignalsFound = signals.length;
    let ordersPlaced = 0;

    for (const sig of signals) {
      if (activeSymbols.size >= autoConfig.maxPositions) break;
      if (activeSymbols.has(sig.bybitSymbol)) continue;
      if (sig.riskLevel === "high") continue;

      const qty = formatQty(maxPerTrade / sig.price, sig.price);
      const slPrice = sig.price * (1 - autoConfig.stopLossPct / 100);
      const tpPrice = sig.price * (1 + autoConfig.takeProfitPct / 100);

      const logEntry: TradeLogEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        symbol: sig.bybitSymbol,
        side: "Buy",
        qty,
        price: sig.price,
        confidence: sig.confidence,
        signal: sig.signal,
        status: "pending",
      };

      try {
        const order = await placeOrder({ symbol: sig.bybitSymbol, side: "Buy", qty });

        // Set TP/SL separately after order is placed
        await setPositionTPSL({
          symbol: sig.bybitSymbol,
          takeProfit: tpPrice,
          stopLoss: slPrice,
        }).catch((e) => logger.warn({ e, symbol: sig.bybitSymbol }, "Failed to set TP/SL after auto-order"));

        logEntry.status = "executed";
        logEntry.orderId = order.orderId;
        activeSymbols.add(sig.bybitSymbol);
        ordersPlaced++;
        logger.info({ symbol: sig.bybitSymbol, qty, orderId: order.orderId }, "Auto-trade executed");
      } catch (err) {
        logEntry.status = "rejected";
        logEntry.reason = String(err);
        logger.warn({ err, symbol: sig.bybitSymbol }, "Auto-trade order failed");
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
