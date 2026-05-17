import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import { analyzeSymbol } from "./analysis.js";
import { scanBybitUniverse } from "./bybit.js";
import { scanScalp5m } from "./scalping5m.js";
import { logActivity } from "./activity-log.js";

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

  return {
    totalTrades,
    closedTrades: closedTrades.length,
    wins,
    losses,
    winRate,
    profitFactor,
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

// ─── Mark price updater (runs every 10s) ─────────────────────────────────────

async function updateMarkPrices() {
  if (state.positions.length === 0) return;
  for (const pos of state.positions) {
    const price = await getMarkPrice(pos.symbol);
    if (!price) continue;
    pos.markPrice = price;
    const { pnl, pnlPct } = calcPnl(pos, price);
    pos.unrealisedPnl = pnl;
    pos.unrealisedPnlPct = pnlPct;

    if (pos.stopLoss != null) {
      const slHit = pos.side === "Buy" ? price <= pos.stopLoss : price >= pos.stopLoss;
      if (slHit) {
        closeDemoPosition(pos.id, "sl", price);
        logger.info({ symbol: pos.symbol, price, sl: pos.stopLoss }, "Demo SL hit");
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
  saveState();
}

setInterval(() => {
  updateMarkPrices().catch((err) => logger.error({ err }, "Demo mark price update error"));
}, 10_000);

// ─── Auto Trading Engine ──────────────────────────────────────────────────────

let autoTimer: ReturnType<typeof setInterval> | null = null;

async function runAutoEngineCycle() {
  if (demoEngineStatus.autoAnalyzing) return;
  demoEngineStatus.autoAnalyzing = true;
  demoEngineStatus.lastCycleAt = Date.now();
  demoEngineStatus.cycleCount++;

  try {
    const candidates = await scanBybitUniverse();
    demoEngineStatus.totalScanned = candidates.length;

    const qualified = candidates.filter(c => c.confidence >= demoConfig.minConfidence);
    demoEngineStatus.lastSignalsFound = qualified.length;

    let autoExited = 0;
    for (const pos of [...state.positions]) {
      let posAnalysis: Awaited<ReturnType<typeof analyzeSymbol>> | null = null;
      try { posAnalysis = await analyzeSymbol(pos.symbol); }
      catch { continue; }

      const isLong = pos.side === "Buy";
      const shouldClose = isLong ? posAnalysis.shouldExitLong : posAnalysis.shouldExitShort;
      if (!shouldClose) continue;

      const exitNote = posAnalysis.exitReason ?? `Tren berbalik ${isLong ? "BEARISH" : "BULLISH"} — auto exit`;
      const price = await getMarkPrice(pos.symbol);
      closeDemoPosition(pos.id, "reversal", price ?? undefined, exitNote);
      autoExited++;
    }

    const usedMargin = state.positions.reduce((s, p) => s + p.margin, 0);
    const available = state.balance - usedMargin;
    const maxPerTrade = Math.min(demoConfig.maxPositionUSDT, available * 0.3);

    if (state.positions.length >= demoConfig.maxPositions) {
      logActivity({ source: "demo", level: "info", message: `Slot penuh (${state.positions.length}/${demoConfig.maxPositions}) — menunggu TP/SL/exit` });
    }

    let skipped = 0;
    let opened = 0;
    let signaled = 0;
    const skipReasons: string[] = [];

    for (const cand of candidates) {
      if (state.positions.length >= demoConfig.maxPositions) break;
      if (cand.confidence < demoConfig.minConfidence) continue;
      if (state.positions.find((p) => p.symbol === cand.symbol)) continue;

      let analysis: Awaited<ReturnType<typeof analyzeSymbol>> | null = null;
      try { analysis = await analyzeSymbol(cand.symbol); } catch { skipped++; continue; }
      if (!analysis || !analysis.shouldEnter || !analysis.side) {
        skipped++;
        if (analysis?.waitReason) skipReasons.push(analysis.waitReason);
        continue;
      }
      if (analysis.overallConfidence < demoConfig.minConfidence) { skipped++; continue; }

      const direction = analysis.side === "Buy" ? "LONG" : "SHORT";

      if (demoConfig.autoMode === "semi") {
        signaled++;
        logActivity({
          source: "demo", level: "signal",
          message: `[Semi] Sinyal ${direction} ${cand.symbol} ${analysis.overallConfidence}% — ${analysis.reasons[0] ?? "entry valid"}`,
          symbol: cand.symbol, confidence: analysis.overallConfidence
        });
        state.log.unshift({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          openedAt: Date.now(),
          symbol: cand.symbol,
          side: analysis.side,
          qty: 0,
          entryPrice: analysis.entryPrice,
          closePrice: null,
          realizedPnl: null,
          realizedPnlPct: null,
          leverage: demoConfig.leverage,
          margin: maxPerTrade,
          confidence: analysis.overallConfidence,
          signal: analysis.side === "Buy" ? "buy" : "sell",
          status: "rejected",
          reason: `[Semi] Sinyal ${analysis.side === "Buy" ? "LONG" : "SHORT"} — ${analysis.reasons[0] ?? ""}`,
          openReason: analysis.reasons.join("; "),
          source: "auto",
          tags: generateTags({ source: "auto", confidence: analysis.overallConfidence, signal: analysis.side === "Buy" ? "buy" : "sell", leverage: demoConfig.leverage }),
        });
        if (state.log.length > 500) state.log.splice(500);
        saveState();
        continue;
      }

      const sl = analysis.side === "Buy"
        ? analysis.entryPrice * (1 - demoConfig.stopLossPct / 100)
        : analysis.entryPrice * (1 + demoConfig.stopLossPct / 100);
      const tp = analysis.side === "Buy"
        ? analysis.entryPrice * (1 + demoConfig.takeProfitPct / 100)
        : analysis.entryPrice * (1 - demoConfig.takeProfitPct / 100);

      openDemoPosition({
        symbol: cand.symbol,
        displayName: cand.symbol.replace("USDT", "/USDT"),
        side: analysis.side,
        entryPrice: analysis.entryPrice,
        positionUSDT: maxPerTrade,
        leverage: demoConfig.leverage,
        stopLoss: sl,
        takeProfit: tp,
        confidence: analysis.overallConfidence,
        signal: analysis.side === "Buy" ? "buy" : "sell",
        source: "auto",
        openReason: analysis.reasons.join("; "),
      });

      opened++;
      logActivity({
        source: "demo", level: "success",
        message: `✓ BUKA ${direction} ${cand.symbol} @ $${analysis.entryPrice.toFixed(4)} | conf: ${analysis.overallConfidence}% | TP: $${tp.toFixed(4)} | SL: $${sl.toFixed(4)}`,
        symbol: cand.symbol, confidence: analysis.overallConfidence
      });
    }

    const parts: string[] = [];
    parts.push(`Siklus #${demoEngineStatus.cycleCount}`);
    parts.push(`pindai: ${candidates.length} · kandidat: ${qualified.length}`);
    if (autoExited > 0) parts.push(`exit reversal: ${autoExited}`);
    if (skipped > 0) parts.push(`skip: ${skipped}`);
    if (opened > 0) parts.push(`BUKA: ${opened}`);
    if (signaled > 0) parts.push(`sinyal: ${signaled}`);
    parts.push(`posisi: ${state.positions.length}/${demoConfig.maxPositions}`);

    const summaryLevel = opened > 0 ? "success" : signaled > 0 ? "signal" : qualified.length === 0 ? "scan" : "info";
    logActivity({ source: "demo", level: summaryLevel, message: parts.join(" · ") });

    if (opened === 0 && signaled === 0 && skipReasons.length > 0) {
      const freq = new Map<string, number>();
      for (const r of skipReasons) freq.set(r, (freq.get(r) ?? 0) + 1);
      const topReason = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
      logActivity({ source: "demo", level: "info", message: `Alasan skip terbanyak (${topReason[1]}x): ${topReason[0]}` });
    }
  } catch (err) {
    demoEngineStatus.lastError = String(err);
    logActivity({ source: "demo", level: "error", message: `Error siklus demo: ${String(err)}` });
    logger.error({ err }, "Demo auto engine cycle error");
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
