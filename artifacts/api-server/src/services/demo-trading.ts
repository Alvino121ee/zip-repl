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
const INITIAL_BALANCE = 10_000; // USDT

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DemoPosition {
  id: string;
  symbol: string;
  displayName: string;
  side: "Buy" | "Sell";
  size: number;         // base currency
  entryPrice: number;
  markPrice: number;
  leverage: number;
  margin: number;       // USDT margin locked
  stopLoss: number | null;
  takeProfit: number | null;
  unrealisedPnl: number;
  unrealisedPnlPct: number;
  openedAt: number;
  source: "auto" | "scalp" | "manual";
  confidence: number;
  signal: string;
}

export interface DemoTradeLog {
  id: string;
  timestamp: number;
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
  source: "auto" | "scalp" | "manual";
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

// ─── State ────────────────────────────────────────────────────────────────────

interface DemoState {
  balance: number;           // available + unrealised PnL
  realizedPnl: number;
  winCount: number;
  lossCount: number;
  positions: DemoPosition[];
  log: DemoTradeLog[];
}

let state: DemoState = {
  balance: INITIAL_BALANCE,
  realizedPnl: 0,
  winCount: 0,
  lossCount: 0,
  positions: [],
  log: [],
};

export const demoConfig: DemoConfig = {
  autoEnabled: false,
  autoMode: "semi",
  scalpEnabled: false,
  scalpMode: "semi",
  minConfidence: 80,
  maxPositionUSDT: 500,
  stopLossPct: 2,
  takeProfitPct: 4,
  maxPositions: 5,
  leverage: 5,
  intervalMs: 20_000,       // 20 detik — lebih responsif
  scalpMinConfidence: 75,
  scalpMaxPositionUSDT: 300,
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
    const saved = JSON.parse(raw) as DemoState;
    state = { ...state, ...saved };
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
}): DemoPosition | { error: string } {
  const margin = data.positionUSDT;
  const usedMargin = state.positions.reduce((s, p) => s + p.margin, 0);
  const available = state.balance - usedMargin;

  if (available < margin) {
    return { error: `Saldo tidak cukup. Tersedia: $${available.toFixed(2)}, dibutuhkan: $${margin.toFixed(2)}` };
  }
  if (state.positions.length >= demoConfig.maxPositions) {
    return { error: `Maksimal ${demoConfig.maxPositions} posisi` };
  }
  const alreadyOpen = state.positions.find((p) => p.symbol === data.symbol);
  if (alreadyOpen) {
    return { error: `Posisi ${data.symbol} sudah terbuka` };
  }

  const size = (margin * data.leverage) / data.entryPrice;
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
  };

  state.positions.push(pos);
  state.log.unshift({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
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
    reason: `Demo ${data.side === "Buy" ? "LONG" : "SHORT"} opened at $${data.entryPrice.toFixed(4)}`,
    source: data.source,
  });
  if (state.log.length > 200) state.log.splice(200);
  saveState();
  return pos;
}

// ─── Close demo position ──────────────────────────────────────────────────────

export function closeDemoPosition(posId: string, reason: "tp" | "sl" | "manual", markPrice?: number): DemoTradeLog | { error: string } {
  const idx = state.positions.findIndex((p) => p.id === posId);
  if (idx === -1) return { error: "Posisi tidak ditemukan" };
  const pos = state.positions[idx];

  const closePrice = markPrice ?? pos.markPrice;
  const { pnl, pnlPct } = calcPnl(pos, closePrice);

  state.realizedPnl += pnl;
  state.balance += pnl; // update balance
  if (pnl >= 0) state.winCount++;
  else state.lossCount++;

  const statusMap = { tp: "closed_tp", sl: "closed_sl", manual: "closed_manual" } as const;
  const reasonText = reason === "tp" ? `Take Profit hit @ $${closePrice.toFixed(4)}`
    : reason === "sl" ? `Stop Loss hit @ $${closePrice.toFixed(4)}`
    : `Manual close @ $${closePrice.toFixed(4)}`;

  const logEntry: DemoTradeLog = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
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
    source: pos.source,
  };

  state.positions.splice(idx, 1);
  state.log.unshift(logEntry);
  if (state.log.length > 200) state.log.splice(200);
  saveState();
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

export function resetDemo() {
  state = {
    balance: INITIAL_BALANCE,
    realizedPnl: 0,
    winCount: 0,
    lossCount: 0,
    positions: [],
    log: [],
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

    // Check SL hit
    if (pos.stopLoss != null) {
      const slHit = pos.side === "Buy" ? price <= pos.stopLoss : price >= pos.stopLoss;
      if (slHit) {
        closeDemoPosition(pos.id, "sl", price);
        logger.info({ symbol: pos.symbol, price, sl: pos.stopLoss }, "Demo SL hit");
        continue;
      }
    }
    // Check TP hit
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

  logActivity({ source: "demo", level: "scan", message: "Memulai siklus analisis pasar demo..." });

  try {
    logActivity({ source: "demo", level: "scan", message: "Memindai pasar Bybit untuk peluang trading..." });
    const candidates = await scanBybitUniverse();
    demoEngineStatus.totalScanned = candidates.length;
    demoEngineStatus.lastSignalsFound = candidates.filter(c => c.confidence >= demoConfig.minConfidence).length;

    const qualified = candidates.filter(c => c.confidence >= demoConfig.minConfidence);
    logActivity({
      source: "demo", level: "info",
      message: `Ditemukan ${qualified.length} kandidat dari ${candidates.length} pasang yang dipindai (min. confidence: ${demoConfig.minConfidence}%)`,
    });

    const usedMargin = state.positions.reduce((s, p) => s + p.margin, 0);
    const available = state.balance - usedMargin;
    const maxPerTrade = Math.min(demoConfig.maxPositionUSDT, available * 0.25);

    if (state.positions.length >= demoConfig.maxPositions) {
      logActivity({ source: "demo", level: "warning", message: `Batas maksimum ${demoConfig.maxPositions} posisi tercapai — tidak membuka posisi baru` });
    }

    for (const cand of candidates) {
      if (state.positions.length >= demoConfig.maxPositions) break;
      if (cand.confidence < demoConfig.minConfidence) continue;
      if (state.positions.find((p) => p.symbol === cand.symbol)) continue;

      logActivity({ source: "demo", level: "scan", message: `Menganalisis ${cand.symbol} (confidence: ${cand.confidence}%)...`, symbol: cand.symbol, confidence: cand.confidence });

      let analysis: Awaited<ReturnType<typeof analyzeSymbol>> | null = null;
      try { analysis = await analyzeSymbol(cand.symbol); } catch { continue; }
      if (!analysis || !analysis.shouldEnter || !analysis.side) {
        logActivity({ source: "demo", level: "info", message: `Skip ${cand.symbol}: tidak ada setup entry yang valid`, symbol: cand.symbol });
        continue;
      }
      if (analysis.overallConfidence < demoConfig.minConfidence) {
        logActivity({ source: "demo", level: "info", message: `Skip ${cand.symbol}: confidence ${analysis.overallConfidence}% di bawah minimum ${demoConfig.minConfidence}%`, symbol: cand.symbol });
        continue;
      }

      const direction = analysis.side === "Buy" ? "LONG" : "SHORT";

      if (demoConfig.autoMode === "semi") {
        logActivity({ source: "demo", level: "signal", message: `[Semi] Sinyal ${direction} ${cand.symbol} terdeteksi — tidak dibuka otomatis (mode semi)`, symbol: cand.symbol, confidence: analysis.overallConfidence });
        state.log.unshift({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
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
          source: "auto",
        });
        if (state.log.length > 200) state.log.splice(200);
        saveState();
        continue;
      }

      // Auto mode — open position
      logActivity({ source: "demo", level: "signal", message: `⚡ Membuka posisi demo ${direction} ${cand.symbol} @ $${analysis.entryPrice.toFixed(4)} (confidence: ${analysis.overallConfidence}%)`, symbol: cand.symbol, confidence: analysis.overallConfidence });

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
      });

      logActivity({ source: "demo", level: "success", message: `✓ Posisi demo ${direction} ${cand.symbol} berhasil dibuka @ $${analysis.entryPrice.toFixed(4)} | TP: $${tp.toFixed(4)} | SL: $${sl.toFixed(4)}`, symbol: cand.symbol, confidence: analysis.overallConfidence });
      logger.info({ symbol: cand.symbol, side: analysis.side, confidence: analysis.overallConfidence }, "Demo auto position opened");
    }

    if (qualified.length === 0) {
      logActivity({ source: "demo", level: "info", message: "Tidak ada peluang trading valid saat ini — menunggu siklus berikutnya" });
    } else {
      logActivity({ source: "demo", level: "info", message: `Siklus ke-${demoEngineStatus.cycleCount} selesai — ${state.positions.length} posisi aktif` });
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
          source: "scalp",
        });
        if (state.log.length > 200) state.log.splice(200);
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
  }, 20_000);    // 20 detik — lebih responsif
  logger.info("Demo scalp engine started");
}

// Trigger manual — paksa satu siklus langsung tanpa menunggu timer
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
