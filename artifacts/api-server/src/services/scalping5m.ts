import { logger } from "../lib/logger.js";

const BYBIT_BASE = "https://api.bybit.com";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Scalp5mChecklist {
  emaCrossover: boolean;
  rsiInZone: boolean;
  volumeAboveAvg: boolean;
  tf15mAligned: boolean;
  rrMet: boolean;
  notOverboughtOversold: boolean;
  inTradingSession: boolean;
}

export interface Scalp5mSignal {
  symbol: string;          // e.g. "BTCUSDT"
  displayName: string;     // e.g. "BTC/USDT"
  side: "Buy" | "Sell" | null;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  ema9: number;
  ema21: number;
  rsi14: number;
  volumeRatio: number;
  trend15m: "bullish" | "bearish" | "sideways";
  crossoverType: "golden" | "death" | "none";
  crossoverBars: number;    // candles ago since crossover
  nearestSupport: number;
  nearestResistance: number;
  checklist: Scalp5mChecklist;
  allChecksPassed: boolean;
  session: TradingSession;
  analyzedAt: number;
  reasons: string[];
  warnings: string[];
}

export interface TradingSession {
  name: string;
  active: boolean;
  quality: "best" | "good" | "avoid" | "neutral";
  wibTime: string;
  nextSession: string;
}

export interface SessionStats {
  tradesCount: number;
  dailyPnl: number;
  dailyLossLimit: number;
  sessionStopped: boolean;
}

// In-memory session state (resets each day)
let sessionState = {
  date: "",
  tradesCount: 0,
  dailyPnl: 0.0,
  dailyLossLimit: -3.0,  // stop at -3% of capital
  sessionStopped: false,
};

export const SCALP_PAIRS = [
  { symbol: "BTCUSDT", displayName: "BTC/USDT" },
  { symbol: "ETHUSDT", displayName: "ETH/USDT" },
  { symbol: "SOLUSDT", displayName: "SOL/USDT" },
  { symbol: "BNBUSDT", displayName: "BNB/USDT" },
];

// ─── Session management ───────────────────────────────────────────────────────

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureSessionReset() {
  const today = getTodayStr();
  if (sessionState.date !== today) {
    sessionState = { date: today, tradesCount: 0, dailyPnl: 0.0, dailyLossLimit: -3.0, sessionStopped: false };
  }
}

export function getSessionStats(): SessionStats {
  ensureSessionReset();
  return { ...sessionState };
}

export function recordTrade(pnlPct: number) {
  ensureSessionReset();
  sessionState.tradesCount++;
  sessionState.dailyPnl += pnlPct;
  if (sessionState.dailyPnl <= sessionState.dailyLossLimit) sessionState.sessionStopped = true;
}

export function resetSessionStats() {
  sessionState = { date: getTodayStr(), tradesCount: 0, dailyPnl: 0.0, dailyLossLimit: -3.0, sessionStopped: false };
}

// ─── WIB Trading Session ──────────────────────────────────────────────────────

function getCurrentTradingSession(): TradingSession {
  const nowUtc = new Date();
  const wibHour = (nowUtc.getUTCHours() + 7) % 24;
  const wibMin = nowUtc.getUTCMinutes();
  const wibDecimal = wibHour + wibMin / 60;
  const wibStr = `${String(wibHour).padStart(2, "0")}:${String(wibMin).padStart(2, "0")} WIB`;

  // New York open: 20:00–23:00 WIB
  if (wibDecimal >= 20 && wibDecimal < 23) {
    return { name: "New York Open", active: true, quality: "best", wibTime: wibStr, nextSession: "London Open 14:00 WIB" };
  }
  // London open: 14:00–17:00 WIB
  if (wibDecimal >= 14 && wibDecimal < 17) {
    return { name: "London Open", active: true, quality: "best", wibTime: wibStr, nextSession: "New York Open 20:00 WIB" };
  }
  // Avoid: 01:00–07:00 WIB
  if (wibDecimal >= 1 && wibDecimal < 7) {
    return { name: "Dead Zone", active: false, quality: "avoid", wibTime: wibStr, nextSession: "London Open 14:00 WIB" };
  }
  // Pre-NY: 17:00–20:00 WIB
  if (wibDecimal >= 17 && wibDecimal < 20) {
    return { name: "Pre NY", active: false, quality: "good", wibTime: wibStr, nextSession: "New York Open 20:00 WIB" };
  }
  // Asian: 07:00–14:00 WIB
  return { name: "Asian Session", active: false, quality: "neutral", wibTime: wibStr, nextSession: "London Open 14:00 WIB" };
}

// ─── Kline fetcher ────────────────────────────────────────────────────────────

async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<Kline[]> {
  const url = `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  const data = (await res.json()) as { retCode: number; result: { list: string[][] } };
  if (data.retCode !== 0) throw new Error(`Kline ${symbol} ${interval} failed: ${data.retCode}`);
  return data.result.list
    .map((r) => ({ time: parseInt(r[0]), open: parseFloat(r[1]), high: parseFloat(r[2]),
      low: parseFloat(r[3]), close: parseFloat(r[4]), volume: parseFloat(r[5]) }))
    .reverse();
}

// ─── Indicators ───────────────────────────────────────────────────────────────

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
  const gains: number[] = [], losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(0, d)); losses.push(Math.max(0, -d));
  }
  const ag = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
  const al = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function avgVolume(klines: Kline[], period = 20): number {
  const recent = klines.slice(-period - 1, -1);
  return recent.length > 0 ? recent.reduce((s, k) => s + k.volume, 0) / recent.length : 1;
}

function swingHighs(klines: Kline[], lb = 3): number[] {
  const out: number[] = [];
  for (let i = lb; i < klines.length - lb; i++) {
    const h = klines[i].high;
    if (klines.slice(i - lb, i).every((k) => k.high <= h) &&
        klines.slice(i + 1, i + lb + 1).every((k) => k.high <= h)) out.push(h);
  }
  return out.slice(-5);
}

function swingLows(klines: Kline[], lb = 3): number[] {
  const out: number[] = [];
  for (let i = lb; i < klines.length - lb; i++) {
    const l = klines[i].low;
    if (klines.slice(i - lb, i).every((k) => k.low >= l) &&
        klines.slice(i + 1, i + lb + 1).every((k) => k.low >= l)) out.push(l);
  }
  return out.slice(-5);
}

// ─── Detect EMA crossover ─────────────────────────────────────────────────────

function detectEmaCrossover(ema9arr: number[], ema21arr: number[]): { type: "golden" | "death" | "none"; barsAgo: number } {
  // Look back up to 5 candles for a fresh crossover
  const len = Math.min(ema9arr.length, ema21arr.length);
  for (let i = 0; i < Math.min(5, len - 1); i++) {
    const idx = len - 1 - i;
    const curr9 = ema9arr[idx], curr21 = ema21arr[idx];
    const prev9 = ema9arr[idx - 1], prev21 = ema21arr[idx - 1];
    if (isNaN(curr9) || isNaN(curr21) || isNaN(prev9) || isNaN(prev21)) continue;
    if (prev9 <= prev21 && curr9 > curr21) return { type: "golden", barsAgo: i };
    if (prev9 >= prev21 && curr9 < curr21) return { type: "death", barsAgo: i };
  }
  return { type: "none", barsAgo: -1 };
}

// ─── Analyze a single pair ────────────────────────────────────────────────────

const cache5m = new Map<string, { data: Scalp5mSignal; at: number }>();
const CACHE_TTL = 60_000; // 1 min cache

export async function analyzeScalp5m(symbol: string, displayName: string): Promise<Scalp5mSignal> {
  const cached = cache5m.get(symbol);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

  logger.info({ symbol }, "5M scalping analysis");

  const session = getCurrentTradingSession();

  const [klines5m, klines15m] = await Promise.all([
    fetchKlines(symbol, "5", 120),
    fetchKlines(symbol, "15", 100),
  ]);

  if (klines5m.length < 30 || klines15m.length < 30) {
    throw new Error(`Insufficient data for ${symbol}`);
  }

  const closes5m = klines5m.map((k) => k.close);
  const price = closes5m[closes5m.length - 1];

  // EMA 9 & 21 on 5M
  const ema9arr = ema(closes5m, 9);
  const ema21arr = ema(closes5m, 21);
  const e9 = ema9arr[ema9arr.length - 1];
  const e21 = ema21arr[ema21arr.length - 1];

  // RSI 14 on 5M
  const rsiVal = rsi(closes5m);

  // Volume
  const avgVol = avgVolume(klines5m);
  const currVol = klines5m[klines5m.length - 1].volume;
  const volRatio = avgVol > 0 ? currVol / avgVol : 1;

  // S&R from 15M
  const closes15m = klines15m.map((k) => k.close);
  const highs15 = swingHighs(klines15m);
  const lows15 = swingLows(klines15m);
  const resistances = highs15.filter((h) => h > price).sort((a, b) => a - b);
  const supports = lows15.filter((l) => l < price).sort((a, b) => b - a);
  const nearestResistance = resistances[0] ?? price * 1.02;
  const nearestSupport = supports[0] ?? price * 0.98;

  // 15M trend
  const ema9_15 = ema(closes15m, 9);
  const ema21_15 = ema(closes15m, 21);
  const e9_15 = ema9_15[ema9_15.length - 1];
  const e21_15 = ema21_15[ema21_15.length - 1];
  const rsi15 = rsi(closes15m);
  const trend15m: "bullish" | "bearish" | "sideways" =
    e9_15 > e21_15 && price > e9_15 ? "bullish" :
    e9_15 < e21_15 && price < e9_15 ? "bearish" : "sideways";

  // Crossover detection on 5M
  const crossover = detectEmaCrossover(ema9arr, ema21arr);

  // Determine side
  let side: "Buy" | "Sell" | null = null;
  if (crossover.type === "golden" && trend15m === "bullish") side = "Buy";
  else if (crossover.type === "death" && trend15m === "bearish") side = "Sell";
  else if (e9 > e21 && trend15m === "bullish") side = "Buy";
  else if (e9 < e21 && trend15m === "bearish") side = "Sell";

  // RSI zone check
  const rsiValidBuy = rsiVal >= 50 && rsiVal <= 65;
  const rsiValidSell = rsiVal >= 35 && rsiVal <= 50;
  const rsiInZone = side === "Buy" ? rsiValidBuy : side === "Sell" ? rsiValidSell : false;
  const notOverboughtOversold = side === "Buy" ? rsiVal <= 70 : side === "Sell" ? rsiVal >= 30 : true;

  // Entry conditions
  const emaCrossover = crossover.type !== "none" && crossover.barsAgo <= 3;
  const volumeAboveAvg = volRatio >= 1.0;
  const tf15mAligned = trend15m !== "sideways" &&
    ((side === "Buy" && trend15m === "bullish") || (side === "Sell" && trend15m === "bearish"));
  const inTradingSession = session.quality === "best";

  // SL / TP calculation
  let stopLoss: number, takeProfit: number;
  const slBufferPct = 0.015; // 1.5% SL

  if (side === "Buy") {
    stopLoss = Math.min(nearestSupport, price * (1 - slBufferPct));
    const slDist = price - stopLoss;
    takeProfit = price + slDist * 1.5;
  } else if (side === "Sell") {
    stopLoss = Math.max(nearestResistance, price * (1 + slBufferPct));
    const slDist = stopLoss - price;
    takeProfit = price - slDist * 1.5;
  } else {
    stopLoss = price * 0.985;
    takeProfit = price * 1.0225;
  }

  const slDist = Math.abs(price - stopLoss);
  const tpDist = Math.abs(takeProfit - price);
  const riskReward = slDist > 0 ? tpDist / slDist : 0;
  const rrMet = riskReward >= 1.5;

  const checklist: Scalp5mChecklist = {
    emaCrossover,
    rsiInZone,
    volumeAboveAvg,
    tf15mAligned,
    rrMet,
    notOverboughtOversold,
    inTradingSession,
  };

  const checksPassed = Object.values(checklist).filter(Boolean).length;
  const allChecksPassed = checksPassed === 7 && side !== null;

  // Confidence score
  let score = 0;
  if (emaCrossover) score += 25;
  else if (crossover.type !== "none") score += 10;
  if (rsiInZone) score += 20;
  if (volumeAboveAvg) score += 15;
  if (tf15mAligned) score += 20;
  if (rrMet) score += 10;
  if (notOverboughtOversold) score += 10;
  if (inTradingSession) score += 5;
  const confidence = Math.min(99, score);

  // Reasons & warnings
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (emaCrossover) reasons.push(`EMA9/21 ${crossover.type === "golden" ? "golden" : "death"} cross ${crossover.barsAgo === 0 ? "baru saja" : `${crossover.barsAgo} candle lalu`}`);
  else if (e9 > e21) reasons.push(`EMA9 ($${e9.toFixed(4)}) di atas EMA21 ($${e21.toFixed(4)}) — bias ${side ?? "none"}`);
  else reasons.push(`EMA9 ($${e9.toFixed(4)}) di bawah EMA21 ($${e21.toFixed(4)}) — bias SHORT`);

  if (rsiInZone) reasons.push(`RSI ${rsiVal.toFixed(1)} di zona ideal ${side === "Buy" ? "(50–65)" : "(35–50)"}`);
  else if (rsiVal > 70) warnings.push(`RSI ${rsiVal.toFixed(1)} overbought — hindari BUY baru`);
  else if (rsiVal < 30) warnings.push(`RSI ${rsiVal.toFixed(1)} oversold — hindari SELL baru`);
  else warnings.push(`RSI ${rsiVal.toFixed(1)} di luar zona ideal scalping`);

  if (volumeAboveAvg) reasons.push(`Volume ${(volRatio * 100).toFixed(0)}% di atas rata-rata — sinyal valid`);
  else warnings.push(`Volume rendah (${(volRatio * 100).toFixed(0)}%) — tunggu volume naik`);

  if (tf15mAligned) reasons.push(`TF 15M ${trend15m} — searah dengan signal 5M`);
  else warnings.push(`TF 15M ${trend15m} — tidak searah, filter aktif`);

  if (!rrMet) warnings.push(`RR ${riskReward.toFixed(2)}x di bawah minimum 1.5x — skip trade ini`);
  else reasons.push(`Risk/Reward ${riskReward.toFixed(2)}x — memenuhi standar`);

  if (!inTradingSession) warnings.push(`Sesi ${session.name} — kualitas sinyal lebih rendah (terbaik: London/NY open)`);
  else reasons.push(`Sesi ${session.name} — waktu terbaik untuk scalping`);

  const result: Scalp5mSignal = {
    symbol, displayName, side, confidence, entryPrice: price,
    stopLoss, takeProfit, riskReward,
    ema9: e9, ema21: e21, rsi14: rsiVal, volumeRatio: volRatio,
    trend15m, crossoverType: crossover.type, crossoverBars: crossover.barsAgo,
    nearestSupport, nearestResistance,
    checklist, allChecksPassed, session, analyzedAt: Date.now(),
    reasons, warnings,
  };

  cache5m.set(symbol, { data: result, at: Date.now() });
  logger.info({ symbol, side, confidence, allChecksPassed, crossover: crossover.type }, "5M scalp analysis complete");
  return result;
}

// ─── Scan all 4 pairs ─────────────────────────────────────────────────────────

export async function scanScalp5m(): Promise<Scalp5mSignal[]> {
  const results = await Promise.allSettled(
    SCALP_PAIRS.map((p) => analyzeScalp5m(p.symbol, p.displayName))
  );
  return results
    .map((r, i) => r.status === "fulfilled" ? r.value : null)
    .filter((r): r is Scalp5mSignal => r !== null)
    .sort((a, b) => b.confidence - a.confidence);
}
