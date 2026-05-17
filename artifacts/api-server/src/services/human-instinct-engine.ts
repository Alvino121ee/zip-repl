/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║          HUMAN INSTINCT & ADAPTIVE EXIT INTELLIGENCE ENGINE             ║
 * ║                                                                          ║
 * ║  AI berperilaku seperti trader profesional berpengalaman:               ║
 * ║  - Mendeteksi peluruhan momentum secara real-time                       ║
 * ║  - Melindungi profit secara cerdas                                       ║
 * ║  - Mencegah keserakahan                                                 ║
 * ║  - Menyesuaikan target secara adaptif                                   ║
 * ║  - Belajar dari setiap keputusan exit                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const INSTINCT_FILE = join(DATA_DIR, "human-instinct.json");
const BYBIT_BASE = "https://api.bybit.com";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Kline {
  time: number;
  open: number;
  high: number;
  close: number;
  low: number;
  volume: number;
}

export type InstinctAction =
  | "hold"
  | "tighten_trail"
  | "early_exit"
  | "extend_target"
  | "scale_out";

export interface MomentumDecayResult {
  /** 0-100: semakin rendah = momentum semakin lemah */
  score: number;
  /** sinyal pelemahan yang terdeteksi */
  decaySignals: string[];
  /** perlu tindakan segera */
  isCritical: boolean;
  /** momentum secara keseluruhan masih kuat? */
  isStrong: boolean;
  /** detail diagnostik */
  volumeDecayPct: number;
  candleExhaustionScore: number;
  rejectionStrength: number;
}

export interface ContinuationAnalysis {
  /** 0-100: probabilitas trade berlanjut menguntungkan */
  probability: number;
  /** risk/reward saat ini jika terus ditahan */
  riskRewardNow: number;
  /** trade masih worth holding? */
  shouldHold: boolean;
  /** alasan keputusan dalam bahasa Indonesia */
  reason: string;
}

export interface GreedAnalysis {
  /** 0-100: semakin tinggi = semakin serakah mempertahankan posisi */
  index: number;
  /** USD yang terancam jika reversal */
  profitAtRisk: number;
  /** USD profit yang bisa dikunci sekarang */
  securableProfit: number;
  /** menahan terlalu lama? */
  isOverstaying: boolean;
  reason: string;
}

export interface HumanInstinctDecision {
  action: InstinctAction;
  /** 0-100: seberapa mendesak tindakan */
  urgency: number;
  /** penjelasan dalam bahasa Indonesia */
  reason: string;
  /** apakah harus exit lebih awal dari TP */
  shouldExitEarly: boolean;
  /** SL baru yang direkomendasikan jika mengetatkan */
  suggestedSL?: number;
  /** TP baru yang diperluas jika momentum sangat kuat */
  suggestedTP?: number;
  /** skor diagnostik */
  momentumScore: number;
  continuationProb: number;
  greedIndex: number;
  decaySignals: string[];
  evalAt: number;
}

export interface InstinctRecord {
  id: string;
  tradeId: string;
  symbol: string;
  side: "Buy" | "Sell";
  action: InstinctAction;
  reason: string;
  profitPctAtDecision: number;
  momentumScore: number;
  continuationProb: number;
  greedIndex: number;
  decaySignals: string[];
  timestamp: number;
  /** diisi setelah trade ditutup */
  outcome?: "correct_early_exit" | "premature_exit" | "held_correctly" | "should_have_exited";
  finalProfitPct?: number;
  profitDelta?: number; // final - at-decision
}

export interface InstinctMemory {
  totalDecisions: number;
  correctEarlyExits: number;
  prematureExits: number;
  heldCorrectly: number;
  shouldHaveExited: number;
  avgMomentumAtEarlyExit: number;
  avgContinuationProbAtExit: number;
  /** threshold yang dinamis berdasarkan pembelajaran */
  momentumExitThreshold: number;     // default 35
  continuationExitThreshold: number; // default 40
  greedExitThreshold: number;        // default 65
  records: InstinctRecord[];
  lastUpdated: number;
}

// ─── Persistence ────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

let instinctMemory: InstinctMemory = {
  totalDecisions: 0,
  correctEarlyExits: 0,
  prematureExits: 0,
  heldCorrectly: 0,
  shouldHaveExited: 0,
  avgMomentumAtEarlyExit: 0,
  avgContinuationProbAtExit: 0,
  momentumExitThreshold: 35,
  continuationExitThreshold: 40,
  greedExitThreshold: 65,
  records: [],
  lastUpdated: Date.now(),
};

(function loadInstinctMemory() {
  try {
    ensureDataDir();
    if (!existsSync(INSTINCT_FILE)) return;
    const saved = JSON.parse(readFileSync(INSTINCT_FILE, "utf-8")) as Partial<InstinctMemory>;
    instinctMemory = {
      ...instinctMemory,
      ...saved,
      records: saved.records ?? [],
    };
    logger.info({
      decisions: instinctMemory.totalDecisions,
      correct: instinctMemory.correctEarlyExits,
      premature: instinctMemory.prematureExits,
    }, "Human Instinct Engine: memori dimuat");
  } catch (err) {
    logger.warn({ err }, "Human Instinct Engine: gagal memuat memori");
  }
})();

function saveInstinctMemory() {
  try {
    ensureDataDir();
    // Simpan maksimal 300 record terakhir
    if (instinctMemory.records.length > 300) {
      instinctMemory.records.splice(300);
    }
    writeFileSync(INSTINCT_FILE, JSON.stringify(instinctMemory, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Human Instinct Engine: gagal menyimpan memori");
  }
}

export function getInstinctMemory(): InstinctMemory {
  return { ...instinctMemory, records: [...instinctMemory.records] };
}

// ─── Bybit Kline Fetcher ────────────────────────────────────────────────────

const klineCache = new Map<string, { data: Kline[]; at: number }>();
const KLINE_CACHE_TTL = 12_000; // 12 detik

async function fetchRecentKlines(symbol: string, interval = "5", limit = 20): Promise<Kline[]> {
  const key = `${symbol}_${interval}`;
  const cached = klineCache.get(key);
  if (cached && Date.now() - cached.at < KLINE_CACHE_TTL) {
    return cached.data;
  }
  try {
    const url = `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json() as {
      retCode: number;
      result: { list: string[][] };
    };
    if (data.retCode !== 0 || !data.result?.list?.length) return [];

    const klines: Kline[] = data.result.list.map(k => ({
      time: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })).reverse(); // oldest first

    klineCache.set(key, { data: klines, at: Date.now() });
    return klines;
  } catch {
    return [];
  }
}

// ─── 1. MOMENTUM DECAY DETECTION ───────────────────────────────────────────

/**
 * Deteksi peluruhan momentum secara real-time.
 * Menganalisis: volume, pola candle, kekuatan trend, divergensi.
 */
export async function detectMomentumDecay(
  symbol: string,
  side: "Buy" | "Sell",
  entryPrice: number,
  currentPrice: number
): Promise<MomentumDecayResult> {
  const klines = await fetchRecentKlines(symbol, "5", 20);
  const decaySignals: string[] = [];

  if (klines.length < 5) {
    return {
      score: 60,
      decaySignals: ["Data kline tidak tersedia — estimasi moderat"],
      isCritical: false,
      isStrong: false,
      volumeDecayPct: 0,
      candleExhaustionScore: 0,
      rejectionStrength: 0,
    };
  }

  const recent = klines.slice(-6);
  const older  = klines.slice(-14, -6);

  // ── 1a. Volume Decay ─────────────────────────────────────────────────────
  const recentAvgVol = recent.reduce((s, k) => s + k.volume, 0) / recent.length;
  const olderAvgVol  = older.length > 0 ? older.reduce((s, k) => s + k.volume, 0) / older.length : recentAvgVol;
  const volumeDecayPct = olderAvgVol > 0 ? ((olderAvgVol - recentAvgVol) / olderAvgVol) * 100 : 0;

  let volumeScore = 100;
  if (volumeDecayPct > 50) {
    decaySignals.push(`Volume turun ${volumeDecayPct.toFixed(0)}% — momentum sangat lemah`);
    volumeScore -= 40;
  } else if (volumeDecayPct > 30) {
    decaySignals.push(`Volume menurun ${volumeDecayPct.toFixed(0)}% — tanda pelemahan`);
    volumeScore -= 22;
  } else if (volumeDecayPct > 15) {
    decaySignals.push(`Volume sedikit turun ${volumeDecayPct.toFixed(0)}%`);
    volumeScore -= 10;
  }

  // ── 1b. Candle Exhaustion (badan kecil, sumbu panjang) ───────────────────
  const last3 = klines.slice(-3);
  let exhaustionScore = 0;
  let exhaustionCount = 0;
  let rejectionStrength = 0;

  for (const k of last3) {
    const body = Math.abs(k.close - k.open);
    const range = k.high - k.low;
    if (range === 0) continue;

    const bodyRatio = body / range;
    const upperWick = k.high - Math.max(k.open, k.close);
    const lowerWick = Math.min(k.open, k.close) - k.low;
    const wickRatio = range > 0 ? (upperWick + lowerWick) / range : 0;

    if (bodyRatio < 0.25) {
      exhaustionCount++;
      exhaustionScore += 25;
      if (exhaustionCount === 1) decaySignals.push("Candle doji terdeteksi — ragu-ragu pasar");
    }

    // Rejection candle: wick besar berlawanan arah posisi
    if (side === "Buy" && upperWick > body * 2 && upperWick > range * 0.4) {
      rejectionStrength += 30;
      if (!decaySignals.includes("Candle rejection atas — tekanan jual kuat")) {
        decaySignals.push("Candle rejection atas — tekanan jual kuat");
      }
    }
    if (side === "Sell" && lowerWick > body * 2 && lowerWick > range * 0.4) {
      rejectionStrength += 30;
      if (!decaySignals.includes("Candle rejection bawah — tekanan beli kuat")) {
        decaySignals.push("Candle rejection bawah — tekanan beli kuat");
      }
    }
  }

  // ── 1c. Fake Breakout / Liquidity Trap ───────────────────────────────────
  const last5Highs = klines.slice(-5).map(k => k.high);
  const last5Lows  = klines.slice(-5).map(k => k.low);
  const currentHigh = klines[klines.length - 1]?.high ?? currentPrice;
  const currentLow  = klines[klines.length - 1]?.low ?? currentPrice;
  const prevMaxHigh = Math.max(...last5Highs.slice(0, -1));
  const prevMinLow  = Math.min(...last5Lows.slice(0, -1));

  if (side === "Buy" && currentHigh > prevMaxHigh && currentPrice < prevMaxHigh * 0.998) {
    decaySignals.push("Potensi fake breakout ke atas — harga kembali di bawah resistance");
    rejectionStrength += 20;
  }
  if (side === "Sell" && currentLow < prevMinLow && currentPrice > prevMinLow * 1.002) {
    decaySignals.push("Potensi fake breakdown ke bawah — harga kembali di atas support");
    rejectionStrength += 20;
  }

  // ── 1d. Weak Breakout Continuation ───────────────────────────────────────
  const priceDelta = side === "Buy"
    ? (currentPrice - entryPrice) / entryPrice * 100
    : (entryPrice - currentPrice) / entryPrice * 100;

  const timeSinceEntry = Date.now(); // akan dihitung di caller
  if (priceDelta < 0.3 && klines.length >= 10) {
    decaySignals.push("Pergerakan sangat kecil — breakout tanpa kelanjutan");
    exhaustionScore += 15;
  }

  // ── 1e. RSI-like Momentum Proxy dari Harga ───────────────────────────────
  const closes = klines.map(k => k.close);
  if (closes.length >= 14) {
    const gains: number[] = [];
    const losses: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains.push(diff);
      else losses.push(Math.abs(diff));
    }
    const avgGain = gains.length > 0 ? gains.reduce((s, v) => s + v, 0) / 14 : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, v) => s + v, 0) / 14 : 0.001;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    if (side === "Buy" && rsi > 75) {
      decaySignals.push(`RSI proxy overbought (${rsi.toFixed(0)}) — risiko reversal meningkat`);
      exhaustionScore += 15;
    }
    if (side === "Sell" && rsi < 25) {
      decaySignals.push(`RSI proxy oversold (${rsi.toFixed(0)}) — risiko reversal meningkat`);
      exhaustionScore += 15;
    }
  }

  // ── 1f. Sudden Volatility Shift ──────────────────────────────────────────
  const recentRanges = recent.map(k => k.high - k.low);
  const olderRanges  = older.map(k => k.high - k.low);
  const recentAvgRange = recentRanges.reduce((s, v) => s + v, 0) / Math.max(recentRanges.length, 1);
  const olderAvgRange  = olderRanges.reduce((s, v) => s + v, 0) / Math.max(olderRanges.length, 1);

  if (olderAvgRange > 0 && recentAvgRange > olderAvgRange * 2.5) {
    decaySignals.push("Lonjakan volatilitas tiba-tiba — pasar tidak stabil");
    exhaustionScore += 12;
  }

  // ── Hitung Skor Akhir ────────────────────────────────────────────────────
  const rawScore = Math.max(0,
    volumeScore
    - exhaustionScore
    - (rejectionStrength * 0.7)
    + (decaySignals.length === 0 ? 15 : 0)
  );
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  return {
    score,
    decaySignals,
    isCritical: score < 25 || rejectionStrength >= 50,
    isStrong: score >= 70 && decaySignals.length === 0,
    volumeDecayPct,
    candleExhaustionScore: exhaustionScore,
    rejectionStrength,
  };
}

// ─── 2. CONTINUATION PROBABILITY ───────────────────────────────────────────

/**
 * Hitung probabilitas trade terus berlanjut menguntungkan.
 * Mempertimbangkan momentum, waktu, profit, kondisi pasar.
 */
export function analyzeContinuation(params: {
  side: "Buy" | "Sell";
  entryPrice: number;
  currentPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
  openedAt: number;
  momentumScore: number;
  decaySignalCount: number;
  isCritical: boolean;
}): ContinuationAnalysis {
  const {
    side, entryPrice, currentPrice, takeProfit, stopLoss,
    openedAt, momentumScore, decaySignalCount, isCritical,
  } = params;

  const holdDurationMs = Date.now() - openedAt;
  const holdMinutes = holdDurationMs / 60_000;

  const profitPct = side === "Buy"
    ? (currentPrice - entryPrice) / entryPrice * 100
    : (entryPrice - currentPrice) / entryPrice * 100;

  // Hitung R:R saat ini
  let riskRewardNow = 0;
  if (stopLoss && takeProfit) {
    const upside  = side === "Buy" ? takeProfit - currentPrice : currentPrice - takeProfit;
    const downside = side === "Buy" ? currentPrice - stopLoss : stopLoss - currentPrice;
    riskRewardNow = downside > 0 ? upside / downside : upside > 0 ? 5 : 0;
  }

  // Skor dasar dari momentum
  let prob = momentumScore * 0.6;

  // Penalti berdasarkan sinyal peluruhan
  prob -= decaySignalCount * 12;

  // Bonus jika R:R masih bagus
  if (riskRewardNow >= 2.0) prob += 15;
  else if (riskRewardNow >= 1.5) prob += 8;
  else if (riskRewardNow < 0.8) prob -= 20;

  // Penalti overstay berdasarkan durasi
  if (holdMinutes > 240) prob -= 20; // > 4 jam
  else if (holdMinutes > 120) prob -= 10; // > 2 jam
  else if (holdMinutes > 60) prob -= 5; // > 1 jam

  // Penalti jika profit sudah besar dan momentum melemah
  if (profitPct > 3 && momentumScore < 50) prob -= 20;
  if (profitPct > 5 && momentumScore < 60) prob -= 15;

  // Penalti kritis
  if (isCritical) prob -= 30;

  prob = Math.min(100, Math.max(0, Math.round(prob)));

  let reason: string;
  let shouldHold: boolean;

  if (prob >= 65 && !isCritical) {
    shouldHold = true;
    reason = `Probabilitas kelanjutan tinggi (${prob}%) — momentum masih mendukung, pertahankan posisi`;
  } else if (prob >= 50 && decaySignalCount < 2) {
    shouldHold = true;
    reason = `Probabilitas kelanjutan moderat (${prob}%) — pantau ketat, pertahankan dengan waspada`;
  } else if (prob >= 40 && riskRewardNow >= 1.5) {
    shouldHold = false;
    reason = `Probabilitas menurun (${prob}%) namun R:R masih ${riskRewardNow.toFixed(1)}x — pertimbangkan amankan sebagian profit`;
  } else {
    shouldHold = false;
    reason = `Probabilitas kelanjutan rendah (${prob}%) — momentum lemah, amankan profit lebih bijaksana dari risiko reversal`;
  }

  return { probability: prob, riskRewardNow, shouldHold, reason };
}

// ─── 3. GREED PREVENTION SYSTEM ────────────────────────────────────────────

/**
 * Deteksi perilaku serakah dalam mempertahankan posisi.
 * "Profit yang sudah diamankan lebih baik dari risiko tanpa tujuan."
 */
export function analyzeGreed(params: {
  side: "Buy" | "Sell";
  entryPrice: number;
  currentPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
  margin: number;
  leverage: number;
  openedAt: number;
  momentumScore: number;
  continuationProb: number;
}): GreedAnalysis {
  const {
    side, entryPrice, currentPrice, takeProfit, stopLoss,
    margin, leverage, openedAt, momentumScore, continuationProb,
  } = params;

  const holdMinutes = (Date.now() - openedAt) / 60_000;
  const profitPct = side === "Buy"
    ? (currentPrice - entryPrice) / entryPrice * 100
    : (entryPrice - currentPrice) / entryPrice * 100;

  const profitUSD = (profitPct / 100) * margin * leverage;
  const securableProfit = Math.max(0, profitUSD * 0.85); // 85% dari profit saat ini

  // Estimasi profit yang terancam jika reversal
  const slDistPct = stopLoss
    ? (side === "Buy"
      ? (currentPrice - stopLoss) / currentPrice * 100
      : (stopLoss - currentPrice) / currentPrice * 100)
    : 2.0;
  const profitAtRisk = Math.max(0, profitUSD - (-slDistPct / 100 * margin * leverage));

  // Hitung indeks keserakahan
  let greedIndex = 0;

  // Semakin lama menahan dengan profit bagus = semakin serakah
  if (holdMinutes > 120 && profitPct > 2) greedIndex += 20;
  if (holdMinutes > 60 && profitPct > 3)  greedIndex += 15;

  // Momentum lemah tapi masih nunggu TP = serakah
  if (momentumScore < 40 && profitPct > 1) greedIndex += 25;
  if (momentumScore < 55 && profitPct > 2) greedIndex += 15;

  // Probabilitas rendah tapi tetap menahan = serakah
  if (continuationProb < 35 && profitPct > 0.5) greedIndex += 25;
  if (continuationProb < 50 && profitPct > 1.5)  greedIndex += 15;

  // Sudah dekat TP lama tapi momentum habis = serakah menunggu
  if (takeProfit) {
    const pctToTP = side === "Buy"
      ? (takeProfit - currentPrice) / currentPrice * 100
      : (currentPrice - takeProfit) / currentPrice * 100;
    if (pctToTP > 0 && pctToTP < 0.5 && momentumScore < 45) {
      greedIndex += 10; // dekat TP tapi momentum habis
    }
  }

  greedIndex = Math.min(100, Math.max(0, greedIndex));
  const isOverstaying = greedIndex >= 65 && profitPct > 0;

  let reason: string;
  if (greedIndex >= 75) {
    reason = `Indeks keserakahan tinggi (${greedIndex}) — mempertahankan posisi mengekspos $${profitAtRisk.toFixed(2)} profit ke risiko tidak perlu`;
  } else if (greedIndex >= 50) {
    reason = `Tanda keserakahan sedang (${greedIndex}) — profit $${securableProfit.toFixed(2)} bisa diamankan sekarang`;
  } else {
    reason = `Keserakahan rendah (${greedIndex}) — mempertahankan posisi masih justified`;
  }

  return { index: greedIndex, profitAtRisk, securableProfit, isOverstaying, reason };
}

// ─── 4. ADAPTIVE TAKE PROFIT SYSTEM ────────────────────────────────────────

/**
 * TP tidak statis — sesuaikan berdasarkan kondisi momentum saat ini.
 */
export function calculateAdaptiveTP(params: {
  side: "Buy" | "Sell";
  entryPrice: number;
  currentPrice: number;
  originalTP: number | null;
  atrEstimate: number;
  momentumScore: number;
  continuationProb: number;
  leverage: number;
}): { newTP: number | null; action: "extend" | "tighten" | "keep"; note: string } {
  const {
    side, entryPrice, currentPrice, originalTP,
    atrEstimate, momentumScore, continuationProb, leverage,
  } = params;

  if (!originalTP) return { newTP: null, action: "keep", note: "Tidak ada TP yang ditetapkan" };

  const distToTP = side === "Buy"
    ? (originalTP - currentPrice) / currentPrice * 100
    : (currentPrice - originalTP) / currentPrice * 100;

  // Momentum sangat kuat → perluas target
  if (momentumScore >= 80 && continuationProb >= 70) {
    const extension = atrEstimate * (leverage <= 5 ? 1.5 : 0.8);
    const newTP = side === "Buy"
      ? Math.max(originalTP, originalTP + extension)
      : Math.min(originalTP, originalTP - extension);
    return {
      newTP,
      action: "extend",
      note: `Momentum sangat kuat (${momentumScore}) — target diperluas ke $${newTP.toFixed(4)}`,
    };
  }

  // Momentum melemah → rapatkan target untuk kunci profit
  if (momentumScore < 40 || continuationProb < 35) {
    const profitPct = side === "Buy"
      ? (currentPrice - entryPrice) / entryPrice * 100
      : (entryPrice - currentPrice) / entryPrice * 100;

    if (profitPct > 0.5) {
      // Set TP lebih dekat ke harga saat ini (kunci 80% dari profit yang ada)
      const lockPct = 0.8;
      const newTP = side === "Buy"
        ? entryPrice + (currentPrice - entryPrice) * lockPct
        : entryPrice - (entryPrice - currentPrice) * lockPct;
      return {
        newTP,
        action: "tighten",
        note: `Momentum melemah (${momentumScore}) — TP dirapatkan ke $${newTP.toFixed(4)} untuk kunci 80% profit`,
      };
    }
  }

  return {
    newTP: originalTP,
    action: "keep",
    note: `Target TP dipertahankan — kondisi momentum moderat (${momentumScore})`,
  };
}

// ─── 5. SMART TRAILING SYSTEM ───────────────────────────────────────────────

/**
 * Trailing stop cerdas: sesuaikan jarak berdasarkan momentum.
 * Saat momentum kuat → longgarkan. Saat lemah → kencangkan.
 */
export function calculateSmartTrail(params: {
  side: "Buy" | "Sell";
  currentPrice: number;
  peakPrice: number;
  currentSL: number | null;
  entryPrice: number;
  atrEstimate: number;
  momentumScore: number;
  decaySignalCount: number;
  profitPct: number;
}): { newSL: number; tightened: boolean; note: string } {
  const {
    side, currentPrice, peakPrice, currentSL, entryPrice,
    atrEstimate, momentumScore, decaySignalCount, profitPct,
  } = params;

  const fallback = side === "Buy"
    ? (currentSL ?? entryPrice * 0.98)
    : (currentSL ?? entryPrice * 1.02);

  if (profitPct < 0.3) {
    return { newSL: fallback, tightened: false, note: "Belum cukup profit untuk trail" };
  }

  // Faktor pengganda ATR berdasarkan momentum
  let trailMult: number;
  if (momentumScore >= 75 && decaySignalCount === 0) {
    trailMult = 0.65; // momentum kuat → trailing lebih longgar, beri ruang bernapas
  } else if (momentumScore >= 55) {
    trailMult = 0.45; // normal
  } else if (momentumScore >= 35) {
    trailMult = 0.28; // mulai melemah → kencangkan
  } else {
    trailMult = 0.15; // sangat lemah → kencangkan agresif
  }

  // Semakin besar profit, semakin kencang trailing
  if (profitPct > 5) trailMult *= 0.6;
  else if (profitPct > 3) trailMult *= 0.75;

  const trailDist = atrEstimate * trailMult;

  let newSL: number;
  let tightened = false;

  if (side === "Buy") {
    const proposed = peakPrice - trailDist;
    const current = currentSL ?? 0;
    newSL = Math.max(proposed, current);
    tightened = newSL > current + 0.000001;
  } else {
    const proposed = peakPrice + trailDist;
    const current = currentSL ?? Infinity;
    newSL = Math.min(proposed, current);
    tightened = newSL < current - 0.000001;
  }

  const note = tightened
    ? `Smart trail → SL ke $${newSL.toFixed(4)} [momentum ${momentumScore}, decay:${decaySignalCount}]`
    : "Trail: sudah di posisi optimal";

  return { newSL, tightened, note };
}

// ─── 6. MASTER DECISION ENGINE ──────────────────────────────────────────────

/**
 * Keputusan utama: apakah AI harus hold, tighten trail, exit lebih awal, atau perluas target?
 *
 * Seperti trader profesional yang terus bertanya:
 * - "Apakah trade ini masih worth holding?"
 * - "Apakah melindungi profit sekarang lebih bijaksana?"
 * - "Apakah momentum masih mendukung?"
 */
export async function makeHumanInstinctDecision(params: {
  tradeId: string;
  symbol: string;
  side: "Buy" | "Sell";
  entryPrice: number;
  currentPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
  margin: number;
  leverage: number;
  openedAt: number;
  confidence: number;
}): Promise<HumanInstinctDecision> {
  const {
    tradeId, symbol, side, entryPrice, currentPrice,
    takeProfit, stopLoss, margin, leverage, openedAt, confidence,
  } = params;

  const profitPct = side === "Buy"
    ? (currentPrice - entryPrice) / entryPrice * 100
    : (entryPrice - currentPrice) / entryPrice * 100;
  const holdMinutes = (Date.now() - openedAt) / 60_000;
  const atrEstimate = entryPrice * 0.018;

  // ── Step 1: Deteksi Peluruhan Momentum ────────────────────────────────────
  const momentum = await detectMomentumDecay(symbol, side, entryPrice, currentPrice);

  // ── Step 2: Analisis Probabilitas Kelanjutan ──────────────────────────────
  const continuation = analyzeContinuation({
    side, entryPrice, currentPrice, takeProfit, stopLoss,
    openedAt, momentumScore: momentum.score,
    decaySignalCount: momentum.decaySignals.length,
    isCritical: momentum.isCritical,
  });

  // ── Step 3: Analisis Keserakahan ──────────────────────────────────────────
  const greed = analyzeGreed({
    side, entryPrice, currentPrice, takeProfit, stopLoss,
    margin, leverage, openedAt,
    momentumScore: momentum.score,
    continuationProb: continuation.probability,
  });

  // ── Step 4: Terapkan Threshold Adaptif dari Pembelajaran ─────────────────
  const {
    momentumExitThreshold,
    continuationExitThreshold,
    greedExitThreshold,
  } = instinctMemory;

  // ── Step 5: Keputusan ─────────────────────────────────────────────────────
  let action: InstinctAction = "hold";
  let urgency = 0;
  let reason = "";
  let shouldExitEarly = false;
  let suggestedSL: number | undefined;
  let suggestedTP: number | undefined;

  // KONDISI EXIT AWAL — urutan prioritas
  const exitConditions: { met: boolean; urgency: number; reason: string }[] = [
    // 1. Kritis: momentum hancur + profit ada → exit segera
    {
      met: momentum.isCritical && profitPct > 0.3,
      urgency: 95,
      reason: `🚨 Momentum kritis — ${momentum.decaySignals[0] ?? "tekanan besar terdeteksi"}. Profit $${(profitPct).toFixed(2)}% diamankan.`,
    },
    // 2. Momentum sangat lemah + profit cukup
    {
      met: momentum.score < momentumExitThreshold && profitPct > 0.5,
      urgency: 85,
      reason: `⚠️ Momentum sangat lemah (skor: ${momentum.score}) — probabilitas kelanjutan rendah. ${momentum.decaySignals[0] ?? ""}`,
    },
    // 3. Probabilitas sangat rendah + ada profit
    {
      met: continuation.probability < continuationExitThreshold && profitPct > 0.5,
      urgency: 80,
      reason: `📉 Probabilitas kelanjutan rendah (${continuation.probability}%) — risiko reversal lebih besar dari potensi profit tersisa.`,
    },
    // 4. Serakah berlebihan + momentum melemah
    {
      met: greed.isOverstaying && momentum.score < 55,
      urgency: 75,
      reason: `💰 Profit protection: menahan terlalu lama dengan momentum melemah. Profit $${greed.securableProfit.toFixed(2)} bisa diamankan.`,
    },
    // 5. Volume jatuh drastis + sudah profit
    {
      met: momentum.volumeDecayPct > 45 && profitPct > 1.0,
      urgency: 70,
      reason: `📊 Volume turun ${momentum.volumeDecayPct.toFixed(0)}% — konfirmasi tidak ada. Amankan profit ${profitPct.toFixed(2)}%.`,
    },
    // 6. Candle rejection keras + sudah profit
    {
      met: momentum.rejectionStrength >= 50 && profitPct > 0.3,
      urgency: 78,
      reason: `🕯️ ${momentum.decaySignals.find(s => s.includes("rejection")) ?? "Candle rejection"} — tekanan reversal kuat.`,
    },
    // 7. Overstay lama + momentum moderat + profit tipis mulai turun
    {
      met: holdMinutes > 180 && momentum.score < 45 && profitPct > 0,
      urgency: 65,
      reason: `⏰ Trade sudah ${Math.round(holdMinutes)} menit — momentum melemah (${momentum.score}). Waktu untuk mengambil profit.`,
    },
  ];

  const triggered = exitConditions.find(c => c.met);
  if (triggered) {
    action = "early_exit";
    urgency = triggered.urgency;
    reason = triggered.reason;
    shouldExitEarly = true;
  }

  // KONDISI PERLUAS TARGET — momentum sangat kuat
  else if (momentum.isStrong && continuation.probability >= 72 && profitPct > 0) {
    const adaptiveTP = calculateAdaptiveTP({
      side, entryPrice, currentPrice,
      originalTP: takeProfit,
      atrEstimate, momentumScore: momentum.score,
      continuationProb: continuation.probability,
      leverage,
    });
    if (adaptiveTP.action === "extend") {
      action = "extend_target";
      urgency = 30;
      reason = `🚀 Momentum sangat kuat (skor: ${momentum.score}) — ${adaptiveTP.note}`;
      suggestedTP = adaptiveTP.newTP ?? undefined;
    } else {
      action = "hold";
      urgency = 10;
      reason = `✅ Kondisi optimal — pertahankan posisi. Momentum kuat (${momentum.score}), probabilitas kelanjutan ${continuation.probability}%`;
    }
  }

  // KONDISI KENCANGKAN TRAILING — momentum melemah tapi belum exit
  else if (momentum.score < 55 && profitPct > 0.5 && !shouldExitEarly) {
    const smartTrail = calculateSmartTrail({
      side, currentPrice,
      peakPrice: side === "Buy"
        ? Math.max(currentPrice, entryPrice)
        : Math.min(currentPrice, entryPrice),
      currentSL: stopLoss,
      entryPrice, atrEstimate,
      momentumScore: momentum.score,
      decaySignalCount: momentum.decaySignals.length,
      profitPct,
    });
    action = "tighten_trail";
    urgency = 50;
    reason = `🛡️ Momentum mulai melemah (${momentum.score}) — ${smartTrail.note}`;
    suggestedSL = smartTrail.tightened ? smartTrail.newSL : undefined;
  }

  // HOLD — kondisi normal
  else {
    action = "hold";
    urgency = 15;
    reason = `⚡ ${continuation.reason}`;
  }

  // ── Catat keputusan untuk pembelajaran ───────────────────────────────────
  const record: InstinctRecord = {
    id: crypto.randomUUID(),
    tradeId,
    symbol,
    side,
    action,
    reason,
    profitPctAtDecision: profitPct,
    momentumScore: momentum.score,
    continuationProb: continuation.probability,
    greedIndex: greed.index,
    decaySignals: momentum.decaySignals,
    timestamp: Date.now(),
  };

  if (action === "early_exit") {
    instinctMemory.totalDecisions++;
    instinctMemory.records.unshift(record);
    if (instinctMemory.records.length > 300) instinctMemory.records.splice(300);
    instinctMemory.lastUpdated = Date.now();
    saveInstinctMemory();
  }

  return {
    action,
    urgency,
    reason,
    shouldExitEarly,
    suggestedSL,
    suggestedTP,
    momentumScore: momentum.score,
    continuationProb: continuation.probability,
    greedIndex: greed.index,
    decaySignals: momentum.decaySignals,
    evalAt: Date.now(),
  };
}

// ─── 7. SELF-LEARNING INTEGRATION ──────────────────────────────────────────

/**
 * Belajar dari hasil keputusan exit yang telah dibuat.
 * Menyesuaikan threshold secara otomatis berdasarkan performa historis.
 */
export function learnFromTradeOutcome(params: {
  tradeId: string;
  symbol: string;
  finalProfitPct: number;
  closedAs: "tp" | "sl" | "early_exit" | "manual";
}): void {
  const { tradeId, finalProfitPct, closedAs } = params;

  // Cari record keputusan instinct untuk trade ini
  const record = instinctMemory.records.find(r => r.tradeId === tradeId && !r.outcome);
  if (!record) return;

  const profitDelta = finalProfitPct - record.profitPctAtDecision;

  // Tentukan outcome pembelajaran
  if (record.action === "early_exit") {
    if (closedAs === "sl" || finalProfitPct < record.profitPctAtDecision) {
      // Keputusan exit awal BENAR — harga memang turun setelahnya
      record.outcome = "correct_early_exit";
      instinctMemory.correctEarlyExits++;
    } else if (profitDelta > 1.5) {
      // Exit terlalu awal — masih ada profit yang terlewat
      record.outcome = "premature_exit";
      instinctMemory.prematureExits++;
      // Longgarkan threshold sedikit karena exit terlalu dini
      instinctMemory.momentumExitThreshold = Math.max(20, instinctMemory.momentumExitThreshold - 2);
      instinctMemory.continuationExitThreshold = Math.max(25, instinctMemory.continuationExitThreshold - 2);
    } else {
      record.outcome = "correct_early_exit";
      instinctMemory.correctEarlyExits++;
    }
  } else if (record.action === "hold" || record.action === "tighten_trail") {
    if (closedAs === "sl" || finalProfitPct < 0) {
      // Seharusnya sudah exit — kencangkan threshold
      record.outcome = "should_have_exited";
      instinctMemory.shouldHaveExited++;
      instinctMemory.momentumExitThreshold = Math.min(50, instinctMemory.momentumExitThreshold + 3);
      instinctMemory.continuationExitThreshold = Math.min(55, instinctMemory.continuationExitThreshold + 3);
    } else {
      record.outcome = "held_correctly";
      instinctMemory.heldCorrectly++;
    }
  }

  record.finalProfitPct = finalProfitPct;
  record.profitDelta = profitDelta;

  // Update statistik rata-rata
  const earlyExitRecords = instinctMemory.records.filter(r => r.action === "early_exit" && r.momentumScore);
  if (earlyExitRecords.length > 0) {
    instinctMemory.avgMomentumAtEarlyExit =
      earlyExitRecords.reduce((s, r) => s + r.momentumScore, 0) / earlyExitRecords.length;
    instinctMemory.avgContinuationProbAtExit =
      earlyExitRecords.reduce((s, r) => s + r.continuationProb, 0) / earlyExitRecords.length;
  }

  instinctMemory.lastUpdated = Date.now();
  saveInstinctMemory();

  logger.info({
    tradeId,
    action: record.action,
    outcome: record.outcome,
    profitAtDecision: record.profitPctAtDecision.toFixed(2) + "%",
    finalProfit: finalProfitPct.toFixed(2) + "%",
    profitDelta: profitDelta.toFixed(2) + "%",
    newMomentumThreshold: instinctMemory.momentumExitThreshold,
  }, "Human Instinct Engine: belajar dari hasil trade");
}

// ─── 8. LIVE REASONING GENERATOR ───────────────────────────────────────────

/**
 * Buat penjelasan reasoning yang mudah dibaca manusia (Bahasa Indonesia).
 */
export function generateLiveReasoning(decision: HumanInstinctDecision, profitPct: number): string {
  const profitStr = profitPct >= 0
    ? `+${profitPct.toFixed(2)}%`
    : `${profitPct.toFixed(2)}%`;

  const header = decision.action === "early_exit"
    ? `🧠 INSTINCT EXIT [${decision.urgency}% urgensi] | Profit: ${profitStr}`
    : decision.action === "tighten_trail"
    ? `🛡️ SMART TRAIL | Profit: ${profitStr}`
    : decision.action === "extend_target"
    ? `🚀 PERLUAS TARGET | Profit: ${profitStr}`
    : `✅ TAHAN POSISI | Profit: ${profitStr}`;

  const lines = [header, decision.reason];

  if (decision.decaySignals.length > 0) {
    lines.push(`Sinyal: ${decision.decaySignals.slice(0, 2).join(" · ")}`);
  }

  lines.push(
    `Skor [Momentum: ${decision.momentumScore} | Kelanjutan: ${decision.continuationProb}% | Keserakahan: ${decision.greedIndex}]`
  );

  return lines.join("\n");
}

// ─── 9. INSTINCT STATUS untuk UI ───────────────────────────────────────────

export interface InstinctStats {
  totalDecisions: number;
  accuracyPct: number;
  prematureExitPct: number;
  correctEarlyExitPct: number;
  adaptiveThresholds: {
    momentum: number;
    continuation: number;
    greed: number;
  };
  recentDecisions: {
    symbol: string;
    action: string;
    profitPct: number;
    outcome?: string;
    timestamp: number;
  }[];
}

export function getInstinctStats(): InstinctStats {
  const total = instinctMemory.totalDecisions;
  const correct = instinctMemory.correctEarlyExits;
  const premature = instinctMemory.prematureExits;
  const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const prematurePct = total > 0 ? Math.round((premature / total) * 100) : 0;

  return {
    totalDecisions: total,
    accuracyPct,
    prematureExitPct: prematurePct,
    correctEarlyExitPct: total > 0 ? Math.round(((instinctMemory.correctEarlyExits) / Math.max(total, 1)) * 100) : 0,
    adaptiveThresholds: {
      momentum: instinctMemory.momentumExitThreshold,
      continuation: instinctMemory.continuationExitThreshold,
      greed: instinctMemory.greedExitThreshold,
    },
    recentDecisions: instinctMemory.records.slice(0, 10).map(r => ({
      symbol: r.symbol,
      action: r.action,
      profitPct: r.profitPctAtDecision,
      outcome: r.outcome,
      timestamp: r.timestamp,
    })),
  };
}
