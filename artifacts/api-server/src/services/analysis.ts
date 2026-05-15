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
  bullishConf: boolean;
  bearishConf: boolean;
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
  side: "Buy" | "Sell" | null;
  shouldEnter: boolean;
  waitReason: string | null;
  // Should exit an EXISTING position?
  shouldExitLong: boolean;
  shouldExitShort: boolean;
  exitReason: string | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
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
    if (i < period - 1) { result.push(NaN); continue; }
    if (i === period - 1) { result.push(prev); continue; }
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
  return 100 - 100 / (1 + avgGain / avgLoss);
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
  const slice = klines.slice(-100);
  let cumPV = 0, cumV = 0;
  for (const k of slice) {
    const tp = (k.high + k.low + k.close) / 3;
    cumPV += tp * k.volume;
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
    if (klines.slice(i - lookback, i).every((k) => k.high <= h) &&
        klines.slice(i + 1, i + lookback + 1).every((k) => k.high <= h))
      highs.push(h);
  }
  return highs.slice(-6);
}

function swingLows(klines: Kline[], lookback = 5): number[] {
  const lows: number[] = [];
  for (let i = lookback; i < klines.length - lookback; i++) {
    const l = klines[i].low;
    if (klines.slice(i - lookback, i).every((k) => k.low >= l) &&
        klines.slice(i + 1, i + lookback + 1).every((k) => k.low >= l))
      lows.push(l);
  }
  return lows.slice(-6);
}

function detectCandlePattern(klines: Kline[]): string | null {
  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  if (!last || !prev) return null;
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low || 0.0001;
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  if (prev.close < prev.open && last.close > last.open && last.close > prev.open && last.open < prev.close) return "Bullish Engulfing";
  if (prev.close > prev.open && last.close < last.open && last.close < prev.open && last.open > prev.close) return "Bearish Engulfing";
  if (lowerWick > body * 2 && upperWick < body * 0.5 && last.close > last.open) return "Hammer (Bullish)";
  if (upperWick > body * 2 && lowerWick < body * 0.5 && last.close < last.open) return "Shooting Star (Bearish)";
  if (body / range < 0.1) return "Doji (Indecision)";
  return null;
}

// ─── Single-timeframe analysis ────────────────────────────────────────────────

function analyzeTimeframe(klines: Kline[], interval: string): TimeframeSignal {
  if (klines.length < 50) {
    return { interval, trend: "sideways", momentum: "weak", bullishConf: false, bearishConf: false,
      ema20: 0, ema50: 0, rsi: 50, volumeRatio: 1, candlePattern: null, note: "Insufficient data" };
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
  const momentum: "strong" | "normal" | "weak" = strongMomentum ? "strong" : volRatio > 0.8 ? "normal" : "weak";

  const bullishConf = trend === "up" && rsiVal > 45 && rsiVal < 75 && volRatio >= 0.9;
  const bearishConf = trend === "down" && rsiVal < 55 && rsiVal > 25 && volRatio >= 0.9;

  let note = "";
  if (trend === "up") note = `EMA bullish, RSI ${rsiVal.toFixed(0)}`;
  else if (trend === "down") note = `EMA bearish, RSI ${rsiVal.toFixed(0)}`;
  else note = `Sideways, RSI ${rsiVal.toFixed(0)}`;
  if (volRatio > 1.5) note += " · Volume spike";
  if (pattern) note += ` · ${pattern}`;

  return { interval, trend, momentum, bullishConf, bearishConf, ema20: e20, ema50: e50,
    rsi: rsiVal, volumeRatio: volRatio, candlePattern: pattern, note };
}

// ─── Full analysis ────────────────────────────────────────────────────────────

const analysisCache = new Map<string, { data: FullAnalysis; at: number }>();
const CACHE_TTL = 30_000;

export async function analyzeSymbol(symbol: string): Promise<FullAnalysis> {
  const cached = analysisCache.get(symbol);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

  logger.info({ symbol }, "Running full bidirectional technical analysis");

  const intervals: [string, string, number][] = [
    ["1", "1m", 200], ["5", "5m", 200], ["15", "15m", 200], ["60", "1h", 200],
  ];

  const klineMap: Record<string, Kline[]> = {};
  await Promise.all(intervals.map(async ([bybitInterval, label, limit]) => {
    try { klineMap[label] = await fetchKlines(symbol, bybitInterval, limit); }
    catch (err) { logger.warn({ symbol, interval: label, err }, "Failed to fetch klines"); klineMap[label] = []; }
  }));

  const primary = klineMap["15m"];
  if (!primary || primary.length < 50) throw new Error(`Insufficient data for ${symbol}`);

  const closes = primary.map((k) => k.close);
  const price = closes[closes.length - 1];

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

  const hourly = klineMap["1h"].length > 20 ? klineMap["1h"] : primary;
  const rawResistance = swingHighs(hourly).filter((h) => h > price).sort((a, b) => a - b);
  const rawSupport = swingLows(hourly).filter((l) => l < price).sort((a, b) => b - a);
  const nearestResistance = rawResistance[0] ?? price * 1.03;
  const nearestSupport = rawSupport[0] ?? price * 0.97;

  const multiTimeframe: Record<string, TimeframeSignal> = {};
  for (const [, label] of intervals) {
    multiTimeframe[label] = analyzeTimeframe(klineMap[label] ?? [], label);
  }

  const tfBullish = Object.values(multiTimeframe).filter((t) => t.trend === "up").length;
  const tfBearish = Object.values(multiTimeframe).filter((t) => t.trend === "down").length;
  const tfTotal = Object.values(multiTimeframe).length;

  const distToSupport = nearestSupport > 0 ? (price - nearestSupport) / price : 1;
  const distToResistance = nearestResistance > 0 ? (nearestResistance - price) / price : 1;
  const pattern15m = detectCandlePattern(primary);

  // ── Bullish scoring ──────────────────────────────────────────────────────────
  let bullScore = 0;
  let bullConf = 0;
  const bullReasons: string[] = [];
  const bullWarnings: string[] = [];

  if (emaAlignment === "bullish") {
    bullReasons.push("EMA 20 > 50 > 200 — tren bullish jangka panjang"); bullScore += 25; bullConf++;
  } else if (emaAlignment === "bearish") {
    bullWarnings.push("EMA bearish alignment — tren jangka panjang turun"); bullScore -= 10;
  } else { bullWarnings.push("EMA belum selaras — pasar masih ranging"); }

  if (price > e20) {
    bullReasons.push(`Harga di atas EMA20 ($${e20.toFixed(4)}) — momentum bullish`); bullScore += 10; bullConf++;
  } else { bullWarnings.push("Harga di bawah EMA20"); bullScore -= 5; }

  if (priceVsVwap === "above") {
    bullReasons.push(`Harga di atas VWAP ($${vwapVal.toFixed(4)}) — buyers in control`); bullScore += 15; bullConf++;
  } else { bullWarnings.push("Harga di bawah VWAP — seller dominan"); bullScore -= 10; }

  if (rsiVal >= 45 && rsiVal <= 65) {
    bullReasons.push(`RSI ${rsiVal.toFixed(0)} — zona bullish optimal (45–65)`); bullScore += 15; bullConf++;
  } else if (rsiVal > 65 && rsiVal < 75) {
    bullReasons.push(`RSI ${rsiVal.toFixed(0)} — momentum kuat`); bullScore += 8;
  } else if (rsiVal >= 75) {
    bullWarnings.push(`RSI ${rsiVal.toFixed(0)} — overbought, risiko reversal`); bullScore -= 15;
  } else if (rsiVal < 35) {
    bullWarnings.push(`RSI ${rsiVal.toFixed(0)} — oversold, perlu konfirmasi`); bullScore -= 5;
  }

  if (volRatio >= 1.5) {
    bullReasons.push(`Volume ${(volRatio * 100).toFixed(0)}% di atas rata-rata`); bullScore += 15; bullConf++;
  } else if (volRatio >= 1.0) {
    bullReasons.push(`Volume normal`); bullScore += 5;
  } else { bullWarnings.push(`Volume rendah (${(volRatio * 100).toFixed(0)}%)`); bullScore -= 5; }

  if (tfBullish >= 3) {
    bullReasons.push(`${tfBullish}/${tfTotal} timeframe bullish — konfirmasi multi-TF kuat`); bullScore += 20; bullConf++;
  } else if (tfBullish === 2) {
    bullReasons.push(`${tfBullish}/${tfTotal} timeframe bullish`); bullScore += 10; bullConf++;
  } else { bullWarnings.push(`Hanya ${tfBullish}/${tfTotal} TF bullish`); bullScore -= 10; }

  if (pattern15m?.includes("Bullish")) {
    bullReasons.push(`Candle: ${pattern15m}`); bullScore += 10; bullConf++;
  } else if (pattern15m?.includes("Bearish")) {
    bullWarnings.push(`Candle: ${pattern15m} — potensi reversal bearish`); bullScore -= 10;
  }

  if (distToSupport < 0.015) {
    bullReasons.push(`Harga dekat support ($${nearestSupport.toFixed(4)}) — area beli optimal`); bullScore += 10; bullConf++;
  }
  if (distToResistance < 0.008) {
    bullWarnings.push(`Terlalu dekat resistance ($${nearestResistance.toFixed(4)})`); bullScore -= 15;
  }

  // ── Bearish scoring ──────────────────────────────────────────────────────────
  let bearScore = 0;
  let bearConf = 0;
  const bearReasons: string[] = [];
  const bearWarnings: string[] = [];

  if (emaAlignment === "bearish") {
    bearReasons.push("EMA 20 < 50 < 200 — tren bearish jangka panjang"); bearScore += 25; bearConf++;
  } else if (emaAlignment === "bullish") {
    bearWarnings.push("EMA bullish alignment — kontra tren"); bearScore -= 10;
  } else { bearWarnings.push("EMA belum selaras — ranging"); }

  if (price < e20) {
    bearReasons.push(`Harga di bawah EMA20 ($${e20.toFixed(4)}) — momentum bearish`); bearScore += 10; bearConf++;
  } else { bearWarnings.push("Harga masih di atas EMA20"); bearScore -= 5; }

  if (priceVsVwap === "below") {
    bearReasons.push(`Harga di bawah VWAP ($${vwapVal.toFixed(4)}) — sellers in control`); bearScore += 15; bearConf++;
  } else { bearWarnings.push("Harga di atas VWAP — buyer masih dominan"); bearScore -= 10; }

  if (rsiVal <= 55 && rsiVal >= 35) {
    bearReasons.push(`RSI ${rsiVal.toFixed(0)} — zona bearish optimal (35–55)`); bearScore += 15; bearConf++;
  } else if (rsiVal < 35 && rsiVal > 25) {
    bearReasons.push(`RSI ${rsiVal.toFixed(0)} — momentum turun kuat`); bearScore += 8;
  } else if (rsiVal <= 25) {
    bearWarnings.push(`RSI ${rsiVal.toFixed(0)} — oversold, risiko reversal`); bearScore -= 15;
  } else if (rsiVal > 65) {
    bearWarnings.push(`RSI ${rsiVal.toFixed(0)} — overbought, butuh konfirmasi short`); bearScore -= 5;
  }

  if (volRatio >= 1.5) {
    bearReasons.push(`Volume ${(volRatio * 100).toFixed(0)}% di atas rata-rata — konfirmasi bearish kuat`); bearScore += 15; bearConf++;
  } else if (volRatio >= 1.0) {
    bearReasons.push(`Volume normal`); bearScore += 5;
  } else { bearWarnings.push(`Volume rendah (${(volRatio * 100).toFixed(0)}%)`); bearScore -= 5; }

  if (tfBearish >= 3) {
    bearReasons.push(`${tfBearish}/${tfTotal} timeframe bearish — konfirmasi multi-TF kuat`); bearScore += 20; bearConf++;
  } else if (tfBearish === 2) {
    bearReasons.push(`${tfBearish}/${tfTotal} timeframe bearish`); bearScore += 10; bearConf++;
  } else { bearWarnings.push(`Hanya ${tfBearish}/${tfTotal} TF bearish`); bearScore -= 10; }

  if (pattern15m?.includes("Bearish")) {
    bearReasons.push(`Candle: ${pattern15m} — konfirmasi reversal bearish`); bearScore += 10; bearConf++;
  } else if (pattern15m?.includes("Bullish")) {
    bearWarnings.push(`Candle: ${pattern15m} — kontra arah short`); bearScore -= 10;
  }

  if (distToResistance < 0.015) {
    bearReasons.push(`Harga dekat resistance ($${nearestResistance.toFixed(4)}) — area short optimal`); bearScore += 10; bearConf++;
  }
  if (distToSupport < 0.008) {
    bearWarnings.push(`Terlalu dekat support ($${nearestSupport.toFixed(4)})`); bearScore -= 15;
  }

  // ── Determine direction ──────────────────────────────────────────────────────
  const bullConfidence = Math.min(99, Math.max(10, Math.round(50 + bullScore)));
  const bearConfidence = Math.min(99, Math.max(10, Math.round(50 + bearScore)));

  let marketDirection: "BULLISH" | "BEARISH" | "SIDEWAYS";
  let side: "Buy" | "Sell" | null;
  let overallConfidence: number;
  let confirmations: number;
  let reasons: string[];
  let warnings: string[];

  if (bullScore > bearScore && bullConfidence >= 60) {
    marketDirection = "BULLISH"; side = "Buy";
    overallConfidence = bullConfidence; confirmations = bullConf;
    reasons = bullReasons; warnings = bullWarnings;
  } else if (bearScore > bullScore && bearConfidence >= 60) {
    marketDirection = "BEARISH"; side = "Sell";
    overallConfidence = bearConfidence; confirmations = bearConf;
    reasons = bearReasons; warnings = bearWarnings;
  } else {
    marketDirection = "SIDEWAYS"; side = null;
    overallConfidence = Math.max(bullConfidence, bearConfidence);
    confirmations = Math.max(bullConf, bearConf);
    reasons = []; warnings = ["Market ranging — tidak ada arah yang dominan"];
  }

  // ── SL / TP (direction-aware, ATR-based) ───────────────────────────────────
  const slDistance = Math.max(atrVal * 1.5, price * 0.012);
  const tpDistance = slDistance * 2.5;
  const entryPrice = price;

  let stopLoss: number;
  let takeProfit: number;

  if (side === "Sell") {
    stopLoss = entryPrice + slDistance;   // SL above entry for shorts
    takeProfit = entryPrice - tpDistance; // TP below entry for shorts
  } else {
    stopLoss = entryPrice - slDistance;   // SL below entry for longs
    takeProfit = entryPrice + tpDistance; // TP above entry for longs
  }

  const riskRewardRatio = tpDistance / slDistance;

  // ── Entry & exit decisions ──────────────────────────────────────────────────
  let shouldEnter = overallConfidence >= 65 && confirmations >= 3 && side !== null;
  let waitReason: string | null = null;

  if (!shouldEnter) {
    if (side === null) waitReason = "Market sideways — tidak ada setup yang jelas, tunggu breakout";
    else if (overallConfidence < 65) waitReason = `Confidence rendah (${overallConfidence}%) — butuh lebih banyak konfirmasi`;
    else if (confirmations < 3) waitReason = `Hanya ${confirmations} konfirmasi — butuh minimal 3`;
    else waitReason = "Kondisi market belum optimal";
  }

  // Hard stops
  if (side === "Buy" && rsiVal >= 78) {
    shouldEnter = false;
    waitReason = `RSI ${rsiVal.toFixed(0)} overbought ekstrem — tunggu pullback sebelum long`;
  }
  if (side === "Sell" && rsiVal <= 22) {
    shouldEnter = false;
    waitReason = `RSI ${rsiVal.toFixed(0)} oversold ekstrem — tunggu rebound sebelum short`;
  }

  // ── Exit signals for existing positions ─────────────────────────────────────
  // Existing LONG should exit if market is now clearly BEARISH
  const shouldExitLong =
    marketDirection === "BEARISH" &&
    bearConfidence >= 68 &&
    bearConf >= 3;

  // Existing SHORT should exit if market is now clearly BULLISH
  const shouldExitShort =
    marketDirection === "BULLISH" &&
    bullConfidence >= 68 &&
    bullConf >= 3;

  let exitReason: string | null = null;
  if (shouldExitLong) exitReason = `Tren berbalik BEARISH (${bearConfidence}% confidence, ${bearConf} konfirmasi) — close LONG`;
  if (shouldExitShort) exitReason = `Tren berbalik BULLISH (${bullConfidence}% confidence, ${bullConf} konfirmasi) — close SHORT`;

  const analysis: FullAnalysis = {
    symbol, analyzedAt: Date.now(), marketDirection, overallConfidence, side,
    shouldEnter, waitReason, shouldExitLong, shouldExitShort, exitReason,
    entryPrice, stopLoss, takeProfit, riskRewardRatio,
    reasons, warnings, confirmations,
    indicators: { ema20: e20, ema50: e50, ema200: e200, vwap: vwapVal, rsi14: rsiVal,
      atr14: atrVal, volumeRatio: volRatio, priceVsVwap, emaAlignment, rsiZone },
    multiTimeframe,
    supportResistance: { support: rawSupport.slice(0, 3), resistance: rawResistance.slice(0, 3), nearestSupport, nearestResistance },
  };

  analysisCache.set(symbol, { data: analysis, at: Date.now() });
  logger.info({ symbol, confidence: overallConfidence, shouldEnter, side, marketDirection, confirmations }, "Analysis complete");
  return analysis;
}
