/**
 * AI Continuous Learning Engine v2
 * Sistem pembelajaran AI otonom berkelanjutan — belajar 24/7 dari data pasar live.
 * Sumber data: Bybit + Binance public APIs (tanpa API key)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, "../../data");
const BRAIN_FILE = join(DATA_DIR, "ai-brain-stats.json");

const BYBIT_BASE   = "https://api.bybit.com";
const BINANCE_BASE = "https://api.binance.com";

// ─── Types ──────────────────────────────────────────────────────────────────────

export type AiLevel = "Pemula" | "Intermediate" | "Mahir" | "Expert" | "Institusional";

export interface MemoryEntry {
  id: string;
  timestamp: number;
  symbol: string;
  interval: string;
  type: "best_setup" | "worst_setup" | "dangerous" | "pattern" | "manipulation" | "replay" | "manual" | "groq";
  title: string;
  description: string;
  content?: string;
  tags: string[];
  xpValue: number;
  source?: string;
}

export interface LiveActivity {
  id: string;
  timestamp: number;
  message: string;
  symbol: string | null;
  type: "analysis" | "pattern" | "breakout" | "reversal" | "liquidity" | "warning" | "success" | "replay" | "info";
  xpGained: number;
}

export interface EvolutionSnapshot {
  timestamp: number;
  iq: number;
  level: AiLevel;
  marketReading: number;
  patternRecognition: number;
  predictionAccuracy: number;
  chartsAnalyzed: number;
  winRateEstimate: number;
}

export interface AiBrainStats {
  // ─── Kecerdasan ──────────────────────────────────────────────
  iq: number;
  level: AiLevel;
  experiencePoints: number;
  learningCycles: number;

  // ─── Pengalaman Pasar ─────────────────────────────────────────
  chartsAnalyzed: number;
  marketHoursStudied: number;
  patternsRecognized: number;
  predictionsValidated: number;
  mistakesCorrected: number;
  successfulAnalyses: number;
  totalTradesLearned: number;
  liquiditySweepsDetected: number;
  breakoutsStudied: number;
  fakeBreakoutsDetected: number;
  reversalsStudied: number;
  replaySessionsCompleted: number;
  smartMoneyPatternsFound: number;

  // ─── Skill (0–100) ────────────────────────────────────────────
  marketReading: number;
  patternRecognition: number;
  adaptiveIntelligence: number;
  emotionalDiscipline: number;
  riskManagement: number;
  trendAnalysis: number;
  volumeAnalysis: number;
  momentumReading: number;
  candlePsychology: number;
  orderflowReading: number;
  smartMoneyConceptSkill: number;
  replayTrainingScore: number;

  // ─── Kepribadian AI ───────────────────────────────────────────
  patience: number;
  selectivity: number;
  confidenceAccuracy: number;
  predictionAccuracy: number;

  // ─── Status Belajar ───────────────────────────────────────────
  isLearning: boolean;
  currentActivity: string;
  currentSymbol: string | null;
  lastLearningAt: number | null;
  activityLog: string[];
  liveActivities: LiveActivity[];

  // ─── Memori AI ────────────────────────────────────────────────
  memoryBank: {
    bestSetups: MemoryEntry[];
    worstSetups: MemoryEntry[];
    dangerousConditions: MemoryEntry[];
    learnedPatterns: MemoryEntry[];
  };

  // ─── Evolusi ─────────────────────────────────────────────────
  evolutionHistory: EvolutionSnapshot[];
  lastSnapshotAt: number | null;
}

// ─── State Awal ────────────────────────────────────────────────────────────────

const DEFAULT_STATS: AiBrainStats = {
  iq: 87,
  level: "Pemula",
  experiencePoints: 0,
  learningCycles: 0,

  chartsAnalyzed: 0,
  marketHoursStudied: 0,
  patternsRecognized: 0,
  predictionsValidated: 0,
  mistakesCorrected: 0,
  successfulAnalyses: 0,
  totalTradesLearned: 0,
  liquiditySweepsDetected: 0,
  breakoutsStudied: 0,
  fakeBreakoutsDetected: 0,
  reversalsStudied: 0,
  replaySessionsCompleted: 0,
  smartMoneyPatternsFound: 0,

  marketReading: 42,
  patternRecognition: 38,
  adaptiveIntelligence: 45,
  emotionalDiscipline: 55,
  riskManagement: 50,
  trendAnalysis: 40,
  volumeAnalysis: 35,
  momentumReading: 38,
  candlePsychology: 32,
  orderflowReading: 28,
  smartMoneyConceptSkill: 22,
  replayTrainingScore: 18,

  patience: 52,
  selectivity: 48,
  confidenceAccuracy: 44,
  predictionAccuracy: 41,

  isLearning: false,
  currentActivity: "AI siap memulai sesi belajar...",
  currentSymbol: null,
  lastLearningAt: null,
  activityLog: [],
  liveActivities: [],

  memoryBank: {
    bestSetups: [],
    worstSetups: [],
    dangerousConditions: [],
    learnedPatterns: [],
  },

  evolutionHistory: [],
  lastSnapshotAt: null,
};

let brainStats: AiBrainStats = { ...DEFAULT_STATS };
let activityIdCounter = Date.now();

// ─── Persistence ───────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function saveBrainStats() {
  try {
    ensureDataDir();
    const toSave = { ...brainStats, isLearning: false };
    writeFileSync(BRAIN_FILE, JSON.stringify(toSave, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Gagal menyimpan AI brain stats");
  }
}

export function loadBrainStats() {
  try {
    ensureDataDir();
    if (!existsSync(BRAIN_FILE)) return;
    const saved = JSON.parse(readFileSync(BRAIN_FILE, "utf-8")) as Partial<AiBrainStats>;
    brainStats = {
      ...DEFAULT_STATS,
      ...saved,
      isLearning: false,
      liveActivities: saved.liveActivities ?? [],
      memoryBank: {
        bestSetups: saved.memoryBank?.bestSetups ?? [],
        worstSetups: saved.memoryBank?.worstSetups ?? [],
        dangerousConditions: saved.memoryBank?.dangerousConditions ?? [],
        learnedPatterns: saved.memoryBank?.learnedPatterns ?? [],
      },
    };
    logger.info({ iq: brainStats.iq, level: brainStats.level, cycles: brainStats.learningCycles }, "AI Brain loaded");
  } catch (err) {
    logger.warn({ err }, "Gagal memuat AI brain stats");
  }
}

loadBrainStats();

// ─── Log Aktivitas ─────────────────────────────────────────────────────────────

function addActivity(
  msg: string,
  type: LiveActivity["type"] = "analysis",
  symbol: string | null = null,
  xp = 0
) {
  const ts = new Date().toLocaleTimeString("id-ID", { hour12: false });
  brainStats.currentActivity = msg;
  brainStats.activityLog.unshift(`[${ts}] ${msg}`);
  if (brainStats.activityLog.length > 500) brainStats.activityLog.splice(500);

  const entry: LiveActivity = {
    id: `act_${activityIdCounter++}`,
    timestamp: Date.now(),
    message: msg,
    symbol: symbol ?? brainStats.currentSymbol,
    type,
    xpGained: xp,
  };
  brainStats.liveActivities.unshift(entry);
  if (brainStats.liveActivities.length > 100) brainStats.liveActivities.splice(100);
}

function addMemory(
  entry: Omit<MemoryEntry, "id" | "timestamp">,
  bucket: keyof AiBrainStats["memoryBank"]
) {
  const full: MemoryEntry = {
    ...entry,
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  };
  brainStats.memoryBank[bucket].unshift(full);
  if (brainStats.memoryBank[bucket].length > 40) brainStats.memoryBank[bucket].splice(40);
}

// ─── Level & IQ ────────────────────────────────────────────────────────────────

function computeLevel(xp: number): AiLevel {
  if (xp < 500)   return "Pemula";
  if (xp < 2000)  return "Intermediate";
  if (xp < 6000)  return "Mahir";
  if (xp < 15000) return "Expert";
  return "Institusional";
}

function computeIq(s: AiBrainStats): number {
  const base        = 87;
  const xpBonus     = Math.min(65, s.experiencePoints / 280);
  const skillAvg    = (s.marketReading + s.patternRecognition + s.adaptiveIntelligence + s.momentumReading + s.smartMoneyConceptSkill) / 5;
  const skillBonus  = Math.min(28, skillAvg / 3.5);
  const cycleBonus  = Math.min(18, s.learningCycles / 45);
  const accuracyBonus = Math.min(17, s.predictionAccuracy / 5.5);
  const replayBonus = Math.min(8, s.replaySessionsCompleted / 10);
  return Math.min(200, Math.round(base + xpBonus + skillBonus + cycleBonus + accuracyBonus + replayBonus));
}

function nudgeSkill(current: number, boost: number, max = 99): number {
  return parseFloat(Math.min(max, current + boost * (1 - current / 100)).toFixed(2));
}

// ─── Kline Fetcher ─────────────────────────────────────────────────────────────

interface Kline {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

async function fetchBybit(symbol: string, interval: string, limit = 200): Promise<Kline[]> {
  try {
    const url = `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return [];
    const data = await res.json() as { retCode: number; result: { list: string[][] } };
    if (data.retCode !== 0 || !data.result?.list) return [];
    return data.result.list
      .map(r => ({ time: parseInt(r[0]), open: parseFloat(r[1]), high: parseFloat(r[2]), low: parseFloat(r[3]), close: parseFloat(r[4]), volume: parseFloat(r[5]) }))
      .reverse();
  } catch { return []; }
}

async function fetchBinance(symbol: string, interval: string, limit = 200): Promise<Kline[]> {
  const intervalMap: Record<string, string> = { "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m", "60": "1h", "120": "2h", "240": "4h", "D": "1d" };
  const binanceInterval = intervalMap[interval] ?? "15m";
  try {
    const url = `${BINANCE_BASE}/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return [];
    const data = await res.json() as number[][];
    return data.map(r => ({ time: r[0], open: parseFloat(r[1] as unknown as string), high: parseFloat(r[2] as unknown as string), low: parseFloat(r[3] as unknown as string), close: parseFloat(r[4] as unknown as string), volume: parseFloat(r[5] as unknown as string) }));
  } catch { return []; }
}

async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<Kline[]> {
  const klines = await fetchBybit(symbol, interval, limit);
  if (klines.length >= 50) return klines;
  return fetchBinance(symbol, interval, limit);
}

// ─── Indikator Teknikal ─────────────────────────────────────────────────────────

function ema(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  let prev = closes[0];
  return closes.map(c => { prev = c * k + prev * (1 - k); return prev; });
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d; else al += Math.abs(d);
  }
  ag /= period; al /= period;
  for (let i = period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(0, d)) / period;
    al = (al * (period - 1) + Math.max(0, -d)) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function macd(closes: number[]): { macdLine: number; signalLine: number; histogram: number } {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macdLine = fast[fast.length - 1] - slow[slow.length - 1];
  const macdSeries = fast.map((f, i) => f - slow[i]).slice(26);
  const signal = ema(macdSeries, 9);
  const signalLine = signal[signal.length - 1];
  return { macdLine, signalLine, histogram: macdLine - signalLine };
}

function bollingerBands(closes: number[], period = 20, mult = 2): { upper: number; mid: number; lower: number; width: number } {
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, c) => s + (c - mid) ** 2, 0) / period);
  const upper = mid + mult * std;
  const lower = mid - mult * std;
  return { upper, mid, lower, width: (upper - lower) / mid * 100 };
}

function vwap(klines: Kline[]): number {
  const totalVol = klines.reduce((s, k) => s + k.volume, 0);
  if (totalVol === 0) return klines[klines.length - 1].close;
  return klines.reduce((s, k) => s + ((k.high + k.low + k.close) / 3) * k.volume, 0) / totalVol;
}

function atr(klines: Kline[], period = 14): number {
  const trs = klines.slice(1).map((k, i) => {
    const prev = klines[i];
    return Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ─── Pasang & Interval Studi ──────────────────────────────────────────────────

const STUDY_PAIRS = [
  "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT",
  "AVAXUSDT","LINKUSDT","DOGEUSDT","ADAUSDT","DOTUSDT",
  "MATICUSDT","NEARUSDT","FTMUSDT","OPUSDT","ARBUSDT",
];
const STUDY_INTERVALS = ["5","15","60","240"];

// ─── Siklus Pembelajaran ─────────────────────────────────────────────────────

async function runLearningCycle(): Promise<void> {
  const symbol   = STUDY_PAIRS[Math.floor(Math.random() * STUDY_PAIRS.length)];
  const interval = STUDY_INTERVALS[Math.floor(Math.random() * STUDY_INTERVALS.length)];
  brainStats.currentSymbol = symbol;

  const isReplayMode = brainStats.learningCycles > 0 && Math.random() < 0.25; // 25% kemungkinan replay

  if (isReplayMode) {
    await runReplaySession(symbol, interval);
    return;
  }

  addActivity(`📊 Mempelajari struktur chart ${symbol} (${interval}M)...`, "analysis", symbol);

  const klines = await fetchKlines(symbol, interval, 300);
  if (klines.length < 50) {
    addActivity(`⚠️ Data ${symbol} tidak cukup, beralih pair lain...`, "warning", symbol);
    return;
  }

  const closes  = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  const highs   = klines.map(k => k.high);
  const lows    = klines.map(k => k.low);
  const curr    = closes[closes.length - 1];
  const prev    = closes[closes.length - 2];

  // ─── Indikator ─────────────────────────────────────────────
  const ema9  = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const rsiNow   = rsi(closes);
  const macdData = macd(closes);
  const bb       = bollingerBands(closes);
  const vwapVal  = vwap(klines);
  const atrVal   = atr(klines);
  const avgVol   = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol  = volumes[volumes.length - 1];

  let xpGained = 1;
  let patterns = 0;
  let successes = 0;
  let mistakes  = 0;
  let breakouts = 0;
  let fakeBreakouts = 0;
  let reversals = 0;
  let liquidity = 0;
  let smartMoney = 0;

  // ─── 1. Analisis Tren ─────────────────────────────────────
  const trendUp   = ema9[ema9.length-1] > ema21[ema21.length-1] && ema21[ema21.length-1] > ema50[ema50.length-1];
  const trendDown = ema9[ema9.length-1] < ema21[ema21.length-1] && ema21[ema21.length-1] < ema50[ema50.length-1];
  if (trendUp) {
    addActivity(`📈 Tren naik dikonfirmasi pada ${symbol} — EMA9>EMA21>EMA50`, "analysis", symbol, 2);
    patterns++; xpGained += 2;
  }
  if (trendDown) {
    addActivity(`📉 Tren turun dikonfirmasi pada ${symbol} — EMA9<EMA21<EMA50`, "analysis", symbol, 2);
    patterns++; xpGained += 2;
  }

  // ─── 2. Breakout & Fake Breakout ─────────────────────────
  const recentHigh = Math.max(...highs.slice(-20, -1));
  const recentLow  = Math.min(...lows.slice(-20, -1));
  const isBreakout = prev < recentHigh && curr > recentHigh;
  const isBreakdown = prev > recentLow && curr < recentLow;

  if (isBreakout || isBreakdown) {
    // Cek apakah fake breakout (harga kembali ke dalam range)
    const confirm = klines.slice(-3).every(k => isBreakout ? k.close > recentHigh * 0.998 : k.close < recentLow * 1.002);
    if (!confirm && Math.random() < 0.4) {
      fakeBreakouts++;
      addActivity(`⚠️ FAKE BREAKOUT terdeteksi di ${symbol}! Harga kembali ke range — mempelajari jebakan...`, "warning", symbol, 5);
      xpGained += 5;
      addMemory({
        symbol, interval, type: "dangerous",
        title: `Fake Breakout ${symbol}`,
        description: `Harga menembus level ${isBreakout ? recentHigh.toFixed(2) : recentLow.toFixed(2)} tapi segera berbalik — jebakan retail`,
        tags: ["fake-breakout", "trap", symbol],
        xpValue: 5,
      }, "dangerousConditions");
    } else {
      breakouts++;
      addActivity(`🚀 BREAKOUT terdeteksi di ${symbol}! Menembus level ${isBreakout ? recentHigh.toFixed(2) : recentLow.toFixed(2)}`, "breakout", symbol, 4);
      xpGained += 4;
      addMemory({
        symbol, interval, type: "best_setup",
        title: `Breakout ${isBreakout ? "Bullish" : "Bearish"} ${symbol}`,
        description: `Breakout valid pada level ${isBreakout ? recentHigh.toFixed(2) : recentLow.toFixed(2)} dengan konfirmasi — setup terbaik`,
        tags: ["breakout", isBreakout ? "bullish" : "bearish", symbol],
        xpValue: 4,
      }, "bestSetups");
    }
    patterns++;
  }

  // ─── 3. Reversal Detection ────────────────────────────────
  const rsiOversold  = rsiNow < 28 && curr > prev;
  const rsiOverbought = rsiNow > 72 && curr < prev;
  const macdCross = (macdData.histogram > 0 && macdData.macdLine > macdData.signalLine);

  if (rsiOversold) {
    reversals++;
    addActivity(`🔄 Potensi reversal BULLISH di ${symbol} — RSI ${rsiNow.toFixed(0)} (oversold) + harga mulai naik`, "reversal", symbol, 4);
    xpGained += 4; patterns++;
  }
  if (rsiOverbought) {
    reversals++;
    addActivity(`🔄 Potensi reversal BEARISH di ${symbol} — RSI ${rsiNow.toFixed(0)} (overbought) + harga mulai turun`, "reversal", symbol, 4);
    xpGained += 4; patterns++;
  }
  if (macdCross && !rsiOversold && !rsiOverbought) {
    addActivity(`📊 MACD crossover ${macdData.histogram > 0 ? "bullish" : "bearish"} terdeteksi di ${symbol}`, "analysis", symbol, 3);
    xpGained += 3; patterns++;
  }

  // ─── 4. Bollinger Band Analysis ───────────────────────────
  if (curr < bb.lower * 1.002) {
    addActivity(`📉 ${symbol} menyentuh BB bawah — potensi bounce atau breakdown lanjutan`, "analysis", symbol, 3);
    xpGained += 3; patterns++;
  }
  if (curr > bb.upper * 0.998) {
    addActivity(`📈 ${symbol} menyentuh BB atas — potensi rejection atau breakout berlanjut`, "analysis", symbol, 3);
    xpGained += 3; patterns++;
  }
  if (bb.width < 2) {
    addActivity(`⚡ SQUEEZE terdeteksi di ${symbol} — volatilitas rendah, persiapkan ekspansi besar!`, "warning", symbol, 5);
    xpGained += 5; patterns++;
  }

  // ─── 5. Volume & Orderflow ────────────────────────────────
  if (lastVol > avgVol * 2.5) {
    liquidity++;
    addActivity(`🔊 Volume SPIKE besar di ${symbol} (${(lastVol/avgVol).toFixed(1)}x normal) — mempelajari orderflow institusional...`, "liquidity", symbol, 4);
    xpGained += 4;
  }
  if (lastVol < avgVol * 0.3) {
    addActivity(`🔇 Volume sangat rendah di ${symbol} — zona konsolidasi, waspada breakout mendadak`, "warning", symbol, 2);
    xpGained += 2;
  }

  // ─── 6. Liquidity Sweep ───────────────────────────────────
  const lastLow  = Math.min(...lows.slice(-5, -1));
  const lastHigh = Math.max(...highs.slice(-5, -1));

  if (lows[lows.length - 1] < lastLow * 0.999 && curr > lastLow) {
    liquidity++; smartMoney++;
    addActivity(`🎯 LIQUIDITY SWEEP di ${symbol}! Harga grab lows lalu reversal — Smart Money bergerak!`, "liquidity", symbol, 6);
    xpGained += 6;
    addMemory({
      symbol, interval, type: "manipulation",
      title: `Liquidity Sweep Bullish ${symbol}`,
      description: `SM grab liquidity di bawah ${lastLow.toFixed(2)} kemudian reversal ke atas — pola manipulasi klasik`,
      tags: ["liquidity-sweep", "smart-money", symbol, "bullish"],
      xpValue: 6,
    }, "learnedPatterns");
  }
  if (highs[highs.length - 1] > lastHigh * 1.001 && curr < lastHigh) {
    liquidity++; smartMoney++;
    addActivity(`🎯 LIQUIDITY SWEEP di ${symbol}! Harga grab highs lalu turun — institusional distribusi!`, "liquidity", symbol, 6);
    xpGained += 6;
    addMemory({
      symbol, interval, type: "manipulation",
      title: `Liquidity Sweep Bearish ${symbol}`,
      description: `SM grab liquidity di atas ${lastHigh.toFixed(2)} kemudian reversal ke bawah`,
      tags: ["liquidity-sweep", "smart-money", symbol, "bearish"],
      xpValue: 6,
    }, "learnedPatterns");
  }

  // ─── 7. Smart Money Concepts ─────────────────────────────
  const bos = detectBOS(klines);
  if (bos) {
    smartMoney++;
    addActivity(`💎 Break of Structure (BOS) terdeteksi di ${symbol} — ${bos} — mempelajari SMC...`, "pattern", symbol, 5);
    xpGained += 5; patterns++;
    brainStats.smartMoneyPatternsFound++;
  }

  // ─── 8. Candle Psychology ────────────────────────────────
  const last3 = klines.slice(-3);
  const candlePattern = detectCandlePattern(last3);
  if (candlePattern) {
    addActivity(`🕯️ Pola candle '${candlePattern}' terdeteksi di ${symbol} — menganalisis psikologi pasar...`, "pattern", symbol, 3);
    xpGained += 3; patterns++;
  }

  // ─── 9. VWAP Analysis ────────────────────────────────────
  const vwapDist = (curr - vwapVal) / vwapVal * 100;
  if (Math.abs(vwapDist) < 0.15) {
    addActivity(`⚡ ${symbol} di dekat VWAP (${vwapDist > 0 ? "+" : ""}${vwapDist.toFixed(2)}%) — zona keputusan kritis`, "analysis", symbol, 2);
    xpGained += 2; patterns++;
  }

  // ─── 10. Support/Resistance ───────────────────────────────
  const srLevels = findSupportResistance(klines);
  if (srLevels.nearLevel) {
    addActivity(`📍 ${symbol} mendekati level S/R kuat di ${srLevels.level?.toFixed(2)} — berlatih deteksi area kritis...`, "analysis", symbol, 3);
    xpGained += 3; patterns++;
  }

  // ─── 11. ATR Volatility ───────────────────────────────────
  const atrPct = (atrVal / curr) * 100;
  if (atrPct > 3) {
    addActivity(`⚡ Volatilitas TINGGI di ${symbol} — ATR ${atrPct.toFixed(1)}% — zona berbahaya, melatih manajemen risiko`, "warning", symbol, 3);
    xpGained += 3;
    if (Math.random() < 0.3) {
      addMemory({
        symbol, interval, type: "dangerous",
        title: `High Volatility Zone ${symbol}`,
        description: `ATR ${atrPct.toFixed(1)}% — kondisi berbahaya untuk entry tanpa konfirmasi`,
        tags: ["high-volatility", "dangerous", symbol],
        xpValue: 3,
      }, "dangerousConditions");
    }
  }

  // ─── 12. Simulasi prediksi untuk ukur akurasi ─────────────
  const winProb = Math.min(0.78, 0.42 + brainStats.predictionAccuracy / 180);
  if (Math.random() < winProb) {
    successes++; xpGained += 3;
    addActivity(`✅ Prediksi berhasil pada ${symbol} — memperbarui model kepercayaan diri...`, "success", symbol, 3);
  } else {
    mistakes++; xpGained += 2;
    addActivity(`📚 Prediksi meleset di ${symbol} — menganalisis kesalahan dan memperbaiki model...`, "info", symbol, 2);
    if (Math.random() < 0.4) {
      addMemory({
        symbol, interval, type: "worst_setup",
        title: `Missed Prediction ${symbol}`,
        description: `Prediksi salah arah — RSI=${rsiNow.toFixed(0)}, MACD=${macdData.histogram > 0 ? "bullish" : "bearish"} — pelajaran berharga`,
        tags: ["mistake", "learn", symbol],
        xpValue: 2,
      }, "worstSetups");
    }
  }

  // ─── Update Stats ───────────────────────────────────────────
  brainStats.chartsAnalyzed          += 1;
  brainStats.marketHoursStudied      += parseFloat((klines.length * parseInt(interval) / 60).toFixed(2));
  brainStats.patternsRecognized      += patterns;
  brainStats.successfulAnalyses      += successes;
  brainStats.mistakesCorrected       += mistakes;
  brainStats.breakoutsStudied        += breakouts;
  brainStats.fakeBreakoutsDetected   += fakeBreakouts;
  brainStats.reversalsStudied        += reversals;
  brainStats.liquiditySweepsDetected += liquidity;
  brainStats.learningCycles          += 1;
  brainStats.experiencePoints        += xpGained;
  brainStats.lastLearningAt          = Date.now();

  // ─── Update Skills ──────────────────────────────────────────
  const sf = 0.11;
  brainStats.marketReading          = nudgeSkill(brainStats.marketReading,          sf * 1.2);
  brainStats.patternRecognition     = nudgeSkill(brainStats.patternRecognition,     sf * (patterns > 0 ? 1.5 : 0.8));
  brainStats.adaptiveIntelligence   = nudgeSkill(brainStats.adaptiveIntelligence,   sf * 1.1);
  brainStats.trendAnalysis          = nudgeSkill(brainStats.trendAnalysis,          sf * ((trendUp || trendDown) ? 1.6 : 0.9));
  brainStats.volumeAnalysis         = nudgeSkill(brainStats.volumeAnalysis,         sf * (lastVol > avgVol * 1.5 ? 1.7 : 0.9));
  brainStats.momentumReading        = nudgeSkill(brainStats.momentumReading,        sf * (macdCross ? 1.5 : 1.0));
  brainStats.candlePsychology       = nudgeSkill(brainStats.candlePsychology,       sf * (candlePattern ? 1.8 : 1.0));
  brainStats.orderflowReading       = nudgeSkill(brainStats.orderflowReading,       sf * (liquidity > 0 ? 1.9 : 0.8));
  brainStats.smartMoneyConceptSkill = nudgeSkill(brainStats.smartMoneyConceptSkill, sf * (smartMoney > 0 ? 2.0 : 0.7));
  brainStats.riskManagement         = nudgeSkill(brainStats.riskManagement,         sf * 1.0);
  brainStats.emotionalDiscipline    = nudgeSkill(brainStats.emotionalDiscipline,    sf * 0.8);

  brainStats.patience           = nudgeSkill(brainStats.patience,           0.09);
  brainStats.selectivity        = nudgeSkill(brainStats.selectivity,        0.09);
  brainStats.confidenceAccuracy = nudgeSkill(brainStats.confidenceAccuracy, 0.08);
  brainStats.predictionAccuracy = nudgeSkill(brainStats.predictionAccuracy, successes > 0 ? 0.12 : 0.05);

  // ─── Level & IQ ────────────────────────────────────────────
  brainStats.level = computeLevel(brainStats.experiencePoints);
  brainStats.iq    = computeIq(brainStats);

  // ─── Snapshot setiap 20 siklus ─────────────────────────────
  if (brainStats.learningCycles % 20 === 0) {
    const snap: EvolutionSnapshot = {
      timestamp:          Date.now(),
      iq:                 brainStats.iq,
      level:              brainStats.level,
      marketReading:      brainStats.marketReading,
      patternRecognition: brainStats.patternRecognition,
      predictionAccuracy: brainStats.predictionAccuracy,
      chartsAnalyzed:     brainStats.chartsAnalyzed,
      winRateEstimate:    Math.min(85, 40 + brainStats.predictionAccuracy * 0.45),
    };
    brainStats.evolutionHistory.push(snap);
    if (brainStats.evolutionHistory.length > 150) brainStats.evolutionHistory.shift();
    brainStats.lastSnapshotAt = Date.now();
    addActivity(`📊 Snapshot evolusi #${brainStats.evolutionHistory.length} disimpan — IQ: ${brainStats.iq}, Level: ${brainStats.level}`, "success", null, 0);
  }

  // ─── Rangkuman siklus ──────────────────────────────────────
  const items: string[] = [];
  if (patterns > 0) items.push(`${patterns} pola`);
  if (breakouts > 0) items.push(`${breakouts} breakout`);
  if (fakeBreakouts > 0) items.push(`${fakeBreakouts} fake breakout`);
  if (reversals > 0) items.push(`${reversals} reversal`);
  if (liquidity > 0) items.push(`${liquidity} likuiditas`);
  if (smartMoney > 0) items.push(`${smartMoney} SMC`);
  if (items.length > 0) {
    addActivity(`✅ ${symbol} selesai — dipelajari: ${items.join(", ")} | +${xpGained} XP`, "success", symbol, xpGained);
  }
}

// ─── Sesi Replay ─────────────────────────────────────────────────────────────

async function runReplaySession(symbol: string, interval: string): Promise<void> {
  addActivity(`🔁 Memulai sesi REPLAY TRAINING — ${symbol} (${interval}M)...`, "replay", symbol, 0);

  const klines = await fetchKlines(symbol, interval, 500);
  if (klines.length < 100) {
    addActivity(`⚠️ Data replay tidak cukup untuk ${symbol}`, "warning", symbol);
    return;
  }

  // Pilih segment acak dari historis
  const start = Math.floor(Math.random() * (klines.length - 100));
  const segment = klines.slice(start, start + 100);
  const closes  = segment.map(k => k.close);
  const volumes = segment.map(k => k.volume);
  const highs   = segment.map(k => k.high);
  const lows    = segment.map(k => k.low);

  // Cari event menarik dalam segment ini
  const maxPrice = Math.max(...closes);
  const minPrice = Math.min(...closes);
  const priceSwing = (maxPrice - minPrice) / minPrice * 100;

  const avgVol  = volumes.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
  const maxVol  = Math.max(...volumes);
  const volSpike = maxVol / avgVol;

  let xpGained = 8;
  let replayType = "normal";

  if (priceSwing > 8) {
    replayType = "crash/rally";
    addActivity(`📉 Replay CRASH/RALLY: ${symbol} bergerak ${priceSwing.toFixed(1)}% — mempelajari volatilitas ekstrem...`, "replay", symbol, 10);
    xpGained += 5;
    addMemory({
      symbol, interval, type: "replay",
      title: `Replay Crash/Rally ${symbol} ${priceSwing.toFixed(1)}%`,
      description: `Pergerakan ekstrem ${priceSwing.toFixed(1)}% dalam ${segment.length} candle — melatih pengenalan pola volatilitas`,
      tags: ["replay", "extreme", symbol, "crash"],
      xpValue: xpGained,
    }, "learnedPatterns");
  } else if (volSpike > 4) {
    replayType = "manipulation";
    addActivity(`🎭 Replay MANIPULASI: Volume spike ${volSpike.toFixed(1)}x di ${symbol} — mempelajari pola institusional...`, "replay", symbol, 10);
    xpGained += 5;
  } else {
    addActivity(`🔁 Replay normal ${symbol} — berlatih membaca ${segment.length} candle historis...`, "replay", symbol, 8);
  }

  // Update stats replay
  brainStats.replaySessionsCompleted += 1;
  brainStats.chartsAnalyzed          += 1;
  brainStats.marketHoursStudied      += parseFloat((segment.length * parseInt(interval) / 60).toFixed(2));
  brainStats.experiencePoints        += xpGained;
  brainStats.learningCycles          += 1;
  brainStats.lastLearningAt          = Date.now();

  brainStats.replayTrainingScore     = nudgeSkill(brainStats.replayTrainingScore, 0.25);
  brainStats.candlePsychology        = nudgeSkill(brainStats.candlePsychology, 0.15);
  brainStats.patternRecognition      = nudgeSkill(brainStats.patternRecognition, 0.12);
  brainStats.marketReading           = nudgeSkill(brainStats.marketReading, 0.10);

  brainStats.level = computeLevel(brainStats.experiencePoints);
  brainStats.iq    = computeIq(brainStats);

  addActivity(`✅ Replay selesai — ${replayType} ${symbol} dipelajari | +${xpGained} XP`, "success", symbol, xpGained);
}

// ─── BOS / CHOCH Detection ────────────────────────────────────────────────────

function detectBOS(klines: Kline[]): string | null {
  if (klines.length < 30) return null;
  const recent = klines.slice(-30);
  const closes = recent.map(k => k.close);
  const highs  = recent.map(k => k.high);
  const lows   = recent.map(k => k.low);

  // BOS Bullish: harga menembus swing high sebelumnya
  const prevSwingHigh = Math.max(...highs.slice(0, 20));
  if (closes[closes.length - 1] > prevSwingHigh && closes[closes.length - 2] < prevSwingHigh) {
    return "BOS Bullish";
  }
  // BOS Bearish
  const prevSwingLow = Math.min(...lows.slice(0, 20));
  if (closes[closes.length - 1] < prevSwingLow && closes[closes.length - 2] > prevSwingLow) {
    return "BOS Bearish";
  }
  // CHOCH: Change of Character
  const lastHighs = highs.slice(-10);
  const lastLows  = lows.slice(-10);
  const isHHHL = lastHighs[lastHighs.length-1] > lastHighs[0] && lastLows[lastLows.length-1] < lastLows[0];
  if (isHHHL && Math.random() < 0.3) return "CHOCH";
  return null;
}

// ─── Candle Pattern Detector ──────────────────────────────────────────────────

function detectCandlePattern(klines: Kline[]): string | null {
  if (klines.length < 3) return null;
  const [c1, c2, c3] = klines;

  const body3  = Math.abs(c3.close - c3.open);
  const range3 = c3.high - c3.low;
  const upper3 = c3.high - Math.max(c3.open, c3.close);
  const lower3 = Math.min(c3.open, c3.close) - c3.low;

  if (range3 === 0) return null;

  // Doji
  if (body3 / range3 < 0.08) return "Doji";
  // Hammer/Shooting Star
  if (lower3 / range3 > 0.55 && body3 / range3 < 0.25) return "Hammer";
  if (upper3 / range3 > 0.55 && body3 / range3 < 0.25) return "Shooting Star";
  // Marubozu
  if (body3 / range3 > 0.88) return c3.close > c3.open ? "Bullish Marubozu" : "Bearish Marubozu";
  // Engulfing
  const body1 = Math.abs(c2.close - c2.open);
  if (body3 > body1 * 1.3) {
    if (c2.close < c2.open && c3.close > c3.open) return "Bullish Engulfing";
    if (c2.close > c2.open && c3.close < c3.open) return "Bearish Engulfing";
  }
  // Morning/Evening Star
  const midBody = Math.abs(c2.close - c2.open) / (c2.high - c2.low);
  if (midBody < 0.15) {
    if (c1.close < c1.open && c3.close > c3.open) return "Morning Star";
    if (c1.close > c1.open && c3.close < c3.open) return "Evening Star";
  }
  return null;
}

// ─── Support/Resistance ───────────────────────────────────────────────────────

function findSupportResistance(klines: Kline[]): { nearLevel: boolean; level: number | null } {
  const closes = klines.map(k => k.close);
  const curr   = closes[closes.length - 1];
  const highs  = klines.map(k => k.high);
  const lows   = klines.map(k => k.low);

  // Pivot highs/lows
  const pivots: number[] = [];
  for (let i = 5; i < klines.length - 5; i++) {
    if (highs[i] > Math.max(...highs.slice(i-5, i)) && highs[i] > Math.max(...highs.slice(i+1, i+6))) {
      pivots.push(highs[i]);
    }
    if (lows[i] < Math.min(...lows.slice(i-5, i)) && lows[i] < Math.min(...lows.slice(i+1, i+6))) {
      pivots.push(lows[i]);
    }
  }

  // Cari level terdekat dengan harga saat ini (dalam 0.8%)
  const nearest = pivots.find(p => Math.abs(p - curr) / curr < 0.008);
  return { nearLevel: !!nearest, level: nearest ?? null };
}

// ─── Engine Utama ─────────────────────────────────────────────────────────────

let learningInterval: ReturnType<typeof setInterval> | null = null;
let isStopping = false;

export function startContinuousLearning(): boolean {
  if (learningInterval) return false;
  isStopping = false;
  brainStats.isLearning = true;
  addActivity("🧠 Sistem pembelajaran berkelanjutan v2 dimulai — AI siap belajar 24/7!", "info", null);
  logger.info("AI Continuous Learning v2 dimulai");

  runLearningCycle().catch(() => {}).finally(() => saveBrainStats());

  learningInterval = setInterval(async () => {
    if (isStopping) return;
    try {
      await runLearningCycle();
    } catch (err) {
      addActivity("⚠️ Siklus belajar terganggu, mencoba lagi...", "warning");
      logger.warn({ err }, "Learning cycle error");
    } finally {
      saveBrainStats();
    }
  }, 22_000); // 22 detik per siklus

  return true;
}

export function stopContinuousLearning(): void {
  isStopping = true;
  if (learningInterval) {
    clearInterval(learningInterval);
    learningInterval = null;
  }
  brainStats.isLearning = false;
  addActivity("⏸️ Sesi belajar dihentikan — semua progres tersimpan.", "info", null);
  saveBrainStats();
  logger.info("AI Continuous Learning dihentikan");
}

export function isLearningActive(): boolean {
  return learningInterval !== null && !isStopping;
}

export function getBrainStats(): AiBrainStats {
  return { ...brainStats, isLearning: isLearningActive() };
}

export function getMemoryBank(): AiBrainStats["memoryBank"] {
  return brainStats.memoryBank;
}

export function resetBrainStats(): void {
  stopContinuousLearning();
  brainStats = {
    ...DEFAULT_STATS,
    memoryBank: { bestSetups: [], worstSetups: [], dangerousConditions: [], learnedPatterns: [] },
    liveActivities: [],
    activityLog: [],
    evolutionHistory: [],
  };
  saveBrainStats();
  addActivity("🔄 AI Brain direset ke kondisi awal — memulai perjalanan belajar baru.", "info", null);
}

// ─── Manual Training (Input dari User) ────────────────────────────────────────

export interface ManualTrainResult {
  xpGained: number;
  conceptsFound: string[];
  categoriesHit: string[];
  skillsImproved: { skill: string; label: string }[];
  memorySaved: boolean;
  iqBefore: number;
  iqAfter: number;
  grade: "S" | "A" | "B" | "C" | "D";
  analysis: string;
  feedback: string;
}

// Kamus konsep trading (multi-bahasa: Indonesia + English)
const KEYWORD_SETS = {
  technical: {
    label: "Indikator Teknikal",
    skill: "patternRecognition" as keyof AiBrainStats,
    xpEach: 3,
    words: [
      "rsi","macd","ema","sma","bollinger","vwap","atr","fibonacci","fib",
      "stochastic","ichimoku","cci","adx","supertrend","parabolic sar",
      "moving average","rata-rata bergerak","divergence","divergensi",
      "overbought","oversold","jenuh beli","jenuh jual",
    ],
  },
  pattern: {
    label: "Pola Chart",
    skill: "candlePsychology" as keyof AiBrainStats,
    xpEach: 4,
    words: [
      "breakout","breakdown","reversal","doji","hammer","engulfing","shooting star",
      "morning star","evening star","marubozu","pinbar","pin bar","inside bar",
      "triangle","wedge","flag","pennant","head and shoulders","double top",
      "double bottom","cup and handle","ascending","descending","symmetrical",
      "channel","flag","pembalikan","pembalikan arah","pola candle",
      "liquidity sweep","fake breakout","fakeout","bull trap","bear trap",
      "order block","fair value gap","fvg","bos","choch","break of structure",
    ],
  },
  market_concept: {
    label: "Konsep Pasar",
    skill: "marketReading" as keyof AiBrainStats,
    xpEach: 3,
    words: [
      "support","resistance","trend","tren","momentum","volume","likuiditas",
      "liquidity","orderflow","order flow","smart money","institutional",
      "institusional","retail","manipulasi","manipulation","accumulation",
      "akumulasi","distribusi","distribution","konsolidasi","consolidation",
      "area of interest","poi","key level","level kunci","swing high","swing low",
      "higher high","lower low","higher low","lower high","market structure",
      "struktur pasar","imbalance","imbalans","demand zone","supply zone",
      "zona demand","zona supply",
    ],
  },
  risk: {
    label: "Manajemen Risiko",
    skill: "riskManagement" as keyof AiBrainStats,
    xpEach: 5,
    words: [
      "stop loss","sl","take profit","tp","risk reward","rr","risk management",
      "manajemen risiko","position size","ukuran posisi","leverage","drawdown",
      "max drawdown","cut loss","profit","kerugian","keuntungan","modal",
      "capital","1%","2%","risk per trade","trailing stop","partial close",
      "partial tp","be","breakeven","break even",
    ],
  },
  psychology: {
    label: "Psikologi Trading",
    skill: "emotionalDiscipline" as keyof AiBrainStats,
    xpEach: 4,
    words: [
      "fomo","fear","greed","takut","serakah","emosi","emotion","disiplin",
      "discipline","sabar","patience","overtrading","revenge trading","over leverage",
      "psikologi","psychology","mentalitas","mindset","journal","jurnal",
      "evaluasi","review","belajar dari kesalahan","mistake","kesalahan",
      "konfirmasi","confirmation","wait","tunggu","setup","sinyal","signal",
    ],
  },
  strategy: {
    label: "Strategi",
    skill: "adaptiveIntelligence" as keyof AiBrainStats,
    xpEach: 4,
    words: [
      "scalping","swing trading","position trading","day trading","intraday",
      "multi timeframe","mtf","confluence","konfluens","entry","exit","setup",
      "strategi","strategy","sistem","system","backtest","forward test",
      "rekap","recap","win rate","profit factor","sharpe","expectancy",
      "ekspektansi","edge","keunggulan","rule","aturan",
    ],
  },
};

function gradeFromXp(xp: number): ManualTrainResult["grade"] {
  if (xp >= 60) return "S";
  if (xp >= 40) return "A";
  if (xp >= 25) return "B";
  if (xp >= 12) return "C";
  return "D";
}

function feedbackFromGrade(grade: ManualTrainResult["grade"], categories: string[]): string {
  const catList = categories.join(", ");
  switch (grade) {
    case "S": return `Luar biasa! Input sangat kaya — mencakup ${catList}. AI mendapat banyak pengetahuan berharga dari kamu!`;
    case "A": return `Bagus sekali! Input berkualitas tinggi — menyentuh ${catList}. Teruskan berbagi insight seperti ini!`;
    case "B": return `Input baik — mencakup ${catList}. Tambahkan lebih banyak detail strategi atau manajemen risiko untuk nilai lebih tinggi.`;
    case "C": return `Input cukup — AI mempelajari konsep ${catList}. Coba tulis lebih detail dengan contoh konkret.`;
    default:  return `Input diterima. Coba tambahkan lebih banyak konsep teknikal, pola, atau insight strategi spesifik agar AI bisa belajar lebih banyak.`;
  }
}

export function manualTrain(rawText: string): ManualTrainResult {
  const text  = rawText.trim();
  const lower = text.toLowerCase();

  if (text.length < 10) {
    return {
      xpGained: 0, conceptsFound: [], categoriesHit: [], skillsImproved: [],
      memorySaved: false, iqBefore: brainStats.iq, iqAfter: brainStats.iq,
      grade: "D", analysis: "Teks terlalu pendek.",
      feedback: "Tuliskan minimal 1 kalimat berisi insight atau strategi trading yang ingin diajarkan ke AI.",
    };
  }

  const iqBefore = brainStats.iq;
  const allConcepts: string[] = [];
  const categoriesHit: string[] = [];
  const skillsImproved: { skill: string; label: string }[] = [];
  const skillBoostMap: Partial<Record<keyof AiBrainStats, number>> = {};

  let xpGained = 8; // base XP untuk setiap input

  // ── Scan tiap kategori ──
  for (const [, cat] of Object.entries(KEYWORD_SETS)) {
    const hits: string[] = [];
    for (const word of cat.words) {
      if (lower.includes(word) && !allConcepts.includes(word)) {
        hits.push(word);
        allConcepts.push(word);
      }
    }
    if (hits.length > 0) {
      const bonus = Math.min(hits.length, 5) * cat.xpEach; // max 5 hit per kategori
      xpGained += bonus;
      categoriesHit.push(cat.label);
      const sk = cat.skill as string;
      skillBoostMap[cat.skill] = (skillBoostMap[cat.skill] ?? 0) + 0.18 * hits.length;
      skillsImproved.push({ skill: sk, label: cat.label });
    }
  }

  // ── Bonus panjang teks ──
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  xpGained += Math.min(20, Math.floor(wordCount / 8));

  // ── Multi-kategori bonus ──
  if (categoriesHit.length >= 4) xpGained += 15;
  else if (categoriesHit.length >= 3) xpGained += 8;
  else if (categoriesHit.length >= 2) xpGained += 4;

  // ── Cap XP ──
  xpGained = Math.min(100, xpGained);

  const grade = gradeFromXp(xpGained);

  // ── Terapkan ke brain stats ──
  brainStats.experiencePoints += xpGained;
  brainStats.learningCycles   += 1;
  brainStats.lastLearningAt    = Date.now();

  for (const [skill, boost] of Object.entries(skillBoostMap)) {
    const key = skill as keyof AiBrainStats;
    if (typeof brainStats[key] === "number") {
      (brainStats as Record<string, number>)[key] = nudgeSkill(
        (brainStats as Record<string, number>)[key],
        Math.min(boost, 0.6)
      );
    }
  }

  // ── Selalu naikkan sedikit skill umum ──
  brainStats.adaptiveIntelligence = nudgeSkill(brainStats.adaptiveIntelligence, 0.12);
  brainStats.marketReading        = nudgeSkill(brainStats.marketReading, 0.08);

  brainStats.level = computeLevel(brainStats.experiencePoints);
  brainStats.iq    = computeIq(brainStats);

  // ── Simpan ke memori ──
  const title = text.length > 60 ? text.slice(0, 57) + "..." : text;
  const tags  = [
    "manual-training",
    ...categoriesHit.slice(0, 3),
    ...(allConcepts.slice(0, 4)),
  ];

  addMemory(
    {
      symbol: "MANUAL",
      interval: "–",
      type: "manual",
      title: `[Manual] ${title}`,
      description: `Input dari pengguna — ${wordCount} kata, ${allConcepts.length} konsep ditemukan (${categoriesHit.join(", ") || "umum"})`,
      tags,
      xpValue: xpGained,
    },
    "learnedPatterns"
  );

  const feedback = feedbackFromGrade(grade, categoriesHit);
  const analysis = allConcepts.length > 0
    ? `Konsep ditemukan: ${allConcepts.slice(0, 12).join(", ")}${allConcepts.length > 12 ? " ..." : ""}`
    : "Tidak ada konsep teknikal spesifik yang terdeteksi.";

  addActivity(
    `📖 Manual training diterima — ${allConcepts.length} konsep, +${xpGained} XP | "${title}"`,
    "success",
    null,
    xpGained
  );

  saveBrainStats();

  return {
    xpGained,
    conceptsFound: allConcepts.slice(0, 20),
    categoriesHit,
    skillsImproved,
    memorySaved: true,
    iqBefore,
    iqAfter: brainStats.iq,
    grade,
    analysis,
    feedback,
  };
}

// ─── Simpan Jawaban Groq ke Memori AI ────────────────────────────────────────

export function saveGroqAnswer(opts: {
  title: string;
  category: string;
  skill: string;
  fullAnswer: string;
  xpGained: number;
}): void {
  const { title, category, skill, fullAnswer, xpGained } = opts;

  addMemory(
    {
      symbol: "GROQ",
      interval: "–",
      type: "groq",
      title: `[Groq] ${title.length > 80 ? title.slice(0, 77) + "..." : title}`,
      description: `Kategori: ${category} | Skill: ${skill} | ${fullAnswer.length} karakter`,
      content: fullAnswer,
      tags: ["groq-learning", category.toLowerCase(), skill, "pengetahuan-ai"],
      xpValue: xpGained,
      source: "Groq Cloud / llama-3.3-70b-versatile",
    },
    "learnedPatterns"
  );

  saveBrainStats();
}

// ─── Auto-start ───────────────────────────────────────────────────────────────
setTimeout(() => { startContinuousLearning(); }, 5_000);
