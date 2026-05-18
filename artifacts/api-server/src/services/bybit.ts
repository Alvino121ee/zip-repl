import crypto from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import { getCryptoPredictions } from "./predictions.js";
import { analyzeSymbol } from "./analysis.js";
import { logActivity } from "./activity-log.js";
import {
  analyzeInstitutional,
  calculateTrailingStop,
  calculateDynamicRisk,
  aiLog,
} from "./institutional-engine.js";
import {
  makeHumanInstinctDecision,
  learnFromTradeOutcome,
  generateLiveReasoning,
} from "./human-instinct-engine.js";
export { getInstinctStats, getInstinctMemory } from "./human-instinct-engine.js";
import { analyzeSLFailure } from "./sl-failure-analysis.js";

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
  scalpEnabled: boolean;
  scalpTargetUSDT: number;
  // ── Full Margin Precision Mode ─────────────────────────────────────────────
  precisionMode: boolean;           // sniper mode — 1 position, max margin, 90%+ conf
  precisionMarginPct: number;       // % of available USDT to allocate (default 90)
  precisionMinConfidence: number;   // minimum confidence threshold (default 90)
  precisionMinRR: number;           // minimum risk/reward ratio (default 2.0)
  precisionCooldownMinutes: number; // cooldown after a loss (default 30)
  precisionDailyLossLimitPct: number; // max daily loss % of equity (default 5)
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
  precisionMode: false,
  precisionMarginPct: 90,
  precisionMinConfidence: 90,
  precisionMinRR: 2.0,
  precisionCooldownMinutes: 30,
  precisionDailyLossLimitPct: 5,
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

export interface PrecisionBestSetup {
  symbol: string;
  side: "Buy" | "Sell";
  confidence: number;
  rr: number;
  score: number;
  grade: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  reasons: string[];
  detectedAt: number;
}

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
  // Full Margin Precision Mode
  precisionSniperStatus: string;
  precisionCooldown: boolean;
  precisionCooldownUntil: number | null;
  precisionDailyLoss: number;
  precisionDailyTrades: number;
  precisionDailyDate: string;
  precisionBestSetup: PrecisionBestSetup | null;
  precisionPositionSymbol: string | null;
  precisionTotalWins: number;
  precisionTotalLosses: number;
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
  precisionSniperStatus: "Menunggu aktivasi...",
  precisionCooldown: false,
  precisionCooldownUntil: null,
  precisionDailyLoss: 0,
  precisionDailyTrades: 0,
  precisionDailyDate: "",
  precisionBestSetup: null,
  precisionPositionSymbol: null,
  precisionTotalWins: 0,
  precisionTotalLosses: 0,
};

// ─── Live Position AI State (in-memory) ───────────────────────────────────────

interface LivePositionState {
  symbol: string;
  side: "Buy" | "Sell";
  entryPrice: number;
  openedAt: number;
  confidence: number;
  stopLoss: number | null;
  takeProfit: number | null;
  trailActivated: boolean;
  trailPeakPrice: number | null;
  humanInstinct?: {
    lastEvalAt: number;
    momentumScore: number;
    continuationProb: number;
    greedIndex: number;
    decaySignals: string[];
    action: string;
    reason: string;
    evalCount: number;
    urgency: number;
  };
}

const livePositionStates = new Map<string, LivePositionState>();

// Track symbols known to be in live positions (for SL-learn on close)
const lastKnownPositionSymbols = new Set<string>();

// ─── Live Position Monitor ─────────────────────────────────────────────────────
// Runs every 10 seconds when engine is active.
// Applies Human Instinct Engine + Institutional trailing stop to live Bybit positions.

const LIVE_INSTINCT_EVAL_INTERVAL_MS = 60_000; // evaluate instinct every 60s

let livePositionMonitorInterval: ReturnType<typeof setInterval> | null = null;

async function runLivePositionMonitor() {
  if (!autoConfig.enabled) return;

  try {
    const posResult = await getPositions() as {
      list: {
        symbol: string;
        side: string;
        size: string;
        avgPrice: string;
        unrealisedPnl: string;
        markPrice: string;
        leverage: string;
        stopLoss: string;
        takeProfit: string;
      }[];
    };

    const openPositions = (posResult.list ?? []).filter((p) => parseFloat(p.size) > 0);
    const currentSymbols = new Set(openPositions.map((p) => p.symbol));

    // ── Detect closed positions (were open, now gone) — trigger learning ─────
    for (const sym of lastKnownPositionSymbols) {
      if (!currentSymbols.has(sym)) {
        const state = livePositionStates.get(sym);
        if (state) {
          const holdMs = Date.now() - state.openedAt;
          const approxPnlPct = 0; // unknown, closed by TP/SL externally
          try {
            learnFromTradeOutcome({
              tradeId: `live_${sym}_${state.openedAt}`,
              symbol: sym,
              finalProfitPct: approxPnlPct,
              closedAs: "manual", // closed externally (TP/SL/user)
            });
          } catch { /* non-critical */ }
          livePositionStates.delete(sym);
          logActivity({
            source: "auto",
            level: "info",
            message: `📊 Posisi ${state.side === "Buy" ? "LONG" : "SHORT"} ${sym} ditutup (TP/SL/eksternal) — AI Brain belajar`,
          });
        }
        lastKnownPositionSymbols.delete(sym);
      }
    }

    if (openPositions.length === 0) return;

    for (const pos of openPositions) {
      const markPrice = parseFloat(pos.markPrice ?? "0");
      const entryPrice = parseFloat(pos.avgPrice ?? "0");
      if (!markPrice || !entryPrice) continue;

      lastKnownPositionSymbols.add(pos.symbol);

      // Initialize state if not yet tracked
      if (!livePositionStates.has(pos.symbol)) {
        livePositionStates.set(pos.symbol, {
          symbol: pos.symbol,
          side: pos.side as "Buy" | "Sell",
          entryPrice,
          openedAt: Date.now() - 60_000, // approximate
          confidence: 80,
          stopLoss: parseFloat(pos.stopLoss ?? "0") || null,
          takeProfit: parseFloat(pos.takeProfit ?? "0") || null,
          trailActivated: false,
          trailPeakPrice: null,
        });
      }

      const st = livePositionStates.get(pos.symbol)!;

      // Update trailing peak
      if (pos.side === "Buy") {
        if (!st.trailPeakPrice || markPrice > st.trailPeakPrice) st.trailPeakPrice = markPrice;
      } else {
        if (!st.trailPeakPrice || markPrice < st.trailPeakPrice) st.trailPeakPrice = markPrice;
      }

      const estimatedAtr = entryPrice * 0.018;
      const rawProfitPct = pos.side === "Buy"
        ? (markPrice - entryPrice) / entryPrice * 100
        : (entryPrice - markPrice) / entryPrice * 100;

      // ── Human Instinct Engine Evaluation ──────────────────────────────────
      const holdMinutes = (Date.now() - st.openedAt) / 60_000;
      const lastEvalAt = st.humanInstinct?.lastEvalAt ?? 0;
      const shouldEvalInstinct =
        Date.now() - lastEvalAt >= LIVE_INSTINCT_EVAL_INTERVAL_MS &&
        holdMinutes >= 2;

      if (shouldEvalInstinct) {
        try {
          const instinctDecision = await makeHumanInstinctDecision({
            tradeId: `live_${pos.symbol}_${st.openedAt}`,
            symbol: pos.symbol,
            side: pos.side as "Buy" | "Sell",
            entryPrice,
            currentPrice: markPrice,
            takeProfit: st.takeProfit ?? undefined,
            stopLoss: st.stopLoss ?? undefined,
            margin: autoConfig.maxPositionUSDT,
            leverage: parseFloat(pos.leverage ?? "1") || 1,
            openedAt: st.openedAt,
            confidence: st.confidence,
          });

          st.humanInstinct = {
            lastEvalAt: Date.now(),
            momentumScore: instinctDecision.momentumScore,
            continuationProb: instinctDecision.continuationProb,
            greedIndex: instinctDecision.greedIndex,
            decaySignals: instinctDecision.decaySignals,
            action: instinctDecision.action,
            reason: instinctDecision.reason,
            evalCount: (st.humanInstinct?.evalCount ?? 0) + 1,
            urgency: instinctDecision.urgency,
          };

          const reasoning = generateLiveReasoning(instinctDecision, rawProfitPct);
          const direction = pos.side === "Buy" ? "LONG" : "SHORT";

          // ── Exit early if instinct says so ─────────────────────────────
          if (instinctDecision.shouldExitEarly && rawProfitPct > -0.5) {
            aiLog.exiting(pos.symbol, instinctDecision.reason, parseFloat(pos.unrealisedPnl ?? "0"));
            logActivity({
              source: "auto",
              level: rawProfitPct > 0 ? "success" : "warning",
              message: `🧠 INSTINCT EXIT ${direction} ${pos.symbol} @ $${markPrice.toFixed(4)} | ${rawProfitPct >= 0 ? "+" : ""}${rawProfitPct.toFixed(2)}% | ${instinctDecision.reason}`,
              symbol: pos.symbol,
            });
            const closeSide: "Buy" | "Sell" = pos.side === "Buy" ? "Sell" : "Buy";
            try {
              const closeOrder = await closePosition(pos.symbol, closeSide, pos.size);
              tradeLog.unshift({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                symbol: pos.symbol,
                side: closeSide,
                qty: pos.size,
                price: markPrice,
                confidence: st.confidence,
                signal: "instinct_exit",
                status: "executed",
                reason: `[Instinct Exit] ${instinctDecision.reason}`,
                orderId: closeOrder.orderId,
              });
              if (tradeLog.length > 200) tradeLog.splice(200);
              saveTradeLog();
              try {
                learnFromTradeOutcome({
                  tradeId: `live_${pos.symbol}_${st.openedAt}`,
                  symbol: pos.symbol,
                  finalProfitPct: rawProfitPct,
                  closedAs: "early_exit",
                });
              } catch { /* non-critical */ }
              livePositionStates.delete(pos.symbol);
              lastKnownPositionSymbols.delete(pos.symbol);
            } catch (err) {
              logger.warn({ err, symbol: pos.symbol }, "Instinct exit failed on live position");
            }
            continue;
          }

          // ── Tighten trailing stop ───────────────────────────────────────
          if (instinctDecision.action === "tighten_trail" && instinctDecision.suggestedSL) {
            const isImprovement = pos.side === "Buy"
              ? instinctDecision.suggestedSL > (st.stopLoss ?? 0)
              : instinctDecision.suggestedSL < (st.stopLoss ?? Infinity);
            if (isImprovement) {
              try {
                await setPositionTPSL({ symbol: pos.symbol, stopLoss: instinctDecision.suggestedSL });
                st.stopLoss = instinctDecision.suggestedSL;
                st.trailActivated = true;
                aiLog.protecting(pos.symbol, `Instinct trail → SL $${instinctDecision.suggestedSL.toFixed(4)}`);
                logActivity({
                  source: "auto",
                  level: "info",
                  message: `🛡 SMART TRAIL ${pos.symbol}: SL → $${instinctDecision.suggestedSL.toFixed(4)} | Momentum ${instinctDecision.momentumScore} | ${instinctDecision.decaySignals[0] ?? "Trail disesuaikan"}`,
                  symbol: pos.symbol,
                });
              } catch (err) {
                logger.warn({ err, symbol: pos.symbol }, "Failed to update SL via instinct tighten_trail");
              }
            }
          }

          // ── Extend take profit ──────────────────────────────────────────
          if (instinctDecision.action === "extend_target" && instinctDecision.suggestedTP) {
            const isExtension = pos.side === "Buy"
              ? instinctDecision.suggestedTP > (st.takeProfit ?? 0)
              : instinctDecision.suggestedTP < (st.takeProfit ?? Infinity);
            if (isExtension && st.takeProfit) {
              try {
                await setPositionTPSL({ symbol: pos.symbol, takeProfit: instinctDecision.suggestedTP });
                const oldTP = st.takeProfit;
                st.takeProfit = instinctDecision.suggestedTP;
                logActivity({
                  source: "auto",
                  level: "signal",
                  message: `🚀 EXTEND TARGET ${pos.symbol}: TP $${oldTP.toFixed(4)} → $${instinctDecision.suggestedTP.toFixed(4)} | Momentum: ${instinctDecision.momentumScore}`,
                  symbol: pos.symbol,
                });
              } catch (err) {
                logger.warn({ err, symbol: pos.symbol }, "Failed to extend TP via instinct");
              }
            }
          }

          if (instinctDecision.decaySignals.length > 0 && instinctDecision.urgency >= 50) {
            logActivity({
              source: "auto",
              level: "info",
              message: `🧠 INSTINCT [${pos.symbol}]: ${reasoning.split("\n")[1] ?? instinctDecision.reason}`,
              symbol: pos.symbol,
            });
          }
        } catch (err) {
          logger.warn({ err, symbol: pos.symbol }, "Human Instinct evaluation error — non-critical");
        }
      }

      // ── Institutional trailing stop (second layer) ─────────────────────
      const trailResult = calculateTrailingStop({
        side: pos.side as "Buy" | "Sell",
        entryPrice,
        currentPrice: markPrice,
        atr: estimatedAtr,
        currentSL: st.stopLoss,
        trailActivated: st.trailActivated,
        peakPrice: st.trailPeakPrice ?? entryPrice,
      });

      if (trailResult.activated && !st.trailActivated) {
        st.trailActivated = true;
        st.stopLoss = trailResult.newSL;
        const note = trailResult.note ?? "Trailing stop aktif — SL dipindah ke breakeven";
        try {
          await setPositionTPSL({ symbol: pos.symbol, stopLoss: trailResult.newSL });
          aiLog.protecting(pos.symbol, note);
          logActivity({
            source: "auto",
            level: "info",
            message: `🛡 TRAIL AKTIF ${pos.side === "Buy" ? "LONG" : "SHORT"} ${pos.symbol}: ${note}`,
            symbol: pos.symbol,
          });
        } catch (err) {
          logger.warn({ err, symbol: pos.symbol }, "Failed to set trail SL on Bybit");
        }
      } else if (trailResult.activated && trailResult.tightened && trailResult.note) {
        if (trailResult.newSL !== st.stopLoss) {
          st.stopLoss = trailResult.newSL;
          try {
            await setPositionTPSL({ symbol: pos.symbol, stopLoss: trailResult.newSL });
            aiLog.protecting(pos.symbol, trailResult.note);
            logActivity({
              source: "auto",
              level: "info",
              message: `🛡 TRAIL ${pos.symbol} (profit ${rawProfitPct.toFixed(1)}%): ${trailResult.note}`,
              symbol: pos.symbol,
            });
          } catch (err) {
            logger.warn({ err, symbol: pos.symbol }, "Failed to tighten trail SL on Bybit");
          }
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "Live position monitor error");
  }
}

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

// ─── Full Margin Precision Mode engine ─────────────────────────────────────────

let precisionInterval: ReturnType<typeof setInterval> | null = null;
let precisionPositionMonitorInterval: ReturnType<typeof setInterval> | null = null;

function setPrecisionStatus(msg: string) {
  engineStatus.precisionSniperStatus = msg;
  logActivity({ source: "auto", level: "info", message: `[SNIPER] ${msg}` });
  logger.info({ msg }, "Precision sniper status");
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkAndResetDailyStats() {
  const today = todayDate();
  if (engineStatus.precisionDailyDate !== today) {
    engineStatus.precisionDailyDate = today;
    engineStatus.precisionDailyLoss = 0;
    engineStatus.precisionDailyTrades = 0;
    logger.info("Precision: daily stats reset");
  }
}

async function runPrecisionPositionMonitor() {
  if (!autoConfig.precisionMode || !autoConfig.enabled) return;
  if (!engineStatus.precisionPositionSymbol) return;

  try {
    const sym = engineStatus.precisionPositionSymbol;
    const posResult = await getPositions() as {
      list: { symbol: string; side: string; size: string; avgPrice: string; unrealisedPnl: string; markPrice: string; leverage: string }[]
    };
    const pos = posResult.list.find((p) => p.symbol === sym && parseFloat(p.size) > 0);

    if (!pos) {
      // Position closed (hit TP/SL or was closed externally)
      logger.info({ sym }, "Precision: position closed (TP/SL or external)");
      const pnl = 0; // unknown — was closed externally
      engineStatus.precisionPositionSymbol = null;
      engineStatus.precisionBestSetup = null;
      setPrecisionStatus("Posisi ditutup — memindai setup terbaik berikutnya...");
      return;
    }

    const pnl = parseFloat(pos.unrealisedPnl ?? "0");
    const markPrice = parseFloat(pos.markPrice ?? "0");
    const size = parseFloat(pos.size ?? "0");
    const closeFee = size * markPrice * BYBIT_TAKER_FEE;
    const netPnl = pnl - closeFee;

    // Run analysis to detect exit signals
    let analysis: Awaited<ReturnType<typeof analyzeSymbol>> | null = null;
    try { analysis = await analyzeSymbol(sym); } catch { return; }

    const isLong = pos.side === "Buy";
    const shouldExit = isLong ? analysis.shouldExitLong : analysis.shouldExitShort;

    if (netPnl > 0) {
      setPrecisionStatus(`Melindungi margin penuh — net PnL: +$${netPnl.toFixed(3)} USDT (${sym})`);
    } else {
      setPrecisionStatus(`Memantau posisi ${isLong ? "LONG" : "SHORT"} ${sym} — net: $${netPnl.toFixed(3)} USDT`);
    }

    if (!shouldExit) return;

    // Exit early — momentum weakening or exit signal
    const exitReason = analysis.exitReason ?? "Momentum melemah — exit cerdas";
    setPrecisionStatus(`Momentum melemah terdeteksi — exit cerdas dari ${sym}...`);
    logger.info({ sym, exitReason, netPnl }, "Precision: early exit triggered");

    const closeSide: "Buy" | "Sell" = isLong ? "Sell" : "Buy";
    try {
      const closeOrder = await closePosition(sym, closeSide, pos.size);
      const closedNetPnl = netPnl;

      // Record result for daily tracking + cooldown
      engineStatus.precisionDailyTrades++;
      if (closedNetPnl < 0) {
        engineStatus.precisionDailyLoss += Math.abs(closedNetPnl);
        engineStatus.precisionTotalLosses++;
        // Activate cooldown
        engineStatus.precisionCooldown = true;
        engineStatus.precisionCooldownUntil = Date.now() + autoConfig.precisionCooldownMinutes * 60_000;
        const cooldownMsg = `Cooldown aktif ${autoConfig.precisionCooldownMinutes} menit setelah loss — re-analisis pasar dengan cermat`;
        setPrecisionStatus(cooldownMsg);
        logActivity({ source: "auto", level: "warn", message: `[SNIPER] Loss $${Math.abs(closedNetPnl).toFixed(3)} — ${cooldownMsg}` });
      } else {
        engineStatus.precisionTotalWins++;
        setPrecisionStatus(`Profit diamankan: +$${closedNetPnl.toFixed(3)} USDT — mencari setup berikutnya...`);
        logActivity({ source: "auto", level: "success", message: `[SNIPER] ✓ Profit $${closedNetPnl.toFixed(3)} USDT — ${sym}` });
      }

      tradeLog.unshift({
        id: crypto.randomUUID(), timestamp: Date.now(),
        symbol: sym, side: closeSide, qty: pos.size,
        price: markPrice, confidence: analysis.overallConfidence,
        signal: "precision_exit", status: "executed",
        reason: `[PRECISION] ${exitReason} — net $${closedNetPnl.toFixed(3)}`,
        orderId: closeOrder.orderId,
      });
      if (tradeLog.length > 200) tradeLog.splice(200);
      saveTradeLog();
      engineStatus.precisionPositionSymbol = null;
      engineStatus.precisionBestSetup = null;
    } catch (err) {
      logger.warn({ err, sym }, "Precision: failed to early-exit position");
    }
  } catch (err) {
    logger.warn({ err }, "Precision position monitor error");
  }
}

async function runPrecisionModeCycle() {
  if (!autoConfig.enabled || !autoConfig.precisionMode) return;
  if (engineStatus.analyzing) return;

  engineStatus.analyzing = true;
  checkAndResetDailyStats();

  try {
    // ── 1. Cooldown check ────────────────────────────────────────────────────
    if (engineStatus.precisionCooldown) {
      if (engineStatus.precisionCooldownUntil && Date.now() < engineStatus.precisionCooldownUntil) {
        const remainMin = Math.ceil((engineStatus.precisionCooldownUntil - Date.now()) / 60_000);
        setPrecisionStatus(`Cooldown aktif — ${remainMin} menit tersisa sebelum scan berikutnya`);
        return;
      }
      engineStatus.precisionCooldown = false;
      engineStatus.precisionCooldownUntil = null;
      setPrecisionStatus("Cooldown selesai — memulai scan sniper...");
    }

    // ── 2. Check if already holding a position ────────────────────────────────
    const posResult = await getPositions() as {
      list: { symbol: string; side: string; size: string; avgPrice: string; unrealisedPnl: string; markPrice: string }[]
    };
    const openPositions = (posResult.list ?? []).filter((p) => parseFloat(p.size) > 0);

    if (openPositions.length > 0) {
      const sym = openPositions[0].symbol;
      engineStatus.precisionPositionSymbol = sym;
      const pnl = parseFloat(openPositions[0].unrealisedPnl ?? "0");
      setPrecisionStatus(`Memantau posisi aktif ${sym} — PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(3)} USDT`);
      return;
    }

    engineStatus.precisionPositionSymbol = null;

    // ── 3. Check daily loss limit ─────────────────────────────────────────────
    const balResult = await getWalletBalance() as {
      list: { totalEquity: string; coin: { coin: string; walletBalance: string }[] }[];
    };
    const totalEquity = parseFloat(balResult.list?.[0]?.totalEquity ?? "0");
    const usdtCoin = balResult.list?.[0]?.coin?.find((c) => c.coin === "USDT");
    const availableUSDT = parseFloat(usdtCoin?.walletBalance ?? "0");

    const dailyLossLimitUSDT = totalEquity * (autoConfig.precisionDailyLossLimitPct / 100);
    if (totalEquity > 0 && engineStatus.precisionDailyLoss >= dailyLossLimitUSDT) {
      setPrecisionStatus(`Batas loss harian ${autoConfig.precisionDailyLossLimitPct}% tercapai ($${engineStatus.precisionDailyLoss.toFixed(2)}) — istirahat hingga besok`);
      return;
    }

    // ── 4. Scan universe for ALL candidates ───────────────────────────────────
    setPrecisionStatus("Memindai seluruh universe — mencari setup terbaik...");
    const rawCandidates = await scanBybitUniverse();
    engineStatus.totalScanned = rawCandidates.length;

    // Score candidates: confidence × RR proxy × score
    const sorted = rawCandidates
      .sort((a, b) => (b.confidence * b.score) - (a.confidence * a.score))
      .slice(0, 15); // analyze top 15 maximum

    if (sorted.length === 0) {
      setPrecisionStatus("Tidak ada kandidat ditemukan — pasar sideways, menunggu...");
      engineStatus.precisionBestSetup = null;
      return;
    }

    setPrecisionStatus(`Menganalisis ${sorted.length} kandidat teratas secara mendalam...`);

    // ── 5. Deep analyze — find the single BEST setup ──────────────────────────
    let bestSetup: PrecisionBestSetup | null = null;

    for (const cand of sorted) {
      let analysis: Awaited<ReturnType<typeof analyzeSymbol>> | null = null;
      try {
        analysis = await analyzeSymbol(cand.symbol);
      } catch {
        continue;
      }

      // STRICT entry criteria gate
      if (!analysis.shouldEnter) continue;
      if (analysis.side !== cand.side) continue;
      if (analysis.overallConfidence < autoConfig.precisionMinConfidence) continue;
      if (analysis.riskRewardRatio < autoConfig.precisionMinRR) continue;
      if (analysis.fakeBreakout.isFakeBreakoutUp || analysis.fakeBreakout.isFakeBreakoutDown) continue;
      if (analysis.indicators.rsiZone === "overbought" && cand.side === "Buy") continue;
      if (analysis.indicators.rsiZone === "oversold" && cand.side === "Sell") continue;
      if (analysis.indicators.volumeRatio < 1.1) continue; // volume must confirm

      // Multi-timeframe alignment check — majority must agree
      const tfKeys = Object.keys(analysis.multiTimeframe);
      if (tfKeys.length >= 2) {
        const aligned = tfKeys.filter((tf) => {
          const t = analysis!.multiTimeframe[tf];
          return cand.side === "Buy" ? t.bullishConf : t.bearishConf;
        });
        const alignRatio = aligned.length / tfKeys.length;
        if (alignRatio < 0.5) continue; // less than half agree
      }

      // This candidate passes ALL strict checks
      const score = analysis.overallConfidence * analysis.riskRewardRatio * analysis.trendStrength;
      if (!bestSetup || score > bestSetup.score) {
        bestSetup = {
          symbol: cand.symbol,
          side: cand.side,
          confidence: analysis.overallConfidence,
          rr: analysis.riskRewardRatio,
          score,
          grade: analysis.signalGrade ?? "B",
          entryPrice: analysis.entryPrice,
          stopLoss: analysis.stopLoss,
          takeProfit: analysis.takeProfit,
          reasons: analysis.reasons.slice(0, 4),
          detectedAt: Date.now(),
        };
      }
      // We stop at the first A-grade, otherwise keep looking for best
      if (bestSetup && analysis.signalGrade === "A") break;
    }

    engineStatus.precisionBestSetup = bestSetup;

    if (!bestSetup) {
      setPrecisionStatus(`Tidak ada setup berkualitas tinggi — ${sorted.length} kandidat gagal melewati seleksi ketat`);
      return;
    }

    // ── 6. Check confirmation wait (avoid FOMO / chasing) ────────────────────
    if (bestSetup.confidence < 93) {
      setPrecisionStatus(`Setup terdeteksi: ${bestSetup.symbol} ${bestSetup.side === "Buy" ? "LONG" : "SHORT"} ${bestSetup.confidence}% — menunggu konfirmasi lebih kuat...`);
    } else {
      setPrecisionStatus(`Peluang high-confidence terdeteksi: ${bestSetup.symbol} ${bestSetup.side === "Buy" ? "LONG" : "SHORT"} ${bestSetup.confidence}% — memasuki trade sniper...`);
    }

    // ── 7. Calculate position size — full margin allocation ───────────────────
    const allocatedUSDT = availableUSDT * (autoConfig.precisionMarginPct / 100);
    if (allocatedUSDT < 5.5) {
      setPrecisionStatus(`Saldo tidak cukup ($${availableUSDT.toFixed(2)} USDT) — perlu minimal $6 USDT`);
      return;
    }

    // Analyze again to get fresh analysis for execution
    let execAnalysis: Awaited<ReturnType<typeof analyzeSymbol>>;
    try {
      execAnalysis = await analyzeSymbol(bestSetup.symbol);
    } catch (err) {
      setPrecisionStatus(`Gagal re-analisis ${bestSetup.symbol} sebelum entry`);
      return;
    }

    // Final check — still valid?
    if (!execAnalysis.shouldEnter || execAnalysis.side !== bestSetup.side) {
      setPrecisionStatus(`Setup ${bestSetup.symbol} sudah berubah — membatalkan entry, mencari setup baru`);
      engineStatus.precisionBestSetup = null;
      return;
    }

    const execPrice = execAnalysis.entryPrice;
    const dynLeverage = Math.min(execAnalysis.recommendedLeverage, autoConfig.leverage > 1 ? autoConfig.leverage : 10);
    const qty = formatQty(allocatedUSDT / execPrice, execPrice);

    const slPrice = execAnalysis.stopLoss > 0 ? execAnalysis.stopLoss
      : bestSetup.side === "Sell" ? execPrice * (1 + autoConfig.stopLossPct / 100)
      : execPrice * (1 - autoConfig.stopLossPct / 100);
    const tpPrice = execAnalysis.takeProfit > 0 ? execAnalysis.takeProfit
      : bestSetup.side === "Sell" ? execPrice * (1 - autoConfig.takeProfitPct / 100)
      : execPrice * (1 + autoConfig.takeProfitPct / 100);

    // Set dynamic leverage
    if (dynLeverage > 1) {
      await bybitPost("/v5/position/set-leverage", {
        category: "linear", symbol: bestSetup.symbol,
        buyLeverage: String(dynLeverage), sellLeverage: String(dynLeverage),
      }).catch(() => {});
    }

    const direction = bestSetup.side === "Buy" ? "LONG" : "SHORT";
    const reasonSummary = execAnalysis.reasons.slice(0, 2).join(" | ");
    setPrecisionStatus(`Memasuki trade sniper ${direction} ${bestSetup.symbol} @ $${execPrice.toFixed(4)} — leverage ${dynLeverage}x`);
    logActivity({ source: "auto", level: "signal", message: `[SNIPER] ⚡ Entry ${direction} ${bestSetup.symbol} @ $${execPrice.toFixed(4)} | conf: ${execAnalysis.overallConfidence}% | RR: ${execAnalysis.riskRewardRatio.toFixed(1)} | lev: ${dynLeverage}x`, symbol: bestSetup.symbol, confidence: execAnalysis.overallConfidence });

    const logEntry: TradeLogEntry = {
      id: crypto.randomUUID(), timestamp: Date.now(),
      symbol: bestSetup.symbol, side: bestSetup.side, qty, price: execPrice,
      confidence: execAnalysis.overallConfidence, signal: `precision_${direction.toLowerCase()}`,
      status: "pending", reason: `[PRECISION] ${reasonSummary}`,
    };

    try {
      const order = await placeOrder({ symbol: bestSetup.symbol, side: bestSetup.side, qty, orderType: "Market" });

      await setPositionTPSL({ symbol: bestSetup.symbol, takeProfit: tpPrice, stopLoss: slPrice }, 1500)
        .catch((e) => logger.warn({ e, symbol: bestSetup!.symbol }, "Precision: failed to set TP/SL"));

      logEntry.status = "executed";
      logEntry.orderId = order.orderId;
      engineStatus.precisionPositionSymbol = bestSetup.symbol;
      engineStatus.precisionDailyTrades++;
      engineStatus.lastOrdersPlaced++;

      setPrecisionStatus(`✓ Posisi ${direction} ${bestSetup.symbol} aktif — margin penuh $${allocatedUSDT.toFixed(2)} | TP $${tpPrice.toFixed(4)} | SL $${slPrice.toFixed(4)}`);
      logActivity({ source: "auto", level: "success", message: `[SNIPER] ✓ ${direction} ${bestSetup.symbol} dibuka | margin $${allocatedUSDT.toFixed(2)} | TP $${tpPrice.toFixed(4)} | SL $${slPrice.toFixed(4)}`, symbol: bestSetup.symbol, confidence: execAnalysis.overallConfidence });
      logger.info({ symbol: bestSetup.symbol, side: bestSetup.side, qty, orderId: order.orderId, allocatedUSDT, dynLeverage, confidence: execAnalysis.overallConfidence }, "Precision sniper trade placed");
    } catch (err) {
      logEntry.status = "rejected";
      logEntry.reason = `[PRECISION] ${String(err)}`;
      setPrecisionStatus(`Gagal membuka posisi ${bestSetup.symbol}: ${String(err)}`);
      logActivity({ source: "auto", level: "error", message: `[SNIPER] ✕ Gagal entry ${bestSetup.symbol}: ${String(err)}`, symbol: bestSetup.symbol });
    }

    tradeLog.unshift(logEntry);
    if (tradeLog.length > 200) tradeLog.splice(200);
    saveTradeLog();

  } catch (err) {
    logger.error({ err }, "Precision mode cycle error");
    engineStatus.lastError = String(err);
    setPrecisionStatus(`Error: ${String(err)}`);
  } finally {
    engineStatus.analyzing = false;
    engineStatus.lastCycleAt = Date.now();
    engineStatus.cycleCount++;
    engineStatus.nextCycleAt = Date.now() + autoConfig.intervalMs;
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
      list: { totalEquity: string; coin: { coin: string; walletBalance: string }[] }[];
    };
    const usdtCoin = balResult.list?.[0]?.coin?.find((c) => c.coin === "USDT");
    const availableUSDT = parseFloat(usdtCoin?.walletBalance ?? "0");

    // ── 2b. Dynamic Risk Management ─────────────────────────────────────────
    const recentLosses = tradeLog.filter(
      (t) => t.status === "executed" && Date.now() - t.timestamp < 3_600_000
    ).length;
    const consecutiveLosses = (() => {
      let count = 0;
      for (const t of tradeLog) {
        if (t.status !== "executed") continue;
        if (t.signal === "close" || t.signal?.includes("exit") || t.signal?.includes("precision")) break;
        count++;
        if (count >= 5) break;
      }
      return 0; // simplified — use available metric
    })();

    const dynRisk = calculateDynamicRisk({
      consecutiveLosses,
      maxConsecutiveLosses: 5,
      drawdownPct: 0, // unknown without equity tracking for live
      availableBalance: availableUSDT,
      maxPositionUSDT: autoConfig.maxPositionUSDT,
      maxLeverage: autoConfig.leverage > 1 ? autoConfig.leverage : 5,
    });

    if (!dynRisk.shouldTrade) {
      aiLog.waiting(dynRisk.reason);
      logActivity({ source: "auto", level: "warning", message: `⚠ RISK MGMT: ${dynRisk.reason}` });
      engineStatus.lastOrdersPlaced = 0;
      return;
    }

    const maxPerTrade = Math.max(5.5, Math.min(dynRisk.positionUSDT, availableUSDT * 0.2));

    // ── 3. Position management — use Institutional analysis for exit ──────────
    let ordersPlaced = 0;

    for (const pos of openPositions) {
      if (!pos.size || parseFloat(pos.size) === 0) continue;

      let posAnalysis: Awaited<ReturnType<typeof analyzeInstitutional>> | null = null;
      try { posAnalysis = await analyzeInstitutional(pos.symbol); }
      catch (err) { logger.warn({ err, symbol: pos.symbol }, "Institutional analysis failed for position monitoring"); continue; }

      const isLong = pos.side === "Buy";
      const shouldClose = isLong ? posAnalysis.shouldExitLong : posAnalysis.shouldExitShort;

      if (!shouldClose) continue;

      const closeSide: "Buy" | "Sell" = isLong ? "Sell" : "Buy";
      try {
        const closeOrder = await closePosition(pos.symbol, closeSide, pos.size);
        const closeMsg = posAnalysis.exitReason ?? `Tren berbalik — institutional exit ${isLong ? "LONG" : "SHORT"}`;
        logger.info({ symbol: pos.symbol, closeSide, size: pos.size, orderId: closeOrder.orderId }, closeMsg);

        // Trigger SL Failure Analysis if this was a forced close (not profit)
        const st = livePositionStates.get(pos.symbol);
        if (st) {
          const markPrice = parseFloat(pos.avgPrice ?? "0");
          const pnlPct = isLong
            ? (markPrice - st.entryPrice) / st.entryPrice * 100
            : (st.entryPrice - markPrice) / st.entryPrice * 100;
          if (pnlPct < 0) {
            try {
              analyzeSLFailure({
                tradeId: `live_${pos.symbol}_${st.openedAt}`,
                symbol: pos.symbol,
                side: isLong ? "long" : "short",
                entryPrice: st.entryPrice,
                slPrice: st.stopLoss ?? markPrice,
                exitPrice: markPrice,
                pnlPct,
                confidence: st.confidence,
                strategy: "auto_institutional",
                holdTimeMs: Date.now() - st.openedAt,
                isChoppy: posAnalysis.marketCondition === "choppy",
                liquiditySweepDetected: posAnalysis.liquiditySweep?.detected ?? false,
              });
            } catch { /* non-critical */ }
          }
          try {
            learnFromTradeOutcome({
              tradeId: `live_${pos.symbol}_${st.openedAt}`,
              symbol: pos.symbol,
              finalProfitPct: pnlPct,
              closedAs: "manual",
            });
          } catch { /* non-critical */ }
          livePositionStates.delete(pos.symbol);
          lastKnownPositionSymbols.delete(pos.symbol);
        }

        tradeLog.unshift({
          id: crypto.randomUUID(), timestamp: Date.now(),
          symbol: pos.symbol, side: closeSide, qty: pos.size,
          price: parseFloat(pos.avgPrice), confidence: posAnalysis.overallConfidence,
          signal: "close", status: "executed", reason: closeMsg, orderId: closeOrder.orderId,
        });
        if (tradeLog.length > 200) tradeLog.splice(200);
        activeSymbols.delete(pos.symbol);

        // Open reverse if institutional analysis confirms new direction
        if (posAnalysis.institutionalShouldTrade && posAnalysis.shouldEnter && posAnalysis.side && posAnalysis.side !== pos.side) {
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
            // Register new position state
            livePositionStates.set(pos.symbol, {
              symbol: pos.symbol,
              side: posAnalysis.side,
              entryPrice: reversePrice,
              openedAt: Date.now(),
              confidence: posAnalysis.overallConfidence,
              stopLoss: reverseSL,
              takeProfit: reverseTP,
              trailActivated: false,
              trailPeakPrice: null,
            });
            lastKnownPositionSymbols.add(pos.symbol);
            logger.info({ symbol: pos.symbol, side: posAnalysis.side, qty: reverseQty, orderId: reverseOrder.orderId }, `Auto-reversed to ${reverseLabel}`);
          } catch (err) {
            logger.warn({ err, symbol: pos.symbol }, "Failed to place reverse order");
          }
        }
      } catch (err) {
        logger.warn({ err, symbol: pos.symbol }, "Failed to close position for reversal");
      }
    }

    // ── 4. Open new positions using Institutional AI analysis ────────────────
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

      // Full Institutional AI analysis gate
      let analysis: Awaited<ReturnType<typeof analyzeInstitutional>> | null = null;
      try {
        analysis = await analyzeInstitutional(cand.symbol);
      } catch (err) {
        logger.warn({ err, symbol: cand.symbol }, "Institutional analysis unavailable, skipping");
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

      // Institutional engine must agree: condition tradeable + direction matches
      if (!analysis.institutionalShouldTrade || !analysis.shouldEnter || analysis.side !== cand.side) {
        const reason = !analysis.institutionalShouldTrade
          ? `Kondisi pasar tidak ideal: ${analysis.conditionLabel}`
          : !analysis.shouldEnter
            ? (analysis.waitReason ?? "Kondisi belum optimal")
            : `Arah berbeda (kandidat: ${cand.side}, analisis: ${analysis.side ?? "sideways"})`;
        logger.info({ symbol: cand.symbol, reason, condition: analysis.marketCondition }, "Entry skipped by institutional analysis");
        tradeLog.unshift({
          id: crypto.randomUUID(), timestamp: Date.now(),
          symbol: cand.symbol, side: cand.side ?? "Buy", qty: "0", price: cand.price,
          confidence: analysis.institutionalConfidence, signal: cand.signal,
          status: "rejected", reason,
        });
        if (tradeLog.length > 200) tradeLog.splice(200);
        skippedAuto++;
        continue;
      }

      const tradeSide = analysis.side as "Buy" | "Sell";
      const execPrice = autoConfig.orderType === "Limit" ? cand.limitPrice : cand.price;
      const qty = formatQty(maxPerTrade / execPrice, execPrice);

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
        confidence: analysis.institutionalConfidence, signal: cand.signal,
        status: "pending", reason: `[${analysis.conditionLabel}] ${reasonSummary}`,
      };

      const direction = tradeSide === "Sell" ? "SHORT" : "LONG";
      logActivity({
        source: "auto",
        level: "signal",
        message: `⚡ Membuka posisi ${direction} ${cand.symbol} @ $${execPrice.toFixed(4)} (conf: ${analysis.institutionalConfidence}% | ${analysis.conditionLabel} | ${autoConfig.orderType})`,
        symbol: cand.symbol,
        confidence: analysis.institutionalConfidence,
      });

      try {
        const order = await placeOrder({
          symbol: cand.symbol, side: tradeSide, qty,
          orderType: autoConfig.orderType,
          price: autoConfig.orderType === "Limit" ? cand.limitPrice : undefined,
        });

        await setPositionTPSL({ symbol: cand.symbol, takeProfit: tpPrice, stopLoss: slPrice }, 1500)
          .catch((e) => logger.warn({ e, symbol: cand.symbol }, "Failed to set TP/SL"));

        logEntry.status = "executed";
        logEntry.orderId = order.orderId;
        activeSymbols.add(cand.symbol);
        ordersPlaced++;

        // Register live position state for AI monitoring
        livePositionStates.set(cand.symbol, {
          symbol: cand.symbol,
          side: tradeSide,
          entryPrice: execPrice,
          openedAt: Date.now(),
          confidence: analysis.institutionalConfidence,
          stopLoss: slPrice,
          takeProfit: tpPrice,
          trailActivated: false,
          trailPeakPrice: null,
        });
        lastKnownPositionSymbols.add(cand.symbol);

        logActivity({
          source: "auto",
          level: "success",
          message: `✓ Posisi ${direction} ${cand.symbol} dibuka | TP: $${tpPrice.toFixed(4)} | SL: $${slPrice.toFixed(4)} | ${analysis.conditionLabel}`,
          symbol: cand.symbol,
          confidence: analysis.institutionalConfidence,
        });
        logger.info(
          { symbol: cand.symbol, side: tradeSide, qty, orderId: order.orderId,
            confidence: analysis.institutionalConfidence, condition: analysis.marketCondition, slPrice, tpPrice },
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
  if (precisionInterval) clearInterval(precisionInterval);
  if (precisionPositionMonitorInterval) clearInterval(precisionPositionMonitorInterval);
  if (livePositionMonitorInterval) clearInterval(livePositionMonitorInterval);

  engineStatus.running = true;
  engineStatus.nextCycleAt = Date.now() + autoConfig.intervalMs;

  // ── Live Position AI Monitor — always active (every 10s) ──────────────────
  livePositionMonitorInterval = setInterval(() => {
    void runLivePositionMonitor();
  }, 10_000);
  void runLivePositionMonitor();

  if (autoConfig.precisionMode) {
    // ── PRECISION MODE — sniper cycle + position monitor ────────────────────
    engineStatus.precisionSniperStatus = "Memindai setup terbaik...";
    precisionInterval = setInterval(() => {
      engineStatus.nextCycleAt = Date.now() + autoConfig.intervalMs;
      void runPrecisionModeCycle();
    }, autoConfig.intervalMs);
    // Position monitor every 15 seconds
    precisionPositionMonitorInterval = setInterval(() => {
      void runPrecisionPositionMonitor();
    }, 15_000);
    void runPrecisionModeCycle();
    void runPrecisionPositionMonitor();
    logger.info({ intervalMs: autoConfig.intervalMs }, "Precision sniper engine started (with AI position monitor)");
  } else {
    // ── STANDARD MODE — bidirectional institutional auto cycle + scalp monitor
    autoInterval = setInterval(() => {
      engineStatus.nextCycleAt = Date.now() + autoConfig.intervalMs;
      void runAutoTradeCycle();
    }, autoConfig.intervalMs);
    scalpInterval = setInterval(() => {
      void runScalpMonitor();
    }, 10_000);
    void runAutoTradeCycle();
    void runScalpMonitor();
    logger.info({ intervalMs: autoConfig.intervalMs, scalpEnabled: autoConfig.scalpEnabled }, "Institutional auto-trading engine started (with Human Instinct + Trail AI)");
  }
}

export function stopAutoEngine() {
  if (autoInterval) { clearInterval(autoInterval); autoInterval = null; }
  if (scalpInterval) { clearInterval(scalpInterval); scalpInterval = null; }
  if (precisionInterval) { clearInterval(precisionInterval); precisionInterval = null; }
  if (precisionPositionMonitorInterval) { clearInterval(precisionPositionMonitorInterval); precisionPositionMonitorInterval = null; }
  if (livePositionMonitorInterval) { clearInterval(livePositionMonitorInterval); livePositionMonitorInterval = null; }
  engineStatus.running = false;
  engineStatus.analyzing = false;
  engineStatus.scalpMonitoring = false;
  engineStatus.nextCycleAt = null;
  engineStatus.precisionSniperStatus = "Engine dimatikan";
  logger.info("Auto-trading engine stopped");
}

export function getLivePositionStates() {
  return Object.fromEntries(livePositionStates.entries());
}
