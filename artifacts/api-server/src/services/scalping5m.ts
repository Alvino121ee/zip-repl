import { logger } from "../lib/logger.js";
import { aiScalpDecision } from "./ai.js";

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
  optimalEntry: number;
  entryQuality: "at_zone" | "near_zone" | "wait_pullback" | "chase";
  riskLevel: "low" | "medium" | "high" | "extreme";
  isHighRisk: boolean;
  riskReason: string | null;
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

  // ── Optimal entry calculation ─────────────────────────────────────────────
  let optimalEntry: number;
  let entryQuality: "at_zone" | "near_zone" | "wait_pullback" | "chase";
  if (side === "Buy") {
    const pullbackTarget = nearestSupport > 0 && nearestSupport < price ? Math.max(e21, nearestSupport) : e21;
    optimalEntry = pullbackTarget > 0 && pullbackTarget < price ? pullbackTarget : price;
    const distPct = optimalEntry < price ? ((price - optimalEntry) / optimalEntry) * 100 : 0;
    entryQuality = distPct < 0.3 ? "at_zone" : distPct < 1.0 ? "near_zone" : distPct < 2.5 ? "wait_pullback" : "chase";
  } else if (side === "Sell") {
    const bounceTarget = nearestResistance > price ? Math.min(e21 > price ? e21 : nearestResistance, nearestResistance) : e21;
    optimalEntry = bounceTarget > price ? bounceTarget : price;
    const distPct = optimalEntry > price ? ((optimalEntry - price) / price) * 100 : 0;
    entryQuality = distPct < 0.3 ? "at_zone" : distPct < 1.0 ? "near_zone" : distPct < 2.5 ? "wait_pullback" : "chase";
  } else {
    optimalEntry = price;
    entryQuality = "wait_pullback";
  }

  // ── Additional risk filters ───────────────────────────────────────────────
  let isHighRisk = false;
  let riskReason: string | null = null;
  // Volume too low
  if (volRatio < 0.8) { isHighRisk = true; riskReason = `Volume hanya ${(volRatio * 100).toFixed(0)}% rata-rata — sinyal tidak terkonfirmasi`; }
  // RSI extremes
  if (side === "Buy" && rsiVal > 72) { isHighRisk = true; riskReason = `RSI ${rsiVal.toFixed(1)} overbought ekstrem — jangan entry LONG`; }
  if (side === "Sell" && rsiVal < 28) { isHighRisk = true; riskReason = `RSI ${rsiVal.toFixed(1)} oversold ekstrem — jangan entry SHORT`; }
  // Dead zone session
  if (session.quality === "avoid") { isHighRisk = true; riskReason = `Sesi ${session.name} (01:00–07:00 WIB) — volume rendah, sinyal mudah palsu`; }
  // Too close to resistance for LONG
  if (side === "Buy") {
    const distToResist = ((nearestResistance - price) / price) * 100;
    if (distToResist < 0.8) { isHighRisk = true; riskReason = `Resistance hanya ${distToResist.toFixed(1)}% dari harga — RR buruk untuk LONG`; }
  }
  // Too close to support for SHORT
  if (side === "Sell") {
    const distToSupp = ((price - nearestSupport) / price) * 100;
    if (distToSupp < 0.8) { isHighRisk = true; riskReason = `Support hanya ${distToSupp.toFixed(1)}% dari harga — RR buruk untuk SHORT`; }
  }
  // Chasing price (too far above EMA9 for LONG)
  if (side === "Buy" && price > e9 * 1.025) { isHighRisk = true; riskReason = `Harga ${((price - e9) / e9 * 100).toFixed(1)}% di atas EMA9 — chasing, tunggu pullback`; }
  if (side === "Sell" && price < e9 * 0.975) { isHighRisk = true; riskReason = `Harga ${((e9 - price) / e9 * 100).toFixed(1)}% di bawah EMA9 — chasing, tunggu rebound`; }
  // RR too low
  if (!rrMet && riskReason === null) { isHighRisk = true; riskReason = `RR ${riskReward.toFixed(2)}x di bawah minimum 1.5x`; }

  // ── AI Brain: Replace rule-based scoring with AI decision ───────────────────
  const recentCandles = klines5m.slice(-10).map((k) => ({
    o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
  }));

  let aiResult = await aiScalpDecision({
    symbol, displayName, price,
    ema9: e9, ema21: e21, rsi14: rsiVal,
    volumeRatio: volRatio,
    trend15m,
    crossoverType: crossover.type,
    crossoverBarsAgo: crossover.barsAgo,
    nearestSupport, nearestResistance,
    sessionName: session.name,
    sessionQuality: session.quality,
    wibTime: session.wibTime,
    recentCandles,
  }).catch(() => null);

  // Fall back to rule-based if AI fails
  let aiSide = side;
  let aiConfidence: number;
  let aiStopLoss = stopLoss;
  let aiTakeProfit = takeProfit;
  let aiOptimalEntry = optimalEntry;
  let aiEntryQuality = entryQuality;
  let aiIsHighRisk = isHighRisk;
  let aiRiskReason = riskReason;
  let riskLevel: "low" | "medium" | "high" | "extreme";
  let reasons: string[];
  let warnings: string[];

  if (aiResult) {
    aiSide = aiResult.side;
    aiConfidence = Math.min(99, Math.max(0, aiResult.confidence));
    aiStopLoss = aiResult.stopLoss > 0 ? aiResult.stopLoss : stopLoss;
    aiTakeProfit = aiResult.takeProfit > 0 ? aiResult.takeProfit : takeProfit;
    aiOptimalEntry = aiResult.entryPrice > 0 ? aiResult.entryPrice : optimalEntry;
    aiEntryQuality = aiResult.entryQuality;
    aiIsHighRisk = aiResult.isHighRisk;
    aiRiskReason = aiResult.riskReason;
    reasons = aiResult.reasons.length > 0 ? aiResult.reasons : [`AI: ${aiSide ?? "tidak ada sinyal"}`];
    warnings = aiResult.warnings;
    riskLevel = aiIsHighRisk ? "extreme" : aiConfidence >= 70 ? "low" : aiConfidence >= 55 ? "medium" : "high";
  } else {
    // Fallback rule-based scoring
    let score = 0;
    if (emaCrossover) score += 25; else if (crossover.type !== "none") score += 10;
    if (rsiInZone) score += 20;
    if (volumeAboveAvg) score += 15;
    if (tf15mAligned) score += 20;
    if (rrMet) score += 10;
    if (notOverboughtOversold) score += 10;
    if (inTradingSession) score += 5;
    aiConfidence = Math.min(99, score);
    riskLevel = isHighRisk ? "extreme" : checksPassed === 7 ? "low" : checksPassed >= 5 ? "medium" : checksPassed >= 3 ? "high" : "extreme";

    reasons = [];
    warnings = [];
    if (emaCrossover) reasons.push(`EMA9/21 ${crossover.type === "golden" ? "golden" : "death"} cross ${crossover.barsAgo === 0 ? "baru saja" : `${crossover.barsAgo} candle lalu`}`);
    else if (e9 > e21) reasons.push(`EMA9 di atas EMA21 — bias ${side ?? "none"}`);
    else reasons.push(`EMA9 di bawah EMA21 — bias SHORT`);
    if (rsiInZone) reasons.push(`RSI ${rsiVal.toFixed(1)} di zona ideal`);
    else if (rsiVal > 70) warnings.push(`RSI ${rsiVal.toFixed(1)} overbought`);
    else if (rsiVal < 30) warnings.push(`RSI ${rsiVal.toFixed(1)} oversold`);
    if (volumeAboveAvg) reasons.push(`Volume ${(volRatio * 100).toFixed(0)}% di atas rata-rata`);
    else warnings.push(`Volume rendah (${(volRatio * 100).toFixed(0)}%)`);
    if (tf15mAligned) reasons.push(`TF 15M ${trend15m} — searah`);
    else warnings.push(`TF 15M ${trend15m} — berlawanan`);
    if (!rrMet) warnings.push(`RR ${riskReward.toFixed(2)}x di bawah 1.5x`);
    else reasons.push(`RR ${riskReward.toFixed(2)}x — OK`);
    if (!inTradingSession) warnings.push(`Sesi ${session.name} — kualitas rendah`);
    else reasons.push(`Sesi ${session.name} — optimal`);
  }

  const finalRR = aiStopLoss > 0 ? Math.abs(aiTakeProfit - aiOptimalEntry) / Math.abs(aiOptimalEntry - aiStopLoss) : riskReward;

  const result: Scalp5mSignal = {
    symbol, displayName,
    side: aiSide,
    confidence: aiConfidence,
    entryPrice: price,
    stopLoss: aiStopLoss,
    takeProfit: aiTakeProfit,
    riskReward: isNaN(finalRR) ? riskReward : finalRR,
    ema9: e9, ema21: e21, rsi14: rsiVal, volumeRatio: volRatio,
    trend15m, crossoverType: crossover.type, crossoverBars: crossover.barsAgo,
    nearestSupport, nearestResistance,
    checklist, allChecksPassed,
    optimalEntry: aiOptimalEntry,
    entryQuality: aiEntryQuality,
    riskLevel,
    isHighRisk: aiIsHighRisk,
    riskReason: aiRiskReason,
    session, analyzedAt: Date.now(),
    reasons, warnings,
  };

  cache5m.set(symbol, { data: result, at: Date.now() });
  logger.info({ symbol, side: aiSide, confidence: aiConfidence, aiUsed: !!aiResult }, "5M AI scalp analysis complete");
  return result;
}

// ─── Scan all 4 pairs ─────────────────────────────────────────────────────────

export async function scanScalp5m(): Promise<Scalp5mSignal[]> {
  const results = await Promise.allSettled(
    SCALP_PAIRS.map((p) => analyzeScalp5m(p.symbol, p.displayName))
  );
  return results
    .map((r) => r.status === "fulfilled" ? r.value : null)
    .filter((r): r is Scalp5mSignal => r !== null)
    .sort((a, b) => {
      // Valid signals first, then by confidence
      if (!a.isHighRisk && b.isHighRisk) return -1;
      if (a.isHighRisk && !b.isHighRisk) return 1;
      return b.confidence - a.confidence;
    });
}
