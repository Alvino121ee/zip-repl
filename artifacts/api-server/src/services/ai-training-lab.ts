/**
 * AI Training Lab — Mesin Backtesting Adaptif
 *
 * Semua parameter strategi (threshold sinyal, TP/SL, hold bars, volume filter,
 * RSI level, cooldown) otomatis diturunkan dari skill AI yang sudah tumbuh.
 * Makin pintar AI → parameter makin presisi → hasil backtest makin baik.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import { getBrainStats } from "./ai-continuous-learning.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const LAB_FILE = join(DATA_DIR, "training-lab.json");
const BYBIT_BASE = "https://api.bybit.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StrategyName =
  | "scalp_5m"
  | "bos_choch"
  | "order_block"
  | "momentum"
  | "reversal"
  | "ema_crossover"
  | "vwap_bounce";

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  symbol: string;
  strategy: StrategyName;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
  result: "win" | "loss";
  exitReason: "tp" | "sl" | "timeout";
  holdBars: number;
  confidence: number;
}

export interface StrategyResult {
  strategy: StrategyName;
  strategyLabel: string;
  symbol: string;
  interval: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalReturnPct: number;
  avgHoldBars: number;
  bestTrade: number;
  worstTrade: number;
  avgConfidence: number;
  backtestAt: number;
}

export interface TrainingLabState {
  isRunning: boolean;
  progress: number;
  phase: string;
  currentSymbol: string | null;
  currentStrategy: string | null;
  results: StrategyResult[];
  allTrades: BacktestTrade[];
  lastRun: number | null;
  totalBarsAnalyzed: number;
  log: string[];
  bestStrategy: { name: string; label: string; winRate: number; sharpe: number; pf: number } | null;
  summary: {
    totalBacktested: number;
    bestWinRate: number;
    bestSharpe: number;
    bestProfitFactor: number;
    totalTrades: number;
  };
  // Konfigurasi adaptif yang dipakai AI untuk backtest terakhir
  aiConfig?: AiAdaptiveConfig;
}

// ─── AI Adaptive Config ───────────────────────────────────────────────────────
// Semua parameter strategi diturunkan dari skill AI secara real-time.

export interface AiAdaptiveConfig {
  // Berapa confidence minimum sebelum AI mau masuk trade
  // Makin tinggi patternRecognition → threshold turun (AI lebih percaya diri)
  confidenceThreshold: number;

  // TP dan SL dalam % — rasio RR naik seiring riskManagement tumbuh
  tpPct: number;
  slPct: number;

  // Berapa lama AI mau hold posisi sebelum timeout
  // Makin tinggi patience → hold lebih lama, beri trade waktu berkembang
  maxHoldBars: number;

  // Minimum volume multiplier vs rata-rata
  // Makin tinggi volumeAnalysis → AI bisa baca volume lebih rendah (lebih sensitif)
  volMultiplier: number;

  // RSI threshold — AI dengan marketReading tinggi bisa baca sinyal lebih awal
  rsiBullMin: number;   // batas bawah RSI untuk sinyal bullish (default 50)
  rsiBearMax: number;   // batas atas RSI untuk sinyal bearish (default 50)
  rsiOverbought: number; // level overbought untuk reversal (default 75)
  rsiOversold: number;   // level oversold untuk reversal (default 25)

  // Cooldown setelah trade — disiplin emosional mencegah overtrade
  cooldownEntry: number; // bar cooldown setelah entry signal
  cooldownExit: number;  // bar cooldown setelah exit

  // Bonus confidence khusus strategi SMC (order block, BOS)
  // Naik seiring smartMoneyConceptSkill
  smcBoost: number;

  // Momentum sensitivity — MACD histogram threshold
  // Makin tinggi momentumReading → lebih peka pada perubahan momentum kecil
  macdSensitivity: number;

  // Deskripsi singkat bagaimana AI mengkonfigurasi dirinya
  description: string;

  // Skill snapshot yang dipakai
  skills: {
    patternRecognition: number;
    riskManagement: number;
    patience: number;
    volumeAnalysis: number;
    marketReading: number;
    emotionalDiscipline: number;
    smartMoneyConceptSkill: number;
    momentumReading: number;
    adaptiveIntelligence: number;
    trendAnalysis: number;
  };
}

/**
 * Bangun konfigurasi backtest adaptif dari skill AI saat ini.
 * Setiap parameter dihitung berdasarkan formula yang mencerminkan
 * "cara berpikir" AI pada level skill-nya sekarang.
 */
function buildAiConfig(): AiAdaptiveConfig {
  const brain = getBrainStats();

  const pr  = Math.max(0, Math.min(100, brain.patternRecognition ?? 38));
  const rm  = Math.max(0, Math.min(100, brain.riskManagement ?? 50));
  const pat = Math.max(0, Math.min(100, brain.patience ?? 52));
  const va  = Math.max(0, Math.min(100, brain.volumeAnalysis ?? 35));
  const mr  = Math.max(0, Math.min(100, brain.marketReading ?? 42));
  const ed  = Math.max(0, Math.min(100, brain.emotionalDiscipline ?? 55));
  const smc = Math.max(0, Math.min(100, brain.smartMoneyConceptSkill ?? 22));
  const mom = Math.max(0, Math.min(100, brain.momentumReading ?? 38));
  const ai  = Math.max(0, Math.min(100, brain.adaptiveIntelligence ?? 45));
  const ta  = Math.max(0, Math.min(100, brain.trendAnalysis ?? 40));

  // patternRecognition 0→100 : threshold 72 → 52
  const confidenceThreshold = Math.round(72 - (pr / 100) * 20);

  // riskManagement 0→100 : TP 1.4% → 2.8%, SL 0.85% → 0.45%
  const tpPct = parseFloat((1.4 + (rm / 100) * 1.4).toFixed(2));
  const slPct = parseFloat((0.85 - (rm / 100) * 0.40).toFixed(2));

  // patience 0→100 : maxHoldBars 8 → 22
  const maxHoldBars = Math.round(8 + (pat / 100) * 14);

  // volumeAnalysis 0→100 : volMultiplier 1.6 → 1.05
  const volMultiplier = parseFloat((1.6 - (va / 100) * 0.55).toFixed(2));

  // marketReading 0→100 : RSI batas geser 0-7 poin
  const rsiShift = Math.round((mr / 100) * 7);
  const rsiBullMin    = 50 - rsiShift;
  const rsiBearMax    = 50 + rsiShift;
  const rsiOverbought = 75 - Math.round((mr / 100) * 4);  // 75 → 71
  const rsiOversold   = 25 + Math.round((mr / 100) * 4);  // 25 → 29

  // emotionalDiscipline 0→100 : cooldown entry 3→7 bars, exit 4→8 bars
  const cooldownEntry = Math.round(3 + (ed / 100) * 4);
  const cooldownExit  = Math.round(4 + (ed / 100) * 4);

  // smartMoneyConceptSkill 0→100 : smcBoost 0 → 14
  const smcBoost = Math.round((smc / 100) * 14);

  // momentumReading 0→100 : sensitivity 0 (tidak sensitif) → lebih presisi
  // Nilai kecil = lebih peka (butuh histogram lebih kecil untuk masuk)
  const macdSensitivity = parseFloat((0.0001 - (mom / 100) * 0.00008).toFixed(6));

  // Buat deskripsi level AI
  const iqLevel = brain.iq ?? 87;
  const levelName = brain.level ?? "Pemula";
  const description = [
    `IQ ${iqLevel} (${levelName})`,
    `Min.Confidence ${confidenceThreshold}%`,
    `TP ${tpPct}% / SL ${slPct}%`,
    `Hold maks ${maxHoldBars} bars`,
    `Vol filter ×${volMultiplier}`,
    ...(smcBoost > 0 ? [`SMC boost +${smcBoost}`] : []),
  ].join(" · ");

  return {
    confidenceThreshold,
    tpPct,
    slPct,
    maxHoldBars,
    volMultiplier,
    rsiBullMin,
    rsiBearMax,
    rsiOverbought,
    rsiOversold,
    cooldownEntry,
    cooldownExit,
    smcBoost,
    macdSensitivity,
    description,
    skills: { patternRecognition: pr, riskManagement: rm, patience: pat, volumeAnalysis: va, marketReading: mr, emotionalDiscipline: ed, smartMoneyConceptSkill: smc, momentumReading: mom, adaptiveIntelligence: ai, trendAnalysis: ta },
  };
}

/**
 * AI memilih strategi sendiri berdasarkan skill tertingginya.
 * Setiap strategi punya "affinitas" skill — AI akan memprioritaskan
 * strategi yang paling cocok dengan kemampuan yang sudah dimilikinya.
 */
function aiChooseStrategies(cfg: AiAdaptiveConfig): StrategyName[] {
  const s = cfg.skills;

  // Skor affinitas per strategi — makin tinggi = AI lebih kompeten di sini
  const scores: Record<StrategyName, number> = {
    scalp_5m:      (s.volumeAnalysis * 0.4 + s.momentumReading * 0.35 + s.patternRecognition * 0.25),
    bos_choch:     (s.smartMoneyConceptSkill * 0.45 + s.marketReading * 0.35 + s.patternRecognition * 0.20),
    order_block:   (s.smartMoneyConceptSkill * 0.50 + s.marketReading * 0.30 + s.patternRecognition * 0.20),
    momentum:      (s.momentumReading * 0.45 + s.trendAnalysis * 0.35 + s.marketReading * 0.20),
    reversal:      (s.patternRecognition * 0.40 + s.riskManagement * 0.35 + s.marketReading * 0.25),
    ema_crossover: (s.trendAnalysis * 0.50 + s.marketReading * 0.30 + s.momentumReading * 0.20),
    vwap_bounce:   (s.volumeAnalysis * 0.45 + s.marketReading * 0.35 + s.momentumReading * 0.20),
  };

  // Urutkan dari skor tertinggi
  const sorted = (Object.entries(scores) as [StrategyName, number][])
    .sort((a, b) => b[1] - a[1]);

  // Jumlah strategi yang dipilih bergantung pada adaptiveIntelligence AI
  // AI pemula hanya berani 2-3 strategi, AI advanced sampai semua 7
  const ai = s.adaptiveIntelligence;
  const count = ai < 30 ? 2 : ai < 50 ? 3 : ai < 65 ? 4 : ai < 80 ? 5 : ai < 90 ? 6 : 7;

  return sorted.slice(0, count).map(([name]) => name);
}

// ─── Strategy Labels ──────────────────────────────────────────────────────────

const STRATEGY_LABELS: Record<StrategyName, string> = {
  scalp_5m:      "Scalping 5M (EMA Cross)",
  bos_choch:     "Break of Structure / CHOCH",
  order_block:   "Order Block Bounce",
  momentum:      "Momentum (RSI + MACD)",
  reversal:      "Reversal di Level Ekstrem",
  ema_crossover: "EMA 9/21 Crossover",
  vwap_bounce:   "VWAP Bounce",
};

export const TRAINING_PAIRS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT",
];

export const TRAINING_STRATEGIES: StrategyName[] = [
  "scalp_5m", "bos_choch", "order_block", "momentum", "reversal", "ema_crossover", "vwap_bounce",
];

// ─── State ────────────────────────────────────────────────────────────────────

let labState: TrainingLabState = {
  isRunning: false,
  progress: 0,
  phase: "Standby",
  currentSymbol: null,
  currentStrategy: null,
  results: [],
  allTrades: [],
  lastRun: null,
  totalBarsAnalyzed: 0,
  log: [],
  bestStrategy: null,
  summary: { totalBacktested: 0, bestWinRate: 0, bestSharpe: 0, bestProfitFactor: 0, totalTrades: 0 },
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function saveLabState() {
  try {
    ensureDataDir();
    const toSave = { ...labState, isRunning: false };
    writeFileSync(LAB_FILE, JSON.stringify(toSave, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to save training lab state");
  }
}

function loadLabState() {
  try {
    ensureDataDir();
    if (!existsSync(LAB_FILE)) return;
    const saved = JSON.parse(readFileSync(LAB_FILE, "utf-8")) as Partial<TrainingLabState>;
    labState = { ...labState, ...saved, isRunning: false };
    logger.info({ results: labState.results.length }, "Training lab state loaded");
  } catch (err) {
    logger.warn({ err }, "Failed to load training lab state");
  }
}

loadLabState();

function addLog(msg: string) {
  const ts = new Date().toLocaleTimeString("id-ID", { hour12: false });
  labState.log.unshift(`[${ts}] ${msg}`);
  if (labState.log.length > 200) labState.log.splice(200);
}

// ─── Kline Fetcher ────────────────────────────────────────────────────────────

interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchKlines(symbol: string, interval: string, limit = 400): Promise<Kline[]> {
  try {
    const url = `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json() as { retCode: number; result: { list: string[][] } };
    if (data.retCode !== 0 || !data.result?.list) return [];
    return data.result.list
      .map(r => ({
        time: parseInt(r[0]),
        open: parseFloat(r[1]),
        high: parseFloat(r[2]),
        low: parseFloat(r[3]),
        close: parseFloat(r[4]),
        volume: parseFloat(r[5]),
      }))
      .reverse();
  } catch {
    return [];
  }
}

// ─── Indicator Calculators ────────────────────────────────────────────────────

function ema(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = closes[0];
  for (const c of closes) {
    prev = c * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function rsi(closes: number[], period = 14): number[] {
  const result: number[] = new Array(period).fill(50);
  let avgGain = 0; let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

function macd(closes: number[]): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

function volumeAvg(volumes: number[], period = 20): number[] {
  const result: number[] = [];
  for (let i = 0; i < volumes.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = volumes.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

// ─── Strategy Signal Generators (Semua pakai AiAdaptiveConfig) ───────────────

type SignalResult = { side: "long" | "short" | null; confidence: number; reason: string };

function strategyScalp5m(klines: Kline[], idx: number, cfg: AiAdaptiveConfig): SignalResult {
  if (idx < 30) return { side: null, confidence: 0, reason: "Insufficient data" };
  const closes  = klines.slice(0, idx + 1).map(k => k.close);
  const volumes = klines.slice(0, idx + 1).map(k => k.volume);
  const ema9    = ema(closes, 9);
  const ema21   = ema(closes, 21);
  const rsiVals = rsi(closes);
  const volAvgs = volumeAvg(volumes);
  const i = closes.length - 1;

  const e9 = ema9[i]; const e21 = ema21[i];
  const e9p = ema9[i - 1]; const e21p = ema21[i - 1];
  const rsiNow   = rsiVals[i];
  const volRatio = volumes[i] / (volAvgs[i] || 1);

  const goldenCross = e9p < e21p && e9 > e21;
  const deathCross  = e9p > e21p && e9 < e21;
  const volOk = volRatio > cfg.volMultiplier;  // ← adaptif: AI makin pintar, filter longgar

  if (goldenCross && rsiNow > cfg.rsiBullMin && rsiNow < 72 && volOk) {
    const conf = Math.min(95, 60 + (rsiNow - cfg.rsiBullMin) * 0.9 + Math.min(15, volRatio * 5));
    return { side: "long", confidence: Math.round(conf), reason: `Golden cross EMA 9/21, RSI ${rsiNow.toFixed(0)}, Vol ${volRatio.toFixed(1)}x (min ${cfg.volMultiplier}x)` };
  }
  if (deathCross && rsiNow < cfg.rsiBearMax && rsiNow > 28 && volOk) {
    const conf = Math.min(95, 60 + (cfg.rsiBearMax - rsiNow) * 0.9 + Math.min(15, volRatio * 5));
    return { side: "short", confidence: Math.round(conf), reason: `Death cross EMA 9/21, RSI ${rsiNow.toFixed(0)}, Vol ${volRatio.toFixed(1)}x` };
  }
  return { side: null, confidence: 0, reason: "No EMA crossover" };
}

function strategyBosChoch(klines: Kline[], idx: number, cfg: AiAdaptiveConfig): SignalResult {
  if (idx < 20) return { side: null, confidence: 0, reason: "Insufficient data" };
  const slice  = klines.slice(Math.max(0, idx - 20), idx + 1);
  const highs  = slice.map(k => k.high);
  const lows   = slice.map(k => k.low);
  const closes = slice.map(k => k.close);
  const i = slice.length - 1;

  const swingHigh = Math.max(...highs.slice(0, i));
  const swingLow  = Math.min(...lows.slice(0, i));
  const curr = closes[i]; const prev = closes[i - 1];
  const rsiVals = rsi(klines.slice(0, idx + 1).map(k => k.close));
  const rsiNow  = rsiVals[rsiVals.length - 1];

  if (prev < swingHigh && curr > swingHigh * 1.001 && rsiNow > cfg.rsiBullMin) {
    const base = 65 + cfg.smcBoost; // ← SMC skill meningkatkan keyakinan
    const conf = Math.min(92, base + Math.min(20, (curr - swingHigh) / swingHigh * 1000));
    return { side: "long", confidence: Math.round(conf), reason: `BOS Bullish break $${swingHigh.toFixed(4)} [SMC +${cfg.smcBoost}]` };
  }
  if (prev > swingLow && curr < swingLow * 0.999 && rsiNow < cfg.rsiBearMax) {
    const base = 65 + cfg.smcBoost;
    const conf = Math.min(92, base + Math.min(20, (swingLow - curr) / swingLow * 1000));
    return { side: "short", confidence: Math.round(conf), reason: `BOS Bearish break $${swingLow.toFixed(4)} [SMC +${cfg.smcBoost}]` };
  }
  return { side: null, confidence: 0, reason: "No structure break" };
}

function strategyOrderBlock(klines: Kline[], idx: number, cfg: AiAdaptiveConfig): SignalResult {
  if (idx < 15) return { side: null, confidence: 0, reason: "Insufficient data" };
  let demandBlock: { high: number; low: number } | null = null;
  let supplyBlock: { high: number; low: number } | null = null;

  for (let j = idx - 1; j >= Math.max(0, idx - 15); j--) {
    const k = klines[j];
    const body = Math.abs(k.close - k.open);
    const range = k.high - k.low;
    const bodyRatio = range > 0 ? body / range : 0;
    if (bodyRatio > 0.7 && k.close > k.open && !demandBlock) {
      demandBlock = { high: k.high, low: k.low };
    }
    if (bodyRatio > 0.7 && k.close < k.open && !supplyBlock) {
      supplyBlock = { high: k.high, low: k.low };
    }
    if (demandBlock && supplyBlock) break;
  }

  const curr = klines[idx].close;
  const rsiVals = rsi(klines.slice(0, idx + 1).map(k => k.close));
  const rsiNow  = rsiVals[rsiVals.length - 1];

  const baseConf = 72 + cfg.smcBoost; // ← SMC skill meningkatkan base confidence
  if (demandBlock && curr >= demandBlock.low && curr <= demandBlock.high && rsiNow < cfg.rsiBearMax) {
    return { side: "long", confidence: Math.min(93, baseConf), reason: `Demand OB $${demandBlock.low.toFixed(4)}–$${demandBlock.high.toFixed(4)} [SMC +${cfg.smcBoost}]` };
  }
  if (supplyBlock && curr >= supplyBlock.low && curr <= supplyBlock.high && rsiNow > cfg.rsiBullMin) {
    return { side: "short", confidence: Math.min(93, baseConf), reason: `Supply OB $${supplyBlock.low.toFixed(4)}–$${supplyBlock.high.toFixed(4)} [SMC +${cfg.smcBoost}]` };
  }
  return { side: null, confidence: 0, reason: "Price not in order block" };
}

function strategyMomentum(klines: Kline[], idx: number, cfg: AiAdaptiveConfig): SignalResult {
  if (idx < 35) return { side: null, confidence: 0, reason: "Insufficient data" };
  const closes = klines.slice(0, idx + 1).map(k => k.close);
  const rsiVals = rsi(closes);
  const { macdLine, signalLine, histogram } = macd(closes);
  const i = closes.length - 1;
  const rsiNow = rsiVals[i]; const rsiPrev = rsiVals[i - 1];
  const histNow = histogram[i]; const histPrev = histogram[i - 1];

  // cfg.macdSensitivity: AI momentumReading tinggi → bisa deteksi perubahan histogram lebih kecil
  const histThreshold = cfg.macdSensitivity;

  const rsiStrong    = rsiNow > cfg.rsiBullMin + 5 && rsiNow > rsiPrev;
  const macdBullish  = histNow > histThreshold && histNow > histPrev && macdLine[i] > signalLine[i];
  const rsiWeakening = rsiNow < cfg.rsiBearMax - 5 && rsiNow < rsiPrev;
  const macdBearish  = histNow < -histThreshold && histNow < histPrev && macdLine[i] < signalLine[i];

  if (rsiStrong && macdBullish) {
    const conf = Math.min(92, 65 + Math.min(22, (rsiNow - (cfg.rsiBullMin + 5)) * 1.5));
    return { side: "long", confidence: Math.round(conf), reason: `Momentum Bull: RSI ${rsiNow.toFixed(0)} (min ${cfg.rsiBullMin + 5}), MACD ${histNow.toFixed(5)}` };
  }
  if (rsiWeakening && macdBearish) {
    const conf = Math.min(92, 65 + Math.min(22, ((cfg.rsiBearMax - 5) - rsiNow) * 1.5));
    return { side: "short", confidence: Math.round(conf), reason: `Momentum Bear: RSI ${rsiNow.toFixed(0)}, MACD ${histNow.toFixed(5)}` };
  }
  return { side: null, confidence: 0, reason: "No momentum confluence" };
}

function strategyReversal(klines: Kline[], idx: number, cfg: AiAdaptiveConfig): SignalResult {
  if (idx < 20) return { side: null, confidence: 0, reason: "Insufficient data" };
  const closes  = klines.slice(0, idx + 1).map(k => k.close);
  const rsiVals = rsi(closes);
  const i = closes.length - 1;
  const rsiNow = rsiVals[i]; const rsiPrev = rsiVals[i - 1];

  // rsiOverbought/rsiOversold kini adaptif: AI marketReading tinggi deteksi lebih awal
  if (rsiPrev >= cfg.rsiOverbought && rsiNow < rsiPrev) {
    const conf = Math.min(90, 62 + (rsiPrev - rsiNow) * 3);
    return { side: "short", confidence: Math.round(conf), reason: `RSI reversal OB: ${rsiPrev.toFixed(0)}→${rsiNow.toFixed(0)} (threshold ${cfg.rsiOverbought})` };
  }
  if (rsiPrev <= cfg.rsiOversold && rsiNow > rsiPrev) {
    const conf = Math.min(90, 62 + (rsiNow - rsiPrev) * 3);
    return { side: "long", confidence: Math.round(conf), reason: `RSI reversal OS: ${rsiPrev.toFixed(0)}→${rsiNow.toFixed(0)} (threshold ${cfg.rsiOversold})` };
  }
  return { side: null, confidence: 0, reason: "No reversal signal" };
}

function strategyEmaCrossover(klines: Kline[], idx: number, cfg: AiAdaptiveConfig): SignalResult {
  if (idx < 50) return { side: null, confidence: 0, reason: "Insufficient data" };
  const closes = klines.slice(0, idx + 1).map(k => k.close);
  const ema20  = ema(closes, 20);
  const ema50  = ema(closes, 50);
  const i = closes.length - 1;
  const e20 = ema20[i]; const e50 = ema50[i];
  const e20p = ema20[i - 1]; const e50p = ema50[i - 1];
  const rsiVals = rsi(closes);

  if (e20p < e50p && e20 > e50 && rsiVals[i] > cfg.rsiBullMin) {
    const conf = Math.min(88, 68 + Math.round((rsiVals[i] - cfg.rsiBullMin) * 0.5));
    return { side: "long", confidence: conf, reason: `EMA 20 cross EMA 50, RSI ${rsiVals[i].toFixed(0)} > ${cfg.rsiBullMin}` };
  }
  if (e20p > e50p && e20 < e50 && rsiVals[i] < cfg.rsiBearMax) {
    const conf = Math.min(88, 68 + Math.round((cfg.rsiBearMax - rsiVals[i]) * 0.5));
    return { side: "short", confidence: conf, reason: `EMA 20 cross EMA 50, RSI ${rsiVals[i].toFixed(0)} < ${cfg.rsiBearMax}` };
  }
  return { side: null, confidence: 0, reason: "No EMA 20/50 cross" };
}

function strategyVwapBounce(klines: Kline[], idx: number, cfg: AiAdaptiveConfig): SignalResult {
  if (idx < 10) return { side: null, confidence: 0, reason: "Insufficient data" };
  const slice      = klines.slice(Math.max(0, idx - 100), idx + 1);
  const totalVol   = slice.reduce((s, k) => s + k.volume, 0);
  const vwap       = totalVol > 0
    ? slice.reduce((s, k) => s + ((k.high + k.low + k.close) / 3) * k.volume, 0) / totalVol
    : slice[slice.length - 1].close;

  const curr = klines[idx].close; const prev = klines[idx - 1].close;
  const rsiVals = rsi(klines.slice(0, idx + 1).map(k => k.close));
  const rsiNow  = rsiVals[rsiVals.length - 1];
  const distPct = Math.abs(curr - vwap) / vwap * 100;

  // AI dengan volumeAnalysis tinggi bisa baca bounce lebih jauh dari VWAP
  const distThreshold = 0.4 + (cfg.skills.volumeAnalysis / 100) * 0.4; // 0.4% → 0.8%

  if (prev < vwap && curr > vwap && rsiNow > cfg.rsiBullMin - 2 && distPct < distThreshold) {
    return { side: "long", confidence: 76 + Math.round(cfg.skills.volumeAnalysis / 10), reason: `VWAP bounce ↑ $${vwap.toFixed(4)}, dist ${distPct.toFixed(2)}%` };
  }
  if (prev > vwap && curr < vwap && rsiNow < cfg.rsiBearMax + 2 && distPct < distThreshold) {
    return { side: "short", confidence: 76 + Math.round(cfg.skills.volumeAnalysis / 10), reason: `VWAP bounce ↓ $${vwap.toFixed(4)}, dist ${distPct.toFixed(2)}%` };
  }
  return { side: null, confidence: 0, reason: "No VWAP interaction" };
}

function getSignal(strategy: StrategyName, klines: Kline[], idx: number, cfg: AiAdaptiveConfig): SignalResult {
  switch (strategy) {
    case "scalp_5m":      return strategyScalp5m(klines, idx, cfg);
    case "bos_choch":     return strategyBosChoch(klines, idx, cfg);
    case "order_block":   return strategyOrderBlock(klines, idx, cfg);
    case "momentum":      return strategyMomentum(klines, idx, cfg);
    case "reversal":      return strategyReversal(klines, idx, cfg);
    case "ema_crossover": return strategyEmaCrossover(klines, idx, cfg);
    case "vwap_bounce":   return strategyVwapBounce(klines, idx, cfg);
  }
}

// ─── Performance Calculations ─────────────────────────────────────────────────

function calcSharpeRatio(returns: number[]): number {
  if (returns.length < 3) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return parseFloat(((mean / std) * Math.sqrt(4320)).toFixed(2));
}

function calcMaxDrawdown(returns: number[]): number {
  let peak = 0; let equity = 0; let maxDD = 0;
  for (const r of returns) {
    equity += r;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }
  return parseFloat(maxDD.toFixed(2));
}

function calcProfitFactor(trades: BacktestTrade[]): number {
  const grossWin  = trades.filter(t => t.result === "win").reduce((s, t) => s + t.pnlPct, 0);
  const grossLoss = Math.abs(trades.filter(t => t.result === "loss").reduce((s, t) => s + t.pnlPct, 0));
  if (grossLoss === 0) return grossWin > 0 ? 999 : 0;
  return parseFloat((grossWin / grossLoss).toFixed(2));
}

// ─── Backtest Runner (sekarang memakai AiAdaptiveConfig) ─────────────────────

async function backtestStrategy(
  symbol: string,
  strategy: StrategyName,
  cfg: AiAdaptiveConfig,
  interval = "5",
): Promise<{ result: StrategyResult; trades: BacktestTrade[] }> {
  const klines = await fetchKlines(symbol, interval, 400); // 400 candles (lebih banyak data)
  if (klines.length < 50) {
    return {
      result: {
        strategy, strategyLabel: STRATEGY_LABELS[strategy], symbol, interval,
        totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0,
        sharpeRatio: 0, maxDrawdown: 0, totalReturnPct: 0, avgHoldBars: 0,
        bestTrade: 0, worstTrade: 0, avgConfidence: 0, backtestAt: Date.now(),
      },
      trades: [],
    };
  }

  const trades: BacktestTrade[] = [];

  // Semua parameter dari AI — bukan hardcoded lagi!
  const TP_PCT        = cfg.tpPct;
  const SL_PCT        = cfg.slPct;
  const MAX_HOLD_BARS = cfg.maxHoldBars;
  const MIN_CONF      = cfg.confidenceThreshold;

  let inTrade = false;
  let tradeEntry = 0;
  let tradeSide: "long" | "short" = "long";
  let tradeEntryIdx = 0;
  let tradeConf = 0;
  let cooldownBars = 0;

  for (let i = 50; i < klines.length; i++) {
    if (cooldownBars > 0) { cooldownBars--; continue; }

    if (!inTrade) {
      const signal = getSignal(strategy, klines, i, cfg);
      if (signal.side && signal.confidence >= MIN_CONF) {  // ← pakai AI threshold
        inTrade = true;
        tradeEntry = klines[i].close;
        tradeSide  = signal.side;
        tradeEntryIdx = i;
        tradeConf  = signal.confidence;
        cooldownBars = cfg.cooldownEntry; // ← cooldown dari AI emotional discipline
      }
    } else {
      const curr    = klines[i].close;
      const pnlPct  = tradeSide === "long"
        ? (curr - tradeEntry) / tradeEntry * 100
        : (tradeEntry - curr) / tradeEntry * 100;
      const holdBars = i - tradeEntryIdx;

      let exitReason: "tp" | "sl" | "timeout" | null = null;
      let exitPrice = curr;

      if (pnlPct >= TP_PCT) {
        exitReason = "tp";
        exitPrice  = tradeSide === "long" ? tradeEntry * (1 + TP_PCT / 100) : tradeEntry * (1 - TP_PCT / 100);
      } else if (pnlPct <= -SL_PCT) {
        exitReason = "sl";
        exitPrice  = tradeSide === "long" ? tradeEntry * (1 - SL_PCT / 100) : tradeEntry * (1 + SL_PCT / 100);
      } else if (holdBars >= MAX_HOLD_BARS) {
        exitReason = "timeout";
      }

      if (exitReason) {
        const finalPnl = tradeSide === "long"
          ? (exitPrice - tradeEntry) / tradeEntry * 100
          : (tradeEntry - exitPrice) / tradeEntry * 100;

        trades.push({
          entryTime: klines[tradeEntryIdx].time,
          exitTime:  klines[i].time,
          symbol, strategy,
          side: tradeSide,
          entryPrice: tradeEntry,
          exitPrice,
          pnlPct:     parseFloat(finalPnl.toFixed(4)),
          result:     finalPnl > 0 ? "win" : "loss",
          exitReason,
          holdBars,
          confidence: tradeConf,
        });

        inTrade = false;
        cooldownBars = cfg.cooldownExit; // ← cooldown exit dari AI
      }
    }
  }

  const returns = trades.map(t => t.pnlPct);
  const wins    = trades.filter(t => t.result === "win").length;
  const pf      = calcProfitFactor(trades);

  const result: StrategyResult = {
    strategy,
    strategyLabel: STRATEGY_LABELS[strategy],
    symbol, interval,
    totalTrades:   trades.length,
    wins,
    losses:        trades.length - wins,
    winRate:       trades.length > 0 ? parseFloat(((wins / trades.length) * 100).toFixed(1)) : 0,
    profitFactor:  pf,
    sharpeRatio:   calcSharpeRatio(returns),
    maxDrawdown:   calcMaxDrawdown(returns),
    totalReturnPct: parseFloat(returns.reduce((a, b) => a + b, 0).toFixed(2)),
    avgHoldBars:   trades.length > 0 ? Math.round(trades.reduce((s, t) => s + t.holdBars, 0) / trades.length) : 0,
    bestTrade:     trades.length > 0 ? parseFloat(Math.max(...returns).toFixed(2)) : 0,
    worstTrade:    trades.length > 0 ? parseFloat(Math.min(...returns).toFixed(2)) : 0,
    avgConfidence: trades.length > 0 ? Math.round(trades.reduce((s, t) => s + t.confidence, 0) / trades.length) : 0,
    backtestAt:    Date.now(),
  };

  return { result, trades };
}

// ─── Training Lab Engine ──────────────────────────────────────────────────────

let labTimer: ReturnType<typeof setTimeout> | null = null;

export async function runTrainingLab(options?: {
  pairs?: string[];
  strategies?: StrategyName[];
  aiAuto?: boolean; // true = biarkan AI pilih strategi sendiri
}): Promise<void> {
  if (labState.isRunning) return;

  // ── 1. Bangun konfigurasi adaptif dari skill AI ──
  const cfg = buildAiConfig();
  const brain = getBrainStats();

  addLog(`━━ AI Config aktif: ${cfg.description} ━━`);
  addLog(`💡 Threshold sinyal: min ${cfg.confidenceThreshold}% | TP ${cfg.tpPct}% / SL ${cfg.slPct}% | Hold ≤${cfg.maxHoldBars} bars`);
  addLog(`📊 Volume filter: ×${cfg.volMultiplier} | RSI bull>${cfg.rsiBullMin} bear<${cfg.rsiBearMax} | Cooldown ${cfg.cooldownEntry}/${cfg.cooldownExit} bars`);

  // ── 2. Tentukan strategi — AI pilih sendiri atau pakai pilihan user ──
  let strategies: StrategyName[];
  const userAiAuto = options?.aiAuto ?? !options?.strategies;

  if (userAiAuto || !options?.strategies) {
    // AI memilih berdasarkan skill affinitas
    strategies = aiChooseStrategies(cfg);
    addLog(`🧠 AI memilih ${strategies.length} strategi otomatis berdasarkan skill: ${strategies.map(s => STRATEGY_LABELS[s]).join(", ")}`);
  } else {
    strategies = options.strategies;
    addLog(`👤 Strategi dipilih manual: ${strategies.map(s => STRATEGY_LABELS[s]).join(", ")}`);
  }

  const pairs = options?.pairs ?? TRAINING_PAIRS.slice(0, 5);
  const total = pairs.length * strategies.length;
  let done = 0;

  labState = {
    ...labState,
    isRunning: true,
    progress: 0,
    phase: `AI IQ ${brain.iq} (${brain.level}) — menyiapkan backtest...`,
    currentSymbol: null,
    currentStrategy: null,
    results: [],
    allTrades: [],
    log: labState.log,
    aiConfig: cfg, // simpan config yang dipakai
  };

  addLog(`🚀 Backtest mulai — ${pairs.length} pair × ${strategies.length} strategi = ${total} kombinasi`);

  try {
    for (const symbol of pairs) {
      for (const strategy of strategies) {
        labState.currentSymbol    = symbol;
        labState.currentStrategy  = STRATEGY_LABELS[strategy];
        labState.phase = `[IQ ${brain.iq}] Backtesting ${strategy} pada ${symbol}...`;

        const { result, trades } = await backtestStrategy(symbol, strategy, cfg);
        labState.results.push(result);
        labState.allTrades.push(...trades);
        labState.totalBarsAnalyzed += 400;
        done++;
        labState.progress = Math.round((done / total) * 100);

        if (result.totalTrades > 0) {
          addLog(`${symbol} [${STRATEGY_LABELS[strategy]}]: ${result.totalTrades} trade, WR ${result.winRate}%, PF ${result.profitFactor}, Sharpe ${result.sharpeRatio}`);
        } else {
          addLog(`${symbol} [${STRATEGY_LABELS[strategy]}]: tidak ada sinyal (threshold terlalu tinggi? ${cfg.confidenceThreshold}%)`);
        }

        await new Promise(r => setTimeout(r, 250));
      }
    }

    // ── 3. Rangkuman & perbandingan ──
    const allResults = labState.results.filter(r => r.totalTrades >= 2);
    if (allResults.length > 0) {
      const bestByWR    = allResults.reduce((b, r) => r.winRate > b.winRate ? r : b);
      const bestSharpe  = allResults.reduce((b, r) => r.sharpeRatio > b.sharpeRatio ? r : b);
      const bestPF      = allResults.reduce((b, r) => r.profitFactor > b.profitFactor ? r : b);

      labState.bestStrategy = {
        name:    bestByWR.strategy,
        label:   bestByWR.strategyLabel,
        winRate: bestByWR.winRate,
        sharpe:  bestSharpe.sharpeRatio,
        pf:      bestPF.profitFactor,
      };
      labState.summary = {
        totalBacktested:  done,
        bestWinRate:      bestByWR.winRate,
        bestSharpe:       bestSharpe.sharpeRatio,
        bestProfitFactor: bestPF.profitFactor,
        totalTrades:      labState.allTrades.length,
      };

      addLog(`✅ Selesai! Terbaik: ${bestByWR.strategyLabel} WR ${bestByWR.winRate}% | Sharpe: ${bestSharpe.strategyLabel} (${bestSharpe.sharpeRatio}) | PF: ${bestPF.strategyLabel} (${bestPF.profitFactor})`);
      addLog(`📈 Config AI ini cocok untuk: min confidence ${cfg.confidenceThreshold}%, RR ${(cfg.tpPct / cfg.slPct).toFixed(1)}:1`);
    } else {
      addLog("⚠️ Tidak ada hasil dengan ≥2 trade. Coba turunkan threshold atau AI perlu lebih banyak belajar.");
    }

  } catch (err) {
    addLog(`Error: ${String(err).slice(0, 100)}`);
    logger.error({ err }, "Training lab error");
  } finally {
    labState.isRunning  = false;
    labState.progress   = 100;
    labState.phase      = `Selesai — AI IQ ${brain.iq} (${brain.level})`;
    labState.currentSymbol   = null;
    labState.currentStrategy = null;
    labState.lastRun = Date.now();
    saveLabState();
  }
}

export function stopTrainingLab(): void {
  if (labTimer) { clearTimeout(labTimer); labTimer = null; }
  labState.isRunning = false;
  labState.phase = "Dihentikan manual";
  addLog("Training dihentikan oleh user");
}

export function getTrainingLabState(): TrainingLabState {
  return { ...labState };
}

export function getTrainingLabResults(): StrategyResult[] {
  return [...labState.results];
}

export function getStrategyComparison(): Record<StrategyName, { winRate: number; sharpe: number; pf: number; trades: number }> {
  const comparison: Partial<Record<StrategyName, { winRate: number; sharpe: number; pf: number; trades: number }>> = {};
  for (const s of TRAINING_STRATEGIES) {
    const stratResults = labState.results.filter(r => r.strategy === s && r.totalTrades >= 2);
    if (stratResults.length === 0) continue;
    const avgWR    = stratResults.reduce((s, r) => s + r.winRate, 0) / stratResults.length;
    const avgSharpe = stratResults.reduce((s, r) => s + r.sharpeRatio, 0) / stratResults.length;
    const avgPF    = stratResults.reduce((s, r) => s + r.profitFactor, 0) / stratResults.length;
    const totalTrades = stratResults.reduce((s, r) => s + r.totalTrades, 0);
    comparison[s] = {
      winRate: parseFloat(avgWR.toFixed(1)),
      sharpe:  parseFloat(avgSharpe.toFixed(2)),
      pf:      parseFloat(avgPF.toFixed(2)),
      trades:  totalTrades,
    };
  }
  return comparison as Record<StrategyName, { winRate: number; sharpe: number; pf: number; trades: number }>;
}

// Ekspor config AI saat ini (untuk ditampilkan di frontend)
export function getCurrentAiConfig(): AiAdaptiveConfig {
  return buildAiConfig();
}
