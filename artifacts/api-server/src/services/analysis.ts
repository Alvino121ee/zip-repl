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

export interface MacdData {
  macd: number;
  signal: number;
  histogram: number;
  trend: "bullish" | "bearish" | "neutral";
  crossover: "golden" | "death" | "none";
}

export interface MarketStructure {
  structure: "bullish" | "bearish" | "ranging";
  pattern: string;
  lastHigh: number;
  lastLow: number;
  prevHigh: number;
  prevLow: number;
}

export interface SupplyDemandZones {
  supplyZone: { high: number; low: number } | null;
  demandZone: { high: number; low: number } | null;
}

export interface FakeBreakout {
  isFakeBreakoutUp: boolean;
  isFakeBreakoutDown: boolean;
  note: string | null;
}

export interface FullAnalysis {
  symbol: string;
  analyzedAt: number;
  marketDirection: "BULLISH" | "BEARISH" | "SIDEWAYS";
  overallConfidence: number;
  indicatorAgreementPct: number;
  side: "Buy" | "Sell" | null;
  shouldEnter: boolean;
  waitReason: string | null;
  shouldExitLong: boolean;
  shouldExitShort: boolean;
  exitReason: string | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  optimalEntry: number;
  entryQuality: "optimal" | "good" | "risky";
  entryNote: string | null;
  scalpTargets: { tp05pct: number; tp1pct: number; sl: number };
  recommendedLeverage: number;
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
  macdData: MacdData;
  marketStructure: MarketStructure;
  openInterest: { value: number; change: number } | null;
  fundingRate: { rate: number; nextFundingTime: number } | null;
  fakeBreakout: FakeBreakout;
  supplyDemandZones: SupplyDemandZones;
  signalGrade: "A" | "B" | "C";
  trendStrength: number;
  rsiDivergence: "bullish" | "bearish" | "none";
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

// ─── Public market data ───────────────────────────────────────────────────────

async function fetchOpenInterest(symbol: string): Promise<{ value: number; change: number } | null> {
  try {
    const url = `${BYBIT_BASE}/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=5min&limit=2`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      retCode: number;
      result: { list: Array<{ openInterest: string; timestamp: string }> };
    };
    if (data.retCode !== 0 || !data.result?.list?.length) return null;
    const list = data.result.list;
    const current = parseFloat(list[0].openInterest);
    const previous = list[1] ? parseFloat(list[1].openInterest) : current;
    const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    return { value: current, change };
  } catch {
    return null;
  }
}

async function fetchFundingRate(symbol: string): Promise<{ rate: number; nextFundingTime: number } | null> {
  try {
    const url = `${BYBIT_BASE}/v5/market/tickers?category=linear&symbol=${symbol}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      retCode: number;
      result: { list: Array<{ fundingRate: string; nextFundingTime: string }> };
    };
    if (data.retCode !== 0 || !data.result?.list?.length) return null;
    const ticker = data.result.list[0];
    return {
      rate: parseFloat(ticker.fundingRate) * 100,
      nextFundingTime: parseInt(ticker.nextFundingTime),
    };
  } catch {
    return null;
  }
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

function bollinger(closes: number[], period = 20, mult = 2): { upper: number; middle: number; lower: number; bandWidth: number } {
  const slice = closes.slice(-period);
  if (slice.length < period) return { upper: closes[closes.length - 1] * 1.02, middle: closes[closes.length - 1], lower: closes[closes.length - 1] * 0.98, bandWidth: 0.04 };
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - sma) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  const band = stdDev * mult;
  return { upper: sma + band, middle: sma, lower: sma - band, bandWidth: sma > 0 ? (band * 2) / sma : 0 };
}

function consecutiveCandleDirection(klines: Kline[], n = 6): number {
  const recent = klines.slice(-n);
  let bull = 0, bear = 0;
  for (const k of recent) {
    if (k.close > k.open * 1.0001) bull++;
    else if (k.close < k.open * 0.9999) bear++;
  }
  return bull - bear; // +6 = all bull, -6 = all bear
}

function detectRsiDivergence(klines: Kline[], closes: number[]): "bullish" | "bearish" | "none" {
  const half = 15;
  if (klines.length < half * 2 + 14 || closes.length < half * 2 + 14) return "none";
  const firstKlines = klines.slice(-(half * 2), -half);
  const secondKlines = klines.slice(-half);
  const priceHigh1 = Math.max(...firstKlines.map((k) => k.high));
  const priceHigh2 = Math.max(...secondKlines.map((k) => k.high));
  const priceLow1 = Math.min(...firstKlines.map((k) => k.low));
  const priceLow2 = Math.min(...secondKlines.map((k) => k.low));
  const rsi1 = rsi(closes.slice(-(half * 2 + 14), -half));
  const rsi2 = rsi(closes.slice(-(half + 14)));
  // Bearish divergence: price HH but RSI LH
  if (priceHigh2 > priceHigh1 * 1.003 && rsi2 < rsi1 - 4) return "bearish";
  // Bullish divergence: price LL but RSI HL
  if (priceLow2 < priceLow1 * 0.997 && rsi2 > rsi1 + 4) return "bullish";
  return "none";
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

// ─── MACD ─────────────────────────────────────────────────────────────────────

function computeMacd(closes: number[]): MacdData {
  if (closes.length < 35) return { macd: 0, signal: 0, histogram: 0, trend: "neutral", crossover: "none" };

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(ema12[i]) || isNaN(ema26[i])) { macdLine.push(NaN); continue; }
    macdLine.push(ema12[i] - ema26[i]);
  }
  const validMacd = macdLine.filter((v) => !isNaN(v));
  if (validMacd.length < 9) return { macd: 0, signal: 0, histogram: 0, trend: "neutral", crossover: "none" };

  const signalLine = ema(validMacd, 9);
  const lastMacd = validMacd[validMacd.length - 1];
  const prevMacd = validMacd[validMacd.length - 2];
  const lastSignal = signalLine[signalLine.length - 1];
  const prevSignal = signalLine[signalLine.length - 2];
  const histogram = lastMacd - lastSignal;

  let trend: "bullish" | "bearish" | "neutral" = "neutral";
  if (lastMacd > lastSignal && lastMacd > 0) trend = "bullish";
  else if (lastMacd < lastSignal && lastMacd < 0) trend = "bearish";
  else if (lastMacd > lastSignal) trend = "bullish";
  else if (lastMacd < lastSignal) trend = "bearish";

  let crossover: "golden" | "death" | "none" = "none";
  if (!isNaN(prevMacd) && !isNaN(prevSignal)) {
    if (prevMacd <= prevSignal && lastMacd > lastSignal) crossover = "golden";
    else if (prevMacd >= prevSignal && lastMacd < lastSignal) crossover = "death";
  }

  return { macd: lastMacd, signal: lastSignal, histogram, trend, crossover };
}

// ─── Market structure (HH/HL/LH/LL) ──────────────────────────────────────────

function detectMarketStructure(klines: Kline[]): MarketStructure {
  if (klines.length < 30) {
    return { structure: "ranging", pattern: "Insufficient data", lastHigh: 0, lastLow: 0, prevHigh: 0, prevLow: 0 };
  }

  const highs = swingHighs(klines, 3);
  const lows = swingLows(klines, 3);

  if (highs.length < 2 || lows.length < 2) {
    const lastH = klines[klines.length - 1].high;
    const lastL = klines[klines.length - 1].low;
    return { structure: "ranging", pattern: "Ranging", lastHigh: lastH, lastLow: lastL, prevHigh: lastH, prevLow: lastL };
  }

  const lastHigh = highs[highs.length - 1];
  const prevHigh = highs[highs.length - 2];
  const lastLow = lows[lows.length - 1];
  const prevLow = lows[lows.length - 2];

  const hh = lastHigh > prevHigh;
  const hl = lastLow > prevLow;
  const lh = lastHigh < prevHigh;
  const ll = lastLow < prevLow;

  if (hh && hl) return { structure: "bullish", pattern: "HH + HL (Uptrend)", lastHigh, lastLow, prevHigh, prevLow };
  if (lh && ll) return { structure: "bearish", pattern: "LH + LL (Downtrend)", lastHigh, lastLow, prevHigh, prevLow };
  if (hh && ll) return { structure: "ranging", pattern: "HH + LL (Volatile)", lastHigh, lastLow, prevHigh, prevLow };
  if (lh && hl) return { structure: "ranging", pattern: "LH + HL (Compression)", lastHigh, lastLow, prevHigh, prevLow };

  return { structure: "ranging", pattern: "Ranging", lastHigh, lastLow, prevHigh, prevLow };
}

// ─── Supply & Demand zones ────────────────────────────────────────────────────

function detectSupplyDemandZones(klines: Kline[], price: number): SupplyDemandZones {
  if (klines.length < 30) return { supplyZone: null, demandZone: null };
  const avgVol = klines.slice(-20).reduce((s, k) => s + k.volume, 0) / 20;
  const highVolCandles = klines.slice(-60).filter((k) => k.volume > avgVol * 1.5);
  const supplyCandles = highVolCandles.filter((k) => k.close < k.open && k.high > price);
  const demandCandles = highVolCandles.filter((k) => k.close > k.open && k.low < price);
  const supplyZone = supplyCandles.length > 0 ? {
    high: Math.max(...supplyCandles.map((k) => k.high)),
    low: Math.min(...supplyCandles.map((k) => k.low)),
  } : null;
  const demandZone = demandCandles.length > 0 ? {
    high: Math.max(...demandCandles.map((k) => k.high)),
    low: Math.min(...demandCandles.map((k) => k.low)),
  } : null;
  return { supplyZone, demandZone };
}

// ─── Fake breakout detection ──────────────────────────────────────────────────

function detectFakeBreakout(klines: Kline[], resistance: number, support: number): FakeBreakout {
  if (klines.length < 4) return { isFakeBreakoutUp: false, isFakeBreakoutDown: false, note: null };
  const last = klines[klines.length - 1];
  const prev1 = klines[klines.length - 2];
  const prev2 = klines[klines.length - 3];

  const isFakeBreakoutUp =
    prev2.close < resistance && prev1.close > resistance && last.close < resistance;
  const isFakeBreakoutDown =
    prev2.close > support && prev1.close < support && last.close > support;

  let note = null;
  if (isFakeBreakoutUp) note = `Fake breakout resistance $${resistance.toFixed(4)} — waspada reversal bearish`;
  if (isFakeBreakoutDown) note = `Fake breakout support $${support.toFixed(4)} — waspada reversal bullish`;

  return { isFakeBreakoutUp, isFakeBreakoutDown, note };
}

// ─── Leverage recommender ─────────────────────────────────────────────────────

function recommendLeverage(confidence: number, atrPct: number): number {
  if (atrPct > 4) return 1;
  if (atrPct > 3) return confidence >= 85 ? 2 : 1;
  if (atrPct > 2) return confidence >= 85 ? 3 : 2;
  if (atrPct > 1) return confidence >= 85 ? 5 : 3;
  if (atrPct > 0.5) return confidence >= 90 ? 10 : 5;
  return confidence >= 90 ? 15 : 10;
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

  logger.info({ symbol }, "Running full scalping AI analysis");

  const intervals: [string, string, number][] = [
    ["1", "1m", 200], ["5", "5m", 200], ["15", "15m", 200], ["60", "1h", 200],
  ];

  const [klineResults, openInterest, fundingRate] = await Promise.all([
    Promise.all(intervals.map(async ([bybitInterval, label, limit]) => {
      try {
        const data = await fetchKlines(symbol, bybitInterval, limit);
        return { label, data };
      } catch (err) {
        logger.warn({ symbol, interval: label, err }, "Failed to fetch klines");
        return { label, data: [] as Kline[] };
      }
    })),
    fetchOpenInterest(symbol),
    fetchFundingRate(symbol),
  ]);

  const klineMap: Record<string, Kline[]> = {};
  for (const { label, data } of klineResults) klineMap[label] = data;

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

  // ── New indicators ────────────────────────────────────────────────────────
  const macdData = computeMacd(closes);
  const marketStructure = detectMarketStructure(klineMap["1h"].length > 20 ? klineMap["1h"] : primary);
  const supplyDemandZones = detectSupplyDemandZones(primary, price);
  const fakeBreakout = detectFakeBreakout(primary, nearestResistance, nearestSupport);
  const atrPct = (atrVal / price) * 100;

  const multiTimeframe: Record<string, TimeframeSignal> = {};
  for (const [, label] of intervals) {
    multiTimeframe[label] = analyzeTimeframe(klineMap[label] ?? [], label);
  }

  const tfBullish = Object.values(multiTimeframe).filter((t) => t.trend === "up").length;
  const tfBearish = Object.values(multiTimeframe).filter((t) => t.trend === "down").length;
  const tfTotal = Object.values(multiTimeframe).length;

  // ── Smart: weighted MTF, Bollinger Bands, candle direction, RSI divergence ──
  const bb = bollinger(closes, 20, 2);
  const candleDirection = consecutiveCandleDirection(primary, 6);
  const rsiDiv = detectRsiDivergence(primary, closes);
  const mtf1h = multiTimeframe["1h"] ?? multiTimeframe["15m"];
  const mtf15m = multiTimeframe["15m"];
  const mtf5m  = multiTimeframe["5m"];
  const mtf1m  = multiTimeframe["1m"];
  const bullMtfWeighted = (mtf1h?.trend === "up" ? 3 : 0) + (mtf15m?.trend === "up" ? 2 : 0) + (mtf5m?.trend === "up" ? 1 : 0) + (mtf1m?.trend === "up" ? 0.5 : 0);
  const bearMtfWeighted = (mtf1h?.trend === "down" ? 3 : 0) + (mtf15m?.trend === "down" ? 2 : 0) + (mtf5m?.trend === "down" ? 1 : 0) + (mtf1m?.trend === "down" ? 0.5 : 0);
  const MTF_MAX = 6.5;
  const bullMtfRatio = bullMtfWeighted / MTF_MAX;
  const bearMtfRatio = bearMtfWeighted / MTF_MAX;

  const distToSupport = nearestSupport > 0 ? (price - nearestSupport) / price : 1;
  const distToResistance = nearestResistance > 0 ? (nearestResistance - price) / price : 1;
  const pattern15m = detectCandlePattern(primary);

  // ── Funding rate bias ─────────────────────────────────────────────────────
  // Positive funding = longs pay shorts (bearish bias risk for longs)
  // Negative funding = shorts pay longs (bullish bias risk for shorts)
  const fundingBias = fundingRate
    ? fundingRate.rate > 0.05 ? "bearish_pressure"
    : fundingRate.rate < -0.05 ? "bullish_pressure"
    : "neutral"
    : "neutral";

  // ── OI momentum ───────────────────────────────────────────────────────────
  const oiRising = openInterest ? openInterest.change > 1 : false;
  const oiFalling = openInterest ? openInterest.change < -1 : false;

  // ─────────────────────────────────────────────────────────────────────────
  // BULLISH SCORING — each indicator is tracked for agreement %
  // ─────────────────────────────────────────────────────────────────────────
  let bullScore = 0;
  let bullConf = 0;
  let bullIndicatorTotal = 0;
  let bullIndicatorAgree = 0;
  const bullReasons: string[] = [];
  const bullWarnings: string[] = [];

  function bullCheck(agrees: boolean, weight: number, reason: string, warning: string) {
    bullIndicatorTotal++;
    if (agrees) { bullIndicatorAgree++; bullScore += weight; bullConf++; bullReasons.push(reason); }
    else { bullScore -= Math.floor(weight / 2); if (warning) bullWarnings.push(warning); }
  }

  // EMA alignment
  bullCheck(emaAlignment === "bullish", 20, "EMA 20>50>200 — tren bullish jangka panjang", "EMA alignment tidak bullish");
  bullCheck(price > e20, 10, `Harga di atas EMA20 ($${e20.toFixed(4)}) — momentum bullish`, "Harga di bawah EMA20");
  bullCheck(priceVsVwap === "above", 12, `Harga di atas VWAP ($${vwapVal.toFixed(4)}) — buyers in control`, "Harga di bawah VWAP — seller dominan");
  bullCheck(rsiVal >= 45 && rsiVal <= 68, 12, `RSI ${rsiVal.toFixed(0)} di zona bullish optimal (45–68)`, `RSI ${rsiVal.toFixed(0)} di luar zona optimal`);
  bullCheck(volRatio >= 1.2, 12, `Volume spike ${(volRatio * 100).toFixed(0)}% di atas rata-rata — konfirmasi kuat`, `Volume rendah (${(volRatio * 100).toFixed(0)}%)`);
  bullCheck(bullMtfRatio >= 0.6, 20, `MTF weighted ${(bullMtfRatio * 100).toFixed(0)}% bullish (1h×3 + 15m×2 + 5m + 1m×0.5)`, `MTF bullish lemah (${(bullMtfRatio * 100).toFixed(0)}%) — 1h/15m tidak konfirmasi`);
  bullCheck(macdData.trend === "bullish", 12, `MACD ${macdData.crossover === "golden" ? "golden cross" : "bullish"} — momentum naik`, "MACD bearish / sideways");
  bullCheck(marketStructure.structure === "bullish", 12, `Market structure HH+HL — uptrend terstruktur`, "Market structure tidak bullish");
  bullCheck(distToSupport < 0.02, 8, `Harga dekat support ($${nearestSupport.toFixed(4)}) — area beli optimal`, "");
  bullCheck(!fakeBreakout.isFakeBreakoutUp, 4, "", "Fake breakout resistance terdeteksi — waspada");
  bullCheck(price <= bb.lower * 1.015, 8, `Harga dekat Bollinger Band bawah — zona beli teknikal optimal`, "");
  if (candleDirection >= 3) { bullScore += 6; bullConf++; bullReasons.push(`${candleDirection}/6 candle terakhir bullish — momentum kuat`); bullIndicatorAgree++; bullIndicatorTotal++; }
  else if (candleDirection <= -4) { bullScore -= 8; bullWarnings.push(`${Math.abs(candleDirection)} candle bearish berturut — kontra bullish`); bullIndicatorTotal++; }
  if (rsiDiv === "bullish") { bullScore += 7; bullConf++; bullReasons.push("RSI bullish divergence — konfirmasi reversal naik"); bullIndicatorAgree++; bullIndicatorTotal++; }
  else if (rsiDiv === "bearish") { bullWarnings.push("RSI bearish divergence — harga naik tapi RSI melemah, waspada reversal"); bullIndicatorTotal++; }
  if (pattern15m?.includes("Bullish")) { bullScore += 10; bullConf++; bullReasons.push(`Candle pattern: ${pattern15m}`); bullIndicatorAgree++; }
  if (pattern15m?.includes("Bearish")) { bullScore -= 10; bullWarnings.push(`Candle: ${pattern15m} — kontra bullish`); }
  bullIndicatorTotal++;
  if (oiRising) { bullScore += 6; bullReasons.push(`Open interest naik ${openInterest!.change.toFixed(2)}% — money inflow`); bullIndicatorAgree++; }
  if (oiFalling) { bullScore -= 4; bullWarnings.push("Open interest turun — potensi profit taking"); }
  bullIndicatorTotal++;
  if (fundingBias === "bearish_pressure") { bullScore -= 6; bullWarnings.push(`Funding rate tinggi (${fundingRate!.rate.toFixed(4)}%) — longs membayar`); }
  else if (fundingBias === "bullish_pressure") { bullScore += 4; bullReasons.push(`Funding rate negatif (${fundingRate!.rate.toFixed(4)}%) — menguntungkan long`); bullIndicatorAgree++; }
  else bullIndicatorAgree++;
  bullIndicatorTotal++;
  if (supplyDemandZones.demandZone && price <= supplyDemandZones.demandZone.high * 1.005) {
    bullScore += 8; bullReasons.push(`Harga di zona demand (${supplyDemandZones.demandZone.low.toFixed(4)}–${supplyDemandZones.demandZone.high.toFixed(4)})`);
    bullIndicatorAgree++; bullIndicatorTotal++;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BEARISH SCORING
  // ─────────────────────────────────────────────────────────────────────────
  let bearScore = 0;
  let bearConf = 0;
  let bearIndicatorTotal = 0;
  let bearIndicatorAgree = 0;
  const bearReasons: string[] = [];
  const bearWarnings: string[] = [];

  function bearCheck(agrees: boolean, weight: number, reason: string, warning: string) {
    bearIndicatorTotal++;
    if (agrees) { bearIndicatorAgree++; bearScore += weight; bearConf++; bearReasons.push(reason); }
    else { bearScore -= Math.floor(weight / 2); if (warning) bearWarnings.push(warning); }
  }

  bearCheck(emaAlignment === "bearish", 20, "EMA 20<50<200 — tren bearish jangka panjang", "EMA alignment tidak bearish");
  bearCheck(price < e20, 10, `Harga di bawah EMA20 ($${e20.toFixed(4)}) — momentum bearish`, "Harga masih di atas EMA20");
  bearCheck(priceVsVwap === "below", 12, `Harga di bawah VWAP ($${vwapVal.toFixed(4)}) — sellers in control`, "Harga di atas VWAP — buyers masih dominan");
  bearCheck(rsiVal <= 55 && rsiVal >= 32, 12, `RSI ${rsiVal.toFixed(0)} di zona bearish optimal (32–55)`, `RSI ${rsiVal.toFixed(0)} di luar zona optimal`);
  bearCheck(volRatio >= 1.2, 12, `Volume spike ${(volRatio * 100).toFixed(0)}% di atas rata-rata — konfirmasi bearish`, `Volume rendah (${(volRatio * 100).toFixed(0)}%)`);
  bearCheck(bearMtfRatio >= 0.6, 20, `MTF weighted ${(bearMtfRatio * 100).toFixed(0)}% bearish (1h×3 + 15m×2 + 5m + 1m×0.5)`, `MTF bearish lemah (${(bearMtfRatio * 100).toFixed(0)}%) — 1h/15m tidak konfirmasi`);
  bearCheck(macdData.trend === "bearish", 12, `MACD ${macdData.crossover === "death" ? "death cross" : "bearish"} — momentum turun`, "MACD bullish / sideways");
  bearCheck(marketStructure.structure === "bearish", 12, `Market structure LH+LL — downtrend terstruktur`, "Market structure tidak bearish");
  bearCheck(distToResistance < 0.02, 8, `Harga dekat resistance ($${nearestResistance.toFixed(4)}) — area short optimal`, "");
  bearCheck(!fakeBreakout.isFakeBreakoutDown, 4, "", "Fake breakout support terdeteksi — waspada");
  bearCheck(price >= bb.upper * 0.985, 8, `Harga dekat Bollinger Band atas — zona short teknikal optimal`, "");
  if (candleDirection <= -3) { bearScore += 6; bearConf++; bearReasons.push(`${Math.abs(candleDirection)}/6 candle terakhir bearish — momentum turun kuat`); bearIndicatorAgree++; bearIndicatorTotal++; }
  else if (candleDirection >= 4) { bearScore -= 8; bearWarnings.push(`${candleDirection} candle bullish berturut — kontra bearish`); bearIndicatorTotal++; }
  if (rsiDiv === "bearish") { bearScore += 7; bearConf++; bearReasons.push("RSI bearish divergence — harga naik tapi RSI melemah, konfirmasi distribusi"); bearIndicatorAgree++; bearIndicatorTotal++; }
  else if (rsiDiv === "bullish") { bearWarnings.push("RSI bullish divergence — potensi reversal naik, waspada saat short"); bearIndicatorTotal++; }
  if (pattern15m?.includes("Bearish")) { bearScore += 10; bearConf++; bearReasons.push(`Candle pattern: ${pattern15m}`); bearIndicatorAgree++; }
  if (pattern15m?.includes("Bullish")) { bearScore -= 10; bearWarnings.push(`Candle: ${pattern15m} — kontra bearish`); }
  bearIndicatorTotal++;
  if (oiFalling) { bearScore += 6; bearReasons.push(`Open interest turun ${openInterest!.change.toFixed(2)}% — short pressure meningkat`); bearIndicatorAgree++; }
  if (oiRising) { bearScore -= 4; bearWarnings.push("Open interest naik — bisa jadi short squeeze"); }
  bearIndicatorTotal++;
  if (fundingBias === "bullish_pressure") { bearScore -= 6; bearWarnings.push(`Funding rate negatif (${fundingRate!.rate.toFixed(4)}%) — shorts membayar`); }
  else if (fundingBias === "bearish_pressure") { bearScore += 4; bearReasons.push(`Funding rate tinggi (${fundingRate!.rate.toFixed(4)}%) — menguntungkan short`); bearIndicatorAgree++; }
  else bearIndicatorAgree++;
  bearIndicatorTotal++;
  if (supplyDemandZones.supplyZone && price >= supplyDemandZones.supplyZone.low * 0.995) {
    bearScore += 8; bearReasons.push(`Harga di zona supply (${supplyDemandZones.supplyZone.low.toFixed(4)}–${supplyDemandZones.supplyZone.high.toFixed(4)})`);
    bearIndicatorAgree++; bearIndicatorTotal++;
  }

  // ── Determine direction ──────────────────────────────────────────────────
  const bullConfidence = Math.min(99, Math.max(10, Math.round(50 + bullScore)));
  const bearConfidence = Math.min(99, Math.max(10, Math.round(50 + bearScore)));
  const bullAgreementPct = bullIndicatorTotal > 0 ? Math.round((bullIndicatorAgree / bullIndicatorTotal) * 100) : 0;
  const bearAgreementPct = bearIndicatorTotal > 0 ? Math.round((bearIndicatorAgree / bearIndicatorTotal) * 100) : 0;

  let marketDirection: "BULLISH" | "BEARISH" | "SIDEWAYS";
  let side: "Buy" | "Sell" | null;
  let overallConfidence: number;
  let confirmations: number;
  let reasons: string[];
  let warnings: string[];
  let indicatorAgreementPct: number;

  if (bullScore > bearScore && bullConfidence >= 60) {
    marketDirection = "BULLISH"; side = "Buy";
    overallConfidence = bullConfidence; confirmations = bullConf;
    reasons = bullReasons; warnings = bullWarnings;
    indicatorAgreementPct = bullAgreementPct;
  } else if (bearScore > bullScore && bearConfidence >= 60) {
    marketDirection = "BEARISH"; side = "Sell";
    overallConfidence = bearConfidence; confirmations = bearConf;
    reasons = bearReasons; warnings = bearWarnings;
    indicatorAgreementPct = bearAgreementPct;
  } else {
    marketDirection = "SIDEWAYS"; side = null;
    overallConfidence = Math.max(bullConfidence, bearConfidence);
    confirmations = Math.max(bullConf, bearConf);
    reasons = []; warnings = ["Market ranging — tidak ada arah yang dominan, hindari entry"];
    indicatorAgreementPct = Math.max(bullAgreementPct, bearAgreementPct);
  }

  // ── SL / TP — ATR-based, scalp-friendly ─────────────────────────────────
  const slDistance = Math.max(atrVal * 1.5, price * 0.01);
  const tpDistance = slDistance * 2.5; // RR 2.5:1 minimum
  const entryPrice = price;

  let stopLoss: number;
  let takeProfit: number;

  if (side === "Sell") {
    stopLoss = entryPrice + slDistance;
    takeProfit = entryPrice - tpDistance;
  } else {
    stopLoss = entryPrice - slDistance;
    takeProfit = entryPrice + tpDistance;
  }

  const riskRewardRatio = tpDistance / slDistance;

  // Scalp targets (quick 0.5% and 1% profit levels)
  const scalpTargets = side === "Sell"
    ? { tp05pct: entryPrice * (1 - 0.005), tp1pct: entryPrice * (1 - 0.01), sl: stopLoss }
    : { tp05pct: entryPrice * (1 + 0.005), tp1pct: entryPrice * (1 + 0.01), sl: stopLoss };

  const recommendedLeverage = recommendLeverage(overallConfidence, atrPct);

  // ── Entry decision — strict 80%+ rule ───────────────────────────────────
  const SCALP_MIN_CONFIDENCE = 80;
  const SCALP_MIN_AGREEMENT = 75; // at least 75% indicators must agree
  const SCALP_MIN_CONFIRMATIONS = 4;

  let shouldEnter = false;
  let waitReason: string | null = null;

  if (side === null) {
    waitReason = "Market sideways — tidak ada setup jelas, tunggu breakout";
  } else if (overallConfidence < SCALP_MIN_CONFIDENCE) {
    waitReason = `Confidence ${overallConfidence}% di bawah standar scalping (≥${SCALP_MIN_CONFIDENCE}%) — tunggu konfirmasi lebih banyak`;
  } else if (indicatorAgreementPct < SCALP_MIN_AGREEMENT) {
    waitReason = `Hanya ${indicatorAgreementPct}% indikator setuju (butuh ≥${SCALP_MIN_AGREEMENT}%) — entry terlalu berisiko`;
  } else if (confirmations < SCALP_MIN_CONFIRMATIONS) {
    waitReason = `Hanya ${confirmations} konfirmasi (butuh ≥${SCALP_MIN_CONFIRMATIONS}) — setup belum cukup kuat`;
  } else if (riskRewardRatio < 1.5) {
    waitReason = `Risk/Reward ${riskRewardRatio.toFixed(1)}x terlalu rendah (butuh ≥1.5x)`;
  } else {
    shouldEnter = true;
  }

  // Hard stops
  if (side === "Buy" && rsiVal >= 78) {
    shouldEnter = false;
    waitReason = `RSI ${rsiVal.toFixed(0)} overbought ekstrem — tunggu pullback`;
  }
  if (side === "Sell" && rsiVal <= 22) {
    shouldEnter = false;
    waitReason = `RSI ${rsiVal.toFixed(0)} oversold ekstrem — tunggu rebound`;
  }
  if (fakeBreakout.isFakeBreakoutUp && side === "Buy") {
    shouldEnter = false;
    waitReason = `Fake breakout resistance terdeteksi — hindari LONG sekarang`;
  }
  if (fakeBreakout.isFakeBreakoutDown && side === "Sell") {
    shouldEnter = false;
    waitReason = `Fake breakout support terdeteksi — hindari SHORT sekarang`;
  }
  // Risk: funding rate extreme — market too crowded
  if (side === "Buy" && fundingRate && fundingRate.rate > 0.1) {
    shouldEnter = false;
    waitReason = `Funding rate ${fundingRate.rate.toFixed(4)}% — pasar terlalu crowded long, risiko long squeeze tinggi`;
  }
  if (side === "Sell" && fundingRate && fundingRate.rate < -0.1) {
    shouldEnter = false;
    waitReason = `Funding rate ${fundingRate.rate.toFixed(4)}% — pasar terlalu crowded short, risiko short squeeze tinggi`;
  }
  // Risk: chasing price — too far from EMA20
  const distEma20Pct = ((price - e20) / e20) * 100;
  if (side === "Buy" && distEma20Pct > 2.5) {
    shouldEnter = false;
    waitReason = `Harga ${distEma20Pct.toFixed(1)}% di atas EMA20 — chasing, tunggu pullback ke $${e20.toFixed(4)}`;
  }
  if (side === "Sell" && distEma20Pct < -2.5) {
    shouldEnter = false;
    waitReason = `Harga ${Math.abs(distEma20Pct).toFixed(1)}% di bawah EMA20 — chasing, tunggu rebound ke $${e20.toFixed(4)}`;
  }
  // Risk: resistance too close for LONG (bad RR)
  const distResistancePct = nearestResistance > 0 ? ((nearestResistance - price) / price) * 100 : 99;
  if (side === "Buy" && distResistancePct < 0.8) {
    shouldEnter = false;
    waitReason = `Resistance $${nearestResistance.toFixed(4)} hanya ${distResistancePct.toFixed(1)}% dari harga — RR terlalu buruk untuk LONG`;
  }
  // Risk: support too close for SHORT (bad RR)
  const distSupportPct = nearestSupport > 0 ? ((price - nearestSupport) / price) * 100 : 99;
  if (side === "Sell" && distSupportPct < 0.8) {
    shouldEnter = false;
    waitReason = `Support $${nearestSupport.toFixed(4)} hanya ${distSupportPct.toFixed(1)}% dari harga — RR terlalu buruk untuk SHORT`;
  }
  // Risk: volume too low — low conviction
  if (shouldEnter && volRatio < 0.7) {
    shouldEnter = false;
    waitReason = `Volume hanya ${(volRatio * 100).toFixed(0)}% rata-rata — konfirmasi lemah, skip entry`;
  }

  // ── Exit signals for existing positions ──────────────────────────────────
  const shouldExitLong = marketDirection === "BEARISH" && bearConfidence >= 72 && bearConf >= 4;
  const shouldExitShort = marketDirection === "BULLISH" && bullConfidence >= 72 && bullConf >= 4;
  let exitReason: string | null = null;
  if (shouldExitLong) exitReason = `Tren berbalik BEARISH (${bearConfidence}% conf, ${bearConf} konfirmasi) — close LONG`;
  if (shouldExitShort) exitReason = `Tren berbalik BULLISH (${bullConfidence}% conf, ${bullConf} konfirmasi) — close SHORT`;

  // ── Optimal entry calculation ─────────────────────────────────────────────
  let optimalEntry: number;
  let entryQuality: "optimal" | "good" | "risky";
  let entryNote: string | null;
  if (side === "Buy") {
    const pullbackTarget = nearestSupport > 0 && nearestSupport < price ? Math.max(e20, nearestSupport) : e20;
    optimalEntry = pullbackTarget > 0 && pullbackTarget < price ? pullbackTarget : price;
    const distPct = optimalEntry < price ? ((price - optimalEntry) / optimalEntry) * 100 : 0;
    if (distPct <= 0.5) { entryQuality = "optimal"; entryNote = `Harga di zona EMA20/Support — entry sekarang sudah optimal`; }
    else if (distPct <= 2.0) { entryQuality = "good"; entryNote = `Tunggu pullback ke $${optimalEntry.toFixed(4)} (${distPct.toFixed(1)}% lebih rendah) untuk rate lebih baik`; }
    else { entryQuality = "risky"; entryNote = `Entry saat ini ${distPct.toFixed(1)}% di atas optimal — idealnya tunggu pullback ke $${optimalEntry.toFixed(4)}`; }
  } else if (side === "Sell") {
    const bounceTarget = nearestResistance > price ? Math.min(e20 > price ? e20 : nearestResistance, nearestResistance) : e20;
    optimalEntry = bounceTarget > price ? bounceTarget : price;
    const distPct = optimalEntry > price ? ((optimalEntry - price) / price) * 100 : 0;
    if (distPct <= 0.5) { entryQuality = "optimal"; entryNote = `Harga di zona EMA20/Resistance — entry sekarang sudah optimal`; }
    else if (distPct <= 2.0) { entryQuality = "good"; entryNote = `Tunggu bounce ke $${optimalEntry.toFixed(4)} (${distPct.toFixed(1)}% lebih tinggi) untuk rate lebih baik`; }
    else { entryQuality = "risky"; entryNote = `Entry saat ini ${distPct.toFixed(1)}% di bawah optimal — idealnya tunggu bounce ke $${optimalEntry.toFixed(4)}`; }
  } else {
    optimalEntry = price; entryQuality = "risky"; entryNote = null;
  }

  const analysis: FullAnalysis = {
    symbol, analyzedAt: Date.now(), marketDirection, overallConfidence, indicatorAgreementPct,
    side, shouldEnter, waitReason, shouldExitLong, shouldExitShort, exitReason,
    entryPrice, stopLoss, takeProfit, riskRewardRatio, optimalEntry, entryQuality, entryNote, scalpTargets, recommendedLeverage,
    reasons, warnings, confirmations,
    indicators: { ema20: e20, ema50: e50, ema200: e200, vwap: vwapVal, rsi14: rsiVal,
      atr14: atrVal, volumeRatio: volRatio, priceVsVwap, emaAlignment, rsiZone },
    macdData, marketStructure, openInterest, fundingRate, fakeBreakout, supplyDemandZones,
    multiTimeframe,
    supportResistance: { support: rawSupport.slice(0, 3), resistance: rawResistance.slice(0, 3), nearestSupport, nearestResistance },
  };

  analysisCache.set(symbol, { data: analysis, at: Date.now() });
  logger.info({ symbol, confidence: overallConfidence, agreementPct: indicatorAgreementPct, shouldEnter, side, marketDirection, confirmations }, "Scalping analysis complete");
  return analysis;
}
