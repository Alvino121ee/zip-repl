import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import {
  analyzeInstitutional,
  calculateTrailingStop,
  calculateDynamicRisk,
  shouldSwitchOpportunity,
  aiLog,
  type OpportunityScore,
} from "./institutional-engine.js";
import { scanBybitUniverse } from "./bybit.js";
import { scanScalp5m } from "./scalping5m.js";
import { logActivity } from "./activity-log.js";
import { analyzeSLFailure } from "./sl-failure-analysis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const DATA_FILE = join(DATA_DIR, "demo-trading.json");

const BYBIT_BASE = "https://api.bybit.com";
export const INITIAL_BALANCE = 50; // $50 USDT

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DemoPosition {
  id: string;
  symbol: string;
  displayName: string;
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
  // Trailing stop state
  trailActivated?: boolean;
  trailPeakPrice?: number;  // highest price for long, lowest for short
  opportunityScore?: number; // for smart switching
}

export interface DemoTradeLog {
  id: string;
  timestamp: number;
  openedAt?: number;
  closedAt?: number;
  duration?: number;
  symbol: string;
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
}

export interface DemoConfig {
  autoEnabled: boolean;
  autoMode: "auto" | "semi";
  scalpEnabled: boolean;
  scalpMode: "auto" | "semi";
  minConfidence: number;
  maxPositionUSDT: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPositions: number;
  leverage: number;
  intervalMs: number;
  scalpMinConfidence: number;
  scalpMaxPositionUSDT: number;
  scalpStopLossPct: number;
  scalpTakeProfitPct: number;
}

export interface DemoBalance {
  total: number;
  available: number;
  usedMargin: number;
  realizedPnl: number;
  unrealisedPnl: number;
  winCount: number;
  lossCount: number;
  winRate: number;
}

export interface DemoEngineStatus {
  autoRunning: boolean;
  autoAnalyzing: boolean;
  scalpRunning: boolean;
  scalpAnalyzing: boolean;
  lastCycleAt: number | null;
  nextCycleAt: number | null;
  cycleCount: number;
  lastSignalsFound: number;
  totalScanned: number;
  lastError: string | null;
}

export interface DemoStats {
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  currentBalance: number;
  initialBalance: number;
  totalPnl: number;
  totalPnlPct: number;
  largestWin: number;
  largestLoss: number;
  avgWin: number;
  avgLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  bestPair: string | null;
  worstPair: string | null;
  equityHistory: { timestamp: number; balance: number }[];
  dailyPnl: { date: string; pnl: number; trades: number }[];
  tagPerformance: { tag: string; wins: number; losses: number; pnl: number; winRate: number }[];
  pairPerformance: { pair: string; wins: number; losses: number; pnl: number; winRate: number; trades: number }[];
  sourcePerformance: { source: string; wins: number; losses: number; pnl: number; winRate: number }[];
}

// ─── State ────────────────────────────────────────────────────────────────────

interface DemoState {
  balance: number;
  realizedPnl: number;
  winCount: number;
  lossCount: number;
  positions: DemoPosition[];
  log: DemoTradeLog[];
  equityHistory: { timestamp: number; balance: number }[];
}

let state: DemoState = {
  balance: INITIAL_BALANCE,
  realizedPnl: 0,
  winCount: 0,
  lossCount: 0,
  positions: [],
  log: [],
  equityHistory: [{ timestamp: Date.now(), balance: INITIAL_BALANCE }],
};

export const demoConfig: DemoConfig = {
  autoEnabled: false,
  autoMode: "semi",
  scalpEnabled: false,
  scalpMode: "semi",
  minConfidence: 80,
  maxPositionUSDT: 10,
  stopLossPct: 2,
  takeProfitPct: 4,
  maxPositions: 3,
  leverage: 5,
  intervalMs: 20_000,
  scalpMinConfidence: 75,
  scalpMaxPositionUSDT: 5,
  scalpStopLossPct: 1,
  scalpTakeProfitPct: 2,
};

// ─── Demo Config Persistence ──────────────────────────────────────────────────

const DEMO_CONFIG_FILE = join(DATA_DIR, "demo-config.json");

(function loadDemoConfig() {
  try {
    ensureDataDir();
    if (!existsSync(DEMO_CONFIG_FILE)) return;
    const saved = JSON.parse(readFileSync(DEMO_CONFIG_FILE, "utf-8")) as Partial<DemoConfig>;
    Object.assign(demoConfig, saved);
    logger.info({ config: demoConfig }, "Demo config loaded from disk");
  } catch (err) {
    logger.warn({ err }, "Failed to load demo config");
  }
})();

export function saveDemoConfig() {
  try {
    ensureDataDir();
    writeFileSync(DEMO_CONFIG_FILE, JSON.stringify(demoConfig, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to save demo config");
  }
}

export const demoEngineStatus: DemoEngineStatus = {
  autoRunning: false,
  autoAnalyzing: false,
  scalpRunning: false,
  scalpAnalyzing: false,
  lastCycleAt: null,
  nextCycleAt: null,
  cycleCount: 0,
  lastSignalsFound: 0,
  totalScanned: 0,
  lastError: null,
};

// ─── Smart switching state (in-memory) ───────────────────────────────────────
let lastSwitchAt = 0;
let switchesToday = 0;
let switchDayKey = "";

// ─── Persistence ──────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  try {
    ensureDataDir();
    if (!existsSync(DATA_FILE)) return;
    const raw = readFileSync(DATA_FILE, "utf-8");
    const saved = JSON.parse(raw) as Partial<DemoState>;
    state = {
      ...state,
      ...saved,
      equityHistory: saved.equityHistory ?? [{ timestamp: Date.now(), balance: saved.balance ?? INITIAL_BALANCE }],
    };
    logger.info({ balance: state.balance, positions: state.positions.length }, "Demo trading state loaded");
  } catch (err) {
    logger.warn({ err }, "Failed to load demo trading state");
  }
}

function saveState() {
  try {
    ensureDataDir();
    writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to save demo trading state");
  }
}

loadState();

setImmediate(() => {
  if (demoConfig.autoEnabled) {
    startDemoAutoEngine();
    logger.info("Demo auto engine resumed (autoEnabled=true from saved config)");
  }
});

// ─── Market price fetching ────────────────────────────────────────────────────

async function getMarkPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${BYBIT_BASE}/v5/market/tickers?category=linear&symbol=${symbol}`);
    if (!res.ok) return null;
    const data = await res.json() as { retCode: number; result: { list: { lastPrice: string; markPrice: string }[] } };
    if (data.retCode !== 0) return null;
    const item = data.result.list[0];
    if (!item) return null;
    return parseFloat(item.markPrice || item.lastPrice);
  } catch {
    return null;
  }
}

// ─── PnL calculation ──────────────────────────────────────────────────────────

function calcPnl(pos: DemoPosition, markPrice: number): { pnl: number; pnlPct: number } {
  const diff = pos.side === "Buy"
    ? markPrice - pos.entryPrice
    : pos.entryPrice - markPrice;
  const pnl = diff * pos.size * pos.leverage;
  const pnlPct = (diff / pos.entryPrice) * 100 * pos.leverage;
  return { pnl, pnlPct };
}

// ─── Tag Generator ────────────────────────────────────────────────────────────

function generateTags(data: {
  source: "auto" | "scalp" | "manual";
  confidence: number;
  signal: string;
  duration?: number;
  leverage: number;
  status?: string;
  pnl?: number;
}): string[] {
  const tags: string[] = [];

  if (data.source === "scalp") tags.push("Scalping");
  else if (data.source === "auto") tags.push("Auto AI");
  else tags.push("Manual");

  if (data.confidence >= 90) tags.push("Kepercayaan Tinggi");
  else if (data.confidence >= 80) tags.push("Setup Aman");
  else tags.push("Entry Agresif");

  if (data.leverage >= 10) tags.push("Leverage Tinggi");

  if (data.duration != null) {
    const mins = data.duration / 60_000;
    if (mins < 10) tags.push("Scalping");
    else if (mins < 60) tags.push("Short Term");
    else if (mins < 480) tags.push("Intraday");
    else tags.push("Swing");
  }

  const sig = data.signal.toLowerCase();
  if (sig.includes("breakout")) tags.push("Breakout");
  if (sig.includes("reversal") || sig.includes("reverse")) tags.push("Reversal");
  if (sig.includes("trend")) tags.push("Trend Following");
  if (sig.includes("scalp")) tags.push("Scalping");
  if (sig.includes("golden")) tags.push("Golden Cross");
  if (sig.includes("death")) tags.push("Death Cross");

  if (data.pnl != null) {
    if (data.pnl > 0) tags.push("Profit");
    else if (data.pnl < 0) tags.push("Loss");
  }

  return [...new Set(tags)];
}

// ─── Open demo position ───────────────────────────────────────────────────────

export function openDemoPosition(data: {
  symbol: string;
  displayName: string;
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
}): DemoPosition | { error: string } {
  const margin = data.positionUSDT;
  const usedMargin = state.positions.reduce((s, p) => s + p.margin, 0);
  const available = state.balance - usedMargin;

  if (available < margin) {
    return { error: `Saldo tidak cukup. Tersedia: $${available.toFixed(2)}, dibutuhkan: $${margin.toFixed(2)}` };
  }
  if (state.positions.length >= demoConfig.maxPositions) {
    return { error: `Maksimal ${demoConfig.maxPositions} posisi aktif` };
  }
  const alreadyOpen = state.positions.find((p) => p.symbol === data.symbol);
  if (alreadyOpen) {
    return { error: `Posisi ${data.symbol} sudah terbuka` };
  }

  const size = (margin * data.leverage) / data.entryPrice;
  const tags = generateTags({
    source: data.source,
    confidence: data.confidence,
    signal: data.signal,
    leverage: data.leverage,
  });

  const pos: DemoPosition = {
    id: crypto.randomUUID(),
    symbol: data.symbol,
    displayName: data.displayName,
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
  };

  state.positions.push(pos);
  state.log.unshift({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    openedAt: pos.openedAt,
    symbol: data.symbol,
    side: data.side,
    qty: size,
    entryPrice: data.entryPrice,
    closePrice: null,
    realizedPnl: null,
    realizedPnlPct: null,
    leverage: data.leverage,
    margin,
    confidence: data.confidence,
    signal: data.signal,
    status: "opened",
    reason: `Demo ${data.side === "Buy" ? "LONG" : "SHORT"} dibuka @ $${data.entryPrice.toFixed(4)}`,
    openReason: data.openReason,
    source: data.source,
    tags,
    marketCondition: data.marketCondition,
  });
  if (state.log.length > 500) state.log.splice(500);
  saveState();
  return pos;
}

// ─── Close demo position ──────────────────────────────────────────────────────

export function closeDemoPosition(
  posId: string,
  reason: "tp" | "sl" | "manual" | "reversal",
  markPrice?: number,
  reversalNote?: string
): DemoTradeLog | { error: string } {
  const idx = state.positions.findIndex((p) => p.id === posId);
  if (idx === -1) return { error: "Posisi tidak ditemukan" };
  const pos = state.positions[idx];

  const closePrice = markPrice ?? pos.markPrice;
  const { pnl, pnlPct } = calcPnl(pos, closePrice);
  const closedAt = Date.now();
  const duration = closedAt - pos.openedAt;

  state.realizedPnl += pnl;
  state.balance += pnl;
  if (pnl >= 0) state.winCount++;
  else state.lossCount++;

  // Equity history snapshot
  const unrealisedPnl = state.positions
    .filter(p => p.id !== posId)
    .reduce((s, p) => s + p.unrealisedPnl, 0);
  state.equityHistory.push({
    timestamp: closedAt,
    balance: Math.max(0, state.balance + unrealisedPnl),
  });
  if (state.equityHistory.length > 1000) state.equityHistory.splice(0, state.equityHistory.length - 1000);

  const statusMap = { tp: "closed_tp", sl: "closed_sl", manual: "closed_manual", reversal: "closed_manual" } as const;
  const reasonText = reason === "tp" ? `Take Profit @ $${closePrice.toFixed(4)}`
    : reason === "sl" ? `Stop Loss @ $${closePrice.toFixed(4)}`
    : reason === "reversal" ? (reversalNote ?? `Tren berbalik — auto close`)
    : `Manual close @ $${closePrice.toFixed(4)}`;

  const tags = generateTags({
    source: pos.source,
    confidence: pos.confidence,
    signal: pos.signal,
    duration,
    leverage: pos.leverage,
    status: statusMap[reason],
    pnl,
  });

  const logEntry: DemoTradeLog = {
    id: crypto.randomUUID(),
    timestamp: closedAt,
    openedAt: pos.openedAt,
    closedAt,
    duration,
    symbol: pos.symbol,
    side: pos.side === "Buy" ? "Sell" : "Buy",
    qty: pos.size,
    entryPrice: pos.entryPrice,
    closePrice,
    realizedPnl: pnl,
    realizedPnlPct: pnlPct,
    leverage: pos.leverage,
    margin: pos.margin,
    confidence: pos.confidence,
    signal: pos.signal,
    status: statusMap[reason],
    reason: reasonText,
    openReason: pos.openReason,
    source: pos.source,
    tags,
    marketCondition: pos.marketCondition,
  };

  state.positions.splice(idx, 1);
  state.log.unshift(logEntry);
  if (state.log.length > 500) state.log.splice(500);
  saveState();

  const direction = pos.side === "Buy" ? "LONG" : "SHORT";
  const pnlStr = (pnl >= 0 ? "+" : "") + pnl.toFixed(2);
  const pnlPctStr = (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(2);
  const level = reason === "tp" ? "success" : reason === "sl" ? "warning" : "info";
  const icon = reason === "tp" ? "✅ TP" : reason === "sl" ? "❌ SL" : reason === "reversal" ? "↩ EXIT" : "🔒 TUTUP";
  logActivity({
    source: "demo", level,
    message: `${icon} ${direction} ${pos.symbol} @ $${closePrice.toFixed(4)} | PnL: $${pnlStr} (${pnlPctStr}%) | ${reasonText}`,
    symbol: pos.symbol,
  });

  // Auto-trigger SL Failure Analysis
  if (reason === "sl") {
    try {
      analyzeSLFailure({
        tradeId: pos.id,
        symbol: pos.symbol,
        side: pos.side === "Buy" ? "long" : "short",
        entryPrice: pos.entryPrice,
        slPrice: pos.stopLoss ?? closePrice,
        exitPrice: closePrice,
        pnlPct: pos.leverage > 0 ? pnlPct / pos.leverage : pnlPct,
        confidence: pos.confidence,
        strategy: pos.source === "scalp" ? "scalp_5m" : pos.source === "auto" ? "auto_institutional" : "manual",
        marketCondition: pos.marketCondition,
        holdTimeMs: duration,
        isChoppy:
          pos.marketCondition?.toLowerCase().includes("choppy") ||
          pos.marketCondition?.toLowerCase().includes("sideways") ||
          false,
        liquiditySweepDetected: false,
      });
    } catch (err) {
      logger.warn({ err }, "SL failure analysis error — non-critical");
    }
  }

  return logEntry;
}

// ─── Get balance ──────────────────────────────────────────────────────────────

export function getDemoBalance(): DemoBalance {
  const usedMargin = state.positions.reduce((s, p) => s + p.margin, 0);
  const unrealisedPnl = state.positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  const total = Math.max(0, state.balance + unrealisedPnl);
  const available = Math.max(0, state.balance - usedMargin);
  const totalTrades = state.winCount + state.lossCount;
  return {
    total,
    available,
    usedMargin,
    realizedPnl: state.realizedPnl,
    unrealisedPnl,
    winCount: state.winCount,
    lossCount: state.lossCount,
    winRate: totalTrades > 0 ? (state.winCount / totalTrades) * 100 : 0,
  };
}

export function getDemoPositions(): DemoPosition[] {
  return [...state.positions];
}

export function getDemoLog(): DemoTradeLog[] {
  return [...state.log];
}

// ─── Get comprehensive stats ──────────────────────────────────────────────────

export function getDemoStats(): DemoStats {
  const closedTrades = state.log.filter(
    e => e.status === "closed_tp" || e.status === "closed_sl" || e.status === "closed_manual"
  );
  const totalTrades = state.log.filter(e => e.status !== "rejected").length;
  const wins = closedTrades.filter(t => (t.realizedPnl ?? 0) > 0).length;
  const losses = closedTrades.filter(t => (t.realizedPnl ?? 0) <= 0).length;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;

  const totalWinPnl = closedTrades.filter(t => (t.realizedPnl ?? 0) > 0).reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const totalLossPnl = Math.abs(closedTrades.filter(t => (t.realizedPnl ?? 0) <= 0).reduce((s, t) => s + (t.realizedPnl ?? 0), 0));
  const profitFactor = totalLossPnl > 0 ? totalWinPnl / totalLossPnl : totalWinPnl > 0 ? 999 : 0;

  const unrealisedPnl = state.positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  const currentBalance = Math.max(0, state.balance + unrealisedPnl);
  const totalPnl = currentBalance - INITIAL_BALANCE;
  const totalPnlPct = (totalPnl / INITIAL_BALANCE) * 100;

  const sorted = [...closedTrades].sort((a, b) => a.timestamp - b.timestamp);
  const largestWin = sorted.reduce((max, t) => Math.max(max, t.realizedPnl ?? 0), 0);
  const largestLoss = sorted.reduce((min, t) => Math.min(min, t.realizedPnl ?? 0), 0);
  const avgWin = wins > 0 ? totalWinPnl / wins : 0;
  const avgLoss = losses > 0 ? totalLossPnl / losses : 0;

  // Consecutive wins/losses (current streak)
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let curW = 0, curL = 0;
  for (const t of sorted) {
    if ((t.realizedPnl ?? 0) > 0) {
      curW++;
      curL = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, curW);
    } else {
      curL++;
      curW = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, curL);
    }
  }
  // Current streak
  for (let i = sorted.length - 1; i >= 0; i--) {
    if ((sorted[i].realizedPnl ?? 0) > 0) { consecutiveWins++; if (consecutiveLosses > 0) break; }
    else { consecutiveLosses++; if (consecutiveWins > 0) break; }
    if (consecutiveWins > 0 && (sorted[i].realizedPnl ?? 0) <= 0) { consecutiveWins = 0; break; }
    if (consecutiveLosses > 0 && (sorted[i].realizedPnl ?? 0) > 0) { consecutiveLosses = 0; break; }
  }

  // Max drawdown
  let peak = INITIAL_BALANCE;
  let bal = INITIAL_BALANCE;
  let maxDrawdown = 0;
  for (const t of sorted) {
    bal += t.realizedPnl ?? 0;
    peak = Math.max(peak, bal);
    maxDrawdown = Math.min(maxDrawdown, bal - peak);
  }
  const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

  // Pair performance
  const pairMap: Record<string, { wins: number; losses: number; pnl: number; trades: number }> = {};
  for (const t of closedTrades) {
    const pair = t.symbol.replace("USDT", "") + "/USDT";
    if (!pairMap[pair]) pairMap[pair] = { wins: 0, losses: 0, pnl: 0, trades: 0 };
    pairMap[pair].trades++;
    pairMap[pair].pnl += t.realizedPnl ?? 0;
    if ((t.realizedPnl ?? 0) > 0) pairMap[pair].wins++;
    else pairMap[pair].losses++;
  }
  const pairPerformance = Object.entries(pairMap)
    .map(([pair, s]) => ({ pair, ...s, winRate: s.trades > 0 ? (s.wins / s.trades) * 100 : 0 }))
    .sort((a, b) => b.pnl - a.pnl);
  const bestPair = pairPerformance.length > 0 ? pairPerformance[0].pair : null;
  const worstPair = pairPerformance.length > 0 ? pairPerformance[pairPerformance.length - 1].pair : null;

  // Tag performance
  const tagMap: Record<string, { wins: number; losses: number; pnl: number }> = {};
  for (const t of closedTrades) {
    for (const tag of (t.tags ?? [])) {
      if (!tagMap[tag]) tagMap[tag] = { wins: 0, losses: 0, pnl: 0 };
      tagMap[tag].pnl += t.realizedPnl ?? 0;
      if ((t.realizedPnl ?? 0) > 0) tagMap[tag].wins++;
      else tagMap[tag].losses++;
    }
  }
  const tagPerformance = Object.entries(tagMap)
    .filter(([tag]) => !["Profit", "Loss"].includes(tag))
    .map(([tag, s]) => ({ tag, ...s, winRate: (s.wins + s.losses) > 0 ? (s.wins / (s.wins + s.losses)) * 100 : 0 }))
    .sort((a, b) => b.pnl - a.pnl);

  // Source performance
  const srcMap: Record<string, { wins: number; losses: number; pnl: number }> = {};
  for (const t of closedTrades) {
    const src = t.source;
    if (!srcMap[src]) srcMap[src] = { wins: 0, losses: 0, pnl: 0 };
    srcMap[src].pnl += t.realizedPnl ?? 0;
    if ((t.realizedPnl ?? 0) > 0) srcMap[src].wins++;
    else srcMap[src].losses++;
  }
  const srcLabels: Record<string, string> = { auto: "Auto AI", scalp: "Scalping", manual: "Manual" };
  const sourcePerformance = Object.entries(srcMap)
    .map(([src, s]) => ({ source: srcLabels[src] ?? src, ...s, winRate: (s.wins + s.losses) > 0 ? (s.wins / (s.wins + s.losses)) * 100 : 0 }));

  // Daily PnL
  const dayMap: Record<string, { pnl: number; trades: number }> = {};
  for (const t of closedTrades) {
    const day = new Date(t.timestamp).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
    if (!dayMap[day]) dayMap[day] = { pnl: 0, trades: 0 };
    dayMap[day].pnl += t.realizedPnl ?? 0;
    dayMap[day].trades++;
  }
  const dailyPnl = Object.entries(dayMap).map(([date, v]) => ({ date, ...v }));

  // Sharpe Ratio dari trade-by-trade returns
  const tradeReturns = closedTrades.map(t => t.realizedPnlPct ?? 0);
  let sharpeRatio = 0;
  if (tradeReturns.length >= 5) {
    const mean = tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length;
    const variance = tradeReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / tradeReturns.length;
    const std = Math.sqrt(variance);
    if (std > 0) sharpeRatio = parseFloat(((mean / std) * Math.sqrt(252)).toFixed(2));
  }

  return {
    totalTrades,
    closedTrades: closedTrades.length,
    wins,
    losses,
    winRate,
    profitFactor,
    sharpeRatio,
    currentBalance,
    initialBalance: INITIAL_BALANCE,
    totalPnl,
    totalPnlPct,
    largestWin,
    largestLoss,
    avgWin,
    avgLoss,
    consecutiveWins,
    consecutiveLosses,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    maxDrawdown,
    maxDrawdownPct,
    bestPair,
    worstPair,
    equityHistory: [...state.equityHistory],
    dailyPnl,
    tagPerformance,
    pairPerformance,
    sourcePerformance,
  };
}

export function resetDemo() {
  state = {
    balance: INITIAL_BALANCE,
    realizedPnl: 0,
    winCount: 0,
    lossCount: 0,
    positions: [],
    log: [],
    equityHistory: [{ timestamp: Date.now(), balance: INITIAL_BALANCE }],
  };
  saveState();
}

// ─── Mark price updater with institutional trailing stop (runs every 8s) ──────

async function updateMarkPrices() {
  if (state.positions.length === 0) {
    if (demoEngineStatus.autoRunning || demoEngineStatus.scalpRunning) {
      aiLog.scanning(667);
    }
    return;
  }

  const positionsCopy = [...state.positions];
  for (const pos of positionsCopy) {
    // Re-check pos still exists
    if (!state.positions.find(p => p.id === pos.id)) continue;

    const price = await getMarkPrice(pos.symbol);
    if (!price) continue;

    // Update trailing peak price
    if (pos.side === "Buy") {
      if (!pos.trailPeakPrice || price > pos.trailPeakPrice) pos.trailPeakPrice = price;
    } else {
      if (!pos.trailPeakPrice || price < pos.trailPeakPrice) pos.trailPeakPrice = price;
    }

    pos.markPrice = price;
    const { pnl, pnlPct } = calcPnl(pos, price);
    pos.unrealisedPnl = pnl;
    pos.unrealisedPnlPct = pnlPct;

    // ── Institutional trailing stop ────────────────────────────────────────
    // Use ~2% ATR estimate based on entry price (safe fallback)
    const estimatedAtr = pos.entryPrice * 0.018;
    const rawProfitPct = pos.side === "Buy"
      ? (price - pos.entryPrice) / pos.entryPrice * 100
      : (pos.entryPrice - price) / pos.entryPrice * 100;

    const trailResult = calculateTrailingStop({
      side: pos.side,
      entryPrice: pos.entryPrice,
      currentPrice: price,
      atr: estimatedAtr,
      currentSL: pos.stopLoss,
      trailActivated: pos.trailActivated ?? false,
      peakPrice: pos.trailPeakPrice ?? pos.entryPrice,
    });

    if (trailResult.activated && !(pos.trailActivated ?? false)) {
      pos.trailActivated = true;
      pos.stopLoss = trailResult.newSL;
      aiLog.protecting(pos.symbol, trailResult.note ?? "Trailing stop aktif — SL dipindah ke breakeven");
      logActivity({ source: "demo", level: "info", message: `🛡 TRAIL AKTIF ${pos.side === "Buy" ? "LONG" : "SHORT"} ${pos.symbol}: ${trailResult.note ?? "SL ke breakeven"}`, symbol: pos.symbol });
    } else if (trailResult.activated && trailResult.tightened && trailResult.note) {
      pos.stopLoss = trailResult.newSL;
      aiLog.protecting(pos.symbol, trailResult.note);
      logActivity({ source: "demo", level: "info", message: `🛡 TRAIL ${pos.symbol} (profit ${rawProfitPct.toFixed(1)}%): ${trailResult.note}`, symbol: pos.symbol });
    }

    // ── SL / TP hit check ──────────────────────────────────────────────────
    if (pos.stopLoss != null) {
      const slHit = pos.side === "Buy" ? price <= pos.stopLoss : price >= pos.stopLoss;
      if (slHit) {
        const reason = (pos.trailActivated && rawProfitPct > 0) ? "sl" : "sl";
        closeDemoPosition(pos.id, reason, price);
        logger.info({ symbol: pos.symbol, price, sl: pos.stopLoss, trail: pos.trailActivated }, "Demo SL hit");
        continue;
      }
    }
    if (pos.takeProfit != null) {
      const tpHit = pos.side === "Buy" ? price >= pos.takeProfit : price <= pos.takeProfit;
      if (tpHit) {
        closeDemoPosition(pos.id, "tp", price);
        logger.info({ symbol: pos.symbol, price, tp: pos.takeProfit }, "Demo TP hit");
        continue;
      }
    }
  }

  // Update AI status with monitoring info
  const totalUnrealized = state.positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  const trailActive = state.positions.some(p => p.trailActivated);
  if (state.positions.length > 0) {
    aiLog.monitoring(state.positions.length, totalUnrealized, trailActive);
  }

  saveState();
}

setInterval(() => {
  updateMarkPrices().catch((err) => logger.error({ err }, "Demo mark price update error"));
}, 8_000);

// ─── Auto Trading Engine (Institutional Grade) ───────────────────────────────

let autoTimer: ReturnType<typeof setInterval> | null = null;

async function runAutoEngineCycle() {
  if (demoEngineStatus.autoAnalyzing) return;
  demoEngineStatus.autoAnalyzing = true;
  demoEngineStatus.lastCycleAt = Date.now();
  demoEngineStatus.cycleCount++;
  const cycleId = `C${demoEngineStatus.cycleCount}`;

  try {
    // ── Phase 1: Scan universe ───────────────────────────────────────────────
    aiLog.scanning(667);
    const candidates = await scanBybitUniverse();
    demoEngineStatus.totalScanned = candidates.length;

    // ── Phase 2: Calculate dynamic risk based on current state ───────────────
    const stats = getDemoStats();
    const drawdownPct = stats.maxDrawdownPct; // already negative
    const usedMargin = state.positions.reduce((s, p) => s + p.margin, 0);
    const available = state.balance - usedMargin;
    const dynRisk = calculateDynamicRisk({
      consecutiveLosses: stats.consecutiveLosses,
      maxConsecutiveLosses: 5,
      drawdownPct,
      availableBalance: available,
      maxPositionUSDT: demoConfig.maxPositionUSDT,
      maxLeverage: demoConfig.leverage,
    });

    if (!dynRisk.shouldTrade) {
      aiLog.waiting(dynRisk.reason);
      logActivity({ source: "demo", level: "warning", message: `⚠ RISK MGMT: ${dynRisk.reason}` });
      return;
    }

    if (dynRisk.alertLevel !== "normal") {
      logActivity({ source: "demo", level: "warning", message: `⚠ Manajemen risiko dinamis: ${dynRisk.reason}` });
    }

    const maxPerTrade = Math.max(0.5, Math.min(dynRisk.positionUSDT, available * 0.28));
    const effectiveLeverage = dynRisk.leverage;

    // ── Phase 3: Filter candidates ───────────────────────────────────────────
    const preFiltered = candidates.filter(c => c.confidence >= Math.max(demoConfig.minConfidence - 5, 60));
    aiLog.filtering(preFiltered.length, candidates.length);
    demoEngineStatus.lastSignalsFound = preFiltered.length;

    // ── Phase 4: Check existing positions for exit / trailing / switch ───────
    let autoExited = 0;
    const opportunityPool: OpportunityScore[] = [];

    for (const pos of [...state.positions]) {
      aiLog.checkTrend(pos.symbol);
      let posAnalysis: Awaited<ReturnType<typeof analyzeInstitutional>> | null = null;
      try { posAnalysis = await analyzeInstitutional(pos.symbol); }
      catch { continue; }

      const isLong = pos.side === "Buy";
      const shouldClose = isLong ? posAnalysis.shouldExitLong : posAnalysis.shouldExitShort;
      if (shouldClose) {
        const exitNote = posAnalysis.exitReason ?? `Tren berbalik ${isLong ? "BEARISH" : "BULLISH"} — institutional exit`;
        const price = await getMarkPrice(pos.symbol);
        const { pnl } = calcPnl(pos, price ?? pos.markPrice);
        aiLog.exiting(pos.symbol, exitNote, pnl);
        closeDemoPosition(pos.id, "reversal", price ?? undefined, exitNote);
        autoExited++;
        continue;
      }

      // Collect for opportunity switching
      opportunityPool.push({
        symbol: pos.symbol,
        side: pos.side,
        confidence: pos.confidence,
        opportunityScore: pos.opportunityScore ?? pos.confidence,
        marketCondition: (pos.marketCondition ?? "ranging") as any,
        entryPrice: posAnalysis.entryPrice,
        stopLoss: posAnalysis.stopLoss,
        takeProfit: posAnalysis.takeProfit,
        reasons: posAnalysis.reasons,
      });
    }

    // ── Phase 5: Deep analysis of top candidates for opportunity pool ─────────
    const TOP_N = Math.min(preFiltered.length, 8);
    for (let i = 0; i < TOP_N; i++) {
      const cand = preFiltered[i];
      if (state.positions.find(p => p.symbol === cand.symbol)) continue;
      try {
        aiLog.checkTrend(cand.symbol);
        await new Promise(r => setTimeout(r, 60)); // avoid rate limiting
        aiLog.checkVolume(cand.symbol);
        const instAnalysis = await analyzeInstitutional(cand.symbol, {
          consecutiveLosses: stats.consecutiveLosses,
          drawdownPct,
          availableBalance: available,
          maxPositionUSDT: demoConfig.maxPositionUSDT,
          maxLeverage: demoConfig.leverage,
        });
        if (instAnalysis.opportunityScore > 0) {
          opportunityPool.push({
            symbol: cand.symbol,
            side: instAnalysis.side,
            confidence: instAnalysis.institutionalConfidence,
            opportunityScore: instAnalysis.opportunityScore,
            marketCondition: instAnalysis.marketCondition,
            entryPrice: instAnalysis.entryPrice,
            stopLoss: instAnalysis.stopLoss,
            takeProfit: instAnalysis.takeProfit,
            reasons: instAnalysis.reasons,
          });
        }
      } catch { continue; }
    }

    // ── Phase 6: Smart opportunity switching for active positions ─────────────
    const dayKey = new Date().toISOString().slice(0, 10);
    if (switchDayKey !== dayKey) { switchDayKey = dayKey; switchesToday = 0; }

    for (const pos of [...state.positions]) {
      if (!pos.unrealisedPnl) continue;
      const rawProfitPct = pos.side === "Buy"
        ? (pos.markPrice - pos.entryPrice) / pos.entryPrice * 100
        : (pos.entryPrice - pos.markPrice) / pos.entryPrice * 100;

      const switchDecision = shouldSwitchOpportunity({
        currentSymbol: pos.symbol,
        currentConfidence: pos.confidence,
        currentOpportunityScore: pos.opportunityScore ?? pos.confidence,
        unrealisedPnlPct: rawProfitPct,
        durationMs: Date.now() - pos.openedAt,
        candidates: opportunityPool.filter(o => o.symbol !== pos.symbol),
        lastSwitchAt,
        switchesToday,
      });

      if (switchDecision.shouldSwitch && switchDecision.newSymbol) {
        const gain = switchDecision.newOpportunityScore - switchDecision.currentOpportunityScore;
        aiLog.switching(pos.symbol, switchDecision.newSymbol, gain);
        logActivity({
          source: "demo", level: "signal",
          message: `🔄 SWITCH: ${pos.symbol} → ${switchDecision.newSymbol} | +${gain} pts | ${switchDecision.reason}`,
          symbol: switchDecision.newSymbol,
        });
        const price = await getMarkPrice(pos.symbol);
        closeDemoPosition(pos.id, "manual", price ?? undefined, `Switch modal ke ${switchDecision.newSymbol}`);
        lastSwitchAt = Date.now();
        switchesToday++;
        break; // one switch per cycle
      }
    }

    // ── Phase 7: Open new positions ──────────────────────────────────────────
    if (state.positions.length >= demoConfig.maxPositions) {
      aiLog.monitoring(state.positions.length, state.positions.reduce((s, p) => s + p.unrealisedPnl, 0), false);
      logActivity({ source: "demo", level: "info", message: `Slot penuh (${state.positions.length}/${demoConfig.maxPositions}) — memantau posisi aktif` });
    }

    let skipped = 0;
    let opened = 0;
    let signaled = 0;
    const skipReasons: string[] = [];

    for (const cand of preFiltered) {
      if (state.positions.length >= demoConfig.maxPositions) break;
      if (state.positions.find((p) => p.symbol === cand.symbol)) continue;

      let analysis: Awaited<ReturnType<typeof analyzeInstitutional>> | null = null;

      try {
        aiLog.checkTrend(cand.symbol);
        await new Promise(r => setTimeout(r, 80));
        aiLog.checkVolume(cand.symbol);
        await new Promise(r => setTimeout(r, 80));
        aiLog.checkSMC(cand.symbol);
        await new Promise(r => setTimeout(r, 80));
        aiLog.checkMomentum(cand.symbol);
        analysis = await analyzeInstitutional(cand.symbol, {
          consecutiveLosses: stats.consecutiveLosses,
          drawdownPct,
          availableBalance: available,
          maxPositionUSDT: demoConfig.maxPositionUSDT,
          maxLeverage: demoConfig.leverage,
        });
      } catch { skipped++; continue; }

      if (!analysis) { skipped++; continue; }

      // Institutional gate: must pass all institutional checks
      if (!analysis.institutionalShouldTrade || !analysis.side) {
        skipped++;
        const reason = analysis.waitReason ?? analysis.conditionReason ?? "Setup tidak memenuhi standar institusional";
        skipReasons.push(`${cand.symbol}: ${reason}`);
        aiLog.waiting(`[${cand.symbol}] ${reason}`);
        continue;
      }
      if (analysis.institutionalConfidence < demoConfig.minConfidence) {
        skipped++;
        skipReasons.push(`${cand.symbol}: Confidence ${analysis.institutionalConfidence}% < ${demoConfig.minConfidence}%`);
        continue;
      }

      aiLog.confirming(cand.symbol, analysis.institutionalConfidence, analysis.reasons);

      const direction = analysis.side === "Buy" ? "LONG" : "SHORT";
      const conditionLabel = analysis.conditionLabel;

      if (demoConfig.autoMode === "semi") {
        signaled++;
        logActivity({
          source: "demo", level: "signal",
          message: `[Semi] ${direction} ${cand.symbol} | ${analysis.institutionalConfidence}% | ${conditionLabel} | ${analysis.reasons[0] ?? ""}`,
          symbol: cand.symbol, confidence: analysis.institutionalConfidence
        });
        state.log.unshift({
          id: crypto.randomUUID(), timestamp: Date.now(), openedAt: Date.now(),
          symbol: cand.symbol, side: analysis.side, qty: 0,
          entryPrice: analysis.entryPrice, closePrice: null,
          realizedPnl: null, realizedPnlPct: null,
          leverage: effectiveLeverage, margin: maxPerTrade,
          confidence: analysis.institutionalConfidence,
          signal: analysis.side === "Buy" ? "buy" : "sell",
          status: "rejected",
          reason: `[Semi] ${direction} — ${analysis.reasons[0] ?? ""}`,
          openReason: `${conditionLabel} | ${analysis.reasons.slice(0, 3).join("; ")}`,
          source: "auto",
          tags: generateTags({ source: "auto", confidence: analysis.institutionalConfidence, signal: analysis.side === "Buy" ? "buy" : "sell", leverage: effectiveLeverage }),
          marketCondition: analysis.marketCondition,
        });
        if (state.log.length > 500) state.log.splice(500);
        saveState();
        continue;
      }

      // ATR-based SL/TP — use analysis values (better than fixed %)
      const sl = analysis.stopLoss;
      const tp = analysis.takeProfit;
      // Verify SL/TP make sense with leverage (not too tight)
      const slDistPct = Math.abs(analysis.entryPrice - sl) / analysis.entryPrice * 100;
      const minSLPct = 0.3; // at least 0.3% from entry
      const finalSL = slDistPct < minSLPct
        ? (analysis.side === "Buy" ? analysis.entryPrice * (1 - demoConfig.stopLossPct / 100) : analysis.entryPrice * (1 + demoConfig.stopLossPct / 100))
        : sl;
      const finalTP = analysis.side === "Buy"
        ? Math.max(tp, analysis.entryPrice * (1 + demoConfig.takeProfitPct / 100 * 0.8))
        : Math.min(tp, analysis.entryPrice * (1 - demoConfig.takeProfitPct / 100 * 0.8));

      aiLog.executing(cand.symbol, direction, analysis.entryPrice, analysis.institutionalConfidence);

      const pos = openDemoPosition({
        symbol: cand.symbol,
        displayName: cand.symbol.replace("USDT", "/USDT"),
        side: analysis.side,
        entryPrice: analysis.entryPrice,
        positionUSDT: maxPerTrade,
        leverage: effectiveLeverage,
        stopLoss: finalSL,
        takeProfit: finalTP,
        confidence: analysis.institutionalConfidence,
        signal: analysis.side === "Buy" ? "institutional_long" : "institutional_short",
        source: "auto",
        openReason: `${conditionLabel} | OppScore:${analysis.opportunityScore} | ${analysis.reasons.slice(0, 2).join("; ")}`,
        marketCondition: analysis.marketCondition,
      });

      if ("id" in pos) {
        pos.opportunityScore = analysis.opportunityScore;
        opened++;
        logActivity({
          source: "demo", level: "success",
          message: `✅ BUKA ${direction} ${cand.symbol} @ $${analysis.entryPrice.toFixed(4)} | ${analysis.institutionalConfidence}% | ${conditionLabel} | TP:$${finalTP.toFixed(4)} SL:$${finalSL.toFixed(4)} | RR:${analysis.riskRewardRatio.toFixed(1)}x`,
          symbol: cand.symbol, confidence: analysis.institutionalConfidence
        });
        if (available - maxPerTrade < maxPerTrade) break; // keep reserve
      }
    }

    // ── Phase 8: Cycle summary ────────────────────────────────────────────────
    const parts: string[] = [
      `${cycleId}`,
      `pindai:${candidates.length}`,
      `kandidat:${preFiltered.length}`,
    ];
    if (autoExited > 0) parts.push(`exit:${autoExited}`);
    if (skipped > 0) parts.push(`skip:${skipped}`);
    if (opened > 0) parts.push(`BUKA:${opened}`);
    if (signaled > 0) parts.push(`sinyal:${signaled}`);
    if (dynRisk.alertLevel !== "normal") parts.push(`⚠${dynRisk.alertLevel}`);
    parts.push(`pos:${state.positions.length}/${demoConfig.maxPositions}`);

    const summaryLevel = opened > 0 ? "success" : signaled > 0 ? "signal" : preFiltered.length === 0 ? "scan" : "info";
    logActivity({ source: "demo", level: summaryLevel, message: parts.join(" · ") });

    if (opened === 0 && signaled === 0 && skipReasons.length > 0) {
      const topReason = skipReasons[0];
      aiLog.noSetup(`Tidak ada setup: ${topReason}`);
      logActivity({ source: "demo", level: "info", message: `Alasan skip: ${topReason}` });
    } else if (opened === 0 && signaled === 0) {
      aiLog.noSetup("Tidak ada pair yang memenuhi standar institusional siklus ini");
    }

  } catch (err) {
    demoEngineStatus.lastError = String(err);
    aiLog.waiting(`Error: ${String(err).slice(0, 80)}`);
    logActivity({ source: "demo", level: "error", message: `Error siklus demo: ${String(err)}` });
    logger.error({ err }, "Demo institutional engine cycle error");
  } finally {
    demoEngineStatus.autoAnalyzing = false;
    demoEngineStatus.nextCycleAt = Date.now() + demoConfig.intervalMs;
  }
}

export function startDemoAutoEngine() {
  if (autoTimer) clearInterval(autoTimer);
  demoEngineStatus.autoRunning = true;
  demoEngineStatus.nextCycleAt = Date.now() + demoConfig.intervalMs;
  runAutoEngineCycle().catch(() => {});
  autoTimer = setInterval(() => {
    demoEngineStatus.nextCycleAt = Date.now() + demoConfig.intervalMs;
    runAutoEngineCycle().catch(() => {});
  }, demoConfig.intervalMs);
  logger.info({ intervalMs: demoConfig.intervalMs }, "Demo auto engine started");
}

export function stopDemoAutoEngine() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  demoEngineStatus.autoRunning = false;
  demoEngineStatus.nextCycleAt = null;
  logger.info("Demo auto engine stopped");
}

// ─── Scalping Engine ──────────────────────────────────────────────────────────

let scalpTimer: ReturnType<typeof setInterval> | null = null;

async function runScalpEngineCycle() {
  if (demoEngineStatus.scalpAnalyzing) return;
  demoEngineStatus.scalpAnalyzing = true;
  try {
    const signals = await scanScalp5m();
    const validSignals = signals.filter(
      (s) => s.side !== null && s.confidence >= demoConfig.scalpMinConfidence && s.allChecksPassed
    );

    const usedMargin = state.positions.reduce((s, p) => s + p.margin, 0);
    const available = state.balance - usedMargin;
    const maxPerTrade = Math.min(demoConfig.scalpMaxPositionUSDT, available * 0.2);

    for (const sig of validSignals) {
      if (state.positions.length >= demoConfig.maxPositions) break;
      if (!sig.side) continue;
      if (state.positions.find((p) => p.symbol === sig.symbol)) continue;

      if (demoConfig.scalpMode === "semi") {
        state.log.unshift({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          openedAt: Date.now(),
          symbol: sig.symbol,
          side: sig.side,
          qty: 0,
          entryPrice: sig.entryPrice,
          closePrice: null,
          realizedPnl: null,
          realizedPnlPct: null,
          leverage: demoConfig.leverage,
          margin: maxPerTrade,
          confidence: sig.confidence,
          signal: sig.side === "Buy" ? "scalp_long" : "scalp_short",
          status: "rejected",
          reason: `[Semi Scalp] ${sig.side === "Buy" ? "LONG" : "SHORT"} — ${sig.reasons[0] ?? ""}`,
          openReason: sig.reasons.join("; "),
          source: "scalp",
          tags: generateTags({ source: "scalp", confidence: sig.confidence, signal: sig.side === "Buy" ? "scalp_long" : "scalp_short", leverage: demoConfig.leverage }),
        });
        if (state.log.length > 500) state.log.splice(500);
        saveState();
        continue;
      }

      openDemoPosition({
        symbol: sig.symbol,
        displayName: sig.displayName,
        side: sig.side,
        entryPrice: sig.entryPrice,
        positionUSDT: maxPerTrade,
        leverage: demoConfig.leverage,
        stopLoss: sig.stopLoss,
        takeProfit: sig.takeProfit,
        confidence: sig.confidence,
        signal: sig.side === "Buy" ? "scalp_long" : "scalp_short",
        source: "scalp",
        openReason: sig.reasons.join("; "),
      });
    }
  } catch (err) {
    logger.error({ err }, "Demo scalp engine cycle error");
  } finally {
    demoEngineStatus.scalpAnalyzing = false;
  }
}

export function startDemoScalpEngine() {
  if (scalpTimer) clearInterval(scalpTimer);
  demoEngineStatus.scalpRunning = true;
  runScalpEngineCycle().catch(() => {});
  scalpTimer = setInterval(() => {
    runScalpEngineCycle().catch(() => {});
  }, 20_000);
  logger.info("Demo scalp engine started");
}

export function triggerDemoEngineCycle(): void {
  runAutoEngineCycle().catch((err) => logger.error({ err }, "Manual trigger error"));
  if (demoEngineStatus.scalpRunning) {
    runScalpEngineCycle().catch((err) => logger.error({ err }, "Manual scalp trigger error"));
  }
}

export function stopDemoScalpEngine() {
  if (scalpTimer) { clearInterval(scalpTimer); scalpTimer = null; }
  demoEngineStatus.scalpRunning = false;
  logger.info("Demo scalp engine stopped");
}
