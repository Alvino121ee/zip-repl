import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import {
  analyzeInstitutional,
  calculateDynamicRisk,
  shouldSwitchOpportunity,
  type OpportunityScore,
  type MarketConditionType,
} from "./institutional-engine.js";
import { logActivity } from "./activity-log.js";
import {
  learnFromTradeOutcome,
} from "./human-instinct-engine.js";
import { analyzeSLFailure } from "./sl-failure-analysis.js";
import {
  adjustConfidence,
  isSymbolEligible,
  getBrainRecommendedConfig,
  learnFromOutcome,
  detectMarketCondition,
} from "./ai-brain.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const DATA_FILE = join(DATA_DIR, "demo-forex.json");
const CONFIG_FILE = join(DATA_DIR, "demo-forex-config.json");

const BYBIT_BASE = "https://api.bybit.com";
export const FOREX_INITIAL_BALANCE = 50;
export const TAKER_FEE_RATE = 0.00055;

// ─── Forex/Commodity Universe ─────────────────────────────────────────────────
// Pasangan yang tersedia sebagai USDT linear perpetual di Bybit

export const FOREX_UNIVERSE: { symbol: string; displayName: string; category: string; emoji: string }[] = [
  { symbol: "XAUUSDT",   displayName: "Gold / USDT",   category: "Komoditas",  emoji: "🥇" },
  { symbol: "XAGUUSDT",  displayName: "Silver / USDT",  category: "Komoditas",  emoji: "⚪" },
  { symbol: "EURUSDT",   displayName: "EUR / USDT",     category: "Forex",      emoji: "🇪🇺" },
  { symbol: "GBPUSDT",   displayName: "GBP / USDT",     category: "Forex",      emoji: "🇬🇧" },
  { symbol: "BNBUSDT",   displayName: "BNB / USDT",     category: "Crypto Macro", emoji: "🔶" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ForexPosition {
  id: string;
  symbol: string;
  displayName: string;
  category: string;
  emoji: string;
  side: "Buy" | "Sell";
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  margin: number;
  stopLoss: number | null;
  takeProfit: number | null;
  unrealisedPnl: number;
  unrealisedPnlPct: number;
  openedAt: number;
  source: "auto" | "scalp" | "manual";
  confidence: number;
  signal: string;
  openReason?: string;
  tags?: string[];
  marketCondition?: string;
  entryFee: number;
  trailActivated?: boolean;
  trailPeakPrice?: number;
  opportunityScore?: number;
}

export interface ForexTradeLog {
  id: string;
  timestamp: number;
  openedAt?: number;
  closedAt?: number;
  duration?: number;
  symbol: string;
  displayName: string;
  category: string;
  emoji: string;
  side: "Buy" | "Sell";
  qty: number;
  entryPrice: number;
  closePrice: number | null;
  realizedPnl: number | null;
  realizedPnlPct: number | null;
  leverage: number;
  margin: number;
  confidence: number;
  signal: string;
  status: "opened" | "closed_tp" | "closed_sl" | "closed_manual" | "rejected";
  reason: string;
  openReason?: string;
  source: "auto" | "scalp" | "manual";
  tags?: string[];
  marketCondition?: string;
  fee?: number;
  entryFee?: number;
  exitFee?: number;
}

export interface ForexConfig {
  autoEnabled: boolean;
  autoMode: "auto" | "semi";
  minConfidence: number;
  maxPositionUSDT: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPositions: number;
  leverage: number;
  intervalMs: number;
}

export interface ForexBalance {
  total: number;
  available: number;
  usedMargin: number;
  realizedPnl: number;
  unrealisedPnl: number;
  winCount: number;
  lossCount: number;
  winRate: number;
}

export interface ForexEngineStatus {
  autoRunning: boolean;
  autoAnalyzing: boolean;
  lastCycleAt: number | null;
  nextCycleAt: number | null;
  cycleCount: number;
  lastSignalsFound: number;
  totalScanned: number;
  lastError: string | null;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface ForexState {
  balance: number;
  realizedPnl: number;
  totalFees: number;
  winCount: number;
  lossCount: number;
  positions: ForexPosition[];
  log: ForexTradeLog[];
  equityHistory: { timestamp: number; balance: number }[];
}

let state: ForexState = {
  balance: FOREX_INITIAL_BALANCE,
  realizedPnl: 0,
  totalFees: 0,
  winCount: 0,
  lossCount: 0,
  positions: [],
  log: [],
  equityHistory: [{ timestamp: Date.now(), balance: FOREX_INITIAL_BALANCE }],
};

export const forexConfig: ForexConfig = {
  autoEnabled: true,
  autoMode: "auto",
  minConfidence: 72,
  maxPositionUSDT: 10,
  stopLossPct: 1.5,
  takeProfitPct: 3,
  maxPositions: 3,
  leverage: 3,
  intervalMs: 30_000,
};

export const forexEngineStatus: ForexEngineStatus = {
  autoRunning: false,
  autoAnalyzing: false,
  lastCycleAt: null,
  nextCycleAt: null,
  cycleCount: 0,
  lastSignalsFound: 0,
  totalScanned: 0,
  lastError: null,
};

// ─── Persistence ──────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  try {
    ensureDataDir();
    if (!existsSync(DATA_FILE)) return;
    const saved = JSON.parse(readFileSync(DATA_FILE, "utf-8")) as Partial<ForexState>;
    state = { ...state, ...saved, totalFees: saved.totalFees ?? 0, equityHistory: saved.equityHistory ?? [{ timestamp: Date.now(), balance: saved.balance ?? FOREX_INITIAL_BALANCE }] };
    logger.info({ balance: state.balance, positions: state.positions.length }, "Demo Forex state loaded");
  } catch (err) {
    logger.warn({ err }, "Failed to load demo forex state");
  }
}

function saveState() {
  try {
    ensureDataDir();
    writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to save demo forex state");
  }
}

export function saveForexConfig() {
  try {
    ensureDataDir();
    writeFileSync(CONFIG_FILE, JSON.stringify(forexConfig, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to save forex config");
  }
}

(function loadForexConfig() {
  try {
    ensureDataDir();
    if (!existsSync(CONFIG_FILE)) return;
    Object.assign(forexConfig, JSON.parse(readFileSync(CONFIG_FILE, "utf-8")));
    logger.info({ config: forexConfig }, "Demo Forex config loaded");
  } catch (err) {
    logger.warn({ err }, "Failed to load forex config");
  }
})();

loadState();

setImmediate(() => {
  if (forexConfig.autoEnabled) {
    startForexAutoEngine();
    logger.info("Demo Forex auto engine resumed");
  }
});

// ─── Market price fetching ────────────────────────────────────────────────────

async function getMarkPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${BYBIT_BASE}/v5/market/tickers?category=linear&symbol=${symbol}`);
    if (!res.ok) return null;
    const data = await res.json() as { retCode: number; result: { list: { lastPrice: string; markPrice: string }[] } };
    if (data.retCode !== 0 || !data.result.list[0]) return null;
    return parseFloat(data.result.list[0].markPrice || data.result.list[0].lastPrice);
  } catch {
    return null;
  }
}

// ─── Brain helpers ────────────────────────────────────────────────────────────

function mapToBrainCondition(mct: MarketConditionType): ReturnType<typeof detectMarketCondition> {
  if (mct === "trending_up_strong" || mct === "trending_up_normal") return "trending_up";
  if (mct === "trending_down_strong" || mct === "trending_down_normal") return "trending_down";
  if (mct === "volatile" || mct === "breakout") return "volatile";
  if (mct === "manipulation") return "low_liquidity";
  return "sideways";
}

function mapReasonsToIndicators(reasons: string[], side: "Buy" | "Sell"): string[] {
  const combined = reasons.join(" ").toLowerCase();
  const keys: string[] = [];
  if (combined.includes("rsi")) {
    keys.push(side === "Buy" ? "rsi_oversold" : "rsi_overbought");
  }
  if (combined.includes("ema") || combined.includes("golden cross")) keys.push("ema_golden_cross");
  if (combined.includes("death cross")) keys.push("ema_death_cross");
  if (combined.includes("macd")) keys.push(side === "Buy" ? "macd_bullish" : "macd_bearish");
  if (combined.includes("bos") || combined.includes("break of structure")) keys.push(side === "Buy" ? "bos_bullish" : "bos_bearish");
  if (combined.includes("order block")) keys.push(side === "Buy" ? "order_block_demand" : "order_block_supply");
  if (combined.includes("fvg") || combined.includes("fair value")) keys.push(side === "Buy" ? "fvg_bullish" : "fvg_bearish");
  if (combined.includes("vwap")) keys.push(side === "Buy" ? "vwap_above" : "vwap_below");
  if (combined.includes("momentum")) keys.push("momentum_strong");
  if (combined.includes("multi") || combined.includes("timeframe")) keys.push("multi_tf_aligned");
  if (combined.includes("volume")) keys.push("volume_spike");
  if (combined.includes("bollinger") || combined.includes("squeeze")) keys.push("bb_squeeze");
  return [...new Set(keys)];
}

// ─── Universe scan ────────────────────────────────────────────────────────────

export async function scanForexUniverse(): Promise<{ symbol: string; displayName: string; category: string; emoji: string; price: number; change24h: number; confidence: number; side: "Buy" | "Sell" | null }[]> {
  const results: { symbol: string; displayName: string; category: string; emoji: string; price: number; change24h: number; confidence: number; side: "Buy" | "Sell" | null }[] = [];

  for (const pair of FOREX_UNIVERSE) {
    try {
      const res = await fetch(`${BYBIT_BASE}/v5/market/tickers?category=linear&symbol=${pair.symbol}`);
      if (!res.ok) continue;
      const data = await res.json() as { retCode: number; result: { list: { lastPrice: string; price24hPcnt: string }[] } };
      if (data.retCode !== 0 || !data.result.list[0]) continue;

      const item = data.result.list[0];
      const price = parseFloat(item.lastPrice);
      const change24h = parseFloat(item.price24hPcnt) * 100;
      const absChange = Math.abs(change24h);

      // Quick confidence estimate based on momentum
      const momentum = absChange > 0.5 ? Math.min(85, 65 + absChange * 8) : 60;
      const side: "Buy" | "Sell" | null = change24h > 0.2 ? "Buy" : change24h < -0.2 ? "Sell" : null;

      results.push({ symbol: pair.symbol, displayName: pair.displayName, category: pair.category, emoji: pair.emoji, price, change24h, confidence: momentum, side });
    } catch {
      continue;
    }
  }

  return results;
}

// ─── PnL calculation ──────────────────────────────────────────────────────────

function calcPnl(pos: ForexPosition, markPrice: number): { pnl: number; pnlPct: number } {
  const diff = pos.side === "Buy" ? markPrice - pos.entryPrice : pos.entryPrice - markPrice;
  const pnl = diff * pos.size * pos.leverage;
  const pnlPct = (diff / pos.entryPrice) * 100 * pos.leverage;
  return { pnl, pnlPct };
}

function getForexMeta(symbol: string) {
  return FOREX_UNIVERSE.find(p => p.symbol === symbol) ?? { displayName: symbol, category: "Forex", emoji: "💱" };
}

function generateTags(data: { source: "auto" | "scalp" | "manual"; confidence: number; signal: string; leverage: number; pnl?: number }): string[] {
  const tags: string[] = [];
  if (data.source === "auto") tags.push("Auto AI");
  else tags.push("Manual");
  if (data.confidence >= 90) tags.push("Kepercayaan Tinggi");
  else if (data.confidence >= 80) tags.push("Setup Aman");
  else tags.push("Entry Moderat");
  if (data.signal.toLowerCase().includes("gold") || data.signal.includes("XAU")) tags.push("Gold");
  if (data.pnl != null) { if (data.pnl > 0) tags.push("Profit"); else if (data.pnl < 0) tags.push("Loss"); }
  return [...new Set(tags)];
}

// ─── Open position ────────────────────────────────────────────────────────────

export function openForexPosition(data: {
  symbol: string;
  side: "Buy" | "Sell";
  entryPrice: number;
  positionUSDT: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  confidence: number;
  signal: string;
  source: "auto" | "scalp" | "manual";
  openReason?: string;
  marketCondition?: string;
}): ForexPosition | { error: string } {
  const meta = getForexMeta(data.symbol);
  const margin = data.positionUSDT;
  const usedMargin = state.positions.reduce((s, p) => s + p.margin, 0);
  const available = state.balance - usedMargin;

  if (available < margin) return { error: `Saldo tidak cukup. Tersedia: $${available.toFixed(2)}, dibutuhkan: $${margin.toFixed(2)}` };
  if (state.positions.length >= forexConfig.maxPositions) return { error: `Maksimal ${forexConfig.maxPositions} posisi aktif` };
  if (state.positions.find(p => p.symbol === data.symbol)) return { error: `Posisi ${data.symbol} sudah terbuka` };

  const size = (margin * data.leverage) / data.entryPrice;
  const entryFee = size * data.entryPrice * TAKER_FEE_RATE;
  state.balance -= entryFee;
  state.totalFees += entryFee;

  const tags = generateTags({ source: data.source, confidence: data.confidence, signal: data.signal, leverage: data.leverage });

  const pos: ForexPosition = {
    id: crypto.randomUUID(),
    symbol: data.symbol,
    displayName: meta.displayName,
    category: meta.category,
    emoji: meta.emoji,
    side: data.side,
    size,
    entryPrice: data.entryPrice,
    markPrice: data.entryPrice,
    leverage: data.leverage,
    margin,
    stopLoss: data.stopLoss,
    takeProfit: data.takeProfit,
    unrealisedPnl: 0,
    unrealisedPnlPct: 0,
    openedAt: Date.now(),
    source: data.source,
    confidence: data.confidence,
    signal: data.signal,
    openReason: data.openReason,
    tags,
    marketCondition: data.marketCondition,
    entryFee,
  };

  state.positions.push(pos);
  state.log.unshift({
    id: crypto.randomUUID(), timestamp: Date.now(), openedAt: pos.openedAt,
    symbol: data.symbol, displayName: meta.displayName, category: meta.category, emoji: meta.emoji,
    side: data.side, qty: size, entryPrice: data.entryPrice, closePrice: null,
    realizedPnl: null, realizedPnlPct: null, leverage: data.leverage, margin,
    confidence: data.confidence, signal: data.signal, status: "opened",
    reason: `${meta.emoji} ${data.side === "Buy" ? "LONG" : "SHORT"} ${meta.displayName} @ $${data.entryPrice.toFixed(data.entryPrice > 100 ? 2 : 4)} | Fee: -$${entryFee.toFixed(4)}`,
    openReason: data.openReason, entryFee, fee: entryFee, source: data.source, tags, marketCondition: data.marketCondition,
  });
  if (state.log.length > 300) state.log.splice(300);
  saveState();

  logActivity({
    source: "demo", level: "info",
    message: `${meta.emoji} FOREX OPEN ${data.side === "Buy" ? "LONG" : "SHORT"} ${meta.displayName} @ $${data.entryPrice.toFixed(data.entryPrice > 100 ? 2 : 4)} | ${data.confidence}%`,
    symbol: data.symbol,
  });

  return pos;
}

// ─── Close position ───────────────────────────────────────────────────────────

export function closeForexPosition(
  posId: string,
  reason: "tp" | "sl" | "manual" | "reversal",
  markPrice?: number,
  reversalNote?: string
): ForexTradeLog | { error: string } {
  const idx = state.positions.findIndex(p => p.id === posId);
  if (idx === -1) return { error: "Posisi tidak ditemukan" };
  const pos = state.positions[idx];

  const closePrice = markPrice ?? pos.markPrice;
  const { pnl, pnlPct } = calcPnl(pos, closePrice);
  const closedAt = Date.now();
  const duration = closedAt - pos.openedAt;

  const exitFee = pos.size * closePrice * TAKER_FEE_RATE;
  const entryFee = pos.entryFee ?? 0;
  const totalFee = entryFee + exitFee;
  const netPnl = pnl - exitFee;
  state.totalFees += exitFee;
  state.realizedPnl += netPnl;
  state.balance += netPnl;
  if (netPnl >= 0) state.winCount++; else state.lossCount++;

  const unrealisedPnl = state.positions.filter(p => p.id !== posId).reduce((s, p) => s + p.unrealisedPnl, 0);
  state.equityHistory.push({ timestamp: closedAt, balance: Math.max(0, state.balance + unrealisedPnl) });
  if (state.equityHistory.length > 500) state.equityHistory.splice(0, state.equityHistory.length - 500);

  const statusMap = { tp: "closed_tp", sl: "closed_sl", manual: "closed_manual", reversal: "closed_manual" } as const;
  const price4 = closePrice > 100 ? closePrice.toFixed(2) : closePrice.toFixed(4);
  const reasonText = reason === "tp" ? `Take Profit @ $${price4}` : reason === "sl" ? `Stop Loss @ $${price4}` : reason === "reversal" ? (reversalNote ?? "Auto-exit tren berbalik") : `Manual close @ $${price4}`;

  const tags = generateTags({ source: pos.source, confidence: pos.confidence, signal: pos.signal, leverage: pos.leverage, pnl });

  const logEntry: ForexTradeLog = {
    id: crypto.randomUUID(), timestamp: closedAt, openedAt: pos.openedAt, closedAt, duration,
    symbol: pos.symbol, displayName: pos.displayName, category: pos.category, emoji: pos.emoji,
    side: pos.side === "Buy" ? "Sell" : "Buy", qty: pos.size,
    entryPrice: pos.entryPrice, closePrice, realizedPnl: netPnl, realizedPnlPct: pnlPct,
    leverage: pos.leverage, margin: pos.margin, confidence: pos.confidence, signal: pos.signal,
    status: statusMap[reason], reason: reasonText, openReason: pos.openReason, source: pos.source,
    tags, marketCondition: pos.marketCondition, fee: totalFee, entryFee, exitFee,
  };

  state.positions.splice(idx, 1);
  state.log.unshift(logEntry);
  if (state.log.length > 300) state.log.splice(300);
  saveState();

  try {
    const rawPnlPct = pos.leverage > 0 ? pnlPct / pos.leverage : pnlPct;
    const closedAs = reason === "tp" ? "tp" : reason === "sl" ? "sl" : "manual";
    learnFromTradeOutcome({ tradeId: pos.id, symbol: pos.symbol, finalProfitPct: rawPnlPct, closedAs });
  } catch { /* non-critical */ }

  // Ajarkan AI Brain dari hasil trade forex
  try {
    const brainCondition = detectMarketCondition({ priceChange24h: netPnl > 0 ? 2 : -2 });
    const indicators = mapReasonsToIndicators([pos.openReason ?? pos.signal], pos.side);
    learnFromOutcome({
      id: pos.id,
      symbol: pos.symbol,
      direction: pos.side === "Buy" ? "LONG" : "SHORT",
      confidence: pos.confidence,
      signal: pos.signal,
      result: netPnl > 0.01 ? "WIN" : netPnl < -0.01 ? "LOSS" : "NEUTRAL",
      priceDeltaPct: pos.leverage > 0 ? pnlPct / pos.leverage : pnlPct,
      reasoning: [pos.openReason ?? pos.signal, `Forex ${pos.category}`, pos.marketCondition ?? ""],
      indicatorsActive: indicators,
      condition: brainCondition,
      strategy: pos.source === "manual" ? "momentum" : "swing_1h",
      virtualPnl: netPnl,
    });
  } catch { /* non-critical */ }

  const icon = reason === "tp" ? "✅ TP" : reason === "sl" ? "❌ SL" : "🔒 TUTUP";
  const dir = pos.side === "Buy" ? "LONG" : "SHORT";
  logActivity({
    source: "demo", level: reason === "tp" ? "success" : reason === "sl" ? "warning" : "info",
    message: `${pos.emoji} ${icon} ${dir} ${pos.displayName} @ $${price4} | PnL: ${netPnl >= 0 ? "+" : ""}$${netPnl.toFixed(2)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)`,
    symbol: pos.symbol,
  });

  if (reason === "sl") {
    try {
      analyzeSLFailure({ tradeId: pos.id, symbol: pos.symbol, side: pos.side === "Buy" ? "long" : "short", entryPrice: pos.entryPrice, slPrice: pos.stopLoss ?? closePrice, exitPrice: closePrice, pnlPct: pos.leverage > 0 ? pnlPct / pos.leverage : pnlPct, confidence: pos.confidence, strategy: "forex_institutional", marketCondition: pos.marketCondition, holdTimeMs: duration, isChoppy: pos.marketCondition?.includes("choppy") ?? false, liquiditySweepDetected: false });
    } catch { /* non-critical */ }
  }

  return logEntry;
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export function getForexBalance(): ForexBalance {
  const usedMargin = state.positions.reduce((s, p) => s + p.margin, 0);
  const unrealisedPnl = state.positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  const total = Math.max(0, state.balance + unrealisedPnl);
  const available = Math.max(0, state.balance - usedMargin);
  const totalTrades = state.winCount + state.lossCount;
  return { total, available, usedMargin, realizedPnl: state.realizedPnl, unrealisedPnl, winCount: state.winCount, lossCount: state.lossCount, winRate: totalTrades > 0 ? (state.winCount / totalTrades) * 100 : 0 };
}

export function getForexPositions(): ForexPosition[] { return [...state.positions]; }
export function getForexLog(): ForexTradeLog[] { return [...state.log]; }

export function getForexStats() {
  const closedTrades = state.log.filter(e => ["closed_tp", "closed_sl", "closed_manual"].includes(e.status));
  const wins = closedTrades.filter(t => (t.realizedPnl ?? 0) > 0).length;
  const losses = closedTrades.filter(t => (t.realizedPnl ?? 0) <= 0).length;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const totalWinPnl = closedTrades.filter(t => (t.realizedPnl ?? 0) > 0).reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const totalLossPnl = Math.abs(closedTrades.filter(t => (t.realizedPnl ?? 0) <= 0).reduce((s, t) => s + (t.realizedPnl ?? 0), 0));
  const profitFactor = totalLossPnl > 0 ? totalWinPnl / totalLossPnl : totalWinPnl > 0 ? 999 : 0;
  const avgWin = wins > 0 ? totalWinPnl / wins : 0;
  const avgLoss = losses > 0 ? totalLossPnl / losses : 0;
  const totalPnl = state.realizedPnl;
  const totalPnlPct = (totalPnl / FOREX_INITIAL_BALANCE) * 100;

  // Max drawdown
  let peak = FOREX_INITIAL_BALANCE;
  let maxDrawdown = 0;
  for (const e of state.equityHistory) {
    if (e.balance > peak) peak = e.balance;
    const dd = peak - e.balance;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

  // Consecutive streaks
  let consecutiveWins = 0, consecutiveLosses = 0, maxW = 0, maxL = 0, curW = 0, curL = 0;
  for (const t of [...closedTrades].reverse()) {
    if ((t.realizedPnl ?? 0) > 0) { curW++; curL = 0; } else { curL++; curW = 0; }
    if (curW > maxW) maxW = curW;
    if (curL > maxL) maxL = curL;
  }
  const lastN = closedTrades.slice(0, 20);
  for (const t of lastN) {
    if ((t.realizedPnl ?? 0) > 0) { if (consecutiveLosses > 0) break; consecutiveWins++; }
    else { if (consecutiveWins > 0) break; consecutiveLosses++; }
  }

  // Pair performance
  const pairMap: Record<string, { wins: number; losses: number; pnl: number; trades: number }> = {};
  for (const t of closedTrades) {
    const p = pairMap[t.displayName] ?? { wins: 0, losses: 0, pnl: 0, trades: 0 };
    p.trades++;
    p.pnl += t.realizedPnl ?? 0;
    if ((t.realizedPnl ?? 0) > 0) p.wins++; else p.losses++;
    pairMap[t.displayName] = p;
  }

  return {
    totalTrades: state.log.filter(e => e.status !== "rejected").length,
    closedTrades: closedTrades.length,
    wins, losses, winRate, profitFactor,
    currentBalance: state.balance + state.positions.reduce((s, p) => s + p.unrealisedPnl, 0),
    initialBalance: FOREX_INITIAL_BALANCE,
    totalPnl, totalPnlPct,
    avgWin, avgLoss,
    largestWin: wins > 0 ? Math.max(...closedTrades.filter(t => (t.realizedPnl ?? 0) > 0).map(t => t.realizedPnl ?? 0)) : 0,
    largestLoss: losses > 0 ? Math.abs(Math.min(...closedTrades.filter(t => (t.realizedPnl ?? 0) <= 0).map(t => t.realizedPnl ?? 0))) : 0,
    consecutiveWins, consecutiveLosses,
    maxConsecutiveWins: maxW, maxConsecutiveLosses: maxL,
    maxDrawdown, maxDrawdownPct,
    equityHistory: state.equityHistory.slice(-100),
    totalFees: state.totalFees,
    pairPerformance: Object.entries(pairMap).map(([pair, d]) => ({ pair, ...d, winRate: d.trades > 0 ? (d.wins / d.trades) * 100 : 0 })),
  };
}

export function resetForexDemo() {
  state = {
    balance: FOREX_INITIAL_BALANCE,
    realizedPnl: 0,
    totalFees: 0,
    winCount: 0,
    lossCount: 0,
    positions: [],
    log: [],
    equityHistory: [{ timestamp: Date.now(), balance: FOREX_INITIAL_BALANCE }],
  };
  saveState();
}

// ─── Mark price updater ───────────────────────────────────────────────────────

async function updateMarkPrices() {
  for (const pos of [...state.positions]) {
    const price = await getMarkPrice(pos.symbol);
    if (!price) continue;
    const { pnl, pnlPct } = calcPnl(pos, price);
    pos.markPrice = price;
    pos.unrealisedPnl = pnl;
    pos.unrealisedPnlPct = pnlPct;

    if (pos.stopLoss != null) {
      const slHit = pos.side === "Buy" ? price <= pos.stopLoss : price >= pos.stopLoss;
      if (slHit) { closeForexPosition(pos.id, "sl", price); continue; }
    }
    if (pos.takeProfit != null) {
      const tpHit = pos.side === "Buy" ? price >= pos.takeProfit : price <= pos.takeProfit;
      if (tpHit) { closeForexPosition(pos.id, "tp", price); continue; }
    }
  }
  saveState();
}

setInterval(() => {
  updateMarkPrices().catch(err => logger.error({ err }, "Forex mark price update error"));
}, 10_000);

// ─── Auto Trading Engine ──────────────────────────────────────────────────────

let autoTimer: ReturnType<typeof setInterval> | null = null;
let lastSwitchAt = 0;
let switchesToday = 0;
let switchDayKey = "";

async function runForexEngineCycle() {
  if (forexEngineStatus.autoAnalyzing) return;
  forexEngineStatus.autoAnalyzing = true;
  forexEngineStatus.lastCycleAt = Date.now();
  forexEngineStatus.cycleCount++;

  try {
    logActivity({ source: "demo", level: "scan", message: `🔍 [Forex] Memindai ${FOREX_UNIVERSE.length} pair forex/komoditas...` });

    const candidates = await scanForexUniverse();
    forexEngineStatus.totalScanned = candidates.length;

    const stats = getForexStats();
    const drawdownPct = stats.maxDrawdownPct;
    const usedMargin = state.positions.reduce((s, p) => s + p.margin, 0);
    const available = state.balance - usedMargin;

    // Ambil rekomendasi dari AI Brain untuk threshold dinamis
    let brainMinConfidence = forexConfig.minConfidence;
    try {
      const brainRec = getBrainRecommendedConfig();
      // Gunakan threshold brain hanya jika lebih tinggi (lebih konservatif)
      brainMinConfidence = Math.max(forexConfig.minConfidence, brainRec.minConfidence);
      if (brainRec.minConfidence !== forexConfig.minConfidence) {
        logger.info({ institutional: forexConfig.minConfidence, brain: brainRec.minConfidence, effective: brainMinConfidence }, "[Brain Forex] Threshold confidence dinamis dari brain");
      }
    } catch { /* non-critical */ }

    const dynRisk = calculateDynamicRisk({
      consecutiveLosses: stats.consecutiveLosses,
      maxConsecutiveLosses: 5,
      drawdownPct,
      availableBalance: available,
      maxPositionUSDT: forexConfig.maxPositionUSDT,
      maxLeverage: forexConfig.leverage,
    });

    if (!dynRisk.shouldTrade) {
      logActivity({ source: "demo", level: "warning", message: `⚠ [Forex] Risk guard: ${dynRisk.reason}` });
      return;
    }

    const maxPerTrade = Math.max(0.5, Math.min(dynRisk.positionUSDT, available * 0.3));
    const effectiveLeverage = Math.min(dynRisk.leverage, forexConfig.leverage);
    const preFiltered = candidates.filter(c => c.confidence >= forexConfig.minConfidence - 10 && c.side !== null);
    forexEngineStatus.lastSignalsFound = preFiltered.length;

    // Opportunity pool for switching
    const opportunityPool: OpportunityScore[] = [];

    // Check existing positions for exit
    for (const pos of [...state.positions]) {
      try {
        const analysis = await analyzeInstitutional(pos.symbol);
        const isLong = pos.side === "Buy";
        const shouldClose = isLong ? analysis.shouldExitLong : analysis.shouldExitShort;
        if (shouldClose) {
          const exitNote = analysis.exitReason ?? `[Forex AI] Tren berbalik — institutional exit`;
          const price = await getMarkPrice(pos.symbol);
          closeForexPosition(pos.id, "reversal", price ?? undefined, exitNote);
          continue;
        }
        opportunityPool.push({ symbol: pos.symbol, side: pos.side, confidence: pos.confidence, opportunityScore: pos.opportunityScore ?? pos.confidence, marketCondition: (pos.marketCondition ?? "ranging") as any, entryPrice: analysis.entryPrice, stopLoss: analysis.stopLoss, takeProfit: analysis.takeProfit, reasons: analysis.reasons });
      } catch { continue; }
    }

    // Deep analysis of candidates
    for (const cand of preFiltered.slice(0, 5)) {
      if (state.positions.find(p => p.symbol === cand.symbol)) continue;
      try {
        await new Promise(r => setTimeout(r, 100));
        const analysis = await analyzeInstitutional(cand.symbol, { consecutiveLosses: stats.consecutiveLosses, drawdownPct, availableBalance: available, maxPositionUSDT: forexConfig.maxPositionUSDT, maxLeverage: forexConfig.leverage });
        if (analysis.opportunityScore > 0) {
          opportunityPool.push({ symbol: cand.symbol, side: analysis.side, confidence: analysis.institutionalConfidence, opportunityScore: analysis.opportunityScore, marketCondition: analysis.marketCondition, entryPrice: analysis.entryPrice, stopLoss: analysis.stopLoss, takeProfit: analysis.takeProfit, reasons: analysis.reasons });
        }
      } catch { continue; }
    }

    // Smart switching
    const dayKey = new Date().toISOString().slice(0, 10);
    if (switchDayKey !== dayKey) { switchDayKey = dayKey; switchesToday = 0; }
    for (const pos of [...state.positions]) {
      const rawProfitPct = pos.side === "Buy" ? (pos.markPrice - pos.entryPrice) / pos.entryPrice * 100 : (pos.entryPrice - pos.markPrice) / pos.entryPrice * 100;
      const switchDecision = shouldSwitchOpportunity({ currentSymbol: pos.symbol, currentConfidence: pos.confidence, currentOpportunityScore: pos.opportunityScore ?? pos.confidence, unrealisedPnlPct: rawProfitPct, durationMs: Date.now() - pos.openedAt, candidates: opportunityPool.filter(o => o.symbol !== pos.symbol), lastSwitchAt, switchesToday });
      if (switchDecision.shouldSwitch && switchDecision.newSymbol) {
        const price = await getMarkPrice(pos.symbol);
        closeForexPosition(pos.id, "manual", price ?? undefined, `Switch modal ke ${switchDecision.newSymbol}`);
        lastSwitchAt = Date.now(); switchesToday++;
        logActivity({ source: "demo", level: "signal", message: `🔄 [Forex] SWITCH: ${pos.displayName} → ${switchDecision.newSymbol} | ${switchDecision.reason}`, symbol: switchDecision.newSymbol });
        break;
      }
    }

    // Open new positions dengan AI Brain integration
    let opened = 0, signaled = 0, brainSkipped = 0;
    for (const cand of preFiltered) {
      if (state.positions.length >= forexConfig.maxPositions) break;
      if (state.positions.find(p => p.symbol === cand.symbol)) continue;

      try {
        // 🧠 Cek eligibilitas dari AI Brain
        const eligibility = isSymbolEligible(cand.symbol);
        if (!eligibility.eligible) {
          brainSkipped++;
          logActivity({ source: "demo", level: "warning", message: `🧠 [Brain] Skip ${cand.symbol}: ${eligibility.reason}` });
          continue;
        }

        await new Promise(r => setTimeout(r, 100));
        const analysis = await analyzeInstitutional(cand.symbol, { consecutiveLosses: stats.consecutiveLosses, drawdownPct, availableBalance: available, maxPositionUSDT: forexConfig.maxPositionUSDT, maxLeverage: forexConfig.leverage });

        if (!analysis.institutionalShouldTrade || !analysis.side) continue;

        // 🧠 Sesuaikan confidence dengan pengetahuan AI Brain
        const brainCondition = mapToBrainCondition(analysis.marketCondition);
        const indicators = mapReasonsToIndicators(analysis.reasons, analysis.side);
        const brainAdjustedConfidence = adjustConfidence(
          analysis.institutionalConfidence,
          cand.symbol,
          brainCondition,
          indicators,
          "swing_1h",
        );

        // Gunakan confidence yang sudah disesuaikan brain
        if (brainAdjustedConfidence < brainMinConfidence) {
          logger.debug({ symbol: cand.symbol, institutional: analysis.institutionalConfidence, brain: brainAdjustedConfidence, threshold: brainMinConfidence }, "[Brain Forex] Confidence terlalu rendah setelah penyesuaian brain");
          continue;
        }

        const meta = getForexMeta(cand.symbol);

        if (forexConfig.autoMode === "semi") {
          signaled++;
          const dir = analysis.side === "Buy" ? "LONG" : "SHORT";
          state.log.unshift({
            id: crypto.randomUUID(), timestamp: Date.now(), openedAt: Date.now(),
            symbol: cand.symbol, displayName: meta.displayName, category: meta.category, emoji: meta.emoji,
            side: analysis.side, qty: 0, entryPrice: analysis.entryPrice, closePrice: null,
            realizedPnl: null, realizedPnlPct: null, leverage: effectiveLeverage, margin: maxPerTrade,
            confidence: brainAdjustedConfidence, signal: analysis.side === "Buy" ? "buy" : "sell",
            status: "rejected", reason: `[Semi] ${dir} ${meta.displayName} — ${analysis.reasons[0] ?? ""} | 🧠 ${brainAdjustedConfidence}%`,
            openReason: `${analysis.conditionLabel} | ${analysis.reasons.slice(0, 3).join("; ")}`,
            source: "auto", tags: generateTags({ source: "auto", confidence: brainAdjustedConfidence, signal: analysis.side === "Buy" ? "buy" : "sell", leverage: effectiveLeverage }), marketCondition: analysis.marketCondition,
          });
          if (state.log.length > 300) state.log.splice(300);
          saveState();
          logActivity({ source: "demo", level: "signal", message: `${meta.emoji} [Semi] ${dir} ${meta.displayName} | Institusional: ${analysis.institutionalConfidence}% → 🧠 Brain: ${brainAdjustedConfidence}% | ${analysis.conditionLabel}`, symbol: cand.symbol, confidence: brainAdjustedConfidence });
          continue;
        }

        const slDistPct = Math.abs(analysis.entryPrice - analysis.stopLoss) / analysis.entryPrice * 100;
        const finalSL = slDistPct < 0.2 ? (analysis.side === "Buy" ? analysis.entryPrice * (1 - forexConfig.stopLossPct / 100) : analysis.entryPrice * (1 + forexConfig.stopLossPct / 100)) : analysis.stopLoss;
        const finalTP = analysis.side === "Buy" ? Math.max(analysis.takeProfit, analysis.entryPrice * (1 + forexConfig.takeProfitPct / 100 * 0.8)) : Math.min(analysis.takeProfit, analysis.entryPrice * (1 - forexConfig.takeProfitPct / 100 * 0.8));

        const pos = openForexPosition({
          symbol: cand.symbol,
          side: analysis.side,
          entryPrice: analysis.entryPrice,
          positionUSDT: maxPerTrade,
          leverage: effectiveLeverage,
          stopLoss: finalSL,
          takeProfit: finalTP,
          confidence: brainAdjustedConfidence,
          signal: analysis.side === "Buy" ? "institutional_long" : "institutional_short",
          source: "auto",
          openReason: `🧠 Brain ${brainAdjustedConfidence}% | ${analysis.conditionLabel} | ${analysis.reasons.slice(0, 2).join("; ")}`,
          marketCondition: analysis.marketCondition,
        });

        if ("id" in pos) {
          (pos as ForexPosition).opportunityScore = analysis.opportunityScore;
          opened++;
          logActivity({ source: "demo", level: "success", message: `${meta.emoji} 🧠 AI BUKA ${analysis.side === "Buy" ? "LONG" : "SHORT"} ${meta.displayName} @ $${analysis.entryPrice.toFixed(analysis.entryPrice > 100 ? 2 : 4)} | Brain: ${brainAdjustedConfidence}% | ${analysis.conditionLabel}`, symbol: cand.symbol, confidence: brainAdjustedConfidence });
        }
      } catch { continue; }
    }

    const summary = `🧠 [Forex+Brain] C${forexEngineStatus.cycleCount} · pindai:${candidates.length} · kandidat:${preFiltered.length}${opened > 0 ? ` · BUKA:${opened}` : ""}${signaled > 0 ? ` · sinyal:${signaled}` : ""}${brainSkipped > 0 ? ` · brain-skip:${brainSkipped}` : ""} · pos:${state.positions.length}/${forexConfig.maxPositions}`;
    logActivity({ source: "demo", level: opened > 0 ? "success" : signaled > 0 ? "signal" : "info", message: summary });

  } catch (err) {
    forexEngineStatus.lastError = String(err);
    logger.error({ err }, "Forex engine cycle error");
  } finally {
    forexEngineStatus.autoAnalyzing = false;
    forexEngineStatus.nextCycleAt = Date.now() + forexConfig.intervalMs;
  }
}

export function startForexAutoEngine() {
  if (autoTimer) clearInterval(autoTimer);
  forexEngineStatus.autoRunning = true;
  forexEngineStatus.nextCycleAt = Date.now() + forexConfig.intervalMs;
  runForexEngineCycle().catch(() => {});
  autoTimer = setInterval(() => {
    forexEngineStatus.nextCycleAt = Date.now() + forexConfig.intervalMs;
    runForexEngineCycle().catch(() => {});
  }, forexConfig.intervalMs);
  logger.info({ intervalMs: forexConfig.intervalMs }, "Demo Forex auto engine started");
}

export function stopForexAutoEngine() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  forexEngineStatus.autoRunning = false;
  forexEngineStatus.nextCycleAt = null;
  logger.info("Demo Forex auto engine stopped");
}

export function triggerForexEngineCycle(): void {
  runForexEngineCycle().catch(err => logger.error({ err }, "Manual forex trigger error"));
}
