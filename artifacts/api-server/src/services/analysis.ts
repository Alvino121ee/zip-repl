import { logger } from "../lib/logger.js";

const BYBIT_BASE = "https://api.bybit.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

export interface TimeframeSignal {
  interval: string;
  trend: "up" | "down" | "sideways";
  momentum: "strong" | "normal" | "weak";
  confirmation: boolean;
  ema20: number;
  ema50: number;
  rsi: number;
  volumeRatio: number;
  candlePattern: string | null;
  note: string;
}

export interface FullAnalysis {
  symbol: string;
  analyzedAt: number;
  marketDirection: "BULLISH" | "BEARISH" | "SIDEWAYS";
  overallConfidence: number;
  shouldEnter: boolean;
  waitReason: string | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  side: "Buy" | "Sell";
  reasons: string[];
  warnings: string[];
  confirmations: number;
  indicators: {
    ema20: number;
    ema50: number;
    ema200: number;
    vwap: number;
    rsi14: number;
    atr14: number;
    volumeRatio: number;
    priceVsVwap: "above" | "below";
    emaAlignment: "bullish" | "bearish" | "mixed";
    rsiZone: "overbought" | "oversold" | "neutral";
  };
  multiTimeframe: Record<string, TimeframeSignal>;
  supportResistance: {
    support: number[];
    resistance: number[];
    nearestSupport: number;
    nearestResistance: number;
  };
}

// ─── Kline fetcher ────────────────────────────────────────────────────────────

async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<Kline[]> {
  const url = `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    retCode: number;
    result: { list: string[][] };
  };
  if (data.retCode !== 0) throw new Error(`Kline fetch failed: ${data.retCode}`);

  // Bybit returns newest first → reverse so index 0 = oldest
  return data.result.list
    .map((r) => ({
      time: parseInt(r[0]),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
      turnover: parseFloat(r[6]),
    }))
    .reverse();
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    if (i === period - 1) {
      result.push(prev);
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(Math.max(0, diff));
    losses.push(Math.max(0, -diff));
  }
  const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(klines: Kline[], period = 14): number {
  const trs = klines.slice(1).map((k, i) => {
    const prev = klines[i];
    return Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close));
  });
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function vwap(klines: Kline[]): number {
  // Session VWAP: use last 100 candles as "session"
  const slice = klines.slice(-100);
  let cumPV = 0;
  let cumV = 0;
  for (const k of slice) {
    const typicalPrice = (k.high + k.low + k.close) / 3;
    cumPV += typicalPrice * k.volume;
    cumV += k.volume;
  }
  return cumV > 0 ? cumPV / cumV : klines[klines.length - 1].close;
}

function avgVolume(klines: Kline[], period = 20): number {
  const recent = klines.slice(-period - 1, -1);
  if (recent.length === 0) return 1;
  return recent.reduce((a, b) => a + b.volume, 0) / recent.length;
}

function swingHighs(klines: Kline[], lookback = 5): number[] {
  const highs: number[] = [];
  for (let i = lookback; i < klines.length - lookback; i++) {
    const h = klines[i].high;
    const isHigh = klines.slice(i - lookback, i).every((k) => k.high <= h) &&
      klines.slice(i + 1, i + lookback + 1).every((k) => k.high <= h);
    if (isHigh) highs.push(h);
  }
  return highs.slice(-6);
}

function swingLows(klines: Kline[], lookback = 5): number[] {
  const lows: number[] = [];
  for (let i = lookback; i < klines.length - lookback; i++) {
    const l = klines[i].low;
    const isLow = klines.slice(i - lookback, i).every((k) => k.low >= l) &&
      klines.slice(i + 1, i + lookback + 1).every((k) => k.low >= l);
    if (isLow) lows.push(l);
  }
  return lows.slice(-6);
}

function detectCandlePattern(klines: Kline[]): string | null {
  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  if (!last || !prev) return null;

  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const doji = body / (range || 1) < 0.1;
  const bullishEngulf =
    prev.close < prev.open &&
    last.close > last.open &&
    last.close > prev.open &&
    last.open < prev.close;
  const hammer =
    lowerWick > body * 2 &&
    upperWick < body * 0.5 &&
    last.close > last.open;
  const shootingStar =
    upperWick > body * 2 &&
    lowerWick < body * 0.5 &&
    last.close < last.open;

  if (bullishEngulf) return "Bullish Engulfing";
  if (hammer) return "Hammer (Bullish)";
  if (shootingStar) return "Shooting Star (Bearish)";
  if (doji) return "Doji (Indecision)";
  return null;
}

// ─── Single-timeframe analysis ────────────────────────────────────────────────

function analyzeTimeframe(klines: Kline[], interval: string): TimeframeSignal {
  if (klines.length < 50) {
    return {
      interval, trend: "sideways", momentum: "weak", confirmation: false,
      ema20: 0, ema50: 0, rsi: 50, volumeRatio: 1, candlePattern: null,
      note: "Insufficient data",
    };
  }

  const closes = klines.map((k) => k.close);
  const price = closes[closes.length - 1];

  const ema20s = ema(closes, 20);
  const ema50s = ema(closes, 50);
  const e20 = ema20s[ema20s.length - 1];
  const e50 = ema50s[ema50s.length - 1];
  const rsiVal = rsi(closes);
  const avgVol = avgVolume(klines);
  const currVol = klines[klines.length - 1].volume;
  const volRatio = avgVol > 0 ? currVol / avgVol : 1;
  const pattern = detectCandlePattern(klines);

  const bullishEma = e20 > e50 && price > e20;
  const bearishEma = e20 < e50 && price < e20;
  const trend: "up" | "down" | "sideways" = bullishEma ? "up" : bearishEma ? "down" : "sideways";
  const strongMomentum = volRatio > 1.5 && (rsiVal > 55 || rsiVal < 45);
  const momentum: "strong" | "normal" | "weak" = strongMomentum
    ? "strong"
    : volRatio > 0.8
    ? "normal"
    : "weak";

  const confirmation =
    trend === "up" && rsiVal > 45 && rsiVal < 75 && volRatio >= 0.9;

  let note = "";
  if (trend === "up") note = `EMA bullish, RSI ${rsiVal.toFixed(0)}`;
  else if (trend === "down") note = `EMA bearish, RSI ${rsiVal.toFixed(0)}`;
  else note = `Sideways, RSI ${rsiVal.toFixed(0)}`;
  if (volRatio > 1.5) note += " · Volume spike";
  if (pattern) note += ` · ${pattern}`;

  return { interval, trend, momentum, confirmation, ema20: e20, ema50: e50, rsi: rsiVal, volumeRatio: volRatio, candlePattern: pattern, note };
}

// ─── Full analysis ────────────────────────────────────────────────────────────

// Cache to avoid hammering kline API
const analysisCache = new Map<string, { data: FullAnalysis; at: number }>();
const CACHE_TTL = 30_000; // 30s

export async function analyzeSymbol(symbol: string): Promise<FullAnalysis> {
  const cached = analysisCache.get(symbol);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

  logger.info({ symbol }, "Running full technical analysis");

  const intervals: [string, string, number][] = [
    ["1", "1m", 200],
    ["5", "5m", 200],
    ["15", "15m", 200],
    ["60", "1h", 200],
  ];

  const klineMap: Record<string, Kline[]> = {};

  await Promise.all(
    intervals.map(async ([bybitInterval, label, limit]) => {
      try {
        klineMap[label] = await fetchKlines(symbol, bybitInterval, limit);
      } catch (err) {
        logger.warn({ symbol, interval: label, err }, "Failed to fetch klines");
        klineMap[label] = [];
      }
    })
  );

  // Use 15m as primary timeframe for indicators
  const primary = klineMap["15m"];
  if (!primary || primary.length < 50) {
    throw new Error(`Insufficient data for ${symbol}`);
  }

  const closes = primary.map((k) => k.close);
  const price = closes[closes.length - 1];

  // EMA on 15m
  const ema20s = ema(closes, 20);
  const ema50s = ema(closes, 50);
  const ema200s = ema(closes, Math.min(200, closes.length));
  const e20 = ema20s[ema20s.length - 1];
  const e50 = ema50s[ema50s.length - 1];
  const e200 = ema200s[ema200s.length - 1];

  const rsiVal = rsi(closes);
  const atrVal = atr(primary);
  const vwapVal = vwap(primary);
  const avgVol = avgVolume(primary);
  const currVol = primary[primary.length - 1].volume;
  const volRatio = avgVol > 0 ? currVol / avgVol : 1;

  const priceVsVwap: "above" | "below" = price > vwapVal ? "above" : "below";

  const emaAlignment: "bullish" | "bearish" | "mixed" =
    e20 > e50 && e50 > e200 ? "bullish" :
    e20 < e50 && e50 < e200 ? "bearish" : "mixed";

  const rsiZone: "overbought" | "oversold" | "neutral" =
    rsiVal > 70 ? "overbought" : rsiVal < 30 ? "oversold" : "neutral";

  // Support / Resistance from 1h
  const hourly = klineMap["1h"].length > 20 ? klineMap["1h"] : primary;
  const rawResistance = swingHighs(hourly).filter((h) => h > price).sort((a, b) => a - b);
  const rawSupport = swingLows(hourly).filter((l) => l < price).sort((a, b) => b - a);
  const nearestResistance = rawResistance[0] ?? price * 1.03;
  const nearestSupport = rawSupport[0] ?? price * 0.97;

  // Timeframe signals
  const multiTimeframe: Record<string, TimeframeSignal> = {};
  for (const [, label] of intervals) {
    multiTimeframe[label] = analyzeTimeframe(klineMap[label] ?? [], label);
  }

  // Score confirmations
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  let confirmations = 0;

  // EMA alignment
  if (emaAlignment === "bullish") {
    reasons.push("EMA 20 > 50 > 200 — Tren bullish jangka panjang");
    score += 25;
    confirmations++;
  } else if (emaAlignment === "bearish") {
    warnings.push("EMA bearish alignment — tren jangka panjang turun");
    score -= 10;
  } else {
    warnings.push("EMA belum selaras — pasar masih ranging");
  }

  // Price vs EMA20
  if (price > e20) {
    reasons.push(`Harga (${price.toFixed(4)}) di atas EMA20 (${e20.toFixed(4)}) — momentum bullish`);
    score += 10;
    confirmations++;
  } else {
    warnings.push(`Harga di bawah EMA20 — konfirmasi belum kuat`);
    score -= 5;
  }

  // Price vs VWAP
  if (priceVsVwap === "above") {
    reasons.push(`Harga di atas VWAP (${vwapVal.toFixed(4)}) — buyers in control`);
    score += 15;
    confirmations++;
  } else {
    warnings.push(`Harga di bawah VWAP — seller masih dominan`);
    score -= 10;
  }

  // RSI
  if (rsiVal >= 45 && rsiVal <= 65) {
    reasons.push(`RSI ${rsiVal.toFixed(0)} — zona bullish optimal (45–65)`);
    score += 15;
    confirmations++;
  } else if (rsiVal > 65 && rsiVal < 75) {
    reasons.push(`RSI ${rsiVal.toFixed(0)} — momentum kuat, belum overbought`);
    score += 8;
  } else if (rsiVal >= 75) {
    warnings.push(`RSI ${rsiVal.toFixed(0)} — overbought, risiko reversal tinggi`);
    score -= 15;
  } else if (rsiVal < 35) {
    warnings.push(`RSI ${rsiVal.toFixed(0)} — oversold, tren mungkin berlanjut turun`);
    score -= 10;
  }

  // Volume
  if (volRatio >= 1.5) {
    reasons.push(`Volume ${(volRatio * 100).toFixed(0)}% di atas rata-rata — konfirmasi kuat`);
    score += 15;
    confirmations++;
  } else if (volRatio >= 1.0) {
    reasons.push(`Volume normal (${(volRatio * 100).toFixed(0)}% rata-rata)`);
    score += 5;
  } else {
    warnings.push(`Volume rendah (${(volRatio * 100).toFixed(0)}% rata-rata) — signal tidak terkonfirmasi`);
    score -= 5;
  }

  // Multi-timeframe
  const tfBullish = Object.values(multiTimeframe).filter((t) => t.trend === "up").length;
  const tfTotal = Object.values(multiTimeframe).length;
  if (tfBullish >= 3) {
    reasons.push(`${tfBullish}/${tfTotal} timeframe bullish — konfirmasi multi-TF kuat`);
    score += 20;
    confirmations++;
  } else if (tfBullish === 2) {
    reasons.push(`${tfBullish}/${tfTotal} timeframe bullish — konfirmasi cukup`);
    score += 10;
    confirmations++;
  } else {
    warnings.push(`Hanya ${tfBullish}/${tfTotal} timeframe bullish — konfirmasi lemah`);
    score -= 10;
  }

  // Candle pattern on 15m
  const pattern15m = detectCandlePattern(primary);
  if (pattern15m && pattern15m.includes("Bullish")) {
    reasons.push(`Candle pattern: ${pattern15m} — konfirmasi reversal/continuation`);
    score += 10;
    confirmations++;
  } else if (pattern15m && pattern15m.includes("Bearish")) {
    warnings.push(`Candle pattern: ${pattern15m} — potensi reversal bearish`);
    score -= 10;
  }

  // Price near support
  const distToSupport = (price - nearestSupport) / price;
  if (distToSupport < 0.015) {
    reasons.push(`Harga dekat support (${nearestSupport.toFixed(4)}) — area beli yang bagus`);
    score += 10;
    confirmations++;
  }

  // Price near resistance — risk
  const distToResistance = (nearestResistance - price) / price;
  if (distToResistance < 0.008) {
    warnings.push(`Harga sangat dekat resistance (${nearestResistance.toFixed(4)}) — risiko rejection tinggi`);
    score -= 15;
  }

  // ATR-based SL/TP
  const slDistance = Math.max(atrVal * 1.5, price * 0.015);
  const tpDistance = slDistance * 2.5;
  const entryPrice = price;
  const stopLoss = entryPrice - slDistance;
  const takeProfit = entryPrice + tpDistance;
  const riskRewardRatio = tpDistance / slDistance;

  // Normalize confidence
  const overallConfidence = Math.min(99, Math.max(10, Math.round(50 + score)));

  // Market direction
  const marketDirection: "BULLISH" | "BEARISH" | "SIDEWAYS" =
    tfBullish >= 3 && emaAlignment === "bullish" ? "BULLISH" :
    tfBullish <= 1 && emaAlignment === "bearish" ? "BEARISH" :
    "SIDEWAYS";

  // Entry decision
  let shouldEnter = overallConfidence >= 65 && confirmations >= 3 && marketDirection !== "BEARISH";
  let waitReason: string | null = null;

  if (!shouldEnter) {
    if (marketDirection === "BEARISH") waitReason = "Tren bearish — hindari entry long";
    else if (overallConfidence < 65) waitReason = `Confidence terlalu rendah (${overallConfidence}%) — tunggu setup lebih baik`;
    else if (confirmations < 3) waitReason = `Hanya ${confirmations} konfirmasi — butuh minimal 3`;
    else waitReason = "Kondisi market belum optimal";
  }

  if (rsiVal >= 75) {
    shouldEnter = false;
    waitReason = `RSI ${rsiVal.toFixed(0)} overbought — tunggu pullback`;
  }

  const analysis: FullAnalysis = {
    symbol,
    analyzedAt: Date.now(),
    marketDirection,
    overallConfidence,
    shouldEnter,
    waitReason,
    entryPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    side: "Buy",
    reasons,
    warnings,
    confirmations,
    indicators: {
      ema20: e20, ema50: e50, ema200: e200,
      vwap: vwapVal, rsi14: rsiVal, atr14: atrVal,
      volumeRatio: volRatio, priceVsVwap, emaAlignment, rsiZone,
    },
    multiTimeframe,
    supportResistance: {
      support: rawSupport.slice(0, 3),
      resistance: rawResistance.slice(0, 3),
      nearestSupport,
      nearestResistance,
    },
  };

  analysisCache.set(symbol, { data: analysis, at: Date.now() });
  logger.info(
    { symbol, confidence: overallConfidence, shouldEnter, confirmations, direction: marketDirection },
    "Analysis complete"
  );
  return analysis;
}
