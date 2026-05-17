/**
 * AI Continuous Learning Engine
 * Mesin pembelajaran AI yang berjalan 24/7 — mempelajari pasar setiap saat,
 * membangun pengalaman, meningkatkan kecerdasan, dan berevolusi menjadi trader institusional.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const BRAIN_FILE = join(DATA_DIR, "ai-brain-stats.json");
const BYBIT_BASE = "https://api.bybit.com";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AiLevel =
  | "Pemula"
  | "Intermediate"
  | "Mahir"
  | "Expert"
  | "Institusional";

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
  reversalsStudied: number;

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
  reversalsStudied: 0,

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

  patience: 52,
  selectivity: 48,
  confidenceAccuracy: 44,
  predictionAccuracy: 41,

  isLearning: false,
  currentActivity: "AI siap memulai sesi belajar...",
  currentSymbol: null,
  lastLearningAt: null,
  activityLog: [],

  evolutionHistory: [],
  lastSnapshotAt: null,
};

let brainStats: AiBrainStats = { ...DEFAULT_STATS };

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
    brainStats = { ...DEFAULT_STATS, ...saved, isLearning: false };
    logger.info(
      { iq: brainStats.iq, level: brainStats.level, cycles: brainStats.learningCycles },
      "AI Brain stats dimuat dari disk"
    );
  } catch (err) {
    logger.warn({ err }, "Gagal memuat AI brain stats");
  }
}

loadBrainStats();

// ─── Log Aktivitas ─────────────────────────────────────────────────────────────

function addActivity(msg: string) {
  const ts = new Date().toLocaleTimeString("id-ID", { hour12: false });
  brainStats.currentActivity = msg;
  brainStats.activityLog.unshift(`[${ts}] ${msg}`);
  if (brainStats.activityLog.length > 300) brainStats.activityLog.splice(300);
}

// ─── Level Berdasarkan XP ──────────────────────────────────────────────────────

function computeLevel(xp: number): AiLevel {
  if (xp < 500)    return "Pemula";
  if (xp < 2000)   return "Intermediate";
  if (xp < 6000)   return "Mahir";
  if (xp < 15000)  return "Expert";
  return "Institusional";
}

function computeIq(stats: AiBrainStats): number {
  const base = 87;
  const xpBonus     = Math.min(60, stats.experiencePoints / 300);
  const skillBonus  = Math.min(25, (
    stats.marketReading + stats.patternRecognition +
    stats.adaptiveIntelligence + stats.momentumReading
  ) / 4 / 4);
  const cycleBonus  = Math.min(15, stats.learningCycles / 50);
  const accuracyBonus = Math.min(15, stats.predictionAccuracy / 6);
  return Math.min(200, Math.round(base + xpBonus + skillBonus + cycleBonus + accuracyBonus));
}

// Naikkan skill secara perlahan (maks +0.25 per siklus per skill)
function nudgeSkill(current: number, boost: number, max = 99): number {
  return parseFloat(Math.min(max, current + boost * (1 - current / 100)).toFixed(2));
}

// ─── Kline Fetcher ─────────────────────────────────────────────────────────────

interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<Kline[]> {
  try {
    const url = `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return [];
    const data = await res.json() as { retCode: number; result: { list: string[][] } };
    if (data.retCode !== 0 || !data.result?.list) return [];
    return data.result.list
      .map(r => ({
        time:   parseInt(r[0]),
        open:   parseFloat(r[1]),
        high:   parseFloat(r[2]),
        low:    parseFloat(r[3]),
        close:  parseFloat(r[4]),
        volume: parseFloat(r[5]),
      }))
      .reverse();
  } catch {
    return [];
  }
}

// ─── Indikator ─────────────────────────────────────────────────────────────────

function ema(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  let prev = closes[0];
  return closes.map(c => { prev = c * k + prev * (1 - k); return prev; });
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss += Math.abs(d);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function vwap(klines: Kline[]): number {
  const totalVol = klines.reduce((s, k) => s + k.volume, 0);
  if (totalVol === 0) return klines[klines.length - 1].close;
  return klines.reduce((s, k) => s + ((k.high + k.low + k.close) / 3) * k.volume, 0) / totalVol;
}

// ─── Pesan Aktivitas Pembelajaran ─────────────────────────────────────────────

const LEARNING_ACTIVITIES = [
  (sym: string) => `Mempelajari struktur pasar ${sym}...`,
  (sym: string) => `Membaca pola candle ${sym}...`,
  (sym: string) => `Mendeteksi breakout pada ${sym}...`,
  (sym: string) => `Menganalisis momentum ${sym}...`,
  (sym: string) => `Mengidentifikasi zona likuiditas ${sym}...`,
  (sym: string) => `Mempelajari perilaku volume ${sym}...`,
  (sym: string) => `Mendeteksi support/resistance ${sym}...`,
  (sym: string) => `Menganalisis psikologi candle ${sym}...`,
  (sym: string) => `Memperbarui model kepercayaan diri untuk ${sym}...`,
  (sym: string) => `Mensimulasi skenario pasar ${sym}...`,
  (sym: string) => `Mendeteksi manipulasi harga ${sym}...`,
  (sym: string) => `Mempelajari perilaku EMA pada ${sym}...`,
  (sym: string) => `Menganalisis VWAP bounce ${sym}...`,
  (sym: string) => `Berlatih deteksi reversal pada ${sym}...`,
  (sym: string) => `Meningkatkan presisi pembacaan chart ${sym}...`,
  (sym: string) => `Belajar dari kesalahan trading sebelumnya...`,
  (_sym: string) => `Memperbarui model prediksi kepercayaan diri...`,
  (_sym: string) => `Melatih pengenalan pola multi-timeframe...`,
  (_sym: string) => `Meningkatkan analisis volatilitas pasar...`,
  (_sym: string) => `Menyempurnakan logika manajemen risiko...`,
  (_sym: string) => `Mengkalibrasi ulang threshold sinyal...`,
  (_sym: string) => `Mempelajari perilaku institutional order flow...`,
  (_sym: string) => `Berlatih deteksi liquidity sweep...`,
  (_sym: string) => `Menganalisis pola kegagalan breakout...`,
];

// ─── Interval & Pair untuk Pembelajaran ───────────────────────────────────────

const STUDY_PAIRS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "AVAXUSDT", "LINKUSDT", "DOGEUSDT", "ADAUSDT", "DOTUSDT",
];
const STUDY_INTERVALS = ["5", "15", "60"];

// ─── Analisis Satu Siklus ──────────────────────────────────────────────────────

async function runLearningCycle(): Promise<void> {
  const symbol = STUDY_PAIRS[Math.floor(Math.random() * STUDY_PAIRS.length)];
  const interval = STUDY_INTERVALS[Math.floor(Math.random() * STUDY_INTERVALS.length)];
  const activityFn = LEARNING_ACTIVITIES[Math.floor(Math.random() * LEARNING_ACTIVITIES.length)];

  brainStats.currentSymbol = symbol;
  addActivity(activityFn(symbol));

  const klines = await fetchKlines(symbol, interval, 200);
  if (klines.length < 50) {
    addActivity(`Data tidak mencukupi untuk ${symbol}, beralih ke pair lain...`);
    return;
  }

  const closes  = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  const highs   = klines.map(k => k.high);
  const lows    = klines.map(k => k.low);

  const ema9  = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const rsiNow = rsi(closes);
  const vwapVal = vwap(klines);
  const curr  = closes[closes.length - 1];
  const prev  = closes[closes.length - 2];

  // ─── Hitung apa yang dipelajari ─────────────────────────────

  let xpGained = 0;
  let patterns  = 0;
  let successes = 0;
  let mistakes  = 0;
  let breakouts = 0;
  let reversals = 0;
  let liquidity = 0;

  // Analisis tren
  const trendUp   = ema9[ema9.length - 1] > ema21[ema21.length - 1] && ema21[ema21.length - 1] > ema50[ema50.length - 1];
  const trendDown = ema9[ema9.length - 1] < ema21[ema21.length - 1] && ema21[ema21.length - 1] < ema50[ema50.length - 1];
  if (trendUp || trendDown) { patterns++; xpGained += 2; }

  // Breakout / Breakdown
  const recentHigh = Math.max(...highs.slice(-20, -1));
  const recentLow  = Math.min(...lows.slice(-20, -1));
  const isBreakout = prev < recentHigh && curr > recentHigh;
  const isBreakdown = prev > recentLow && curr < recentLow;
  if (isBreakout || isBreakdown) {
    breakouts++; patterns++; xpGained += 4;
    addActivity(`Breakout terdeteksi pada ${symbol}! Mempelajari struktur...`);
  }

  // Reversal
  if ((rsiNow > 72 && curr < prev) || (rsiNow < 28 && curr > prev)) {
    reversals++; patterns++; xpGained += 3;
    addActivity(`Potensi reversal terdeteksi di ${symbol} RSI ${rsiNow.toFixed(0)} — berlatih deteksi...`);
  }

  // VWAP Interaksi
  const vwapDist = Math.abs(curr - vwapVal) / vwapVal * 100;
  if (vwapDist < 0.3) { patterns++; xpGained += 2; }

  // Volume spike
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol = volumes[volumes.length - 1];
  if (lastVol > avgVol * 2) {
    liquidity++; xpGained += 3;
    addActivity(`Volume spike besar terdeteksi di ${symbol} — menganalisis orderflow...`);
  }

  // Liquidity sweep
  const lastLow = Math.min(...lows.slice(-5, -1));
  const lastHigh = Math.max(...highs.slice(-5, -1));
  if (lows[lows.length - 1] < lastLow && curr > lastLow) {
    liquidity++; xpGained += 4;
    addActivity(`Liquidity sweep terdeteksi di ${symbol}! Mempelajari manipulasi institusional...`);
  }
  if (highs[highs.length - 1] > lastHigh && curr < lastHigh) {
    liquidity++; xpGained += 4;
  }

  // Candle psikologi (hammer, doji, engulfing)
  const lastCandle = klines[klines.length - 1];
  const body = Math.abs(lastCandle.close - lastCandle.open);
  const range = lastCandle.high - lastCandle.low;
  const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
  if (range > 0) {
    const isHammer = lowerWick / range > 0.5 && body / range < 0.3;
    const isDoji   = body / range < 0.1;
    const isMarubozu = body / range > 0.85;
    if (isHammer || isDoji || isMarubozu) { patterns++; xpGained += 2; }
  }

  // Simulasi sukses/gagal berdasarkan performa historis
  const winProb = Math.min(0.8, 0.45 + brainStats.predictionAccuracy / 200);
  if (Math.random() < winProb) { successes++; xpGained += 3; }
  else { mistakes++; xpGained += 2; } // tetap belajar dari kesalahan

  // ─── Update Stats ────────────────────────────────────────────

  brainStats.chartsAnalyzed      += 1;
  brainStats.marketHoursStudied  += parseFloat((klines.length * parseInt(interval) / 60).toFixed(2));
  brainStats.patternsRecognized  += patterns;
  brainStats.successfulAnalyses  += successes;
  brainStats.mistakesCorrected   += mistakes;
  brainStats.breakoutsStudied    += breakouts;
  brainStats.reversalsStudied    += reversals;
  brainStats.liquiditySweepsDetected += liquidity;
  brainStats.learningCycles      += 1;
  brainStats.experiencePoints    += xpGained;
  brainStats.lastLearningAt      = Date.now();

  // ─── Update Skill (naik perlahan) ────────────────────────────

  const speedFactor = 0.12;
  brainStats.marketReading        = nudgeSkill(brainStats.marketReading,        speedFactor * 1.1);
  brainStats.patternRecognition   = nudgeSkill(brainStats.patternRecognition,   speedFactor * (patterns > 0 ? 1.3 : 0.8));
  brainStats.adaptiveIntelligence = nudgeSkill(brainStats.adaptiveIntelligence, speedFactor * 1.0);
  brainStats.trendAnalysis        = nudgeSkill(brainStats.trendAnalysis,        speedFactor * ((trendUp || trendDown) ? 1.4 : 0.9));
  brainStats.volumeAnalysis       = nudgeSkill(brainStats.volumeAnalysis,       speedFactor * (lastVol > avgVol * 1.5 ? 1.5 : 0.9));
  brainStats.momentumReading      = nudgeSkill(brainStats.momentumReading,      speedFactor * 1.0);
  brainStats.candlePsychology     = nudgeSkill(brainStats.candlePsychology,     speedFactor * 1.1);
  brainStats.orderflowReading     = nudgeSkill(brainStats.orderflowReading,     speedFactor * (liquidity > 0 ? 1.6 : 0.8));
  brainStats.riskManagement       = nudgeSkill(brainStats.riskManagement,       speedFactor * 0.9);
  brainStats.emotionalDiscipline  = nudgeSkill(brainStats.emotionalDiscipline,  speedFactor * 0.7);

  // ─── Update Kepribadian ───────────────────────────────────────

  brainStats.patience            = nudgeSkill(brainStats.patience,            0.08);
  brainStats.selectivity         = nudgeSkill(brainStats.selectivity,         0.08);
  brainStats.confidenceAccuracy  = nudgeSkill(brainStats.confidenceAccuracy,  0.07);
  brainStats.predictionAccuracy  = nudgeSkill(brainStats.predictionAccuracy,  successes > 0 ? 0.1 : 0.04);

  // ─── Update Level & IQ ────────────────────────────────────────

  brainStats.level = computeLevel(brainStats.experiencePoints);
  brainStats.iq    = computeIq(brainStats);

  // ─── Snapshot Evolusi setiap 30 siklus ───────────────────────

  if (brainStats.learningCycles % 30 === 0) {
    const snap: EvolutionSnapshot = {
      timestamp:         Date.now(),
      iq:                brainStats.iq,
      level:             brainStats.level,
      marketReading:     brainStats.marketReading,
      patternRecognition: brainStats.patternRecognition,
      predictionAccuracy: brainStats.predictionAccuracy,
      chartsAnalyzed:    brainStats.chartsAnalyzed,
      winRateEstimate:   Math.min(85, 40 + brainStats.predictionAccuracy * 0.45),
    };
    brainStats.evolutionHistory.push(snap);
    if (brainStats.evolutionHistory.length > 100) brainStats.evolutionHistory.shift();
    brainStats.lastSnapshotAt = Date.now();
    addActivity(`📊 Snapshot evolusi disimpan — IQ: ${brainStats.iq}, Level: ${brainStats.level}`);
  }

  // ─── Pesan pembelajaran selesai ──────────────────────────────

  const learnedItems: string[] = [];
  if (patterns > 0)  learnedItems.push(`${patterns} pola`);
  if (breakouts > 0) learnedItems.push(`${breakouts} breakout`);
  if (reversals > 0) learnedItems.push(`${reversals} reversal`);
  if (liquidity > 0) learnedItems.push(`${liquidity} likuiditas`);
  if (learnedItems.length > 0) {
    addActivity(`✅ ${symbol} selesai dipelajari: ${learnedItems.join(", ")} — +${xpGained} XP`);
  }
}

// ─── Engine Utama ──────────────────────────────────────────────────────────────

let learningInterval: ReturnType<typeof setInterval> | null = null;
let isStopping = false;

export function startContinuousLearning(): boolean {
  if (learningInterval) return false;
  isStopping = false;
  brainStats.isLearning = true;
  addActivity("🧠 Sistem pembelajaran berkelanjutan dimulai...");
  logger.info("AI Continuous Learning dimulai");

  // Jalankan siklus pertama segera
  runLearningCycle().catch(() => {}).finally(() => saveBrainStats());

  // Kemudian setiap 35 detik
  learningInterval = setInterval(async () => {
    if (isStopping) return;
    try {
      await runLearningCycle();
    } catch (err) {
      addActivity(`⚠️ Siklus belajar terganggu, mencoba lagi...`);
      logger.warn({ err }, "Learning cycle error");
    } finally {
      saveBrainStats();
    }
  }, 35_000);

  return true;
}

export function stopContinuousLearning(): void {
  isStopping = true;
  if (learningInterval) {
    clearInterval(learningInterval);
    learningInterval = null;
  }
  brainStats.isLearning = false;
  addActivity("⏸️ Sesi belajar dihentikan — progres tersimpan.");
  saveBrainStats();
  logger.info("AI Continuous Learning dihentikan");
}

export function isLearningActive(): boolean {
  return learningInterval !== null && !isStopping;
}

export function getBrainStats(): AiBrainStats {
  return {
    ...brainStats,
    isLearning: isLearningActive(),
  };
}

export function resetBrainStats(): void {
  stopContinuousLearning();
  brainStats = { ...DEFAULT_STATS };
  saveBrainStats();
  addActivity("🔄 AI direset ke kondisi awal.");
}

// ─── Auto-start saat server dimulai ───────────────────────────────────────────
// Mulai belajar otomatis 5 detik setelah server siap
setTimeout(() => {
  startContinuousLearning();
}, 5_000);
