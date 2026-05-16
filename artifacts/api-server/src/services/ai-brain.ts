/**
 * AI Brain — Internal self-learning trading intelligence.
 *
 * No external API. The brain learns purely from its own trading history:
 * - Records every prediction outcome
 * - Tracks indicator accuracy per symbol / condition
 * - Weights strategies dynamically based on real results
 * - Generates analysis text from accumulated statistical knowledge
 * - Stores mistakes permanently and corrects future decisions
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const BRAIN_FILE = join(DATA_DIR, "ai-brain.json");

// ─── Types ────────────────────────────────────────────────────────────────────

export type MarketCondition = "trending_up" | "trending_down" | "sideways" | "volatile" | "low_liquidity";
export type TradeResult = "WIN" | "LOSS" | "NEUTRAL";

export interface IndicatorStat {
  name: string;
  correct: number;
  total: number;
  weight: number; // 0.0–2.0, adaptive multiplier
}

export interface SymbolPerformance {
  symbol: string;
  wins: number;
  losses: number;
  neutrals: number;
  totalPnl: number;
  avgConfidence: number;
  lastTrade: number;
  consecutiveLosses: number;
  avoidUntil: number | null; // timestamp to avoid trading this pair
}

export interface MistakeRecord {
  id: string;
  timestamp: number;
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  signal: string;
  result: TradeResult;
  priceDeltaPct: number;
  reasoning: string[];
  condition: MarketCondition;
  lesson: string;
  correctedApproach: string;
  indicatorsActive: string[];
}

export interface SuccessPattern {
  id: string;
  timestamp: number;
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  priceDeltaPct: number;
  indicatorsActive: string[];
  condition: MarketCondition;
  usageCount: number;
}

export interface StrategyWeight {
  name: string;
  weight: number; // 0.0–2.0
  wins: number;
  losses: number;
  lastAdjusted: number;
}

export interface BrainMemory {
  version: number;
  learningCycles: number;
  totalPredictions: number;
  totalWins: number;
  totalLosses: number;
  lastUpdated: number;
  indicatorStats: Record<string, IndicatorStat>;
  symbolPerformance: Record<string, SymbolPerformance>;
  conditionPerformance: Record<MarketCondition, { wins: number; losses: number; neutrals: number }>;
  strategyWeights: Record<string, StrategyWeight>;
  mistakes: MistakeRecord[];
  successPatterns: SuccessPattern[];
  consecutiveLosses: number;
  maxDrawdownSeen: number;
  bestWinStreak: number;
  currentWinStreak: number;
}

// ─── Default memory ───────────────────────────────────────────────────────────

const DEFAULT_INDICATORS: Record<string, IndicatorStat> = {
  rsi_oversold: { name: "RSI Oversold", correct: 0, total: 0, weight: 1.0 },
  rsi_overbought: { name: "RSI Overbought", correct: 0, total: 0, weight: 1.0 },
  ema_golden_cross: { name: "EMA Golden Cross", correct: 0, total: 0, weight: 1.0 },
  ema_death_cross: { name: "EMA Death Cross", correct: 0, total: 0, weight: 1.0 },
  macd_bullish: { name: "MACD Bullish", correct: 0, total: 0, weight: 1.0 },
  macd_bearish: { name: "MACD Bearish", correct: 0, total: 0, weight: 1.0 },
  volume_spike: { name: "Volume Spike", correct: 0, total: 0, weight: 1.0 },
  bos_bullish: { name: "Break of Structure Bullish", correct: 0, total: 0, weight: 1.0 },
  bos_bearish: { name: "Break of Structure Bearish", correct: 0, total: 0, weight: 1.0 },
  order_block_demand: { name: "Order Block Demand", correct: 0, total: 0, weight: 1.0 },
  order_block_supply: { name: "Order Block Supply", correct: 0, total: 0, weight: 1.0 },
  fvg_bullish: { name: "Fair Value Gap Bullish", correct: 0, total: 0, weight: 1.0 },
  fvg_bearish: { name: "Fair Value Gap Bearish", correct: 0, total: 0, weight: 1.0 },
  vwap_above: { name: "Price Above VWAP", correct: 0, total: 0, weight: 1.0 },
  vwap_below: { name: "Price Below VWAP", correct: 0, total: 0, weight: 1.0 },
  bb_squeeze: { name: "Bollinger Band Squeeze", correct: 0, total: 0, weight: 1.0 },
  multi_tf_aligned: { name: "Multi-Timeframe Aligned", correct: 0, total: 0, weight: 1.2 },
  high_volatility: { name: "High Volatility", correct: 0, total: 0, weight: 0.8 },
  momentum_strong: { name: "Strong Momentum", correct: 0, total: 0, weight: 1.0 },
};

const DEFAULT_CONDITION_PERF: BrainMemory["conditionPerformance"] = {
  trending_up: { wins: 0, losses: 0, neutrals: 0 },
  trending_down: { wins: 0, losses: 0, neutrals: 0 },
  sideways: { wins: 0, losses: 0, neutrals: 0 },
  volatile: { wins: 0, losses: 0, neutrals: 0 },
  low_liquidity: { wins: 0, losses: 0, neutrals: 0 },
};

const DEFAULT_STRATEGIES: Record<string, StrategyWeight> = {
  scalp_5m: { name: "Scalping 5M", weight: 1.0, wins: 0, losses: 0, lastAdjusted: 0 },
  swing_1h: { name: "Swing 1H", weight: 1.0, wins: 0, losses: 0, lastAdjusted: 0 },
  bos_choch: { name: "BOS/CHOCH", weight: 1.1, wins: 0, losses: 0, lastAdjusted: 0 },
  order_block: { name: "Order Block", weight: 1.1, wins: 0, losses: 0, lastAdjusted: 0 },
  smart_money: { name: "Smart Money", weight: 1.0, wins: 0, losses: 0, lastAdjusted: 0 },
  momentum: { name: "Momentum", weight: 1.0, wins: 0, losses: 0, lastAdjusted: 0 },
  reversal: { name: "Reversal", weight: 0.9, wins: 0, losses: 0, lastAdjusted: 0 },
};

function createDefaultMemory(): BrainMemory {
  return {
    version: 1,
    learningCycles: 0,
    totalPredictions: 0,
    totalWins: 0,
    totalLosses: 0,
    lastUpdated: Date.now(),
    indicatorStats: { ...DEFAULT_INDICATORS },
    symbolPerformance: {},
    conditionPerformance: { ...DEFAULT_CONDITION_PERF },
    strategyWeights: { ...DEFAULT_STRATEGIES },
    mistakes: [],
    successPatterns: [],
    consecutiveLosses: 0,
    maxDrawdownSeen: 0,
    bestWinStreak: 0,
    currentWinStreak: 0,
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

let memory: BrainMemory = createDefaultMemory();

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function saveBrain() {
  try {
    ensureDataDir();
    writeFileSync(BRAIN_FILE, JSON.stringify(memory, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to save AI brain");
  }
}

function loadBrain() {
  try {
    ensureDataDir();
    if (!existsSync(BRAIN_FILE)) {
      logger.info("AI brain initializing fresh memory");
      return;
    }
    const raw = readFileSync(BRAIN_FILE, "utf-8");
    const saved = JSON.parse(raw) as BrainMemory;
    // Merge with defaults to handle schema additions
    memory = {
      ...createDefaultMemory(),
      ...saved,
      indicatorStats: { ...DEFAULT_INDICATORS, ...saved.indicatorStats },
      conditionPerformance: { ...DEFAULT_CONDITION_PERF, ...saved.conditionPerformance },
      strategyWeights: { ...DEFAULT_STRATEGIES, ...saved.strategyWeights },
    };
    logger.info({
      cycles: memory.learningCycles,
      predictions: memory.totalPredictions,
      wins: memory.totalWins,
      losses: memory.totalLosses,
      mistakes: memory.mistakes.length,
    }, "AI brain loaded from memory");
  } catch (err) {
    logger.warn({ err }, "Failed to load AI brain — starting fresh");
    memory = createDefaultMemory();
  }
}

loadBrain();

// ─── Market Condition Detection ───────────────────────────────────────────────

export function detectMarketCondition(data: {
  priceChange24h: number;
  priceChange7d?: number | null;
  rsi?: number | null;
  volumeRatio?: number | null;
}): MarketCondition {
  const { priceChange24h, priceChange7d, rsi, volumeRatio } = data;
  const abs24h = Math.abs(priceChange24h);

  if (abs24h > 8 || (rsi != null && (rsi > 80 || rsi < 20))) return "volatile";
  if (volumeRatio != null && volumeRatio < 0.5) return "low_liquidity";
  if (abs24h < 1.5 && (priceChange7d == null || Math.abs(priceChange7d) < 3)) return "sideways";
  if (priceChange24h > 2) return "trending_up";
  if (priceChange24h < -2) return "trending_down";
  return "sideways";
}

// ─── Learning Engine ──────────────────────────────────────────────────────────

interface LearningInput {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  signal: string;
  result: TradeResult;
  priceDeltaPct: number;
  reasoning: string[];
  indicatorsActive: string[];
  condition: MarketCondition;
  strategy?: string;
  virtualPnl?: number;
}

function updateIndicatorWeights(input: LearningInput) {
  const isCorrect = input.result === "WIN";

  for (const indKey of input.indicatorsActive) {
    if (!memory.indicatorStats[indKey]) continue;
    const stat = memory.indicatorStats[indKey];
    stat.total++;
    if (isCorrect) stat.correct++;

    // Bayesian-style weight adjustment
    const accuracy = stat.total > 0 ? stat.correct / stat.total : 0.5;
    // Weight ranges from 0.3 (always wrong) to 2.0 (always right)
    stat.weight = Math.max(0.3, Math.min(2.0, 0.3 + accuracy * 1.7));
  }
}

function updateSymbolPerformance(input: LearningInput) {
  if (!memory.symbolPerformance[input.symbol]) {
    memory.symbolPerformance[input.symbol] = {
      symbol: input.symbol,
      wins: 0, losses: 0, neutrals: 0,
      totalPnl: 0, avgConfidence: input.confidence,
      lastTrade: Date.now(), consecutiveLosses: 0, avoidUntil: null,
    };
  }
  const perf = memory.symbolPerformance[input.symbol];
  perf.lastTrade = Date.now();
  perf.avgConfidence = (perf.avgConfidence * (perf.wins + perf.losses) + input.confidence) / (perf.wins + perf.losses + 1);
  perf.totalPnl += input.virtualPnl ?? 0;

  if (input.result === "WIN") {
    perf.wins++;
    perf.consecutiveLosses = 0;
    perf.avoidUntil = null;
  } else if (input.result === "LOSS") {
    perf.losses++;
    perf.consecutiveLosses++;
    // After 3 consecutive losses on a symbol, avoid it for 2 hours
    if (perf.consecutiveLosses >= 3) {
      perf.avoidUntil = Date.now() + 2 * 60 * 60 * 1000;
      logger.warn({ symbol: input.symbol, consecutiveLosses: perf.consecutiveLosses }, "Brain: avoiding symbol for 2h");
    }
  } else {
    perf.neutrals++;
  }
}

function updateStrategyWeight(strategy: string, isWin: boolean) {
  if (!memory.strategyWeights[strategy]) {
    memory.strategyWeights[strategy] = {
      name: strategy, weight: 1.0, wins: 0, losses: 0, lastAdjusted: Date.now()
    };
  }
  const sw = memory.strategyWeights[strategy];
  if (isWin) sw.wins++;
  else sw.losses++;

  const total = sw.wins + sw.losses;
  const accuracy = total > 0 ? sw.wins / total : 0.5;
  sw.weight = Math.max(0.3, Math.min(2.0, 0.4 + accuracy * 1.6));
  sw.lastAdjusted = Date.now();
}

function generateLesson(input: LearningInput): { lesson: string; correctedApproach: string } {
  const { result, direction, confidence, priceDeltaPct, condition, indicatorsActive, signal } = input;
  const dir = direction === "LONG" ? "LONG (beli)" : "SHORT (jual)";

  if (result === "WIN") {
    const lesson = `Setup ${dir} berhasil dengan pergerakan ${priceDeltaPct.toFixed(2)}%. ` +
      `Kondisi ${condition.replace("_", " ")} mendukung. Confidence ${confidence}% terbukti akurat.`;
    const correctedApproach = `Pertahankan pendekatan ini: konfirmasi ${indicatorsActive.slice(0, 2).join(", ")} valid di kondisi ${condition.replace("_", " ")}.`;
    return { lesson, correctedApproach };
  }

  if (result === "LOSS") {
    const reversalStrength = Math.abs(priceDeltaPct).toFixed(2);
    let lesson = `Setup ${dir} gagal, pasar bergerak ${reversalStrength}% berlawanan arah. `;
    let correctedApproach = "";

    if (condition === "sideways") {
      lesson += "Kondisi sideways kurang cocok untuk directional trade.";
      correctedApproach = "Di kondisi sideways: tunggu breakout konfirmasi atau gunakan range strategy. Hindari prediksi directional tanpa volume spike.";
    } else if (condition === "volatile") {
      lesson += "Volatilitas tinggi membuat prediksi tidak stabil.";
      correctedApproach = "Saat volatile: kurangi ukuran posisi, perkecil SL/TP, tunggu volatilitas reda sebelum entry.";
    } else if (confidence > 85) {
      lesson += `Confidence ${confidence}% terlalu tinggi untuk kondisi ini — overconfidence.`;
      correctedApproach = `Confidence > 85% harus memerlukan konfirmasi minimal 5 indikator berbeda. Saat ini hanya: ${indicatorsActive.slice(0, 3).join(", ")}.`;
    } else {
      lesson += `Sinyal ${signal} tidak cukup kuat untuk melawan tren utama.`;
      correctedApproach = "Perkuat dengan konfirmasi multi-timeframe sebelum entry. Tambahkan konfirmasi volume dan struktur pasar.";
    }

    return { lesson, correctedApproach };
  }

  return {
    lesson: `Pergerakan ${Math.abs(priceDeltaPct).toFixed(2)}% terlalu kecil untuk dikonfirmasi sebagai WIN/LOSS. Setup valid namun timing kurang presisi.`,
    correctedApproach: "Perbaiki entry timing: tunggu breakout yang lebih jelas dari level kunci sebelum entry.",
  };
}

export function learnFromOutcome(input: LearningInput): void {
  memory.learningCycles++;
  memory.totalPredictions++;
  memory.lastUpdated = Date.now();

  const isWin = input.result === "WIN";
  const isLoss = input.result === "LOSS";

  if (isWin) {
    memory.totalWins++;
    memory.consecutiveLosses = 0;
    memory.currentWinStreak++;
    memory.bestWinStreak = Math.max(memory.bestWinStreak, memory.currentWinStreak);
  } else if (isLoss) {
    memory.totalLosses++;
    memory.consecutiveLosses++;
    memory.currentWinStreak = 0;
    if (input.virtualPnl && input.virtualPnl < 0) {
      memory.maxDrawdownSeen = Math.min(memory.maxDrawdownSeen, input.virtualPnl);
    }
  }

  // Update condition performance
  const condPerf = memory.conditionPerformance[input.condition];
  if (condPerf) {
    if (isWin) condPerf.wins++;
    else if (isLoss) condPerf.losses++;
    else condPerf.neutrals++;
  }

  // Update indicator weights
  updateIndicatorWeights(input);
  updateSymbolPerformance(input);
  if (input.strategy) updateStrategyWeight(input.strategy, isWin);

  // Generate lesson
  const { lesson, correctedApproach } = generateLesson(input);

  // Record mistake (even partial losses worth recording)
  if (isLoss || (input.result === "NEUTRAL" && input.confidence > 80)) {
    const mistake: MistakeRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      symbol: input.symbol,
      direction: input.direction,
      confidence: input.confidence,
      signal: input.signal,
      result: input.result,
      priceDeltaPct: input.priceDeltaPct,
      reasoning: input.reasoning,
      condition: input.condition,
      lesson,
      correctedApproach,
      indicatorsActive: input.indicatorsActive,
    };
    memory.mistakes.unshift(mistake);
    if (memory.mistakes.length > 500) memory.mistakes.splice(500);
  }

  // Record success pattern
  if (isWin && input.priceDeltaPct > 1.5) {
    const pattern: SuccessPattern = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      symbol: input.symbol,
      direction: input.direction,
      confidence: input.confidence,
      priceDeltaPct: input.priceDeltaPct,
      indicatorsActive: input.indicatorsActive,
      condition: input.condition,
      usageCount: 1,
    };
    memory.successPatterns.unshift(pattern);
    if (memory.successPatterns.length > 200) memory.successPatterns.splice(200);
  }

  saveBrain();
  logger.info({
    symbol: input.symbol,
    result: input.result,
    cycles: memory.learningCycles,
    winRate: memory.totalPredictions > 0 ? ((memory.totalWins / memory.totalPredictions) * 100).toFixed(1) + "%" : "N/A",
  }, "Brain learned from outcome");
}

// ─── Confidence Adjustment ────────────────────────────────────────────────────

export function adjustConfidence(
  baseConfidence: number,
  symbol: string,
  condition: MarketCondition,
  indicatorsActive: string[],
  strategy?: string
): number {
  let adjusted = baseConfidence;

  // Symbol performance adjustment
  const symPerf = memory.symbolPerformance[symbol];
  if (symPerf) {
    // Avoid penalized symbols
    if (symPerf.avoidUntil && Date.now() < symPerf.avoidUntil) {
      return Math.max(0, adjusted - 20); // Heavy penalty
    }
    const symTotal = symPerf.wins + symPerf.losses;
    if (symTotal >= 5) {
      const symWinRate = symPerf.wins / symTotal;
      adjusted += (symWinRate - 0.5) * 20; // ±10% adjustment
    }
  }

  // Market condition adjustment
  const condPerf = memory.conditionPerformance[condition];
  if (condPerf) {
    const condTotal = condPerf.wins + condPerf.losses;
    if (condTotal >= 3) {
      const condWinRate = condPerf.wins / condTotal;
      adjusted += (condWinRate - 0.5) * 15; // ±7.5% adjustment
    }
    // Penalty for known difficult conditions
    if (condition === "sideways") adjusted -= 5;
    if (condition === "low_liquidity") adjusted -= 8;
    if (condition === "volatile") adjusted -= 3;
  }

  // Indicator weight adjustment
  if (indicatorsActive.length > 0) {
    const avgWeight = indicatorsActive.reduce((sum, k) => {
      return sum + (memory.indicatorStats[k]?.weight ?? 1.0);
    }, 0) / indicatorsActive.length;
    adjusted *= avgWeight;
  }

  // Strategy weight adjustment
  if (strategy && memory.strategyWeights[strategy]) {
    adjusted *= memory.strategyWeights[strategy].weight;
  }

  // Consecutive loss penalty
  if (memory.consecutiveLosses >= 3) adjusted -= memory.consecutiveLosses * 3;

  return Math.max(10, Math.min(98, Math.round(adjusted)));
}

// ─── Check symbol eligibility ──────────────────────────────────────────────────

export function isSymbolEligible(symbol: string): { eligible: boolean; reason?: string } {
  const perf = memory.symbolPerformance[symbol];
  if (!perf) return { eligible: true };
  if (perf.avoidUntil && Date.now() < perf.avoidUntil) {
    const minsLeft = Math.round((perf.avoidUntil - Date.now()) / 60000);
    return { eligible: false, reason: `Brain menghindari ${symbol} (${perf.consecutiveLosses}x loss berturut) — tunggu ${minsLeft} menit` };
  }
  return { eligible: true };
}

// ─── Analysis Text Generation ─────────────────────────────────────────────────

export interface AssetAnalysisInput {
  symbol: string;
  name: string;
  assetType: "crypto" | "stock";
  currentPrice: number;
  priceChange24h: number;
  priceChange7d?: number | null;
  signal?: string;
  confidence?: number;
  rsi?: number;
  macd?: { value: number; signal: number; histogram: number; bullish: boolean };
  volume?: number | null;
  marketCap?: number | null;
  high24h?: number | null;
  low24h?: number | null;
}

export function generateAssetAnalysis(data: AssetAnalysisInput): string {
  const condition = detectMarketCondition({
    priceChange24h: data.priceChange24h,
    priceChange7d: data.priceChange7d,
    rsi: data.rsi,
    volumeRatio: null,
  });

  const symPerf = memory.symbolPerformance[data.symbol];
  const winRate = memory.totalPredictions > 0
    ? ((memory.totalWins / memory.totalPredictions) * 100).toFixed(1)
    : null;
  const condPerf = memory.conditionPerformance[condition];
  const condTotal = condPerf.wins + condPerf.losses;
  const condWinRate = condTotal > 0 ? ((condPerf.wins / condTotal) * 100).toFixed(1) : null;

  const isAvoid = symPerf?.avoidUntil && Date.now() < symPerf.avoidUntil;

  const lines: string[] = [];

  // Header
  lines.push(`🧠 **ANALISIS AI BRAIN — ${data.name} (${data.symbol.toUpperCase()})**`);
  lines.push(`📊 Kondisi Pasar: **${formatCondition(condition)}**`);
  lines.push(`💰 Harga: ${data.assetType === "crypto" ? `$${data.currentPrice.toLocaleString("en-US", { maximumFractionDigits: 6 })}` : `Rp ${data.currentPrice.toLocaleString("id-ID")}`} | 24h: ${data.priceChange24h >= 0 ? "+" : ""}${data.priceChange24h.toFixed(2)}%`);
  lines.push("");

  // Brain memory insight
  if (memory.totalPredictions > 0) {
    lines.push(`📈 **Memori Brain:** ${memory.totalPredictions} prediksi | Win Rate: ${winRate}% | Siklus Belajar: ${memory.learningCycles}`);
    if (condWinRate) {
      lines.push(`🎯 **Akurasi di kondisi ${formatCondition(condition)}:** ${condWinRate}% (dari ${condTotal} prediksi)`);
    }
  } else {
    lines.push(`📈 **Memori Brain:** Masih mengumpulkan data — prediksi berdasarkan analisis teknikal murni.`);
  }

  // Symbol-specific insight
  if (symPerf && symPerf.wins + symPerf.losses >= 3) {
    const symTotal = symPerf.wins + symPerf.losses;
    const symWR = ((symPerf.wins / symTotal) * 100).toFixed(1);
    lines.push(`🔍 **${data.symbol} History:** ${symTotal} trade | WR ${symWR}% | PnL akumulasi: ${symPerf.totalPnl >= 0 ? "+" : ""}${symPerf.totalPnl.toFixed(2)}%`);
  }
  lines.push("");

  // Technical indicators
  lines.push(`**📉 ANALISIS TEKNIKAL:**`);
  if (data.rsi != null) {
    const rsiStat = memory.indicatorStats[data.rsi < 40 ? "rsi_oversold" : data.rsi > 60 ? "rsi_overbought" : ""];
    const rsiAccuracy = rsiStat && rsiStat.total > 0 ? ` [akurasi: ${((rsiStat.correct / rsiStat.total) * 100).toFixed(0)}%]` : "";
    const rsiLabel = data.rsi < 30 ? "Sangat Oversold ⚡" : data.rsi < 45 ? "Oversold" : data.rsi > 70 ? "Sangat Overbought ⚠️" : data.rsi > 55 ? "Overbought" : "Netral";
    lines.push(`• RSI: ${data.rsi.toFixed(1)} — ${rsiLabel}${rsiAccuracy}`);
  }
  if (data.macd) {
    const macdKey = data.macd.bullish ? "macd_bullish" : "macd_bearish";
    const macdStat = memory.indicatorStats[macdKey];
    const macdAccuracy = macdStat && macdStat.total > 0 ? ` [akurasi: ${((macdStat.correct / macdStat.total) * 100).toFixed(0)}%]` : "";
    lines.push(`• MACD: ${data.macd.bullish ? "Bullish 📈" : "Bearish 📉"} | Histogram: ${data.macd.histogram.toFixed(4)}${macdAccuracy}`);
  }
  if (data.high24h && data.low24h) {
    const range = ((data.high24h - data.low24h) / data.low24h * 100).toFixed(2);
    lines.push(`• Range 24h: H $${data.high24h.toLocaleString()} | L $${data.low24h.toLocaleString()} | Spread: ${range}%`);
  }
  lines.push("");

  // Market condition analysis
  lines.push(`**🌐 KONDISI PASAR — ${formatCondition(condition).toUpperCase()}:**`);
  lines.push(getConditionAnalysis(condition, data.priceChange24h));
  lines.push("");

  // Warning if symbol avoided
  if (isAvoid) {
    const minsLeft = Math.round((symPerf!.avoidUntil! - Date.now()) / 60000);
    lines.push(`⛔ **PERINGATAN BRAIN:** ${data.symbol} sedang dihindari karena ${symPerf!.consecutiveLosses}x loss berturut. Tunggu ${minsLeft} menit sebelum pertimbangkan entry.`);
    lines.push("");
  }

  // Signal assessment
  const sig = data.signal;
  const conf = data.confidence;
  if (sig && conf != null) {
    lines.push(`**🎯 PENILAIAN SINYAL:**`);
    if (conf >= 80 && !isAvoid && condition !== "sideways" && condition !== "low_liquidity") {
      lines.push(`✅ Setup **${sig.toUpperCase().replace(/_/g, " ")}** dengan confidence ${conf}% — Brain mempertimbangkan VALID untuk entry.`);
      lines.push(`📌 Saran: Konfirmasi dengan volume dan struktur sebelum eksekusi.`);
    } else if (conf >= 60) {
      lines.push(`⚠️ Sinyal **${sig.toUpperCase().replace(/_/g, " ")}** dengan confidence ${conf}% — **TUNGGU konfirmasi lebih kuat.**`);
      lines.push(`📌 Kondisi ${formatCondition(condition)} tidak ideal. Brain merekomendasikan observasi dahulu.`);
    } else {
      lines.push(`❌ Confidence ${conf}% terlalu rendah. **Brain merekomendasikan TIDAK ENTRY saat ini.**`);
      lines.push(`📌 Tunggu setup yang lebih jelas dan kondisi pasar yang lebih favorable.`);
    }
    lines.push("");
  }

  // Recent lessons from mistakes
  const recentMistakes = memory.mistakes.filter(m => m.symbol === data.symbol).slice(0, 2);
  if (recentMistakes.length > 0) {
    lines.push(`**📚 PELAJARAN DARI KESALAHAN LALU (${data.symbol}):**`);
    for (const m of recentMistakes) {
      lines.push(`• ${m.lesson}`);
      lines.push(`  → Koreksi: ${m.correctedApproach}`);
    }
    lines.push("");
  }

  // Footer
  lines.push(`*⚠️ Analisis ini bersifat edukatif. Brain terus belajar dari setiap outcome. Bukan saran investasi.*`);

  return lines.join("\n");
}

export function generateMarketSummary(data: {
  fearGreedIndex: number;
  fearGreedLabel: string;
  btcDominance: number;
  totalMarketCap: number;
  marketCapChange24h: number;
  topMovers?: Array<{ name: string; symbol: string; change: number }>;
}): string {
  const winRate = memory.totalPredictions > 0
    ? ((memory.totalWins / memory.totalPredictions) * 100).toFixed(1)
    : null;

  const topIndicators = Object.entries(memory.indicatorStats)
    .filter(([, s]) => s.total >= 3)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 3);

  const weakIndicators = Object.entries(memory.indicatorStats)
    .filter(([, s]) => s.total >= 3 && s.weight < 0.7)
    .map(([, s]) => s.name);

  const lines: string[] = [];
  lines.push(`🧠 **RINGKASAN PASAR — PERSPEKTIF AI BRAIN**`);
  lines.push("");

  // Market overview
  lines.push(`**📊 Kondisi Global:**`);
  lines.push(`• Fear & Greed: ${data.fearGreedIndex} (${data.fearGreedLabel})`);
  lines.push(`• BTC Dominance: ${data.btcDominance.toFixed(1)}%`);
  lines.push(`• Market Cap: $${(data.totalMarketCap / 1e9).toFixed(0)}B (${data.marketCapChange24h >= 0 ? "+" : ""}${data.marketCapChange24h?.toFixed(2) ?? "N/A"}% 24h)`);

  if (data.topMovers && data.topMovers.length > 0) {
    const movers = data.topMovers.slice(0, 5).map(m => `${m.symbol} ${m.change >= 0 ? "+" : ""}${m.change.toFixed(1)}%`).join(" | ");
    lines.push(`• Top Movers: ${movers}`);
  }
  lines.push("");

  // Brain performance
  if (memory.totalPredictions > 0) {
    lines.push(`**🧠 Status Brain:**`);
    lines.push(`• Total Prediksi: ${memory.totalPredictions} | Win Rate: ${winRate}%`);
    lines.push(`• Siklus Belajar: ${memory.learningCycles} | Kesalahan Tercatat: ${memory.mistakes.length}`);
    lines.push(`• Win Streak Terbaik: ${memory.bestWinStreak} | Drawdown Maks: ${memory.maxDrawdownSeen.toFixed(2)}%`);

    if (topIndicators.length > 0) {
      lines.push(`• Indikator Terkuat: ${topIndicators.map(([, s]) => `${s.name} (${(s.weight * 100).toFixed(0)}%)`).join(", ")}`);
    }
    if (weakIndicators.length > 0) {
      lines.push(`• ⚠️ Indikator Lemah (dikurangi bobotnya): ${weakIndicators.join(", ")}`);
    }
    lines.push("");
  }

  // Market assessment
  const fearGreedLevel = data.fearGreedIndex;
  lines.push(`**🎯 PENILAIAN BRAIN:**`);

  if (fearGreedLevel < 25) {
    lines.push(`Pasar berada di zona EXTREME FEAR (${fearGreedLevel}). Institutional biasanya akumulasi di zona ini.`);
    lines.push(`Brain mencatat: kondisi fear ekstrem historis memberikan setup LONG berkualitas tinggi — namun perlu konfirmasi reversal.`);
  } else if (fearGreedLevel < 45) {
    lines.push(`Fear & Greed ${fearGreedLevel} menunjukkan ketidakpastian pasar. Brain merekomendasikan selektif dan sabar.`);
  } else if (fearGreedLevel > 75) {
    lines.push(`EXTREME GREED (${fearGreedLevel}). Risiko distribusi institusional meningkat. Brain lebih waspada untuk setup LONG baru.`);
    lines.push(`Perhatikan tanda-tanda reversal: volume divergence, rejection candle, BTC dominance changes.`);
  } else {
    lines.push(`Kondisi pasar relatif netral (Fear & Greed: ${fearGreedLevel}). Fokus pada setup individual berkualitas tinggi.`);
  }

  if (data.btcDominance > 60) {
    lines.push(`BTC dominance ${data.btcDominance.toFixed(1)}% tinggi — altcoin cenderung melemah. Fokus ke BTC/ETH.`);
  } else if (data.btcDominance < 45) {
    lines.push(`BTC dominance ${data.btcDominance.toFixed(1)}% rendah — potensi altseason. Monitor altcoin momentum.`);
  }
  lines.push("");

  // Risk warning
  if (memory.consecutiveLosses >= 2) {
    lines.push(`⚠️ **PERINGATAN RISK:** Brain mencatat ${memory.consecutiveLosses}x loss berturut. Kurangi ukuran posisi dan tingkatkan threshold confidence.`);
  } else {
    lines.push(`📌 Gunakan confluence minimal 3+ konfirmasi sebelum entry. Sabar adalah senjata utama.`);
  }

  lines.push(`\n*Brain terus belajar dari setiap outcome. Total ${memory.learningCycles} siklus pembelajaran aktif.*`);
  return lines.join("\n");
}

function formatCondition(c: MarketCondition): string {
  const map: Record<MarketCondition, string> = {
    trending_up: "Trending Naik",
    trending_down: "Trending Turun",
    sideways: "Sideways / Ranging",
    volatile: "Volatilitas Tinggi",
    low_liquidity: "Likuiditas Rendah",
  };
  return map[c] ?? c;
}

function getConditionAnalysis(c: MarketCondition, change24h: number): string {
  switch (c) {
    case "trending_up":
      return `Pasar dalam tren naik kuat (+${change24h.toFixed(2)}% 24h). Setup LONG lebih favorable. Hindari FOMO — tunggu pullback ke support sebelum entry. Brain mendeteksi momentum bullish aktif.`;
    case "trending_down":
      return `Pasar dalam tren turun (${change24h.toFixed(2)}% 24h). Setup SHORT lebih favorable. Hati-hati dengan dead cat bounce yang bisa menjebak. Brain merekomendasikan konfirmasi BOS sebelum SHORT.`;
    case "sideways":
      return `Pasar ranging / sideways. Hindari directional trade kecuali ada breakout yang dikonfirmasi volume. Brain secara historis kurang akurat di kondisi sideways — turunkan position size.`;
    case "volatile":
      return `Volatilitas tinggi terdeteksi. Spread melebar, slippage meningkat. Brain merekomendasikan: kurangi leverage, perkecil posisi, atau hindari trading hingga volatilitas mereda.`;
    case "low_liquidity":
      return `Likuiditas rendah — manipulasi dan fake breakout lebih mudah terjadi. Brain sangat berhati-hati di kondisi ini. Hindari entry besar, gunakan limit order, tunggu volume normal kembali.`;
  }
}

// ─── AI Chat — Brain-powered responses ───────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function generateChatResponse(messages: ChatMessage[], context?: AssetAnalysisInput): string {
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg) return "Silakan ketik pertanyaan Anda.";

  const userText = lastMsg.content.toLowerCase();
  const winRate = memory.totalPredictions > 0
    ? ((memory.totalWins / memory.totalPredictions) * 100).toFixed(1)
    : null;

  // Context-aware response
  if (context) {
    const condition = detectMarketCondition({
      priceChange24h: context.priceChange24h,
      priceChange7d: context.priceChange7d,
      rsi: context.rsi,
      volumeRatio: null,
    });

    if (userText.includes("entry") || userText.includes("beli") || userText.includes("masuk")) {
      const symPerf = memory.symbolPerformance[context.symbol];
      const isAvoid = symPerf?.avoidUntil && Date.now() < symPerf.avoidUntil;

      if (isAvoid) {
        return `⛔ Brain merekomendasikan **JANGAN ENTRY** ${context.symbol} saat ini.\n\nBrain mencatat ${symPerf!.consecutiveLosses}x loss berturut pada pair ini. Sistem secara otomatis menghindari pair ini untuk mencegah kerugian lebih lanjut.\n\nTunggu hingga pattern berubah dan brain memberikan clearance.`;
      }

      if (condition === "sideways") {
        return `⚠️ Kondisi ${context.symbol} saat ini **SIDEWAYS/RANGING**.\n\nBrain merekomendasikan menunggu. Entry di kondisi ranging berisiko tinggi kena whipsaw.\n\nTunggu:\n• Breakout dari range yang dikonfirmasi volume\n• RSI keluar dari zona 40-60\n• Candle momentum yang kuat\n\nSabar adalah senjata terbaik institutional trader.`;
      }

      if (context.confidence != null && context.confidence >= 80) {
        const adj = adjustConfidence(context.confidence, context.symbol, condition, [], context.signal);
        return `📊 **Analisis Entry ${context.name}:**\n\nConfidence dasar: ${context.confidence}%\nConfidence Brain (disesuaikan): **${adj}%**\n\nKondisi: ${formatCondition(condition)}\nRSI: ${context.rsi?.toFixed(1) ?? "N/A"}\n\n${adj >= 75 ? "✅ Setup terlihat valid. Konfirmasi volume sebelum entry." : "⚠️ Brain mengurangi confidence berdasarkan history. Tunggu konfirmasi lebih kuat."}\n\n${winRate ? `Win rate brain saat ini: ${winRate}%` : "Brain masih dalam fase belajar awal."}`;
      }
    }

    if (userText.includes("analisis") || userText.includes("signal") || userText.includes("prediksi")) {
      return generateAssetAnalysis(context);
    }
  }

  // General questions
  if (userText.includes("brain") || userText.includes("belajar") || userText.includes("akurasi")) {
    return `🧠 **Status AI Brain:**\n\n• Prediksi total: ${memory.totalPredictions}\n• Win Rate: ${winRate ?? "Belum ada data"}%\n• Siklus belajar: ${memory.learningCycles}\n• Kesalahan tercatat: ${memory.mistakes.length}\n• Loss berturut saat ini: ${memory.consecutiveLosses}\n• Win streak terbaik: ${memory.bestWinStreak}\n\nBrain terus belajar dari setiap outcome. Semakin banyak prediksi divalidasi, semakin akurat analisisnya.`;
  }

  if (userText.includes("kesalahan") || userText.includes("mistake") || userText.includes("salah")) {
    const recent = memory.mistakes.slice(0, 3);
    if (recent.length === 0) return "Brain belum mencatat kesalahan. Buat prediksi dan validasi outcomenya untuk mulai proses pembelajaran.";
    const lines = ["📚 **Kesalahan Terkini yang Dipelajari Brain:**\n"];
    for (const m of recent) {
      lines.push(`**${m.symbol} ${m.direction}** (${m.result}) — ${new Date(m.timestamp).toLocaleDateString("id-ID")}`);
      lines.push(`• ${m.lesson}`);
      lines.push(`• Koreksi: ${m.correctedApproach}\n`);
    }
    return lines.join("\n");
  }

  if (userText.includes("risk") || userText.includes("drawdown") || userText.includes("loss")) {
    const lines = [
      `⚠️ **Manajemen Risiko Brain:**`,
      ``,
      `• Loss berturut saat ini: ${memory.consecutiveLosses}x`,
      memory.consecutiveLosses >= 3 ? `• ⛔ PERINGATAN: Kurangi posisi 50% atau hentikan trading sementara!` : `• Status normal — lanjutkan dengan disiplin.`,
      `• Max drawdown tercatat: ${memory.maxDrawdownSeen.toFixed(2)}%`,
      ``,
      `**Aturan Brain:**`,
      `• 3x loss berturut → kurangi ukuran posisi 50%`,
      `• 5x loss berturut → berhenti trading hari ini`,
      `• Pair dengan 3x consecutive loss → dihindari 2 jam`,
      `• Confidence < 70% → selalu tunggu konfirmasi`,
    ];
    return lines.join("\n");
  }

  // Fallback contextual response
  const responses = [
    `Sebagai AI Brain yang belajar dari ${memory.totalPredictions} prediksi, saya merekomendasikan selalu menunggu confluence minimum 3 indikator sebelum entry. Patience adalah keunggulan utama institutional trader.`,
    `Brain mencatat ${memory.mistakes.length} kesalahan yang telah dianalisis. Setiap loss adalah data pembelajaran. Yang penting: jangan ulangi pola yang sama.`,
    `Strategi terbaik saat ini berdasarkan data brain: ${getTopStrategy()}. Fokus pada pair dan kondisi yang memiliki histori win rate tertinggi.`,
    `Ingat: Brain terus adaptif. Semakin banyak prediksi divalidasi, semakin presisi rekomendasinya. Gunakan prediction lock untuk memberi brain data training yang akurat.`,
  ];

  return responses[Math.floor(Date.now() / 10000) % responses.length];
}

function getTopStrategy(): string {
  const strategies = Object.values(memory.strategyWeights)
    .filter(s => s.wins + s.losses >= 3)
    .sort((a, b) => b.weight - a.weight);
  if (strategies.length === 0) return "Belum ada data strategi yang cukup";
  return strategies[0].name;
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export function getBrainStats() {
  const winRate = memory.totalPredictions > 0
    ? (memory.totalWins / memory.totalPredictions) * 100
    : 0;

  const topIndicators = Object.entries(memory.indicatorStats)
    .filter(([, s]) => s.total >= 2)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 5)
    .map(([key, s]) => ({
      key,
      name: s.name,
      accuracy: s.total > 0 ? (s.correct / s.total) * 100 : 0,
      weight: s.weight,
      total: s.total,
    }));

  const topSymbols = Object.values(memory.symbolPerformance)
    .filter(p => p.wins + p.losses >= 3)
    .sort((a, b) => {
      const aWR = a.wins / (a.wins + a.losses);
      const bWR = b.wins / (b.wins + b.losses);
      return bWR - aWR;
    })
    .slice(0, 5);

  const strategyRanking = Object.values(memory.strategyWeights)
    .filter(s => s.wins + s.losses >= 3)
    .sort((a, b) => b.weight - a.weight);

  return {
    totalPredictions: memory.totalPredictions,
    totalWins: memory.totalWins,
    totalLosses: memory.totalLosses,
    winRate,
    learningCycles: memory.learningCycles,
    mistakeCount: memory.mistakes.length,
    successPatternCount: memory.successPatterns.length,
    consecutiveLosses: memory.consecutiveLosses,
    maxDrawdownSeen: memory.maxDrawdownSeen,
    bestWinStreak: memory.bestWinStreak,
    currentWinStreak: memory.currentWinStreak,
    lastUpdated: memory.lastUpdated,
    topIndicators,
    topSymbols,
    strategyRanking,
    conditionPerformance: memory.conditionPerformance,
    recentMistakes: memory.mistakes.slice(0, 20),
    recentSuccessPatterns: memory.successPatterns.slice(0, 10),
  };
}

export function getBrainMemory(): BrainMemory {
  return { ...memory };
}

export function resetBrainMemory() {
  memory = createDefaultMemory();
  saveBrain();
  logger.info("AI brain memory reset");
}
