/**
 * Institutional-Grade AI Engine — lapisan institutional di atas analysis.ts
 *
 * Menambahkan:
 * - Klasifikasi kondisi pasar (trending/choppy/volatile/manipulation/breakout/reversal)
 * - Scoring kepercayaan berbasis kondisi
 * - Live AI Activity Status (apa yang sedang AI pikirkan)
 * - Trailing stop ATR-based
 * - Dynamic risk management berbasis streak dan drawdown
 * - Smart opportunity switching
 * - Liquidity sweep & orderflow detection
 */

import { analyzeSymbol, type FullAnalysis } from "./analysis.js";
import { logger } from "../lib/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MarketConditionType =
  | "trending_up_strong"
  | "trending_up_normal"
  | "trending_down_strong"
  | "trending_down_normal"
  | "ranging"
  | "choppy"
  | "volatile"
  | "breakout"
  | "reversal"
  | "manipulation";

export const CONDITION_LABEL: Record<MarketConditionType, string> = {
  trending_up_strong:   "Tren Naik Kuat ↑↑",
  trending_up_normal:   "Tren Naik ↑",
  trending_down_strong: "Tren Turun Kuat ↓↓",
  trending_down_normal: "Tren Turun ↓",
  ranging:              "Ranging / Sideways",
  choppy:               "Choppy (Hindari)",
  volatile:             "Volatil (Waspada)",
  breakout:             "Breakout",
  reversal:             "Potensi Reversal",
  manipulation:         "Manipulasi (Skip)",
};

export interface MarketConditionResult {
  condition: MarketConditionType;
  confidenceModifier: number;   // -30 to +20
  leverageModifier: number;     // 0.2–1.0
  positionSizeModifier: number; // 0.1–1.0
  shouldTrade: boolean;
  reason: string;
  score: number;                // raw condition quality 0-100
}

export interface InstitutionalResult extends FullAnalysis {
  marketCondition: MarketConditionType;
  conditionLabel: string;
  conditionModifier: number;
  institutionalConfidence: number;
  institutionalShouldTrade: boolean;
  opportunityScore: number; // 0-100 composite
  conditionReason: string;
  liquiditySweep: { detected: boolean; direction: "up" | "down" | null; note: string | null };
  orderflowBias: "bullish" | "bearish" | "neutral";
  momentumStrength: number; // 0-100
  dynamicRisk?: DynamicRiskResult;
}

export interface TrailingStopResult {
  newSL: number;
  activated: boolean;
  movedToBreakeven: boolean;
  tightened: boolean;
  note: string | null;
}

export interface DynamicRiskResult {
  positionUSDT: number;
  leverage: number;
  riskMultiplier: number;
  reason: string;
  shouldTrade: boolean;
  alertLevel: "normal" | "caution" | "danger" | "stop";
}

export interface OpportunityScore {
  symbol: string;
  side: "Buy" | "Sell" | null;
  confidence: number;
  opportunityScore: number;
  marketCondition: MarketConditionType;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  reasons: string[];
}

export interface SwitchDecision {
  shouldSwitch: boolean;
  reason: string;
  newSymbol: string | null;
  newOpportunityScore: number;
  currentOpportunityScore: number;
}

// ─── AI Activity Status ───────────────────────────────────────────────────────

export type AIPhase =
  | "idle" | "scanning" | "filtering" | "analyzing" | "confirming"
  | "waiting" | "executing" | "monitoring" | "switching" | "protecting" | "exiting";

export const PHASE_LABEL: Record<AIPhase, string> = {
  idle:       "⚪ Standby",
  scanning:   "🔍 Memindai Pasar",
  filtering:  "📊 Menyaring Kandidat",
  analyzing:  "🧠 Menganalisis Mendalam",
  confirming: "✔ Mengkonfirmasi Setup",
  waiting:    "⏳ Menunggu Konfirmasi",
  executing:  "⚡ Mengeksekusi Trade",
  monitoring: "👁 Memantau Posisi",
  switching:  "🔄 Rotasi Modal",
  protecting: "🛡 Mengamankan Profit",
  exiting:    "🚪 Menutup Posisi",
};

export interface AIActivityStatus {
  phase: AIPhase;
  phaseLabel: string;
  symbol: string | null;
  step: string;
  detail: string;
  progress: number; // 0-100
  findings: string[];
  warnings: string[];
  marketCondition: MarketConditionType | null;
  marketConditionLabel: string;
  scanStats: {
    totalScanned: number;
    qualified: number;
    skipped: number;
    lastUpdated: number;
  };
  updatedAt: number;
  cycleId: string;
}

let _aiStatus: AIActivityStatus = {
  phase: "idle",
  phaseLabel: PHASE_LABEL.idle,
  symbol: null,
  step: "Engine standby",
  detail: "Menunggu aktifasi",
  progress: 0,
  findings: [],
  warnings: [],
  marketCondition: null,
  marketConditionLabel: "",
  scanStats: { totalScanned: 0, qualified: 0, skipped: 0, lastUpdated: 0 },
  updatedAt: Date.now(),
  cycleId: "",
};

export function getAIStatus(): AIActivityStatus { return { ..._aiStatus }; }

export function setAIStatus(update: Partial<AIActivityStatus>) {
  _aiStatus = {
    ..._aiStatus,
    ...update,
    updatedAt: Date.now(),
    phaseLabel: PHASE_LABEL[update.phase ?? _aiStatus.phase],
  };
}

// Convenience helpers for demo engine to call
export const aiLog = {
  idle: () => setAIStatus({ phase: "idle", symbol: null, step: "Engine standby", detail: "Menunggu siklus berikutnya", progress: 0, findings: [], warnings: [] }),
  scanning: (n: number) => setAIStatus({ phase: "scanning", symbol: null, step: `Memindai ${n} pair di universe Bybit...`, detail: "Mengumpulkan kandidat awal berdasarkan pergerakan harga & volume", progress: 5, findings: [], warnings: [] }),
  filtering: (candidates: number, total: number) => setAIStatus({ phase: "filtering", symbol: null, step: `Menyaring ${candidates} kandidat dari ${total} pair`, detail: "Mengeliminasi pair dengan confidence rendah & kondisi pasar buruk", progress: 25, findings: [] }),
  analyzing: (sym: string, step: string, progress: number, findings: string[] = []) => setAIStatus({ phase: "analyzing", symbol: sym, step, detail: `Analisis institusional: ${sym}`, progress, findings }),
  checkTrend: (sym: string) => setAIStatus({ phase: "analyzing", symbol: sym, step: `[${sym}] Memeriksa tren multi-timeframe (1m/5m/15m/1h)...`, detail: "EMA alignment, market structure, HH/HL/LH/LL", progress: 35 }),
  checkVolume: (sym: string) => setAIStatus({ phase: "analyzing", symbol: sym, step: `[${sym}] Menganalisis volume & orderflow...`, detail: "Volume ratio, OI change, funding rate bias", progress: 45 }),
  checkSMC: (sym: string) => setAIStatus({ phase: "analyzing", symbol: sym, step: `[${sym}] Smart Money Concepts — order block & liquidity sweep...`, detail: "Supply/demand zones, fake breakout, BOS detection", progress: 55 }),
  checkMomentum: (sym: string) => setAIStatus({ phase: "analyzing", symbol: sym, step: `[${sym}] Momentum check — RSI, MACD, divergence...`, detail: "RSI zone, MACD crossover, candle patterns", progress: 65 }),
  confirming: (sym: string, conf: number, reasons: string[]) => setAIStatus({ phase: "confirming", symbol: sym, step: `[${sym}] Setup dikonfirmasi — confidence ${conf}%`, detail: "Semua indikator divalidasi, persiapan entry", progress: 80, findings: reasons.slice(0, 5) }),
  waiting: (reason: string) => setAIStatus({ phase: "waiting", symbol: null, step: "Menunggu — kondisi tidak ideal", detail: reason, progress: 50, findings: [] }),
  noSetup: (reason: string) => setAIStatus({ phase: "idle", symbol: null, step: "Tidak ada setup valid ditemukan", detail: reason, progress: 100, findings: [] }),
  executing: (sym: string, side: string, price: number, conf: number) => setAIStatus({ phase: "executing", symbol: sym, step: `Membuka posisi DEMO ${side} ${sym}`, detail: `Entry: $${price.toFixed(4)} | Confidence: ${conf}%`, progress: 90, findings: [] }),
  monitoring: (n: number, pnl: number, trailActive: boolean) => setAIStatus({
    phase: "monitoring", symbol: null,
    step: `Memantau ${n} posisi aktif`,
    detail: `Unrealized PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}${trailActive ? " | Trailing stop aktif" : ""}`,
    progress: 100, findings: []
  }),
  protecting: (sym: string, note: string) => setAIStatus({ phase: "protecting", symbol: sym, step: `[${sym}] Mengamankan profit — trailing stop bergerak`, detail: note, progress: 88 }),
  switching: (from: string, to: string, gain: number) => setAIStatus({ phase: "switching", symbol: to, step: `Rotasi modal: ${from} → ${to}`, detail: `Peluang baru lebih baik (+${gain} pts confidence). Mengamankan profit dan masuk setup baru.`, progress: 82 }),
  exiting: (sym: string, reason: string, pnl: number) => setAIStatus({ phase: "exiting", symbol: sym, step: `Menutup posisi ${sym}`, detail: `${reason} | PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`, progress: 95 }),
};

// ─── Market Condition Classifier ─────────────────────────────────────────────

export function classifyMarketCondition(analysis: FullAnalysis): MarketConditionResult {
  const { indicators, marketStructure, macdData, multiTimeframe, fakeBreakout, overallConfidence, warnings, rsiDivergence } = analysis;
  const { emaAlignment, rsi14: rsiVal, volumeRatio, atr14 } = indicators;
  const atrPct = (atr14 / analysis.entryPrice) * 100;

  const tfValues = Object.values(multiTimeframe);
  const tfBullish = tfValues.filter(t => t.trend === "up").length;
  const tfBearish = tfValues.filter(t => t.trend === "down").length;
  const tfTotal = Math.max(tfValues.length, 1);

  const isManipulation =
    fakeBreakout.isFakeBreakoutUp || fakeBreakout.isFakeBreakoutDown ||
    (volumeRatio > 5 && warnings.some(w => w.toLowerCase().includes("fake")));

  const isHighVolatility = atrPct > 4;
  const isMediumVolatility = atrPct > 2.5;

  const isChoppy =
    Math.abs(rsiVal - 50) < 10 &&
    Math.abs(tfBullish - tfBearish) <= 1 &&
    marketStructure.structure === "ranging" &&
    volumeRatio < 1.2;

  const tfAlignmentStrong = tfBullish >= 3 || tfBearish >= 3;
  const isStrongTrend =
    tfAlignmentStrong &&
    emaAlignment !== "mixed" &&
    (marketStructure.structure === "bullish" || marketStructure.structure === "bearish");

  const isBreakout = volumeRatio > 2.2 && !isHighVolatility && macdData.crossover !== "none";

  const isReversal =
    (indicators.rsiZone === "overbought" && rsiDivergence === "bearish") ||
    (indicators.rsiZone === "oversold" && rsiDivergence === "bullish");

  if (isManipulation) {
    return { condition: "manipulation", confidenceModifier: -30, leverageModifier: 0.2, positionSizeModifier: 0.2, shouldTrade: false, reason: "Manipulasi terdeteksi — fake breakout / volume anomali ekstrem", score: 5 };
  }
  if (isHighVolatility && isChoppy) {
    return { condition: "volatile", confidenceModifier: -22, leverageModifier: 0.25, positionSizeModifier: 0.25, shouldTrade: false, reason: `Volatil + Choppy (ATR ${atrPct.toFixed(1)}%) — hindari trading`, score: 10 };
  }
  if (isChoppy) {
    return { condition: "choppy", confidenceModifier: -28, leverageModifier: 0.3, positionSizeModifier: 0.3, shouldTrade: false, reason: "Pasar choppy — konflik TF, RSI sideways, volume rendah", score: 15 };
  }
  if (isHighVolatility) {
    return { condition: "volatile", confidenceModifier: -15, leverageModifier: 0.35, positionSizeModifier: 0.35, shouldTrade: overallConfidence >= 85, reason: `Volatilitas tinggi ATR ${atrPct.toFixed(1)}% — kurangi size & leverage secara signifikan`, score: 30 };
  }
  if (isBreakout && tfBullish > tfBearish) {
    return { condition: "breakout", confidenceModifier: +12, leverageModifier: 0.85, positionSizeModifier: 0.85, shouldTrade: true, reason: `Breakout bullish — volume ${volumeRatio.toFixed(1)}x + MACD ${macdData.crossover}`, score: 80 };
  }
  if (isBreakout && tfBearish > tfBullish) {
    return { condition: "breakout", confidenceModifier: +12, leverageModifier: 0.85, positionSizeModifier: 0.85, shouldTrade: true, reason: `Breakout bearish — volume ${volumeRatio.toFixed(1)}x + MACD ${macdData.crossover}`, score: 80 };
  }
  if (isReversal) {
    return { condition: "reversal", confidenceModifier: +8, leverageModifier: 0.7, positionSizeModifier: 0.7, shouldTrade: overallConfidence >= 78, reason: "Reversal potensial — divergensi RSI di level ekstrem", score: 70 };
  }
  if (isStrongTrend && tfBullish > tfBearish) {
    return { condition: "trending_up_strong", confidenceModifier: +18, leverageModifier: 1.0, positionSizeModifier: 1.0, shouldTrade: true, reason: `Tren naik kuat — ${tfBullish}/${tfTotal} TF bullish, struktur HH+HL`, score: 90 };
  }
  if (isStrongTrend && tfBearish > tfBullish) {
    return { condition: "trending_down_strong", confidenceModifier: +18, leverageModifier: 1.0, positionSizeModifier: 1.0, shouldTrade: true, reason: `Tren turun kuat — ${tfBearish}/${tfTotal} TF bearish, struktur LH+LL`, score: 90 };
  }
  if (tfBullish > tfBearish && emaAlignment === "bullish") {
    return { condition: "trending_up_normal", confidenceModifier: +10, leverageModifier: 0.85, positionSizeModifier: 0.9, shouldTrade: true, reason: `Tren naik moderat — ${tfBullish}/${tfTotal} TF + EMA bullish`, score: 72 };
  }
  if (tfBearish > tfBullish && emaAlignment === "bearish") {
    return { condition: "trending_down_normal", confidenceModifier: +10, leverageModifier: 0.85, positionSizeModifier: 0.9, shouldTrade: true, reason: `Tren turun moderat — ${tfBearish}/${tfTotal} TF + EMA bearish`, score: 72 };
  }
  if (isMediumVolatility) {
    return { condition: "volatile", confidenceModifier: -8, leverageModifier: 0.6, positionSizeModifier: 0.6, shouldTrade: overallConfidence >= 82, reason: `Volatilitas sedang (ATR ${atrPct.toFixed(1)}%) — kurangi leverage`, score: 45 };
  }
  return { condition: "ranging", confidenceModifier: -12, leverageModifier: 0.55, positionSizeModifier: 0.55, shouldTrade: overallConfidence >= 84, reason: "Ranging — tidak ada arah jelas, tunggu breakout atau konfirmasi kuat", score: 40 };
}

// ─── Liquidity Sweep Detector ─────────────────────────────────────────────────

function detectLiquiditySweep(analysis: FullAnalysis): { detected: boolean; direction: "up" | "down" | null; note: string | null } {
  const { fakeBreakout, supportResistance, entryPrice } = analysis;
  if (fakeBreakout.isFakeBreakoutUp) {
    return { detected: true, direction: "up", note: `Liquidity sweep resistance $${supportResistance.nearestResistance.toFixed(4)} — smart money beli lebih murah` };
  }
  if (fakeBreakout.isFakeBreakoutDown) {
    return { detected: true, direction: "down", note: `Liquidity sweep support $${supportResistance.nearestSupport.toFixed(4)} — smart money jual lebih mahal` };
  }
  const distRes = (supportResistance.nearestResistance - entryPrice) / entryPrice;
  const distSup = (entryPrice - supportResistance.nearestSupport) / entryPrice;
  if (distSup < 0.003 && analysis.side === "Buy") {
    return { detected: true, direction: "down", note: `Harga baru tap support $${supportResistance.nearestSupport.toFixed(4)} — potensi sweep selesai` };
  }
  if (distRes < 0.003 && analysis.side === "Sell") {
    return { detected: true, direction: "up", note: `Harga baru tap resistance $${supportResistance.nearestResistance.toFixed(4)} — potensi sweep selesai` };
  }
  return { detected: false, direction: null, note: null };
}

// ─── Orderflow Bias ───────────────────────────────────────────────────────────

function getOrderflowBias(analysis: FullAnalysis): "bullish" | "bearish" | "neutral" {
  const { openInterest, fundingRate, indicators } = analysis;
  let bullScore = 0;
  let bearScore = 0;
  if (openInterest) {
    if (openInterest.change > 1.5) bullScore += 2;
    else if (openInterest.change < -1.5) bearScore += 2;
  }
  if (fundingRate) {
    if (fundingRate.rate < -0.02) bullScore += 1;
    else if (fundingRate.rate > 0.05) bearScore += 1;
  }
  if (indicators.priceVsVwap === "above") bullScore += 2;
  else bearScore += 2;
  if (indicators.volumeRatio > 1.5 && analysis.side === "Buy") bullScore += 2;
  if (indicators.volumeRatio > 1.5 && analysis.side === "Sell") bearScore += 2;
  if (bullScore > bearScore + 1) return "bullish";
  if (bearScore > bullScore + 1) return "bearish";
  return "neutral";
}

// ─── Momentum Strength (0-100) ────────────────────────────────────────────────

function getMomentumStrength(analysis: FullAnalysis): number {
  const { macdData, indicators } = analysis;
  let strength = 50;
  if (macdData.crossover === "golden" || macdData.crossover === "death") strength += 20;
  if (macdData.trend !== "neutral") strength += 10;
  if (indicators.volumeRatio > 2) strength += 15;
  else if (indicators.volumeRatio > 1.5) strength += 8;
  const rsiDist = Math.abs(indicators.rsi14 - 50);
  strength += Math.min(15, rsiDist / 3);
  if (analysis.rsiDivergence !== "none") strength += 10;
  return Math.min(100, Math.max(0, strength));
}

// ─── Opportunity Score ────────────────────────────────────────────────────────

function calcOpportunityScore(analysis: FullAnalysis, condition: MarketConditionResult): number {
  if (!analysis.shouldEnter || !analysis.side || !condition.shouldTrade) return 0;
  let score = analysis.overallConfidence + condition.confidenceModifier;
  if (analysis.indicatorAgreementPct >= 80) score += 8;
  if (analysis.confirmations >= 7) score += 6;
  if (analysis.riskRewardRatio >= 3) score += 7;
  else if (analysis.riskRewardRatio >= 2.5) score += 4;
  if (analysis.signalGrade === "A") score += 5;
  if (analysis.rsiDivergence !== "none") score += 6;
  return Math.min(100, Math.max(0, Math.round(score)));
}

// ─── Main Institutional Analysis ─────────────────────────────────────────────

const instCache = new Map<string, { data: InstitutionalResult; at: number }>();
const INST_CACHE_TTL = 28_000; // 28s

export async function analyzeInstitutional(
  symbol: string,
  riskParams?: {
    consecutiveLosses: number;
    drawdownPct: number;
    availableBalance: number;
    maxPositionUSDT: number;
    maxLeverage: number;
  }
): Promise<InstitutionalResult> {
  const cached = instCache.get(symbol);
  if (cached && Date.now() - cached.at < INST_CACHE_TTL) {
    if (riskParams) {
      const dynRisk = calculateDynamicRisk({ ...riskParams, maxConsecutiveLosses: 5 });
      return { ...cached.data, dynamicRisk: dynRisk };
    }
    return cached.data;
  }

  const base = await analyzeSymbol(symbol);
  const condition = classifyMarketCondition(base);
  const liquiditySweep = detectLiquiditySweep(base);
  const orderflowBias = getOrderflowBias(base);
  const momentumStrength = getMomentumStrength(base);
  const institutionalConfidence = Math.min(99, Math.max(5, base.overallConfidence + condition.confidenceModifier));
  const opportunityScore = calcOpportunityScore(base, condition);
  const institutionalShouldTrade =
    base.shouldEnter &&
    condition.shouldTrade &&
    institutionalConfidence >= 73 &&
    !["choppy", "manipulation"].includes(condition.condition);

  const result: InstitutionalResult = {
    ...base,
    marketCondition: condition.condition,
    conditionLabel: CONDITION_LABEL[condition.condition],
    conditionModifier: condition.confidenceModifier,
    institutionalConfidence,
    institutionalShouldTrade,
    opportunityScore,
    conditionReason: condition.reason,
    liquiditySweep,
    orderflowBias,
    momentumStrength,
  };

  if (riskParams) {
    result.dynamicRisk = calculateDynamicRisk({ ...riskParams, maxConsecutiveLosses: 5 });
  }

  instCache.set(symbol, { data: result, at: Date.now() });
  return result;
}

// ─── Trailing Stop Calculator ─────────────────────────────────────────────────

export function calculateTrailingStop(params: {
  side: "Buy" | "Sell";
  entryPrice: number;
  currentPrice: number;
  atr: number;
  currentSL: number | null;
  trailActivated: boolean;
  peakPrice: number; // highest for long, lowest for short
}): TrailingStopResult {
  const { side, entryPrice, currentPrice, atr, currentSL, trailActivated, peakPrice } = params;

  const rawProfitPct = side === "Buy"
    ? (currentPrice - entryPrice) / entryPrice * 100
    : (entryPrice - currentPrice) / entryPrice * 100;

  // Activation threshold: 0.7% raw profit
  if (!trailActivated) {
    if (rawProfitPct >= 0.7) {
      const newSL = side === "Buy"
        ? entryPrice * 1.0008  // breakeven + tiny buffer
        : entryPrice * 0.9992;
      return { newSL, activated: true, movedToBreakeven: true, tightened: false, note: `Trailing aktif — SL dipindah ke breakeven $${newSL.toFixed(4)}` };
    }
    return { newSL: currentSL ?? (side === "Buy" ? entryPrice * 0.98 : entryPrice * 1.02), activated: false, movedToBreakeven: false, tightened: false, note: null };
  }

  // ATR trail distance — tighten as profit grows
  let trailMult = 0.55;
  if (rawProfitPct > 3) trailMult = 0.3;
  else if (rawProfitPct > 2) trailMult = 0.4;
  const trailDist = atr * trailMult;

  let newSL: number;
  if (side === "Buy") {
    const proposed = peakPrice - trailDist;
    newSL = Math.max(proposed, currentSL ?? 0);
  } else {
    const proposed = peakPrice + trailDist;
    newSL = Math.min(proposed, currentSL ?? Infinity);
  }

  const tightened = side === "Buy"
    ? newSL > (currentSL ?? 0) + 0.00001
    : newSL < (currentSL ?? Infinity) - 0.00001;

  const note = tightened
    ? `Trail bergerak → SL ke $${newSL.toFixed(4)} (profit ${rawProfitPct.toFixed(1)}%)`
    : null;

  return { newSL, activated: true, movedToBreakeven: false, tightened, note };
}

// ─── Dynamic Risk Management ──────────────────────────────────────────────────

export function calculateDynamicRisk(params: {
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  drawdownPct: number;
  availableBalance: number;
  maxPositionUSDT: number;
  maxLeverage: number;
}): DynamicRiskResult {
  const { consecutiveLosses, drawdownPct, availableBalance, maxPositionUSDT, maxLeverage } = params;

  let riskMult = 1.0;
  let levMult = 1.0;
  let shouldTrade = true;
  let alertLevel: DynamicRiskResult["alertLevel"] = "normal";
  let reason = "Risiko normal — trading seperti biasa";

  // Drawdown-based deductions
  if (drawdownPct <= -30) {
    shouldTrade = false; riskMult = 0; alertLevel = "stop";
    reason = `Drawdown ${Math.abs(drawdownPct).toFixed(0)}% — HENTIKAN TRADING. Reset strategi diperlukan.`;
  } else if (drawdownPct <= -22) {
    riskMult = 0.2; levMult = 0.25; alertLevel = "stop";
    reason = `Drawdown parah ${Math.abs(drawdownPct).toFixed(0)}% — posisi sangat kecil (20% dari normal)`;
  } else if (drawdownPct <= -15) {
    riskMult = 0.35; levMult = 0.45; alertLevel = "danger";
    reason = `Drawdown ${Math.abs(drawdownPct).toFixed(0)}% — posisi dikecilkan 65%`;
  } else if (drawdownPct <= -8) {
    riskMult = 0.6; levMult = 0.7; alertLevel = "caution";
    reason = `Drawdown ${Math.abs(drawdownPct).toFixed(0)}% — posisi dikecilkan 40%`;
  }

  // Consecutive loss override
  if (consecutiveLosses >= 5) {
    shouldTrade = false; alertLevel = "stop";
    reason = `${consecutiveLosses}x loss berturut — HENTIKAN. Evaluasi strategi dahulu.`;
  } else if (consecutiveLosses >= 4) {
    riskMult = Math.min(riskMult, 0.15); levMult = Math.min(levMult, 0.25); alertLevel = "stop";
    reason = `${consecutiveLosses}x loss berturut — posisi sangat dikecilkan 85%`;
  } else if (consecutiveLosses >= 3) {
    riskMult = Math.min(riskMult, 0.3); levMult = Math.min(levMult, 0.4); alertLevel = "danger";
    reason = `${consecutiveLosses}x loss berturut — posisi dikecilkan 70%`;
  } else if (consecutiveLosses >= 2) {
    riskMult = Math.min(riskMult, 0.55); levMult = Math.min(levMult, 0.6); alertLevel = "caution";
    reason = `${consecutiveLosses}x loss berturut — posisi dikecilkan 45%`;
  } else if (consecutiveLosses === 1) {
    riskMult = Math.min(riskMult, 0.8); alertLevel = "caution";
    reason = "1x loss — sedikit kurangi risiko (-20%)";
  }

  const positionUSDT = Math.max(0.5, Math.min(maxPositionUSDT * riskMult, availableBalance * 0.3));
  const leverage = Math.max(1, Math.round(maxLeverage * levMult));

  return { positionUSDT, leverage, riskMultiplier: riskMult, reason, shouldTrade, alertLevel };
}

// ─── Smart Opportunity Switch ─────────────────────────────────────────────────

export function shouldSwitchOpportunity(params: {
  currentSymbol: string;
  currentConfidence: number;
  currentOpportunityScore: number;
  unrealisedPnlPct: number; // per-unit %, not leveraged
  durationMs: number;
  candidates: OpportunityScore[];
  lastSwitchAt: number;
  switchesToday: number;
}): SwitchDecision {
  const { currentSymbol, currentConfidence, unrealisedPnlPct, durationMs, candidates, lastSwitchAt, switchesToday } = params;

  const MIN_PROFIT_PCT  = 0.4; // must be 0.4% profit before switching
  const MIN_HOLD_MS     = 3 * 60_000; // 3 min minimum hold
  const MIN_CONF_GAIN   = 20;  // new setup must be 20+ pts better
  const COOLDOWN_MS     = 6 * 60_000; // 6 min cooldown between switches
  const MAX_DAILY       = 3;

  if (unrealisedPnlPct < MIN_PROFIT_PCT)
    return { shouldSwitch: false, reason: `Profit belum cukup (${unrealisedPnlPct.toFixed(2)}% < ${MIN_PROFIT_PCT}%)`, newSymbol: null, newOpportunityScore: 0, currentOpportunityScore: currentConfidence };

  if (durationMs < MIN_HOLD_MS)
    return { shouldSwitch: false, reason: `Terlalu cepat (${Math.round(durationMs / 60000)}m < 3m minimum)`, newSymbol: null, newOpportunityScore: 0, currentOpportunityScore: currentConfidence };

  const sinceLastSwitch = Date.now() - lastSwitchAt;
  if (sinceLastSwitch < COOLDOWN_MS)
    return { shouldSwitch: false, reason: `Cooldown ${Math.ceil((COOLDOWN_MS - sinceLastSwitch) / 60000)}m lagi`, newSymbol: null, newOpportunityScore: 0, currentOpportunityScore: currentConfidence };

  if (switchesToday >= MAX_DAILY)
    return { shouldSwitch: false, reason: `Sudah ${switchesToday}x switch hari ini (maks ${MAX_DAILY})`, newSymbol: null, newOpportunityScore: 0, currentOpportunityScore: currentConfidence };

  const eligible = candidates.filter(c =>
    c.symbol !== currentSymbol &&
    c.opportunityScore >= currentConfidence + MIN_CONF_GAIN &&
    c.side !== null &&
    !["choppy", "manipulation", "volatile"].includes(c.marketCondition)
  ).sort((a, b) => b.opportunityScore - a.opportunityScore);

  if (eligible.length === 0)
    return { shouldSwitch: false, reason: "Tidak ada peluang signifikan lebih baik", newSymbol: null, newOpportunityScore: 0, currentOpportunityScore: currentConfidence };

  const best = eligible[0];
  const gain = best.opportunityScore - currentConfidence;
  return {
    shouldSwitch: true,
    reason: `${best.symbol} lebih baik: score ${best.opportunityScore} vs ${currentConfidence} (+${gain} pts)`,
    newSymbol: best.symbol,
    newOpportunityScore: best.opportunityScore,
    currentOpportunityScore: currentConfidence,
  };
}
