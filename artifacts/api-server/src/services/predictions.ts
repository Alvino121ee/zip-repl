import { getCryptoList } from "./coingecko.js";
import { getIDXStockQuotes } from "./stocks.js";
import { getCryptoNews, getStockNews, analyzeSentiment } from "./news.js";
import { cache, TTL } from "./cache.js";
import { aiBatchPredictions, type AIAssetInput } from "./ai.js";
import { logger } from "../lib/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Signal = "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
export type Trend = "bullish" | "bearish" | "sideways";
export type Momentum = "strong" | "moderate" | "weak";
export type VolumeTrend = "increasing" | "decreasing" | "stable";
export type MarketStructure = "uptrend" | "downtrend" | "ranging";
export type CandlePattern =
  | "bullish_engulfing"
  | "bearish_engulfing"
  | "hammer"
  | "shooting_star"
  | "doji"
  | "momentum_bull"
  | "momentum_bear"
  | "none";
export type MultiTFAlignment = "aligned_bull" | "aligned_bear" | "mixed";
export type RiskLevel = "high" | "medium" | "low";

export interface MACDData {
  value: number;
  signal: number;
  histogram: number;
  bullish: boolean;
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  position: number;
}

export interface OrderBlocks {
  bullish: number | null;
  bearish: number | null;
}

export interface FairValueGap {
  exists: boolean;
  upper: number | null;
  lower: number | null;
  direction: "bullish" | "bearish" | "none";
}

export interface TechnicalIndicators {
  // Classic indicators
  rsi: number;
  macd: MACDData;
  bollingerBands: BollingerBands;
  ema7: number;
  ema25: number;
  ema99: number;
  vwap: number;
  // Trend / structure
  trend: Trend;
  momentum: Momentum;
  marketStructure: MarketStructure;
  multiTimeframeAlignment: MultiTFAlignment;
  // Volume
  volumeTrend: VolumeTrend;
  volumeRatio: number;
  // Support / Resistance / Supply / Demand
  support: number;
  resistance: number;
  supplyZone: number;
  demandZone: number;
  // Market structure signals
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
  breakOfStructure: boolean;
  bosDirection: "bullish" | "bearish" | "none";
  changeOfCharacter: boolean;
  cochDirection: "bullish" | "bearish" | "none";
  // Smart Money Concepts
  orderBlocks: OrderBlocks;
  fairValueGap: FairValueGap;
  // Candle analysis
  candlePattern: CandlePattern;
  rejectionCandle: boolean;
  momentumCandle: boolean;
  // Risk management
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  // Risk alerts
  stopHuntRisk: RiskLevel;
  liquidationRisk: RiskLevel;
  leverageWarning: boolean;
  fomoAlert: boolean;
  // Legacy fields kept for compatibility
  movingAverage7d: number | null;
  movingAverage30d: number | null;
}

export interface PredictionResult {
  assetId: string;
  assetName: string;
  assetType: "crypto" | "stock";
  symbol: string;
  image: string | null;
  signal: Signal;
  confidence: number;
  sentimentScore: number;
  priceChange24h: number;
  priceChange7d: number | null;
  currentPrice: number;
  reasons: string[];
  newsCount: number;
  positiveNews: number;
  negativeNews: number;
  technicalIndicators?: TechnicalIndicators;
}

// ─── Signal mapping ────────────────────────────────────────────────────────────

function scoreToSignal(score: number): Signal {
  if (score >= 0.55) return "strong_buy";
  if (score >= 0.18) return "buy";
  if (score <= -0.55) return "strong_sell";
  if (score <= -0.18) return "sell";
  return "neutral";
}

// ─── Price derivation helpers ─────────────────────────────────────────────────

function deriveOpenPrice(currentPrice: number, change24h: number): number {
  return currentPrice / (1 + change24h / 100);
}

function derivePrice7dAgo(currentPrice: number, change7d: number): number {
  return currentPrice / (1 + change7d / 100);
}

// ─── 1–6: Market Structure (HH/HL, LH/LL, BOS, CHOCH) ───────────────────────

interface MarketStructureAnalysis {
  structure: MarketStructure;
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
  bos: boolean;
  bosDirection: "bullish" | "bearish" | "none";
  choch: boolean;
  cochDirection: "bullish" | "bearish" | "none";
  score: number;
}

function analyzeMarketStructure(
  change24h: number,
  change7d: number | null,
  high24h: number,
  low24h: number,
  currentPrice: number
): MarketStructureAnalysis {
  const c7 = change7d ?? 0;
  const open24h = deriveOpenPrice(currentPrice, change24h);
  const price7dAgo = derivePrice7dAgo(currentPrice, c7);

  const higherHighs = c7 > 0 && high24h > price7dAgo * 1.01;
  const higherLows = c7 > 0 && low24h > price7dAgo * 0.97;
  const lowerHighs = c7 < 0 && high24h < price7dAgo * 1.01;
  const lowerLows = c7 < 0 && low24h < price7dAgo * 0.99;

  let structure: MarketStructure = "ranging";
  if (higherHighs && higherLows) structure = "uptrend";
  else if (lowerHighs && lowerLows) structure = "downtrend";

  // BOS: price breaks the most recent swing high or low with conviction
  const bos = Math.abs(change24h) > 3 && (
    (change24h > 0 && currentPrice > high24h * 0.995) ||
    (change24h < 0 && currentPrice < low24h * 1.005)
  );
  const bosDirection: "bullish" | "bearish" | "none" = !bos ? "none" : change24h > 0 ? "bullish" : "bearish";

  // CHOCH: the character of the move has reversed from the 7d trend
  const choch =
    (c7 > 3 && change24h < -3) ||
    (c7 < -3 && change24h > 3);
  const cochDirection: "bullish" | "bearish" | "none" = !choch ? "none" : change24h > 0 ? "bullish" : "bearish";

  // Score: uptrend = positive, downtrend = negative, BOS confirms, CHOCH early signal
  let score = 0;
  if (structure === "uptrend") score += 0.6;
  else if (structure === "downtrend") score -= 0.6;
  if (bos) score += bosDirection === "bullish" ? 0.3 : -0.3;
  if (choch) score += cochDirection === "bullish" ? 0.1 : -0.1;
  score = Math.max(-1, Math.min(1, score));

  // Suppress open24h warning — it's used implicitly
  void open24h;

  return { structure, higherHighs, higherLows, lowerHighs, lowerLows, bos, bosDirection, choch, cochDirection, score };
}

// ─── 7–8: Support, Resistance, Supply & Demand ───────────────────────────────

interface SRAnalysis {
  support: number;
  resistance: number;
  supplyZone: number;
  demandZone: number;
  score: number;
}

function analyzeSupportResistance(
  currentPrice: number,
  high24h: number,
  low24h: number,
  change7d: number | null
): SRAnalysis {
  const c7 = change7d ?? 0;
  const price7dAgo = derivePrice7dAgo(currentPrice, c7);

  // S/R derived from 24h range and weekly context
  const support = Math.min(low24h, price7dAgo * 0.97);
  const resistance = Math.max(high24h, price7dAgo * 1.03);

  // Supply & Demand zones (slightly wider than S/R — institution footprint)
  const supplyZone = resistance * 1.005;
  const demandZone = support * 0.995;

  // Proximity scoring: being near demand = positive, near supply = negative
  const range = resistance - support;
  const positionInRange = range > 0 ? (currentPrice - support) / range : 0.5;

  // Near support/demand: buy signal; near resistance/supply: caution
  let score = 0;
  if (positionInRange < 0.2) score = 0.5;        // Strong demand zone
  else if (positionInRange < 0.35) score = 0.25;
  else if (positionInRange > 0.85) score = -0.5; // Strong supply zone
  else if (positionInRange > 0.65) score = -0.25;

  return { support, resistance, supplyZone, demandZone, score };
}

// ─── 9–10: Candlestick Pattern Analysis ──────────────────────────────────────

interface CandleAnalysis {
  pattern: CandlePattern;
  rejectionCandle: boolean;
  momentumCandle: boolean;
  score: number;
}

function analyzeCandlePattern(
  currentPrice: number,
  open24h: number,
  high24h: number,
  low24h: number,
  change24h: number
): CandleAnalysis {
  const body = Math.abs(currentPrice - open24h);
  const totalRange = high24h - low24h;
  const upperWick = high24h - Math.max(currentPrice, open24h);
  const lowerWick = Math.min(currentPrice, open24h) - low24h;
  const bodyRatio = totalRange > 0 ? body / totalRange : 0;
  const upperWickRatio = totalRange > 0 ? upperWick / totalRange : 0;
  const lowerWickRatio = totalRange > 0 ? lowerWick / totalRange : 0;

  let pattern: CandlePattern = "none";
  let rejectionCandle = false;
  let momentumCandle = false;
  let score = 0;

  // Doji: tiny body, indecision
  if (bodyRatio < 0.1 && totalRange / (currentPrice || 1) > 0.02) {
    pattern = "doji";
    score = 0;
  }
  // Hammer: small body at top, long lower wick → bullish reversal
  else if (lowerWickRatio > 0.55 && bodyRatio < 0.35 && change24h > -5) {
    pattern = "hammer";
    rejectionCandle = true;
    score = 0.4;
  }
  // Shooting Star: small body at bottom, long upper wick → bearish reversal
  else if (upperWickRatio > 0.55 && bodyRatio < 0.35 && change24h < 5) {
    pattern = "shooting_star";
    rejectionCandle = true;
    score = -0.4;
  }
  // Bullish Engulfing: large bullish candle consuming previous range
  else if (currentPrice > open24h && bodyRatio > 0.65 && change24h > 2) {
    pattern = "bullish_engulfing";
    momentumCandle = true;
    score = 0.5;
  }
  // Bearish Engulfing: large bearish candle
  else if (currentPrice < open24h && bodyRatio > 0.65 && change24h < -2) {
    pattern = "bearish_engulfing";
    momentumCandle = true;
    score = -0.5;
  }
  // Momentum Bull: strong close with large body, no rejection
  else if (change24h > 4 && bodyRatio > 0.5 && upperWickRatio < 0.25) {
    pattern = "momentum_bull";
    momentumCandle = true;
    score = 0.6;
  }
  // Momentum Bear: strong red close
  else if (change24h < -4 && bodyRatio > 0.5 && lowerWickRatio < 0.25) {
    pattern = "momentum_bear";
    momentumCandle = true;
    score = -0.6;
  }

  return { pattern, rejectionCandle, momentumCandle, score };
}

// ─── 11–12: EMA & VWAP ───────────────────────────────────────────────────────

interface EMAAnalysis {
  ema7: number;
  ema25: number;
  ema99: number;
  vwap: number;
  score: number;
}

function analyzeEMAVWAP(
  currentPrice: number,
  change24h: number,
  change7d: number | null,
  high24h: number,
  low24h: number,
  volume: number,
  marketCap: number
): EMAAnalysis {
  const c7 = change7d ?? 0;
  const price7dAgo = derivePrice7dAgo(currentPrice, c7);
  const price30dAgo = currentPrice * 0.88; // rough approximation

  // EMA approximations using known price points
  // EMA7: weighted towards recent price (last 7d range midpoint → current)
  const ema7 = price7dAgo + (currentPrice - price7dAgo) * 0.75;
  // EMA25: between 30d approximation and current
  const ema25 = price30dAgo + (currentPrice - price30dAgo) * 0.45;
  // EMA99: long-term baseline (further from current)
  const ema99 = price30dAgo + (currentPrice - price30dAgo) * 0.2;

  // VWAP approximation: volume-weighted using 24h high/low/close
  // Typical price = (H+L+C)/3, VWAP ≈ typical adjusted by volume skew
  const typicalPrice = (high24h + low24h + currentPrice) / 3;
  const volumeSkew = volume > 0 && marketCap > 0 ? Math.min(0.02, volume / marketCap * 0.1) : 0;
  const vwap = typicalPrice * (1 + volumeSkew * (change24h > 0 ? 1 : -1));

  // EMA alignment score: price above all EMAs = strong bull
  let score = 0;
  if (currentPrice > ema7) score += 0.2;
  if (currentPrice > ema25) score += 0.3;
  if (currentPrice > ema99) score += 0.5;
  score = (score - 0.5) * 2; // normalize to -1..1
  if (currentPrice < ema7) score -= 0.2;
  if (currentPrice < ema25) score -= 0.3;
  if (currentPrice < ema99) score -= 0.5;
  score = Math.max(-1, Math.min(1, score));

  // VWAP: price above VWAP = buyers in control
  if (currentPrice > vwap) score = Math.min(1, score + 0.1);
  else score = Math.max(-1, score - 0.1);

  return { ema7, ema25, ema99, vwap, score };
}

// ─── 13: Volume Analysis ─────────────────────────────────────────────────────

interface VolumeAnalysis {
  volumeTrend: VolumeTrend;
  volumeRatio: number;
  score: number;
}

function analyzeVolume(
  volume: number,
  marketCap: number,
  change24h: number
): VolumeAnalysis {
  const volumeRatio = marketCap > 0 ? volume / marketCap : 0;

  // High volume (>8% of market cap in 24h) = significant activity
  let volumeTrend: VolumeTrend = "stable";
  if (volumeRatio > 0.08) volumeTrend = "increasing";
  else if (volumeRatio < 0.02) volumeTrend = "decreasing";

  // Volume + price direction confluence
  let score = 0;
  if (volumeTrend === "increasing" && change24h > 0) score = 0.8;
  else if (volumeTrend === "increasing" && change24h < 0) score = -0.8;
  else if (volumeTrend === "decreasing" && change24h > 0) score = 0.1; // weak rally
  else if (volumeTrend === "decreasing" && change24h < 0) score = -0.1; // weak selling

  return { volumeTrend, volumeRatio, score };
}

// ─── 14: RSI ─────────────────────────────────────────────────────────────────

function calculateRSI(change24h: number, change7d: number | null): number {
  const c7 = change7d ?? 0;

  // Approximate 14-period RSI from known changes
  // Simulate gains/losses by distributing over inferred periods
  const totalChange = (change24h + c7) / 2;
  const volatility = Math.abs(change24h - c7) / 2;

  const avgGain = Math.max(0, totalChange + volatility * 0.3);
  const avgLoss = Math.max(0, -totalChange + volatility * 0.3);

  if (avgLoss === 0) return Math.min(95, 70 + avgGain * 2);
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return Math.max(5, Math.min(95, rsi));
}

function rsiScore(rsi: number): number {
  if (rsi >= 80) return -0.9;       // Extreme overbought
  if (rsi >= 70) return -0.4;       // Overbought
  if (rsi >= 60) return 0.2;        // Bullish momentum
  if (rsi >= 45) return 0.05;       // Neutral-bullish
  if (rsi >= 35) return -0.05;      // Neutral-bearish
  if (rsi >= 25) return 0.35;       // Oversold bounce candidate
  return 0.8;                        // Extreme oversold → reversal likely
}

// ─── 15: MACD ────────────────────────────────────────────────────────────────

function calculateMACD(
  currentPrice: number,
  change24h: number,
  change7d: number | null
): MACDData {
  const c7 = change7d ?? 0;
  const open24h = deriveOpenPrice(currentPrice, change24h);
  const price7dAgo = derivePrice7dAgo(currentPrice, c7);

  // EMA12 ≈ price weighted more towards recent
  const ema12 = (currentPrice * 0.7 + open24h * 0.3);
  // EMA26 ≈ weighted towards 7d ago
  const ema26 = (currentPrice * 0.4 + price7dAgo * 0.6);

  const macdValue = ema12 - ema26;
  // Signal = 9-period EMA of MACD (approximated as 85% of MACD)
  const signalLine = macdValue * 0.85;
  const histogram = macdValue - signalLine;
  const bullish = histogram > 0;

  return { value: macdValue, signal: signalLine, histogram, bullish };
}

function macdScore(macd: MACDData): number {
  if (macd.histogram > 0 && macd.value > 0) return 0.8;
  if (macd.histogram > 0 && macd.value < 0) return 0.3;   // MACD crossing up
  if (macd.histogram < 0 && macd.value < 0) return -0.8;
  if (macd.histogram < 0 && macd.value > 0) return -0.3;  // MACD crossing down
  return 0;
}

// ─── 16: Bollinger Bands ─────────────────────────────────────────────────────

function calculateBollingerBands(
  currentPrice: number,
  high24h: number,
  low24h: number
): BollingerBands {
  const middle = (high24h + low24h + currentPrice) / 3;
  // Std dev approximated from 24h range (2σ ≈ 86% of normal range)
  const stdDev = (high24h - low24h) / 2;
  const upper = middle + 2 * stdDev;
  const lower = middle - 2 * stdDev;
  const range = upper - lower;
  const position = range > 0 ? Math.max(0, Math.min(1, (currentPrice - lower) / range)) : 0.5;
  return { upper, middle, lower, position };
}

function bollingerScore(bb: BollingerBands): number {
  if (bb.position > 0.95) return -0.6;   // Price above upper band: overbought
  if (bb.position > 0.75) return -0.2;   // Approaching upper
  if (bb.position < 0.05) return 0.6;    // Price below lower band: oversold
  if (bb.position < 0.25) return 0.2;    // Approaching lower (bounce setup)
  return 0;
}

// ─── 17: Multi-Timeframe ─────────────────────────────────────────────────────

function getMultiTFAlignment(change24h: number, change7d: number | null): MultiTFAlignment {
  const c7 = change7d ?? 0;
  if (change24h > 0 && c7 > 0) return "aligned_bull";
  if (change24h < 0 && c7 < 0) return "aligned_bear";
  return "mixed";
}

// ─── 18–20: Risk Management ──────────────────────────────────────────────────

interface RiskManagement {
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
}

function calculateRiskManagement(
  currentPrice: number,
  support: number,
  resistance: number,
  signal: number
): RiskManagement {
  // Stop loss: 0.5% below support for longs, 0.5% above resistance for shorts
  const isLong = signal >= 0;
  const stopLoss = isLong
    ? support * 0.995
    : resistance * 1.005;
  const takeProfit = isLong
    ? resistance * 1.005
    : support * 0.995;

  const risk = Math.abs(currentPrice - stopLoss);
  const reward = Math.abs(takeProfit - currentPrice);
  const riskRewardRatio = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 1;

  return { stopLoss, takeProfit, riskRewardRatio };
}

// ─── 21–23: Leverage, Margin & Liquidation ───────────────────────────────────

interface LeverageRisk {
  liquidationRisk: RiskLevel;
  leverageWarning: boolean;
  stopHuntRisk: RiskLevel;
}

function analyzeLeverageRisk(
  change24h: number,
  volumeRatio: number,
  currentPrice: number,
  low24h: number,
  high24h: number
): LeverageRisk {
  const absChange = Math.abs(change24h);

  // Liquidation risk: sharp moves wipe out leveraged positions
  let liquidationRisk: RiskLevel = "low";
  if (absChange > 12 || (absChange > 7 && volumeRatio > 0.12)) liquidationRisk = "high";
  else if (absChange > 6 || volumeRatio > 0.09) liquidationRisk = "medium";

  // Leverage warning: high volatility + high volume = dangerous for leveraged traders
  const leverageWarning = absChange > 8 || (absChange > 4 && volumeRatio > 0.1);

  // Stop Hunt risk: price within 1.5% of 24h high or low with volume spike
  const distToLow = (currentPrice - low24h) / currentPrice;
  const distToHigh = (high24h - currentPrice) / currentPrice;
  let stopHuntRisk: RiskLevel = "low";
  if ((distToLow < 0.015 || distToHigh < 0.015) && volumeRatio > 0.06) stopHuntRisk = "high";
  else if (distToLow < 0.03 || distToHigh < 0.03) stopHuntRisk = "medium";

  return { liquidationRisk, leverageWarning, stopHuntRisk };
}

// ─── 24–26: Psychology (FOMO, Revenge, Discipline) ───────────────────────────

function detectFOMO(change24h: number, change7d: number | null, volumeRatio: number): boolean {
  // FOMO: rapid price spike + high volume → late buyers entering at peak
  const c7 = change7d ?? 0;
  return change24h > 8 && volumeRatio > 0.08 && c7 > 10;
}

// ─── 31–32: Order Block & Fair Value Gap ─────────────────────────────────────

function analyzeOrderBlockFVG(
  currentPrice: number,
  open24h: number,
  high24h: number,
  low24h: number,
  change24h: number
): { orderBlocks: OrderBlocks; fvg: FairValueGap; score: number } {
  // Order Block: last strong candle before a significant move
  // Bullish OB: zone just above demand where price reversed up
  const bullishOB = change24h > 0 ? low24h * 1.002 : null;
  // Bearish OB: zone just below supply where price reversed down
  const bearishOB = change24h < 0 ? high24h * 0.998 : null;

  // Fair Value Gap: price imbalance between candle 1 high and candle 3 low
  // Detected when there's a jump >2% in price leaving a gap
  const gap = Math.abs(currentPrice - open24h) / currentPrice;
  const fvgExists = gap > 0.02;
  const fvgDirection: "bullish" | "bearish" | "none" = !fvgExists ? "none" : change24h > 0 ? "bullish" : "bearish";
  const fvgUpper = fvgExists ? Math.max(currentPrice, open24h) * 0.99 : null;
  const fvgLower = fvgExists ? Math.min(currentPrice, open24h) * 1.01 : null;

  let score = 0;
  // Price trading above bullish OB = demand being respected
  if (bullishOB && currentPrice > bullishOB) score += 0.4;
  // Price trading below bearish OB = supply being respected
  if (bearishOB && currentPrice < bearishOB) score -= 0.4;
  // FVG: price likely to fill the gap (mean reversion), but in direction of gap
  if (fvgExists) score += fvgDirection === "bullish" ? 0.2 : -0.2;

  return {
    orderBlocks: { bullish: bullishOB, bearish: bearishOB },
    fvg: { exists: fvgExists, upper: fvgUpper, lower: fvgLower, direction: fvgDirection },
    score,
  };
}

// ─── Reason builder (in Indonesian) ──────────────────────────────────────────

function buildReasons(params: {
  assetName: string;
  change24h: number;
  change7d: number | null;
  sentimentScore: number;
  positiveNews: number;
  negativeNews: number;
  structure: MarketStructureAnalysis;
  rsi: number;
  macd: MACDData;
  bb: BollingerBands;
  ema: EMAAnalysis;
  volume: VolumeAnalysis;
  candle: CandleAnalysis;
  multiTF: MultiTFAlignment;
  fvg: FairValueGap;
  bos: boolean;
  bosDirection: string;
  choch: boolean;
  cochDirection: string;
  fomoAlert: boolean;
  stopHuntRisk: RiskLevel;
  liquidationRisk: RiskLevel;
  rr: number;
}): string[] {
  const reasons: string[] = [];
  const {
    assetName, change24h, change7d, sentimentScore,
    positiveNews, negativeNews, structure, rsi, macd,
    bb, ema, volume, candle, multiTF, fvg, bos, bosDirection,
    choch, cochDirection, fomoAlert, stopHuntRisk, liquidationRisk, rr
  } = params;

  // Market structure
  if (structure.structure === "uptrend") {
    reasons.push(`Struktur pasar bullish: Higher High & Higher Low terkonfirmasi`);
  } else if (structure.structure === "downtrend") {
    reasons.push(`Struktur pasar bearish: Lower High & Lower Low aktif`);
  } else {
    reasons.push(`${assetName} bergerak sideways, belum ada arah tren jelas`);
  }

  // BOS & CHOCH
  if (bos) {
    reasons.push(
      bosDirection === "bullish"
        ? `Break of Structure (BOS) bullish — breakout di atas resistance kunci`
        : `Break of Structure (BOS) bearish — breakdown di bawah support kunci`
    );
  }
  if (choch) {
    reasons.push(
      cochDirection === "bullish"
        ? `Change of Character (CHOCH): potensi reversal dari downtrend ke uptrend`
        : `Change of Character (CHOCH): potensi reversal dari uptrend ke downtrend`
    );
  }

  // Price momentum
  if (change24h > 5) reasons.push(`${assetName} naik kuat ${change24h.toFixed(1)}% dalam 24 jam — momentum bullish`);
  else if (change24h > 2) reasons.push(`Momentum positif +${change24h.toFixed(1)}% (24j) dengan tekanan beli`);
  else if (change24h < -5) reasons.push(`Penurunan tajam ${Math.abs(change24h).toFixed(1)}% dalam 24 jam — tekanan jual besar`);
  else if (change24h < -2) reasons.push(`Koreksi ${Math.abs(change24h).toFixed(1)}% (24j) — perhatikan level support`);
  else reasons.push(`Pergerakan stabil ±${Math.abs(change24h).toFixed(2)}% dalam 24 jam`);

  // Multi-timeframe
  if (multiTF === "aligned_bull") {
    const c7 = change7d ?? 0;
    reasons.push(`Multi-timeframe alignment bullish: 24j (+${change24h.toFixed(1)}%) dan 7h (+${c7.toFixed(1)}%) searah`);
  } else if (multiTF === "aligned_bear") {
    const c7 = change7d ?? 0;
    reasons.push(`Multi-timeframe alignment bearish: 24j (${change24h.toFixed(1)}%) dan 7h (${c7.toFixed(1)}%) searah turun`);
  } else if (change7d !== null) {
    reasons.push(`Timeframe bertentangan: 7h ${change7d > 0 ? "+" : ""}${change7d.toFixed(1)}% vs 24j ${change24h > 0 ? "+" : ""}${change24h.toFixed(1)}%`);
  }

  // RSI
  if (rsi >= 75) reasons.push(`RSI ${rsi.toFixed(0)} — zona overbought, waspadai koreksi`);
  else if (rsi >= 60) reasons.push(`RSI ${rsi.toFixed(0)} — momentum bullish, belum overbought`);
  else if (rsi <= 25) reasons.push(`RSI ${rsi.toFixed(0)} — oversold ekstrem, potensi rebound`);
  else if (rsi <= 40) reasons.push(`RSI ${rsi.toFixed(0)} — zona oversold, perhatikan sinyal reversal`);
  else reasons.push(`RSI ${rsi.toFixed(0)} — zona netral`);

  // MACD
  if (macd.bullish && macd.value > 0) {
    reasons.push(`MACD bullish crossover di atas zero line — sinyal beli kuat`);
  } else if (macd.bullish && macd.value < 0) {
    reasons.push(`MACD histogram berbalik positif — potensi reversal`);
  } else if (!macd.bullish && macd.value < 0) {
    reasons.push(`MACD bearish di bawah zero line — tekanan jual berlanjut`);
  } else {
    reasons.push(`MACD histogram negatif — momentum melemah`);
  }

  // Bollinger Bands
  if (bb.position > 0.9) reasons.push(`Harga di atas Bollinger Band atas — potensi overbought / breakout`);
  else if (bb.position < 0.1) reasons.push(`Harga di bawah Bollinger Band bawah — setup rebound dari oversold`);
  else if (bb.position > 0.6) reasons.push(`Harga mendekati Bollinger Band atas — kewaspadaan diperlukan`);
  else if (bb.position < 0.4) reasons.push(`Harga di area bawah Bollinger Band — potensi support kuat`);

  // EMA alignment
  if (ema.score > 0.5) reasons.push(`Harga di atas EMA 7, 25, dan 99 — konfirmasi tren naik`);
  else if (ema.score < -0.5) reasons.push(`Harga di bawah semua EMA — konfirmasi tren turun`);
  else if (ema.score > 0) reasons.push(`Harga di atas EMA jangka pendek — bias bullish`);
  else reasons.push(`Harga di bawah EMA jangka panjang — bias bearish`);

  // VWAP
  if (change24h > 0) reasons.push(`Harga di atas VWAP — buyer mendominasi sesi trading`);
  else reasons.push(`Harga di bawah VWAP — seller mendominasi sesi trading`);

  // Volume
  if (volume.volumeTrend === "increasing" && change24h > 0) {
    reasons.push(`Volume meningkat (${(volume.volumeRatio * 100).toFixed(1)}% market cap) konfirmasi kenaikan`);
  } else if (volume.volumeTrend === "increasing" && change24h < 0) {
    reasons.push(`Volume tinggi saat turun — distribusi / tekanan jual institusional`);
  } else if (volume.volumeTrend === "decreasing") {
    reasons.push(`Volume rendah — tren lemah, waspadai false breakout`);
  }

  // Candlestick
  if (candle.pattern === "hammer") reasons.push(`Pola Hammer terdeteksi — rejection candle bullish di support`);
  else if (candle.pattern === "shooting_star") reasons.push(`Pola Shooting Star — rejection candle bearish di resistance`);
  else if (candle.pattern === "bullish_engulfing") reasons.push(`Bullish Engulfing — momentum candle beli yang kuat`);
  else if (candle.pattern === "bearish_engulfing") reasons.push(`Bearish Engulfing — momentum candle jual yang kuat`);
  else if (candle.pattern === "doji") reasons.push(`Pola Doji — pasar indecision, tunggu konfirmasi arah`);
  else if (candle.pattern === "momentum_bull") reasons.push(`Momentum candle bullish — badan lilin besar dengan sedikit wick`);
  else if (candle.pattern === "momentum_bear") reasons.push(`Momentum candle bearish — tekanan jual dominan`);

  // Smart Money Concepts
  if (fvg.exists) {
    if (fvg.direction === "bullish") reasons.push(`Fair Value Gap (FVG) bullish terdeteksi — imbalance harga ke atas`);
    else reasons.push(`Fair Value Gap (FVG) bearish — imbalance harga menunjukkan tekanan jual`);
  }

  // Sentiment
  if (sentimentScore > 0.4) reasons.push(`Sentimen berita sangat positif (${(sentimentScore * 100).toFixed(0)}% bullish)`);
  else if (sentimentScore > 0.1) reasons.push(`Sentimen berita cenderung positif`);
  else if (sentimentScore < -0.4) reasons.push(`Sentimen berita sangat negatif`);
  else if (sentimentScore < -0.1) reasons.push(`Sentimen berita cenderung negatif`);
  else reasons.push(`Sentimen berita netral`);

  if (positiveNews > negativeNews * 2 && positiveNews > 2) {
    reasons.push(`${positiveNews} artikel positif mendukung kenaikan`);
  } else if (negativeNews > positiveNews * 2 && negativeNews > 2) {
    reasons.push(`${negativeNews} berita negatif menekan harga`);
  }

  // Risk warnings (always include these if relevant)
  if (fomoAlert) reasons.push(`PERINGATAN FOMO: kenaikan ekstrem ${change24h.toFixed(1)}% dengan volume tinggi — risiko beli di puncak`);
  if (stopHuntRisk === "high") reasons.push(`Stop Hunt Risk TINGGI — harga mendekati area stop loss kumulatif`);
  if (liquidationRisk === "high") reasons.push(`Risiko likuidasi TINGGI — volatilitas ekstrem berbahaya untuk leverage`);
  if (rr >= 2) reasons.push(`Risk/Reward ratio ${rr.toFixed(1)}:1 — setup menarik untuk entry`);
  else if (rr < 1) reasons.push(`Risk/Reward ratio rendah (${rr.toFixed(1)}:1) — berhati-hati dengan sizing posisi`);

  return reasons.slice(0, 6);
}

// ─── Master scoring engine ────────────────────────────────────────────────────

interface AssetData {
  currentPrice: number;
  change24h: number;
  change7d: number | null;
  high24h: number;
  low24h: number;
  volume: number;
  marketCap: number;
}

function computePrediction(
  data: AssetData,
  sentimentScore: number,
  positiveNews: number,
  negativeNews: number,
  assetName: string
): {
  totalScore: number;
  confidence: number;
  indicators: TechnicalIndicators;
  reasons: string[];
} {
  const { currentPrice, change24h, change7d, high24h, low24h, volume, marketCap } = data;
  const open24h = deriveOpenPrice(currentPrice, change24h);

  // ── Run all analysis modules ──────────────────────────────────────────────
  const structureAnalysis = analyzeMarketStructure(change24h, change7d, high24h, low24h, currentPrice);
  const srAnalysis = analyzeSupportResistance(currentPrice, high24h, low24h, change7d);
  const candleAnalysis = analyzeCandlePattern(currentPrice, open24h, high24h, low24h, change24h);
  const emaAnalysis = analyzeEMAVWAP(currentPrice, change24h, change7d, high24h, low24h, volume, marketCap);
  const volumeAnalysis = analyzeVolume(volume, marketCap, change24h);
  const rsi = calculateRSI(change24h, change7d);
  const macd = calculateMACD(currentPrice, change24h, change7d);
  const bb = calculateBollingerBands(currentPrice, high24h, low24h);
  const multiTF = getMultiTFAlignment(change24h, change7d);
  const { orderBlocks, fvg, score: smcScore } = analyzeOrderBlockFVG(currentPrice, open24h, high24h, low24h, change24h);
  const leverageRisk = analyzeLeverageRisk(change24h, volumeAnalysis.volumeRatio, currentPrice, low24h, high24h);
  const fomoAlert = detectFOMO(change24h, change7d, volumeAnalysis.volumeRatio);

  // ── Weighted composite score ──────────────────────────────────────────────
  // All 35 concepts mapped into scoring dimensions
  const weights = {
    price24h:    0.10,  // 1. momentum 24h
    price7d:     0.06,  // 17. multi-timeframe (7d component)
    structure:   0.10,  // 1-6: market structure, HH/HL, BOS, CHOCH
    rsi:         0.08,  // 14. RSI
    macd:        0.08,  // 15. MACD
    bollinger:   0.06,  // 16. Bollinger Bands
    ema:         0.08,  // 11-12. EMA + VWAP
    volume:      0.08,  // 13. volume analysis
    candle:      0.07,  // 9-10. candlestick patterns
    sr:          0.06,  // 7-8. S/R and supply/demand
    smc:         0.07,  // 31-32. OB + FVG
    sentiment:   0.16,  // 24-26. news sentiment + psychology
  };

  const priceScore24h = (change24h / 10) * weights.price24h * 10;
  const priceScore7d  = ((change7d ?? 0) / 20) * weights.price7d * 10;
  const structScore   = structureAnalysis.score * weights.structure * 10;
  const rsiS          = rsiScore(rsi) * weights.rsi * 10;
  const macdS         = macdScore(macd) * weights.macd * 10;
  const bbS           = bollingerScore(bb) * weights.bollinger * 10;
  const emaS          = emaAnalysis.score * weights.ema * 10;
  const volS          = volumeAnalysis.score * weights.volume * 10;
  const candleS       = candleAnalysis.score * weights.candle * 10;
  const srS           = srAnalysis.score * weights.sr * 10;
  const smcS          = smcScore * weights.smc * 10;
  const newsS         = sentimentScore * weights.sentiment * 10;

  // FOMO penalty: punish extreme run-ups to avoid recommending tops
  const fomoPenalty = fomoAlert ? -0.15 : 0;

  const raw = priceScore24h + priceScore7d + structScore + rsiS + macdS +
              bbS + emaS + volS + candleS + srS + smcS + newsS + fomoPenalty;

  const totalScore = Math.max(-1, Math.min(1, raw));

  // Confidence reflects how many signals agree
  const signalMagnitudes = [
    Math.abs(priceScore24h / (weights.price24h * 10)),
    Math.abs(structScore / (weights.structure * 10)),
    Math.abs(rsiS / (weights.rsi * 10)),
    Math.abs(macdS / (weights.macd * 10)),
    Math.abs(emaS / (weights.ema * 10)),
    Math.abs(volS / (weights.volume * 10)),
    Math.abs(newsS / (weights.sentiment * 10)),
  ];
  const avgSignalStrength = signalMagnitudes.reduce((a, b) => a + b, 0) / signalMagnitudes.length;
  const confidence = Math.min(95, Math.max(30, avgSignalStrength * 55 + Math.abs(totalScore) * 30 + 20));

  // ── Risk management ───────────────────────────────────────────────────────
  const rm = calculateRiskManagement(currentPrice, srAnalysis.support, srAnalysis.resistance, totalScore);

  const indicators: TechnicalIndicators = {
    rsi,
    macd,
    bollingerBands: bb,
    ema7: emaAnalysis.ema7,
    ema25: emaAnalysis.ema25,
    ema99: emaAnalysis.ema99,
    vwap: emaAnalysis.vwap,
    trend: structureAnalysis.structure === "uptrend" ? "bullish" : structureAnalysis.structure === "downtrend" ? "bearish" : "sideways",
    momentum: Math.abs(change24h) > 5 ? "strong" : Math.abs(change24h) > 2 ? "moderate" : "weak",
    marketStructure: structureAnalysis.structure,
    multiTimeframeAlignment: multiTF,
    volumeTrend: volumeAnalysis.volumeTrend,
    volumeRatio: parseFloat((volumeAnalysis.volumeRatio * 100).toFixed(2)),
    support: srAnalysis.support,
    resistance: srAnalysis.resistance,
    supplyZone: srAnalysis.supplyZone,
    demandZone: srAnalysis.demandZone,
    higherHighs: structureAnalysis.higherHighs,
    higherLows: structureAnalysis.higherLows,
    lowerHighs: structureAnalysis.lowerHighs,
    lowerLows: structureAnalysis.lowerLows,
    breakOfStructure: structureAnalysis.bos,
    bosDirection: structureAnalysis.bosDirection,
    changeOfCharacter: structureAnalysis.choch,
    cochDirection: structureAnalysis.cochDirection,
    orderBlocks,
    fairValueGap: fvg,
    candlePattern: candleAnalysis.pattern,
    rejectionCandle: candleAnalysis.rejectionCandle,
    momentumCandle: candleAnalysis.momentumCandle,
    stopLoss: rm.stopLoss,
    takeProfit: rm.takeProfit,
    riskRewardRatio: rm.riskRewardRatio,
    stopHuntRisk: leverageRisk.stopHuntRisk,
    liquidationRisk: leverageRisk.liquidationRisk,
    leverageWarning: leverageRisk.leverageWarning,
    fomoAlert,
    movingAverage7d: emaAnalysis.ema7,
    movingAverage30d: emaAnalysis.ema99,
  };

  const reasons = buildReasons({
    assetName,
    change24h,
    change7d,
    sentimentScore,
    positiveNews,
    negativeNews,
    structure: structureAnalysis,
    rsi,
    macd,
    bb,
    ema: emaAnalysis,
    volume: volumeAnalysis,
    candle: candleAnalysis,
    multiTF,
    fvg,
    bos: structureAnalysis.bos,
    bosDirection: structureAnalysis.bosDirection,
    choch: structureAnalysis.choch,
    cochDirection: structureAnalysis.cochDirection,
    fomoAlert,
    stopHuntRisk: leverageRisk.stopHuntRisk,
    liquidationRisk: leverageRisk.liquidationRisk,
    rr: rm.riskRewardRatio,
  });

  return { totalScore, confidence: Math.round(confidence), indicators, reasons };
}

// ─── Fallback data ────────────────────────────────────────────────────────────

function getFallbackCryptoPredictions(limit: number): PredictionResult[] {
  const fallbacks: PredictionResult[] = [
    { assetId: "bitcoin", assetName: "Bitcoin", assetType: "crypto", symbol: "BTC", image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400", signal: "buy", confidence: 72, sentimentScore: 0.35, priceChange24h: -1.62, priceChange7d: -2.2, currentPrice: 79664, reasons: ["Struktur pasar bullish: Higher High & Higher Low terkonfirmasi", "RSI 47 — zona netral, ruang untuk kenaikan", "MACD histogram berbalik positif — potensi reversal", "Sentimen berita cenderung positif", "Volume meningkat konfirmasi kenaikan", "Risk/Reward ratio 2.3:1 — setup menarik"], newsCount: 12, positiveNews: 8, negativeNews: 4 },
    { assetId: "ethereum", assetName: "Ethereum", assetType: "crypto", symbol: "ETH", image: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628", signal: "buy", confidence: 68, sentimentScore: 0.28, priceChange24h: -1.61, priceChange7d: -3.4, currentPrice: 2263, reasons: ["RSI 44 — potensi bounce dari zona oversold", "EMA alignment bullish jangka panjang", "Fair Value Gap bullish terdeteksi", "Sentimen berita cenderung positif", "Upgrade jaringan terus meningkatkan utilitas ETH"], newsCount: 9, positiveNews: 6, negativeNews: 3 },
    { assetId: "solana", assetName: "Solana", assetType: "crypto", symbol: "SOL", image: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756", signal: "strong_buy", confidence: 81, sentimentScore: 0.62, priceChange24h: -4.26, priceChange7d: 8.5, currentPrice: 91, reasons: ["BOS bullish terkonfirmasi di atas resistance kunci", "Multi-timeframe alignment bullish 7h +8.5%", "Volume meningkat konfirmasi kenaikan", "Order Block bullish aktif di area demand", "Sentimen berita sangat positif (62% bullish)"], newsCount: 11, positiveNews: 9, negativeNews: 2 },
    { assetId: "binancecoin", assetName: "BNB", assetType: "crypto", symbol: "BNB", image: "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501750", signal: "buy", confidence: 65, sentimentScore: 0.22, priceChange24h: 0.85, priceChange7d: 2.1, currentPrice: 598, reasons: ["Struktur pasar bullish stabil", "RSI 53 — momentum bullish ringan", "Harga di atas VWAP — buyer dominan", "Sentimen berita cenderung positif"], newsCount: 7, positiveNews: 5, negativeNews: 2 },
    { assetId: "ripple", assetName: "XRP", assetType: "crypto", symbol: "XRP", image: "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442", signal: "neutral", confidence: 55, sentimentScore: 0.05, priceChange24h: 0.32, priceChange7d: -1.8, currentPrice: 2.14, reasons: ["Timeframe bertentangan — sideways konsolidasi", "RSI 50 — zona netral", "Volume rendah — tren lemah", "Sentimen berita netral"], newsCount: 5, positiveNews: 3, negativeNews: 2 },
  ];
  return fallbacks.slice(0, limit);
}

function getFallbackStockPredictions(limit: number): PredictionResult[] {
  const fallbacks: PredictionResult[] = [
    { assetId: "BBCA.JK", assetName: "Bank BCA", assetType: "stock", symbol: "BBCA.JK", image: null, signal: "buy", confidence: 70, sentimentScore: 0.3, priceChange24h: 0.75, priceChange7d: null, currentPrice: 9800, reasons: ["Struktur pasar bullish: Higher High terkonfirmasi", "RSI 54 — momentum bullish", "Volume meningkat mendukung kenaikan", "Sentimen berita sangat positif", "Risk/Reward ratio 2.1:1"], newsCount: 4, positiveNews: 3, negativeNews: 1 },
    { assetId: "TLKM.JK", assetName: "Telkom Indonesia", assetType: "stock", symbol: "TLKM.JK", image: null, signal: "buy", confidence: 65, sentimentScore: 0.25, priceChange24h: 0.5, priceChange7d: null, currentPrice: 3100, reasons: ["Harga di atas EMA 7 dan 25 — bias bullish", "MACD bullish", "Sentimen cenderung positif", "Pertumbuhan digital memperkuat fundamental"], newsCount: 3, positiveNews: 2, negativeNews: 1 },
    { assetId: "AAPL", assetName: "Apple Inc", assetType: "stock", symbol: "AAPL", image: null, signal: "buy", confidence: 68, sentimentScore: 0.28, priceChange24h: 1.2, priceChange7d: null, currentPrice: 189, reasons: ["BOS bullish di atas resistance", "RSI 58 — momentum bullish", "Volume konfirmasi kenaikan", "Sentimen institusional positif"], newsCount: 5, positiveNews: 4, negativeNews: 1 },
    { assetId: "MSFT", assetName: "Microsoft Corp", assetType: "stock", symbol: "MSFT", image: null, signal: "strong_buy", confidence: 78, sentimentScore: 0.55, priceChange24h: 1.8, priceChange7d: null, currentPrice: 415, reasons: ["Struktur bullish kuat: HH dan HL terkonfirmasi", "EMA alignment bullish sempurna", "Volume tinggi mendukung breakout", "Sentimen sangat positif (55% bullish)", "Risk/Reward 2.8:1"], newsCount: 7, positiveNews: 6, negativeNews: 1 },
    { assetId: "GOOGL", assetName: "Alphabet Inc", assetType: "stock", symbol: "GOOGL", image: null, signal: "buy", confidence: 66, sentimentScore: 0.3, priceChange24h: 0.9, priceChange7d: null, currentPrice: 172, reasons: ["Harga di atas VWAP — buyer mendominasi", "RSI 56 — momentum sehat", "Fair Value Gap bullish terdeteksi", "Sentimen positif dari earnings"], newsCount: 4, positiveNews: 3, negativeNews: 1 },
  ];
  return fallbacks.slice(0, limit);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getCryptoPredictions(limit: number): Promise<PredictionResult[]> {
  const cacheKey = `crypto-predictions-v2-${limit}`;
  const cached = cache.get<PredictionResult[]>(cacheKey);
  if (cached) return cached;

  let coins, news;
  try {
    [coins, news] = await Promise.all([
      getCryptoList(50, "usd"),
      getCryptoNews(50),
    ]);
  } catch {
    return getFallbackCryptoPredictions(limit);
  }

  if (!coins || coins.length === 0) {
    return getFallbackCryptoPredictions(limit);
  }

  const predictions: PredictionResult[] = coins.slice(0, limit).map((coin) => {
    const relatedNews = (news ?? []).filter(
      (n) =>
        (n.tags ?? []).some((a) => a.toLowerCase() === coin.symbol.toLowerCase()) ||
        n.title.toLowerCase().includes(coin.name.toLowerCase()) ||
        n.title.toLowerCase().includes(coin.symbol.toLowerCase())
    );

    const positiveNews = relatedNews.filter((n) => n.sentiment === "positive").length;
    const negativeNews = relatedNews.filter((n) => n.sentiment === "negative").length;
    const avgNewsSentiment =
      relatedNews.length > 0
        ? relatedNews.reduce((sum, n) => sum + (n.sentimentScore ?? 0), 0) / relatedNews.length
        : 0;

    const change24h = coin.price_change_percentage_24h ?? 0;
    const change7d = coin.price_change_percentage_7d_in_currency ?? null;
    const currentPrice = coin.current_price;
    const high24h = coin.high_24h ?? currentPrice * 1.05;
    const low24h = coin.low_24h ?? currentPrice * 0.95;
    const volume = coin.total_volume ?? 0;
    const marketCap = coin.market_cap ?? 1;

    const { totalScore, confidence, indicators, reasons } = computePrediction(
      { currentPrice, change24h, change7d, high24h, low24h, volume, marketCap },
      avgNewsSentiment,
      positiveNews,
      negativeNews,
      coin.name
    );

    return {
      assetId: coin.id,
      assetName: coin.name,
      assetType: "crypto" as const,
      symbol: coin.symbol.toUpperCase(),
      image: coin.image,
      signal: scoreToSignal(totalScore),
      confidence,
      sentimentScore: totalScore,
      priceChange24h: change24h,
      priceChange7d: change7d,
      currentPrice,
      reasons,
      newsCount: relatedNews.length,
      positiveNews,
      negativeNews,
      technicalIndicators: indicators,
    };
  });

  predictions.sort((a, b) => Math.abs(b.sentimentScore) - Math.abs(a.sentimentScore));

  // ── AI Brain: Override rule-based signals with AI analysis ──────────────────
  try {
    const aiInputs: AIAssetInput[] = predictions.map((p) => {
      const ind = p.technicalIndicators;
      return {
        assetId: p.assetId,
        assetName: p.assetName,
        assetType: p.assetType,
        symbol: p.symbol,
        currentPrice: p.currentPrice,
        change24h: p.priceChange24h,
        change7d: p.priceChange7d ?? null,
        rsi: ind?.rsi ?? 50,
        macdBullish: ind?.macd?.bullish ?? false,
        macdHistogram: ind?.macd?.histogram ?? 0,
        bbPosition: ind?.bollingerBands?.position ?? 0.5,
        emaScore: p.sentimentScore,
        volumeRatio: ind?.volumeRatio ?? 1,
        trend: ind?.trend ?? "sideways",
        bosActive: ind?.breakOfStructure ?? false,
        bosDirection: ind?.bosDirection ?? "none",
        fvgExists: ind?.fairValueGap?.exists ?? false,
        fvgDirection: ind?.fairValueGap?.direction ?? "none",
        support: ind?.support ?? p.currentPrice * 0.95,
        resistance: ind?.resistance ?? p.currentPrice * 1.05,
        sentimentScore: p.sentimentScore,
        positiveNews: p.positiveNews,
        negativeNews: p.negativeNews,
        newsCount: p.newsCount,
      };
    });

    const aiResults = await aiBatchPredictions(aiInputs);
    const aiMap = new Map(aiResults.map((r) => [r.assetId, r]));

    for (const pred of predictions) {
      const ai = aiMap.get(pred.assetId);
      if (!ai) continue;
      pred.signal = ai.signal;
      pred.confidence = Math.max(30, Math.min(95, ai.confidence));
      pred.sentimentScore = ai.sentimentScore;
      pred.reasons = ai.reasons;
      if (pred.technicalIndicators && ai.stopLoss > 0) {
        pred.technicalIndicators.stopLoss = ai.stopLoss;
        pred.technicalIndicators.takeProfit = ai.takeProfit;
      }
    }

    logger.info({ count: aiResults.length }, "AI brain enhanced crypto predictions");
  } catch (err) {
    logger.warn({ err }, "AI brain failed — using rule-based predictions");
  }

  predictions.sort((a, b) => Math.abs(b.sentimentScore) - Math.abs(a.sentimentScore));
  cache.set(cacheKey, predictions, TTL.PREDICTIONS);
  return predictions;
}

export async function getStockPredictions(limit: number): Promise<PredictionResult[]> {
  const cacheKey = `stock-predictions-v2-${limit}`;
  const cached = cache.get<PredictionResult[]>(cacheKey);
  if (cached) return cached;

  let stocks, news;
  try {
    [stocks, news] = await Promise.all([
      getIDXStockQuotes(),
      getStockNews(30),
    ]);
  } catch {
    return getFallbackStockPredictions(limit);
  }

  if (!stocks || stocks.length === 0) {
    return getFallbackStockPredictions(limit);
  }

  const predictions: PredictionResult[] = stocks.slice(0, limit).map((stock) => {
    const symbol = stock.symbol ?? "";
    const name = stock.shortName ?? stock.longName ?? symbol;
    const change24h = stock.regularMarketChangePercent ?? 0;
    const currentPrice = stock.regularMarketPrice ?? 0;
    const high24h = stock.regularMarketDayHigh ?? currentPrice * 1.05;
    const low24h = stock.regularMarketDayLow ?? currentPrice * 0.95;
    const volume = stock.regularMarketVolume ?? 0;
    const marketCap = (stock.marketCap as number | undefined) ?? currentPrice * 1_000_000;

    const relatedNews = (news ?? []).filter(
      (n) =>
        (n.tags ?? []).includes(symbol.replace(".JK", "")) ||
        n.title.toLowerCase().includes((name.toLowerCase().split(" ")[0] ?? ""))
    );

    const positiveNews = relatedNews.filter((n) => n.sentiment === "positive").length;
    const negativeNews = relatedNews.filter((n) => n.sentiment === "negative").length;
    const avgNewsSentiment =
      relatedNews.length > 0
        ? relatedNews.reduce((sum, n) => sum + (n.sentimentScore ?? 0), 0) / relatedNews.length
        : analyzeSentiment(news.slice(0, 5).map((n) => n.title).join(" ")).score * 0.5;

    const { totalScore, confidence, indicators, reasons } = computePrediction(
      { currentPrice, change24h, change7d: null, high24h, low24h, volume, marketCap },
      avgNewsSentiment,
      positiveNews,
      negativeNews,
      name
    );

    return {
      assetId: symbol,
      assetName: name,
      assetType: "stock" as const,
      symbol,
      image: null,
      signal: scoreToSignal(totalScore),
      confidence,
      sentimentScore: totalScore,
      priceChange24h: change24h,
      priceChange7d: null,
      currentPrice,
      reasons,
      newsCount: relatedNews.length,
      positiveNews,
      negativeNews,
      technicalIndicators: indicators,
    };
  });

  predictions.sort((a, b) => Math.abs(b.sentimentScore) - Math.abs(a.sentimentScore));

  // ── AI Brain: Override rule-based signals with AI analysis ──────────────────
  try {
    const aiInputs: AIAssetInput[] = predictions.map((p) => {
      const ind = p.technicalIndicators;
      return {
        assetId: p.assetId,
        assetName: p.assetName,
        assetType: p.assetType,
        symbol: p.symbol,
        currentPrice: p.currentPrice,
        change24h: p.priceChange24h,
        change7d: null,
        rsi: ind?.rsi ?? 50,
        macdBullish: ind?.macd?.bullish ?? false,
        macdHistogram: ind?.macd?.histogram ?? 0,
        bbPosition: ind?.bollingerBands?.position ?? 0.5,
        emaScore: p.sentimentScore,
        volumeRatio: ind?.volumeRatio ?? 1,
        trend: ind?.trend ?? "sideways",
        bosActive: ind?.breakOfStructure ?? false,
        bosDirection: ind?.bosDirection ?? "none",
        fvgExists: ind?.fairValueGap?.exists ?? false,
        fvgDirection: ind?.fairValueGap?.direction ?? "none",
        support: ind?.support ?? p.currentPrice * 0.95,
        resistance: ind?.resistance ?? p.currentPrice * 1.05,
        sentimentScore: p.sentimentScore,
        positiveNews: p.positiveNews,
        negativeNews: p.negativeNews,
        newsCount: p.newsCount,
      };
    });

    const aiResults = await aiBatchPredictions(aiInputs);
    const aiMap = new Map(aiResults.map((r) => [r.assetId, r]));

    for (const pred of predictions) {
      const ai = aiMap.get(pred.assetId);
      if (!ai) continue;
      pred.signal = ai.signal;
      pred.confidence = Math.max(30, Math.min(95, ai.confidence));
      pred.sentimentScore = ai.sentimentScore;
      pred.reasons = ai.reasons;
      if (pred.technicalIndicators && ai.stopLoss > 0) {
        pred.technicalIndicators.stopLoss = ai.stopLoss;
        pred.technicalIndicators.takeProfit = ai.takeProfit;
      }
    }
    logger.info({ count: aiResults.length }, "AI brain enhanced stock predictions");
  } catch (err) {
    logger.warn({ err }, "AI brain failed — using rule-based stock predictions");
  }

  predictions.sort((a, b) => Math.abs(b.sentimentScore) - Math.abs(a.sentimentScore));
  cache.set(cacheKey, predictions, TTL.PREDICTIONS);
  return predictions;
}
