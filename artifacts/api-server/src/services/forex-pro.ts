/**
 * FOREX PRO ENGINE — AI Trading Profesional Kelas Hedge Fund
 * Engine terpisah dari crypto, karakter pasar berbeda.
 * Bahasa: Indonesia
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import {
  connectMT5Real,
  disconnectMT5Real,
  fetchAccountInformation,
  hasMetaApiToken,
} from "./metaapi-mt5.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const STATE_FILE = join(DATA_DIR, "forex-pro-state.json");
const CONFIG_FILE = join(DATA_DIR, "forex-pro-config.json");

// ─── Konstanta ────────────────────────────────────────────────────────────────

export const INITIAL_BALANCE = 1000;
export const SPREAD_COST = 0.00015; // rata-rata spread dalam lot

// ─── Pasangan Forex & Komoditas ───────────────────────────────────────────────

export const FOREX_PAIRS_PRO = [
  { symbol: "EURUSD", name: "Euro / US Dollar",          category: "Major",    emoji: "🇪🇺", basePrice: 1.0872, volatility: 0.00045, pipSize: 0.0001, pipValue: 10 },
  { symbol: "GBPUSD", name: "British Pound / US Dollar", category: "Major",    emoji: "🇬🇧", basePrice: 1.2715, volatility: 0.00065, pipSize: 0.0001, pipValue: 10 },
  { symbol: "USDJPY", name: "US Dollar / Japanese Yen",  category: "Major",    emoji: "🇯🇵", basePrice: 153.42, volatility: 0.075,   pipSize: 0.01,   pipValue: 6.5 },
  { symbol: "USDCHF", name: "US Dollar / Swiss Franc",   category: "Major",    emoji: "🇨🇭", basePrice: 0.9042, volatility: 0.00040, pipSize: 0.0001, pipValue: 11 },
  { symbol: "AUDUSD", name: "Australian Dollar / USD",   category: "Major",    emoji: "🇦🇺", basePrice: 0.6558, volatility: 0.00042, pipSize: 0.0001, pipValue: 10 },
  { symbol: "USDCAD", name: "US Dollar / Canadian Dollar",category: "Major",   emoji: "🇨🇦", basePrice: 1.3628, volatility: 0.00038, pipSize: 0.0001, pipValue: 7.3 },
  { symbol: "NZDUSD", name: "New Zealand Dollar / USD",  category: "Major",    emoji: "🇳🇿", basePrice: 0.6102, volatility: 0.00040, pipSize: 0.0001, pipValue: 10 },
  { symbol: "EURJPY", name: "Euro / Japanese Yen",       category: "Cross",    emoji: "🔀",  basePrice: 166.68, volatility: 0.090,   pipSize: 0.01,   pipValue: 6.5 },
  { symbol: "GBPJPY", name: "British Pound / Yen",       category: "Cross",    emoji: "🔀",  basePrice: 194.85, volatility: 0.110,   pipSize: 0.01,   pipValue: 6.5 },
  { symbol: "XAUUSD", name: "Gold / US Dollar",          category: "Emas",     emoji: "🥇",  basePrice: 2325.0, volatility: 2.50,    pipSize: 0.01,   pipValue: 1   },
  { symbol: "XAGUSD", name: "Silver / US Dollar",        category: "Perak",    emoji: "⚪",  basePrice: 27.45,  volatility: 0.30,    pipSize: 0.001,  pipValue: 5   },
  { symbol: "USOIL",  name: "US Crude Oil (WTI)",        category: "Komoditas",emoji: "🛢️",  basePrice: 78.60,  volatility: 0.55,    pipSize: 0.01,   pipValue: 1   },
];

export const TIMEFRAMES = ["M1","M5","M15","M30","H1","H4","D1"] as const;
export type Timeframe = typeof TIMEFRAMES[number];

const TF_MINUTES: Record<Timeframe, number> = {
  M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440,
};

// ─── Tipe Data ────────────────────────────────────────────────────────────────

export interface Candle {
  time: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isComplete: boolean;
}

export interface SessionInfo {
  name: string;
  active: boolean;
  start: number; // UTC hour
  end: number;   // UTC hour
  color: string;
  description: string;
}

export interface TechnicalLayers {
  // Trend
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  trendBias: "Bullish" | "Bearish" | "Sideways";
  trendStrength: number; // 0-100

  // Momentum
  rsi: number;
  rsiZone: "Overbought" | "Oversold" | "Netral";
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  macdBias: "Bullish" | "Bearish" | "Netral";

  // Volatilitas
  atr: number;
  atrPct: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidth: number;

  // Volume
  volumeRatio: number;
  volumeBias: "Tinggi" | "Normal" | "Rendah";

  // Pola Candle
  candlePattern: string | null;
  candleSignal: "Bullish" | "Bearish" | "Netral";
}

export interface SmcLayers {
  marketStructure: "Bullish" | "Bearish" | "Ranging";
  lastBOS: { type: "Bullish" | "Bearish"; price: number; time: number } | null;
  lastCHOCH: { type: "Bullish" | "Bearish"; price: number; time: number } | null;
  orderBlock: { type: "Bullish" | "Bearish"; high: number; low: number } | null;
  fairValueGap: { type: "Bullish" | "Bearish"; high: number; low: number } | null;
  liquiditySweep: { direction: "High" | "Low"; price: number } | null;
  premiumZone: number;
  discountZone: number;
  equilibrium: number;
  supplyZone: { high: number; low: number } | null;
  demandZone: { high: number; low: number } | null;
  inducement: boolean;
  inducementNote: string | null;
}

export interface FundamentalLayers {
  dxyBias: "Kuat" | "Lemah" | "Netral";
  goldCorrelation: number; // -1 to 1
  riskSentiment: "Risk-On" | "Risk-Off" | "Netral";
  newsImpact: "Tinggi" | "Sedang" | "Rendah";
  upcomingEvent: string | null;
  interestRateBias: "Hawkish" | "Dovish" | "Netral";
}

export interface AiDecision {
  shouldTrade: boolean;
  direction: "Buy" | "Sell" | null;
  confidence: number;
  strategy: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  tp2: number;
  riskReward: number;
  lotSize: number;
  reasoning: string[];
  waitReason: string | null;
  marketCondition: string;
  qualityScore: number; // 0-100, hanya trade jika > 70
  fibonacci: { level: number; price: number; label: string }[];
  supportLevels: number[];
  resistanceLevels: number[];
}

export interface ForexProAnalysis {
  symbol: string;
  timeframe: Timeframe;
  analyzedAt: number;
  currentPrice: number;
  bid: number;
  ask: number;
  spread: number;
  sessions: SessionInfo[];
  activeSession: string;
  technical: TechnicalLayers;
  smc: SmcLayers;
  fundamental: FundamentalLayers;
  aiDecision: AiDecision;
  multiTimeframe: Record<string, { trend: string; bias: string; note: string }>;
}

export interface ForexProPosition {
  id: string;
  symbol: string;
  pairName: string;
  emoji: string;
  side: "Buy" | "Sell";
  lotSize: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  tp2: number | null;
  leverage: number;
  margin: number;
  unrealisedPnl: number;
  unrealisedPips: number;
  openedAt: number;
  strategy: string;
  confidence: number;
  reasoning: string[];
  trailActivated: boolean;
  trailPeak: number;
  breakeven: boolean;
  riskReward: number;
  timeframe: Timeframe;
  aiNote: string;
}

export interface ForexProTrade {
  id: string;
  symbol: string;
  pairName: string;
  emoji: string;
  side: "Buy" | "Sell";
  lotSize: number;
  entryPrice: number;
  closePrice: number;
  stopLoss: number;
  takeProfit: number;
  pips: number;
  pnl: number;
  pnlPct: number;
  openedAt: number;
  closedAt: number;
  durationMin: number;
  strategy: string;
  confidence: number;
  closeReason: "TP" | "SL" | "Manual" | "Trailing" | "Breakeven";
  reasoning: string[];
  lessonLearned: string | null;
  timeframe: Timeframe;
}

export interface MistakeLog {
  id: string;
  timestamp: number;
  symbol: string;
  strategy: string;
  mistake: string;
  lesson: string;
  severity: "Minor" | "Sedang" | "Kritis";
  avoided: boolean;
}

export interface ForexProState {
  balance: number;
  equity: number;
  positions: ForexProPosition[];
  tradeLog: ForexProTrade[];
  mistakes: MistakeLog[];
  strategyStats: Record<string, { wins: number; losses: number; totalPnl: number; avgRR: number }>;
  equityHistory: { time: number; value: number }[];
  dailyStats: { date: string; pnl: number; trades: number; wins: number };
  totalSessionsRun: number;
  lastAnalysis: Record<string, number>;
}

export interface ForexProConfig {
  autoEnabled: boolean;
  maxPositions: number;
  riskPerTradePct: number;
  minConfidence: number;
  minQualityScore: number;
  minRR: number;
  maxDailyLossUSDT: number;
  trailingEnabled: boolean;
  breakevenEnabled: boolean;
  newsFilterEnabled: boolean;
  spreadLimitPips: number;
  defaultLeverage: number;
  preferredTimeframe: Timeframe;
  preferredStrategies: string[];
  intervalMs: number;
}

// ─── Live Rates dari Frankfurter API (ECB) & Gold-API ────────────────────────
// Sumber: https://www.frankfurter.app — gratis, tanpa API key (dari public-apis)
// Sumber: https://api.gold-api.com — gratis, tanpa API key (dari public-apis)

interface LiveRateCache {
  rates: Record<string, number>; // symbol → harga
  fetchedAt: number;
}

let liveRateCache: LiveRateCache | null = null;
const LIVE_RATE_TTL_MS = 60_000; // refresh tiap 60 detik

async function fetchLiveForexRates(): Promise<Record<string, number>> {
  try {
    // Frankfurter: rates vs USD (ECB data, gratis tanpa key)
    const resp = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CHF,AUD,CAD,NZD", {
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) throw new Error(`Frankfurter ${resp.status}`);
    const data = await resp.json() as { rates: Record<string, number> };
    const r = data.rates;

    const rates: Record<string, number> = {};
    if (r.EUR) rates["EURUSD"] = parseFloat((1 / r.EUR).toFixed(5));
    if (r.GBP) rates["GBPUSD"] = parseFloat((1 / r.GBP).toFixed(5));
    if (r.JPY) rates["USDJPY"] = parseFloat(r.JPY.toFixed(3));
    if (r.CHF) rates["USDCHF"] = parseFloat(r.CHF.toFixed(5));
    if (r.AUD) rates["AUDUSD"] = parseFloat((1 / r.AUD).toFixed(5));
    if (r.CAD) rates["USDCAD"] = parseFloat(r.CAD.toFixed(5));
    if (r.NZD) rates["NZDUSD"] = parseFloat((1 / r.NZD).toFixed(5));
    // Cross rates
    if (r.EUR && r.JPY) rates["EURJPY"] = parseFloat((r.JPY / r.EUR).toFixed(3));
    if (r.GBP && r.JPY) rates["GBPJPY"] = parseFloat((r.JPY / r.GBP).toFixed(3));

    // Fetch Gold & Silver dari gold-api.com (gratis, tanpa key, dari public-apis)
    try {
      const goldResp = await fetch("https://api.gold-api.com/price/XAU", { signal: AbortSignal.timeout(4000) });
      if (goldResp.ok) {
        const goldData = await goldResp.json() as { price?: number; price_gram_24k?: number };
        const goldPrice = goldData.price ?? (goldData.price_gram_24k ? goldData.price_gram_24k * 31.1035 : null);
        if (goldPrice && goldPrice > 1000) rates["XAUUSD"] = parseFloat(goldPrice.toFixed(2));
      }
    } catch { /* gunakan base price jika gold-api gagal */ }

    try {
      const silverResp = await fetch("https://api.gold-api.com/price/XAG", { signal: AbortSignal.timeout(4000) });
      if (silverResp.ok) {
        const silverData = await silverResp.json() as { price?: number };
        if (silverData.price && silverData.price > 5) rates["XAGUSD"] = parseFloat(silverData.price.toFixed(3));
      }
    } catch { /* gunakan base price jika silver gagal */ }

    logger.info({ pairs: Object.keys(rates).length }, "Live forex rates diperbarui dari Frankfurter + Gold-API");
    return rates;
  } catch (err) {
    logger.warn({ err: String(err) }, "Gagal ambil live forex rates — pakai base price");
    return {};
  }
}

async function getLiveRate(symbol: string): Promise<number | null> {
  const now = Date.now();
  if (!liveRateCache || now - liveRateCache.fetchedAt > LIVE_RATE_TTL_MS) {
    const rates = await fetchLiveForexRates();
    liveRateCache = { rates, fetchedAt: now };
  }
  return liveRateCache.rates[symbol] ?? null;
}

// Refresh rates di background setiap 60 detik
async function startLiveRateRefresh(): Promise<void> {
  const rates = await fetchLiveForexRates();
  liveRateCache = { rates, fetchedAt: Date.now() };
  setInterval(async () => {
    const r = await fetchLiveForexRates();
    liveRateCache = { rates: r, fetchedAt: Date.now() };
  }, LIVE_RATE_TTL_MS);
}

// Mulai refresh saat module dimuat
startLiveRateRefresh().catch(() => {});

// ─── Harga Simulasi Real-time ─────────────────────────────────────────────────

const priceState: Record<string, { price: number; drift: number; lastUpdate: number }> = {};

function getPairInfo(symbol: string) {
  return FOREX_PAIRS_PRO.find(p => p.symbol === symbol) ?? FOREX_PAIRS_PRO[0]!;
}

function initPrice(symbol: string): void {
  if (priceState[symbol]) return;
  const pair = getPairInfo(symbol);
  // Gunakan live rate sebagai harga awal jika tersedia
  const livePrice = liveRateCache?.rates[symbol];
  priceState[symbol] = { price: livePrice ?? pair.basePrice, drift: 0, lastUpdate: Date.now() };
}

function getEffectiveBasePrice(symbol: string): number {
  return liveRateCache?.rates[symbol] ?? getPairInfo(symbol).basePrice;
}

function updatePrice(symbol: string): number {
  initPrice(symbol);
  const state = priceState[symbol]!;
  const pair = getPairInfo(symbol);
  const now = Date.now();
  const dt = Math.min((now - state.lastUpdate) / 1000, 5); // max 5 detik

  // Mean reversion ke harga LIVE (bukan base price statis)
  const effectiveBase = getEffectiveBasePrice(symbol);

  // Jika ada live rate baru yang berbeda jauh, sesuaikan harga perlahan
  const liveRate = liveRateCache?.rates[symbol];
  if (liveRate && Math.abs(state.price - liveRate) / liveRate > 0.005) {
    // Harga menyimpang >0.5% dari live rate → snap ke live rate
    state.price = liveRate * (1 + (Math.random() - 0.5) * 0.0002);
    state.drift = 0;
    state.lastUpdate = now;
    return state.price;
  }

  // Random walk dengan mean reversion ke live rate
  const randomShock = (Math.random() - 0.5) * pair.volatility * 2 * Math.sqrt(dt);
  const meanReversion = (effectiveBase - state.price) * 0.0003 * dt;
  const sessionMultiplier = getSessionVolatilityMultiplier();

  state.drift = state.drift * 0.95 + randomShock * sessionMultiplier + meanReversion;
  state.price = Math.max(state.price + state.drift, effectiveBase * 0.5);
  state.lastUpdate = now;

  return state.price;
}

function getSessionVolatilityMultiplier(): number {
  const h = new Date().getUTCHours();
  const m = new Date().getUTCMinutes();
  const dec = h + m / 60;

  // London open (07-08): 2x, NY open (13-14): 1.8x, overlap (13-16): 2.5x
  if (dec >= 7 && dec <= 8) return 2.0;
  if (dec >= 13 && dec <= 14) return 1.8;
  if (dec >= 13 && dec <= 16) return 2.5;
  if (dec >= 23 || dec <= 1) return 0.4; // Dead zone
  return 1.0;
}

// ─── Generator OHLCV ──────────────────────────────────────────────────────────

const candleCache: Record<string, Candle[]> = {};

export function getCandles(symbol: string, timeframe: Timeframe, count = 100): Candle[] {
  const key = `${symbol}_${timeframe}`;
  const pair = getPairInfo(symbol);
  const tfMin = TF_MINUTES[timeframe];
  const now = Date.now();
  const msPerCandle = tfMin * 60 * 1000;

  if (!candleCache[key] || candleCache[key]!.length === 0) {
    // Generate initial candles
    candleCache[key] = generateInitialCandles(symbol, timeframe, count);
  }

  const candles = candleCache[key]!;

  // Update atau tambahkan candle terbaru
  const currentCandleTime = Math.floor(now / msPerCandle) * msPerCandle;
  const lastCandle = candles[candles.length - 1];

  if (!lastCandle || lastCandle.time < currentCandleTime) {
    // Tutup candle lama, buka baru
    if (lastCandle) lastCandle.isComplete = true;

    const prevClose = lastCandle?.close ?? pair.basePrice;
    const currentPrice = updatePrice(symbol);
    const vol = pair.volatility * Math.sqrt(tfMin) * 3;

    const open = prevClose;
    const close = currentPrice;
    const high = Math.max(open, close) + Math.random() * vol;
    const low = Math.min(open, close) - Math.random() * vol;

    candles.push({
      time: currentCandleTime,
      open,
      high,
      low,
      close: currentPrice,
      volume: 100 + Math.random() * 500 * getSessionVolatilityMultiplier(),
      isComplete: false,
    });

    if (candles.length > count + 10) candles.splice(0, candles.length - count);
  } else if (lastCandle.time === currentCandleTime) {
    // Update candle saat ini
    const currentPrice = updatePrice(symbol);
    lastCandle.close = currentPrice;
    lastCandle.high = Math.max(lastCandle.high, currentPrice);
    lastCandle.low = Math.min(lastCandle.low, currentPrice);
    lastCandle.volume += Math.random() * 10;
  }

  return candles.slice(-count);
}

function generateInitialCandles(symbol: string, timeframe: Timeframe, count: number): Candle[] {
  const pair = getPairInfo(symbol);
  const tfMin = TF_MINUTES[timeframe];
  const msPerCandle = tfMin * 60 * 1000;
  const now = Date.now();
  const candles: Candle[] = [];

  let price = pair.basePrice * (0.97 + Math.random() * 0.06);
  const vol = pair.volatility * Math.sqrt(tfMin) * 3;

  for (let i = count - 1; i >= 0; i--) {
    const time = Math.floor((now - i * msPerCandle) / msPerCandle) * msPerCandle;
    const drift = (Math.random() - 0.5) * vol;
    const open = price;
    const close = Math.max(price + drift, pair.basePrice * 0.5);
    const high = Math.max(open, close) + Math.random() * vol * 0.5;
    const low = Math.min(open, close) - Math.random() * vol * 0.5;
    const volume = 100 + Math.random() * 500;

    candles.push({ time, open, high, low, close, volume, isComplete: i > 0 });
    price = close;
  }

  // Simpan harga akhir ke state
  if (!priceState[symbol]) {
    priceState[symbol] = { price, drift: 0, lastUpdate: now };
  }

  return candles;
}

// ─── Detektor Sesi ────────────────────────────────────────────────────────────

export function getSessions(): SessionInfo[] {
  const h = new Date().getUTCHours();
  const m = new Date().getUTCMinutes();
  const dec = h + m / 60;

  const sessions: SessionInfo[] = [
    { name: "Sydney",  active: dec >= 21 || dec < 6,    start: 21, end: 6,  color: "#4ade80", description: "Sesi tenang, volatilitas rendah" },
    { name: "Tokyo",   active: dec >= 0  && dec < 9,    start: 0,  end: 9,  color: "#f87171", description: "Aktif untuk JPY, Asia pairs" },
    { name: "London",  active: dec >= 7  && dec < 16,   start: 7,  end: 16, color: "#60a5fa", description: "Sesi paling aktif, volume tinggi" },
    { name: "New York",active: dec >= 12 && dec < 21,   start: 12, end: 21, color: "#a78bfa", description: "Tren kuat, NFP & berita penting" },
  ];

  // Overlap London-NY (13-16 UTC)
  const overlapActive = dec >= 13 && dec < 16;
  if (overlapActive) {
    sessions.find(s => s.name === "London")!.description += " ⚡ OVERLAP NY — Volume maksimal!";
    sessions.find(s => s.name === "New York")!.description += " ⚡ OVERLAP London — Volume maksimal!";
  }

  return sessions;
}

function getActiveSessionName(): string {
  const sessions = getSessions();
  const active = sessions.filter(s => s.active).map(s => s.name);
  if (active.length === 0) return "Dead Zone";
  if (active.length === 2) return `${active[0]}-${active[1]} Overlap`;
  return active[0]!;
}

// ─── Kalkulasi Indikator ──────────────────────────────────────────────────────

function calcEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i]! * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macd = ema12 - ema26;
  const signals = closes.slice(-9).map((_, i) => {
    const slice = closes.slice(0, closes.length - 9 + i + 1);
    return calcEMA(slice, 12) - calcEMA(slice, 26);
  });
  const signal = signals.reduce((a, b) => a + b, 0) / signals.length;
  return { macd, signal, histogram: macd - signal };
}

function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs = candles.slice(-period - 1).map((c, i, arr) => {
    if (i === 0) return c.high - c.low;
    const prev = arr[i - 1]!;
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function calcBollingerBands(closes: number[], period = 20, std = 2) {
  if (closes.length < period) return { upper: closes[closes.length-1]! * 1.01, middle: closes[closes.length-1]!, lower: closes[closes.length-1]! * 0.99 };
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  return { upper: mean + std * stdDev, middle: mean, lower: mean - std * stdDev };
}

function detectCandlePattern(candles: Candle[]): { pattern: string | null; signal: "Bullish" | "Bearish" | "Netral" } {
  if (candles.length < 3) return { pattern: null, signal: "Netral" };
  const c = candles[candles.length - 1]!;
  const p = candles[candles.length - 2]!;
  const pp = candles[candles.length - 3]!;

  const bodySize = Math.abs(c.close - c.open);
  const totalSize = c.high - c.low;
  const upperWick = c.high - Math.max(c.close, c.open);
  const lowerWick = Math.min(c.close, c.open) - c.low;
  const isBullish = c.close > c.open;
  const isBearish = c.close < c.open;

  // Hammer / Pin Bar
  if (lowerWick > bodySize * 2.5 && upperWick < bodySize * 0.5) return { pattern: "Hammer (Pin Bar Bullish)", signal: "Bullish" };
  if (upperWick > bodySize * 2.5 && lowerWick < bodySize * 0.5) return { pattern: "Shooting Star (Pin Bar Bearish)", signal: "Bearish" };

  // Doji
  if (bodySize < totalSize * 0.1 && totalSize > 0) return { pattern: "Doji — Ketidakpastian", signal: "Netral" };

  // Engulfing
  const prevBody = Math.abs(p.close - p.open);
  if (isBullish && p.close < p.open && c.open <= p.close && c.close >= p.open && bodySize > prevBody) return { pattern: "Bullish Engulfing", signal: "Bullish" };
  if (isBearish && p.close > p.open && c.open >= p.close && c.close <= p.open && bodySize > prevBody) return { pattern: "Bearish Engulfing", signal: "Bearish" };

  // Morning/Evening Star
  const ppBearish = pp.close < pp.open;
  const ppBullish = pp.close > pp.open;
  if (ppBearish && bodySize > 0.6 * Math.abs(pp.close - pp.open) && isBullish) return { pattern: "Morning Star — Pembalikan Naik", signal: "Bullish" };
  if (ppBullish && bodySize > 0.6 * Math.abs(pp.close - pp.open) && isBearish) return { pattern: "Evening Star — Pembalikan Turun", signal: "Bearish" };

  // Marubozu (candle kuat tanpa shadow)
  if (bodySize > totalSize * 0.9 && isBullish) return { pattern: "Bullish Marubozu — Momentum Kuat", signal: "Bullish" };
  if (bodySize > totalSize * 0.9 && isBearish) return { pattern: "Bearish Marubozu — Momentum Turun", signal: "Bearish" };

  return { pattern: null, signal: "Netral" };
}

// ─── Fibonacci Retracement ────────────────────────────────────────────────────

function calcFibonacci(candles: Candle[]): { level: number; price: number; label: string }[] {
  if (candles.length < 20) return [];
  const recent = candles.slice(-20);
  const highPrice = Math.max(...recent.map(c => c.high));
  const lowPrice = Math.min(...recent.map(c => c.low));
  const range = highPrice - lowPrice;

  return [
    { level: 0,     price: lowPrice,                label: "0% — Support Kuat" },
    { level: 23.6,  price: lowPrice + range * 0.236, label: "23.6%" },
    { level: 38.2,  price: lowPrice + range * 0.382, label: "38.2% — Golden Zone" },
    { level: 50,    price: lowPrice + range * 0.5,   label: "50% — Equilibrium" },
    { level: 61.8,  price: lowPrice + range * 0.618, label: "61.8% — Golden Ratio" },
    { level: 78.6,  price: lowPrice + range * 0.786, label: "78.6% — OTE Zone" },
    { level: 100,   price: highPrice,                label: "100% — Resistance Kuat" },
  ];
}

// ─── Analisis SMC (Smart Money Concepts) ─────────────────────────────────────

function analyzeSmC(candles: Candle[], closes: number[]): SmcLayers {
  if (candles.length < 10) {
    const cp = closes[closes.length - 1] ?? 0;
    return {
      marketStructure: "Ranging", lastBOS: null, lastCHOCH: null,
      orderBlock: null, fairValueGap: null, liquiditySweep: null,
      premiumZone: cp * 1.005, discountZone: cp * 0.995, equilibrium: cp,
      supplyZone: null, demandZone: null, inducement: false, inducementNote: null,
    };
  }

  // Market Structure
  const highs = candles.slice(-10).map(c => c.high);
  const lows  = candles.slice(-10).map(c => c.low);
  const recentHH = highs[highs.length-1]! > highs[highs.length-5]!;
  const recentHL = lows[lows.length-1]! > lows[lows.length-5]!;
  const recentLH = highs[highs.length-1]! < highs[highs.length-5]!;
  const recentLL = lows[lows.length-1]! < lows[lows.length-5]!;

  let marketStructure: "Bullish" | "Bearish" | "Ranging";
  if (recentHH && recentHL) marketStructure = "Bullish";
  else if (recentLH && recentLL) marketStructure = "Bearish";
  else marketStructure = "Ranging";

  // BOS & CHOCH
  const swingHigh = Math.max(...highs.slice(-5));
  const swingLow  = Math.min(...lows.slice(-5));
  const cp = closes[closes.length-1]!;

  const lastBOS = cp > swingHigh
    ? { type: "Bullish" as const, price: swingHigh, time: Date.now() - 3600000 }
    : cp < swingLow
    ? { type: "Bearish" as const, price: swingLow, time: Date.now() - 3600000 }
    : null;

  // Order Block — candle sebelum gerakan impulsif
  const impulseIdx = candles.length - 3;
  const oblCandle = candles[impulseIdx];
  const orderBlock = oblCandle ? {
    type: (oblCandle.close > oblCandle.open ? "Bullish" : "Bearish") as "Bullish" | "Bearish",
    high: oblCandle.high,
    low: oblCandle.low,
  } : null;

  // Fair Value Gap
  const c1 = candles[candles.length - 3];
  const c3 = candles[candles.length - 1];
  const fvg = (c1 && c3 && c1.high < c3.low)
    ? { type: "Bullish" as const, high: c3.low, low: c1.high }
    : (c1 && c3 && c1.low > c3.high)
    ? { type: "Bearish" as const, high: c1.low, low: c3.high }
    : null;

  // Liquidity Sweep
  const prevSwingHigh = Math.max(...highs.slice(-8,-3));
  const prevSwingLow  = Math.min(...lows.slice(-8,-3));
  const liquiditySweep = (candles[candles.length-1]!.high > prevSwingHigh && candles[candles.length-1]!.close < prevSwingHigh)
    ? { direction: "High" as const, price: prevSwingHigh }
    : (candles[candles.length-1]!.low < prevSwingLow && candles[candles.length-1]!.close > prevSwingLow)
    ? { direction: "Low" as const, price: prevSwingLow }
    : null;

  // Premium / Discount / Equilibrium
  const range = swingHigh - swingLow;
  const equilibrium = swingLow + range * 0.5;
  const premiumZone = swingLow + range * 0.618;
  const discountZone = swingLow + range * 0.382;

  // Supply & Demand
  const supplyZone = { high: swingHigh, low: swingHigh - range * 0.05 };
  const demandZone = { high: swingLow + range * 0.05, low: swingLow };

  // Inducement (jebakan retail)
  const inducement = liquiditySweep !== null;
  const inducementNote = inducement
    ? `Likuiditas ${liquiditySweep!.direction === "High" ? "atas" : "bawah"} disapu — potensi reversal dari ${liquiditySweep!.direction === "High" ? "institusi jual" : "institusi beli"}`
    : null;

  return {
    marketStructure, lastBOS, lastCHOCH: null, orderBlock, fairValueGap: fvg,
    liquiditySweep, premiumZone, discountZone, equilibrium,
    supplyZone, demandZone, inducement, inducementNote,
  };
}

// ─── Analisis Fundamental (Simulasi) ─────────────────────────────────────────

function analyzeFundamental(symbol: string): FundamentalLayers {
  const h = new Date().getUTCHours();

  // DXY bias berdasarkan waktu/sesi
  const dxyBias: "Kuat" | "Lemah" | "Netral" = h >= 13 && h < 21 ? "Kuat" : h >= 7 && h < 12 ? "Lemah" : "Netral";

  // Gold inverse correlation dengan DXY
  const goldCorrelation = symbol === "XAUUSD" ? -0.75 : symbol.includes("USD") ? 0.4 : 0.2;

  // Risk sentiment
  const riskSentiment: "Risk-On" | "Risk-Off" | "Netral" = h >= 13 && h < 16 ? "Risk-On" : h >= 23 || h < 2 ? "Risk-Off" : "Netral";

  // Berita / event upcoming
  const events = [
    "FOMC Meeting Minutes",
    "Non-Farm Payrolls (NFP)",
    "CPI Data Release",
    "GDP Quarterly",
    "ISM Manufacturing PMI",
    "Fed Chair Speech",
    "ECB Rate Decision",
  ];
  const todayEvent = Math.random() > 0.7 ? events[Math.floor(Math.random() * events.length)]! : null;
  const newsImpact: "Tinggi" | "Sedang" | "Rendah" = todayEvent ? "Tinggi" : h >= 12 && h < 15 ? "Sedang" : "Rendah";

  return {
    dxyBias,
    goldCorrelation,
    riskSentiment,
    newsImpact,
    upcomingEvent: todayEvent,
    interestRateBias: dxyBias === "Kuat" ? "Hawkish" : dxyBias === "Lemah" ? "Dovish" : "Netral",
  };
}

// ─── Psikologi Pasar & Mindset AI ────────────────────────────────────────────

function assessMarketPsychology(technical: TechnicalLayers, smc: SmcLayers): string {
  if (smc.inducement) return "JEBAKAN RETAIL — Likuiditas disapu, tunggu konfirmasi reversal";
  if (technical.rsi > 75) return "OVERBOUGHT EKSTREM — Potensi distribusi institusi";
  if (technical.rsi < 25) return "OVERSOLD EKSTREM — Potensi akumulasi institusi";
  if (smc.marketStructure === "Bullish" && technical.trendBias === "Bullish") return "TREN BULLISH KUAT — Setup buy berkualitas tinggi";
  if (smc.marketStructure === "Bearish" && technical.trendBias === "Bearish") return "TREN BEARISH KUAT — Setup sell berkualitas tinggi";
  if (technical.volumeBias === "Rendah") return "VOLUME LEMAH — Hindari entry, tunggu konfirmasi";
  return "MARKET SIDEWAYS — Kualitas setup rendah, tidak ada trade";
}

// ─── AI Decision Engine ───────────────────────────────────────────────────────

function makeAiDecision(
  symbol: string,
  candles: Candle[],
  technical: TechnicalLayers,
  smc: SmcLayers,
  fundamental: FundamentalLayers,
  config: ForexProConfig,
  state: ForexProState
): AiDecision {
  const pair = getPairInfo(symbol);
  const cp = candles[candles.length - 1]?.close ?? pair.basePrice;
  const reasoning: string[] = [];
  let bullishScore = 0;
  let bearishScore = 0;
  let qualityScore = 50;
  const fibonacci = calcFibonacci(candles);

  // Cek kondisi tidak boleh trade
  const sessions = getSessions();
  const activeSessions = sessions.filter(s => s.active);
  const isDead = activeSessions.length === 0;
  const hasOpenPositions = state.positions.filter(p => p.symbol === symbol).length;

  if (isDead) {
    return noTrade("Sesi dead zone (00:00-06:00 UTC tanpa sesi aktif) — tidak ada trade", cp, smc, fibonacci, qualityScore);
  }

  if (fundamental.newsImpact === "Tinggi" && config.newsFilterEnabled) {
    return noTrade(`Event berdampak tinggi: ${fundamental.upcomingEvent ?? "Berita Penting"} — hindari entry saat volatilitas ekstrem`, cp, smc, fibonacci, qualityScore);
  }

  // Spread simulasi: 1-3 pips untuk major, lebih tinggi untuk cross & komoditas
  const currentSpreadPips = pair.category === "Major" ? 1.5 : pair.category === "Cross" ? 2.5 : pair.category === "Emas" ? 4.0 : 3.0;
  if (currentSpreadPips > config.spreadLimitPips) {
    return noTrade("Spread terlalu lebar — risiko tidak sepadan", cp, smc, fibonacci, qualityScore);
  }

  if (hasOpenPositions >= 1) {
    return noTrade(`Sudah ada posisi ${symbol} terbuka — tidak tambah posisi`, cp, smc, fibonacci, qualityScore);
  }

  // ─── Kalkulasi Skor Bullish/Bearish ───────────────────────────────────────

  // 1. Trend EMA
  if (technical.ema9 > technical.ema21 && technical.ema21 > technical.ema50) {
    bullishScore += 15;
    reasoning.push("✅ EMA 9/21/50 aligned bullish — tren naik terkonfirmasi");
  } else if (technical.ema9 < technical.ema21 && technical.ema21 < technical.ema50) {
    bearishScore += 15;
    reasoning.push("✅ EMA 9/21/50 aligned bearish — tren turun terkonfirmasi");
  }

  // 2. RSI
  if (technical.rsi > 55 && technical.rsi < 70) {
    bullishScore += 10;
    reasoning.push(`✅ RSI ${technical.rsi.toFixed(1)} — zona momentum bullish tanpa overbought`);
  } else if (technical.rsi < 45 && technical.rsi > 30) {
    bearishScore += 10;
    reasoning.push(`✅ RSI ${technical.rsi.toFixed(1)} — zona momentum bearish tanpa oversold`);
  } else if (technical.rsi > 75) {
    bearishScore += 8; // Potensi reversal
    reasoning.push(`⚠️ RSI ${technical.rsi.toFixed(1)} overbought — waspada distribusi`);
  } else if (technical.rsi < 25) {
    bullishScore += 8;
    reasoning.push(`⚠️ RSI ${technical.rsi.toFixed(1)} oversold — potensi bounce`);
  }

  // 3. MACD
  if (technical.macdHistogram > 0 && technical.macd > technical.macdSignal) {
    bullishScore += 10;
    reasoning.push("✅ MACD histogram positif — momentum bullish meningkat");
  } else if (technical.macdHistogram < 0 && technical.macd < technical.macdSignal) {
    bearishScore += 10;
    reasoning.push("✅ MACD histogram negatif — momentum bearish meningkat");
  }

  // 4. Market Structure SMC
  if (smc.marketStructure === "Bullish") {
    bullishScore += 20;
    reasoning.push("✅ Struktur pasar Bullish (HH/HL) — institusi beli");
  } else if (smc.marketStructure === "Bearish") {
    bearishScore += 20;
    reasoning.push("✅ Struktur pasar Bearish (LH/LL) — institusi jual");
  }

  // 5. BOS / CHOCH
  if (smc.lastBOS?.type === "Bullish") {
    bullishScore += 12;
    reasoning.push(`✅ Break of Structure Bullish di ${smc.lastBOS.price.toFixed(pair.basePrice > 100 ? 2 : 4)}`);
  } else if (smc.lastBOS?.type === "Bearish") {
    bearishScore += 12;
    reasoning.push(`✅ Break of Structure Bearish di ${smc.lastBOS.price.toFixed(pair.basePrice > 100 ? 2 : 4)}`);
  }

  // 6. Pola Candle
  if (technical.candleSignal === "Bullish") {
    bullishScore += 8;
    reasoning.push(`✅ Pola candle: ${technical.candlePattern} — sinyal bullish`);
  } else if (technical.candleSignal === "Bearish") {
    bearishScore += 8;
    reasoning.push(`✅ Pola candle: ${technical.candlePattern} — sinyal bearish`);
  }

  // 7. Liquidity Sweep
  if (smc.liquiditySweep?.direction === "Low") {
    bullishScore += 15;
    reasoning.push(`✅ Likuiditas low disapu di ${smc.liquiditySweep.price.toFixed(4)} — smart money beli`);
  } else if (smc.liquiditySweep?.direction === "High") {
    bearishScore += 15;
    reasoning.push(`✅ Likuiditas high disapu di ${smc.liquiditySweep.price.toFixed(4)} — smart money jual`);
  }

  // 8. Volume
  if (technical.volumeRatio > 1.5) {
    const dominant = bullishScore > bearishScore ? "bullish" : "bearish";
    bullishScore += dominant === "bullish" ? 5 : 0;
    bearishScore += dominant === "bearish" ? 5 : 0;
    reasoning.push(`✅ Volume tinggi (${technical.volumeRatio.toFixed(1)}x) — konfirmasi pergerakan institusional`);
  } else if (technical.volumeRatio < 0.6) {
    qualityScore -= 15;
    reasoning.push("⚠️ Volume lemah — kurang keyakinan pergerakan");
  }

  // 9. Sesi Trading
  const sessionBonus = activeSessions.some(s => s.name === "London" || s.name === "New York");
  if (sessionBonus) {
    qualityScore += 10;
    reasoning.push(`✅ Sesi aktif: ${activeSessions.map(s => s.name).join("+")} — momentum tinggi`);
  }

  // 10. Fundamental
  if (fundamental.dxyBias === "Kuat" && symbol.startsWith("USD")) {
    bullishScore += 5;
    reasoning.push("✅ DXY kuat — mendukung USD bull");
  } else if (fundamental.dxyBias === "Lemah" && symbol.startsWith("EUR")) {
    bullishScore += 5;
  }

  // ─── Tentukan Arah & Confidence ───────────────────────────────────────────

  const totalScore = bullishScore + bearishScore;
  const dominance = Math.abs(bullishScore - bearishScore);
  const confidence = Math.min(95, Math.round(40 + (dominance / Math.max(totalScore, 1)) * 60));
  const direction: "Buy" | "Sell" | null = bullishScore > bearishScore ? "Buy" : bearishScore > bullishScore ? "Sell" : null;

  // Quality score
  qualityScore += Math.round(confidence * 0.5);
  qualityScore += dominance > 30 ? 15 : dominance > 15 ? 8 : 0;
  qualityScore = Math.min(100, Math.max(0, qualityScore));

  // Tidak trade jika confidence rendah
  if (confidence < config.minConfidence || qualityScore < config.minQualityScore || direction === null) {
    const reason = direction === null
      ? "Konflik sinyal — tidak ada arah dominan"
      : `Confidence ${confidence}% di bawah minimum ${config.minConfidence}% atau quality score ${qualityScore} < ${config.minQualityScore}`;
    return noTrade(reason, cp, smc, fibonacci, qualityScore);
  }

  // ─── Kalkulasi Entry / SL / TP ────────────────────────────────────────────

  const atr = technical.atr;
  const spread = pair.pipSize * 2;

  let entryPrice: number;
  let stopLoss: number;
  let takeProfit: number;
  let tp2: number;

  if (direction === "Buy") {
    entryPrice = cp + spread; // ask
    stopLoss = entryPrice - atr * 1.5;
    takeProfit = entryPrice + atr * 3;
    tp2 = entryPrice + atr * 5;
    // Snap SL ke demand zone atau discount zone jika ada
    if (smc.demandZone && smc.demandZone.low < entryPrice && smc.demandZone.low > stopLoss) {
      stopLoss = smc.demandZone.low - pair.pipSize * 3;
    }
  } else {
    entryPrice = cp - spread; // bid
    stopLoss = entryPrice + atr * 1.5;
    takeProfit = entryPrice - atr * 3;
    tp2 = entryPrice - atr * 5;
    // Snap SL ke supply zone jika ada
    if (smc.supplyZone && smc.supplyZone.high > entryPrice && smc.supplyZone.high < stopLoss) {
      stopLoss = smc.supplyZone.high + pair.pipSize * 3;
    }
  }

  const riskPips = Math.abs(entryPrice - stopLoss) / pair.pipSize;
  const rewardPips = Math.abs(takeProfit - entryPrice) / pair.pipSize;
  const riskReward = rewardPips / Math.max(riskPips, 1);

  // Tolak jika RR tidak memenuhi minimum
  if (riskReward < config.minRR) {
    return noTrade(`Risk/Reward ${riskReward.toFixed(2)} di bawah minimum ${config.minRR} — tidak worth it`, cp, smc, fibonacci, qualityScore);
  }

  // Hitung lot size berdasarkan risk management
  const riskUSDT = state.balance * (config.riskPerTradePct / 100);
  const pipValueUSD = pair.pipValue;
  const lotSize = Math.max(0.01, Math.min(10, riskUSDT / (riskPips * pipValueUSD)));

  // Pilih strategi terbaik
  const strategy = selectStrategy(technical, smc, sessions);
  reasoning.push(`🎯 Strategi dipilih: ${strategy}`);
  reasoning.push(`📊 Confidence: ${confidence}% | Quality Score: ${qualityScore}/100 | RR: ${riskReward.toFixed(2)}`);
  reasoning.push(`💰 Lot Size: ${lotSize.toFixed(2)} | Risk: $${riskUSDT.toFixed(2)}`);

  const supportLevels = [
    smc.demandZone?.low ?? cp * 0.995,
    fibonacci.find(f => f.level === 38.2)?.price ?? cp * 0.997,
    fibonacci.find(f => f.level === 61.8)?.price ?? cp * 0.994,
  ].sort((a, b) => b - a);

  const resistanceLevels = [
    smc.supplyZone?.high ?? cp * 1.005,
    fibonacci.find(f => f.level === 61.8)?.price ?? cp * 1.003,
    fibonacci.find(f => f.level === 100)?.price ?? cp * 1.006,
  ].sort((a, b) => a - b);

  return {
    shouldTrade: true,
    direction,
    confidence,
    strategy,
    entryPrice,
    stopLoss,
    takeProfit,
    tp2,
    riskReward,
    lotSize: parseFloat(lotSize.toFixed(2)),
    reasoning,
    waitReason: null,
    marketCondition: assessMarketPsychology(technical, smc),
    qualityScore,
    fibonacci,
    supportLevels,
    resistanceLevels,
  };
}

function noTrade(reason: string, price: number, smc: SmcLayers, fibonacci: ReturnType<typeof calcFibonacci>, qs: number): AiDecision {
  return {
    shouldTrade: false,
    direction: null,
    confidence: 0,
    strategy: "No Trade",
    entryPrice: price,
    stopLoss: price,
    takeProfit: price,
    tp2: price,
    riskReward: 0,
    lotSize: 0,
    reasoning: [`❌ ${reason}`],
    waitReason: reason,
    marketCondition: "Tidak ada setup berkualitas saat ini",
    qualityScore: qs,
    fibonacci,
    supportLevels: [smc.demandZone?.low ?? price * 0.995],
    resistanceLevels: [smc.supplyZone?.high ?? price * 1.005],
  };
}

function selectStrategy(technical: TechnicalLayers, smc: SmcLayers, sessions: SessionInfo[]): string {
  const activeSessions = sessions.filter(s => s.active).map(s => s.name);
  const isLondonNY = activeSessions.includes("London") || activeSessions.includes("New York");

  if (smc.liquiditySweep) return "Liquidity Sweep Reversal";
  if (smc.orderBlock && technical.trendBias !== "Sideways") return "Order Block Retest";
  if (smc.fairValueGap) return "Fair Value Gap Fill";
  if (technical.candleSignal !== "Netral" && technical.volumeRatio > 1.3) return "Price Action + Volume";
  if (isLondonNY && technical.trendStrength > 70) return "Session Breakout";
  if (technical.rsi < 30 || technical.rsi > 70) return "Mean Reversion";
  if (technical.trendStrength > 65) return "Trend Following";
  return "Confluence Reversal";
}

// ─── Analisis Lengkap ─────────────────────────────────────────────────────────

export function analyzeForexPro(symbol: string, timeframe: Timeframe, state: ForexProState, config: ForexProConfig): ForexProAnalysis {
  const candles = getCandles(symbol, timeframe, 120);
  const pair = getPairInfo(symbol);
  const closes = candles.map(c => c.close);
  const cp = closes[closes.length - 1] ?? pair.basePrice;
  const spread = pair.volatility * 1.5;

  // Technical indicators
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const rsi = calcRSI(closes);
  const { macd, signal, histogram } = calcMACD(closes);
  const atr = calcATR(candles);
  const bb = calcBollingerBands(closes);
  const { pattern: candlePattern, signal: candleSignal } = detectCandlePattern(candles);

  const volumes = candles.map(c => c.volume);
  const avgVol = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
  const curVol = volumes[volumes.length - 1] ?? avgVol;
  const volumeRatio = curVol / Math.max(avgVol, 1);

  const trendBias: "Bullish" | "Bearish" | "Sideways" =
    ema9 > ema21 && ema21 > ema50 ? "Bullish" :
    ema9 < ema21 && ema21 < ema50 ? "Bearish" : "Sideways";
  const trendStrength = Math.min(100, Math.abs(ema9 - ema50) / pair.volatility * 20);

  const technical: TechnicalLayers = {
    ema9, ema21, ema50, ema200, trendBias, trendStrength,
    rsi, rsiZone: rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : "Netral",
    macd, macdSignal: signal, macdHistogram: histogram,
    macdBias: histogram > 0 ? "Bullish" : histogram < 0 ? "Bearish" : "Netral",
    atr, atrPct: (atr / cp) * 100,
    bbUpper: bb.upper, bbMiddle: bb.middle, bbLower: bb.lower,
    bbWidth: (bb.upper - bb.lower) / bb.middle * 100,
    volumeRatio,
    volumeBias: volumeRatio > 1.4 ? "Tinggi" : volumeRatio < 0.7 ? "Rendah" : "Normal",
    candlePattern, candleSignal,
  };

  const smc = analyzeSmC(candles, closes);
  const fundamental = analyzeFundamental(symbol);
  const sessions = getSessions();
  const aiDecision = makeAiDecision(symbol, candles, technical, smc, fundamental, config, state);

  // Multi-timeframe summary
  const multiTimeframe: Record<string, { trend: string; bias: string; note: string }> = {};
  const tfOrder: Timeframe[] = ["M15","H1","H4","D1"];
  for (const tf of tfOrder) {
    if (tf === timeframe) continue;
    const tfc = getCandles(symbol, tf, 50);
    const tfCloses = tfc.map(c => c.close);
    const tfEma9 = calcEMA(tfCloses, 9);
    const tfEma21 = calcEMA(tfCloses, 21);
    const tfRsi = calcRSI(tfCloses);
    const bias = tfEma9 > tfEma21 ? "Bullish" : tfEma9 < tfEma21 ? "Bearish" : "Sideways";
    multiTimeframe[tf] = {
      trend: bias,
      bias,
      note: `EMA: ${bias} | RSI: ${tfRsi.toFixed(0)}`,
    };
  }

  return {
    symbol,
    timeframe,
    analyzedAt: Date.now(),
    currentPrice: cp,
    bid: cp - spread / 2,
    ask: cp + spread / 2,
    spread: parseFloat((spread / pair.pipSize).toFixed(1)),
    sessions,
    activeSession: getActiveSessionName(),
    technical,
    smc,
    fundamental,
    aiDecision,
    multiTimeframe,
  };
}

// ─── Manajemen State & Posisi ─────────────────────────────────────────────────

function defaultState(): ForexProState {
  return {
    balance: INITIAL_BALANCE,
    equity: INITIAL_BALANCE,
    positions: [],
    tradeLog: [],
    mistakes: [],
    strategyStats: {},
    equityHistory: [{ time: Date.now(), value: INITIAL_BALANCE }],
    dailyStats: { date: new Date().toDateString(), pnl: 0, trades: 0, wins: 0 },
    totalSessionsRun: 0,
    lastAnalysis: {},
  };
}

function defaultConfig(): ForexProConfig {
  return {
    autoEnabled: false,
    maxPositions: 3,
    riskPerTradePct: 1,
    minConfidence: 58,
    minQualityScore: 55,
    minRR: 1.5,
    maxDailyLossUSDT: 30,
    trailingEnabled: true,
    breakevenEnabled: true,
    newsFilterEnabled: true,
    spreadLimitPips: 10,
    defaultLeverage: 10,
    preferredTimeframe: "H1",
    preferredStrategies: ["Order Block Retest","Liquidity Sweep Reversal","Trend Following"],
    intervalMs: 30000,
  };
}

let state: ForexProState = defaultState();
let config: ForexProConfig = defaultConfig();

export function loadForexProState(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(STATE_FILE)) {
      const loaded = JSON.parse(readFileSync(STATE_FILE, "utf-8")) as ForexProState;
      state = { ...defaultState(), ...loaded };
      logger.info({ balance: state.balance, positions: state.positions.length }, "Forex Pro state loaded");
    }
    if (existsSync(CONFIG_FILE)) {
      const loaded = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as ForexProConfig;
      config = { ...defaultConfig(), ...loaded };
    }
  } catch (e) {
    logger.warn("Gagal load forex pro state", { error: String(e) });
    state = defaultState();
  }
}

function saveState(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { logger.warn("Gagal save forex pro state", { error: String(e) }); }
}

function saveConfig(): void {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) { logger.warn("Gagal save forex pro config", { error: String(e) }); }
}

export function getForexProState() { return { ...state }; }
export function getForexProConfig() { return { ...config }; }

export function updateForexProConfig(updates: Partial<ForexProConfig>): ForexProConfig {
  config = { ...config, ...updates };
  saveConfig();
  return config;
}

// ─── Buka Posisi ──────────────────────────────────────────────────────────────

export function openForexProPosition(
  symbol: string,
  direction: "Buy" | "Sell",
  timeframe: Timeframe,
  manual = false,
  customLot?: number,
): { ok: boolean; position?: ForexProPosition; error?: string } {
  const pair = getPairInfo(symbol);
  const analysis = analyzeForexPro(symbol, timeframe, state, config);
  const dec = analysis.aiDecision;

  if (!manual && !dec.shouldTrade) {
    return { ok: false, error: dec.waitReason ?? "AI tidak merekomendasikan trade saat ini" };
  }

  const lotSize = customLot ?? dec.lotSize;
  const entryPrice = direction === "Buy" ? analysis.ask : analysis.bid;
  const margin = lotSize * pair.basePrice * 1000 / config.defaultLeverage;

  if (margin > state.balance * 0.8) {
    return { ok: false, error: "Margin tidak cukup (>80% balance)" };
  }

  if (state.positions.length >= config.maxPositions) {
    return { ok: false, error: `Maksimal ${config.maxPositions} posisi terbuka` };
  }

  // Cek daily loss limit
  const today = new Date().toDateString();
  if (state.dailyStats.date === today && state.dailyStats.pnl < -config.maxDailyLossUSDT) {
    return { ok: false, error: `Daily loss limit tercapai: $${config.maxDailyLossUSDT}` };
  }

  const pos: ForexProPosition = {
    id: `fp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    symbol,
    pairName: pair.name,
    emoji: pair.emoji,
    side: direction,
    lotSize,
    entryPrice,
    currentPrice: entryPrice,
    stopLoss: direction === "Buy" ? dec.stopLoss : dec.stopLoss,
    takeProfit: direction === "Buy" ? dec.takeProfit : dec.takeProfit,
    tp2: dec.tp2,
    leverage: config.defaultLeverage,
    margin,
    unrealisedPnl: 0,
    unrealisedPips: 0,
    openedAt: Date.now(),
    strategy: dec.strategy,
    confidence: dec.confidence,
    reasoning: dec.reasoning,
    trailActivated: false,
    trailPeak: entryPrice,
    breakeven: false,
    riskReward: dec.riskReward,
    timeframe,
    aiNote: dec.marketCondition,
  };

  state.positions.push(pos);
  state.balance -= margin;
  saveState();
  logger.info({ symbol, direction, lotSize, entryPrice }, "Forex Pro: posisi dibuka");
  return { ok: true, position: pos };
}

// ─── Tutup Posisi ─────────────────────────────────────────────────────────────

export function closeForexProPosition(id: string, reason: ForexProTrade["closeReason"] = "Manual"): { ok: boolean; trade?: ForexProTrade; error?: string } {
  const idx = state.positions.findIndex(p => p.id === id);
  if (idx < 0) return { ok: false, error: "Posisi tidak ditemukan" };

  const pos = state.positions[idx]!;
  const pair = getPairInfo(pos.symbol);
  const closePrice = updatePrice(pos.symbol);

  const pipDiff = (pos.side === "Buy" ? closePrice - pos.entryPrice : pos.entryPrice - closePrice) / pair.pipSize;
  const pnl = pipDiff * pair.pipValue * pos.lotSize;
  const pnlPct = (pnl / pos.margin) * 100;

  const trade: ForexProTrade = {
    id: pos.id,
    symbol: pos.symbol,
    pairName: pos.pairName,
    emoji: pos.emoji,
    side: pos.side,
    lotSize: pos.lotSize,
    entryPrice: pos.entryPrice,
    closePrice,
    stopLoss: pos.stopLoss,
    takeProfit: pos.takeProfit,
    pips: parseFloat(pipDiff.toFixed(1)),
    pnl: parseFloat(pnl.toFixed(2)),
    pnlPct: parseFloat(pnlPct.toFixed(2)),
    openedAt: pos.openedAt,
    closedAt: Date.now(),
    durationMin: Math.round((Date.now() - pos.openedAt) / 60000),
    strategy: pos.strategy,
    confidence: pos.confidence,
    closeReason: reason,
    reasoning: pos.reasoning,
    lessonLearned: pnl < 0 ? generateLesson(pos, reason) : null,
    timeframe: pos.timeframe,
  };

  // Update state
  state.balance += pos.margin + pnl;
  state.positions.splice(idx, 1);
  state.tradeLog.unshift(trade);
  if (state.tradeLog.length > 200) state.tradeLog.pop();

  // Update equity history
  state.equity = state.balance + state.positions.reduce((sum, p) => sum + p.unrealisedPnl, 0);
  state.equityHistory.push({ time: Date.now(), value: state.equity });
  if (state.equityHistory.length > 500) state.equityHistory.splice(0, 1);

  // Update daily stats
  const today = new Date().toDateString();
  if (state.dailyStats.date !== today) {
    state.dailyStats = { date: today, pnl: 0, trades: 0, wins: 0 };
  }
  state.dailyStats.pnl += pnl;
  state.dailyStats.trades += 1;
  if (pnl > 0) state.dailyStats.wins += 1;

  // Update strategy stats
  const ss = state.strategyStats[pos.strategy] ?? { wins: 0, losses: 0, totalPnl: 0, avgRR: 0 };
  if (pnl > 0) ss.wins++; else ss.losses++;
  ss.totalPnl += pnl;
  ss.avgRR = (ss.avgRR + pos.riskReward) / 2;
  state.strategyStats[pos.strategy] = ss;

  // Catat kesalahan jika loss
  if (pnl < 0 && reason === "SL") {
    recordMistake(pos, trade);
  }

  saveState();
  logger.info({ symbol: pos.symbol, pnl, reason }, "Forex Pro: posisi ditutup");
  return { ok: true, trade };
}

function generateLesson(pos: ForexProPosition, reason: ForexProTrade["closeReason"]): string {
  const lessons = [
    "Entry terlalu awal sebelum konfirmasi struktural lengkap — tunggu penutupan candle",
    "Stop loss terlalu ketat — perlu lebih banyak ruang ATR",
    "Tren HTF berlawanan — selalu periksa H4 dan D1 sebelum entry",
    "Volume rendah saat entry — sinyal lemah tanpa konfirmasi volume",
    "Spread tinggi saat entry — hindari entry saat pre-news",
    "Terlalu memaksa trade saat market sideways",
    "Tidak mempertimbangkan sesi — entry di dead zone",
    "Fundamental berlawanan dengan sinyal teknikal",
  ];
  return lessons[Math.floor(Math.random() * lessons.length)]!;
}

function recordMistake(pos: ForexProPosition, trade: ForexProTrade): void {
  const mistake: MistakeLog = {
    id: `err_${Date.now()}`,
    timestamp: Date.now(),
    symbol: pos.symbol,
    strategy: pos.strategy,
    mistake: `SL hit pada ${pos.symbol} ${pos.side} — ${trade.pips.toFixed(1)} pips`,
    lesson: trade.lessonLearned ?? "Review kondisi market sebelum entry berikutnya",
    severity: Math.abs(trade.pnl) > 20 ? "Kritis" : Math.abs(trade.pnl) > 10 ? "Sedang" : "Minor",
    avoided: false,
  };
  state.mistakes.unshift(mistake);
  if (state.mistakes.length > 50) state.mistakes.pop();
}

// ─── Update Posisi Terbuka ─────────────────────────────────────────────────────

export function updateOpenPositions(): void {
  for (const pos of state.positions) {
    const pair = getPairInfo(pos.symbol);
    const cp = updatePrice(pos.symbol);
    pos.currentPrice = cp;

    const pipDiff = (pos.side === "Buy" ? cp - pos.entryPrice : pos.entryPrice - cp) / pair.pipSize;
    pos.unrealisedPnl = parseFloat((pipDiff * pair.pipValue * pos.lotSize).toFixed(2));
    pos.unrealisedPips = parseFloat(pipDiff.toFixed(1));

    // Trailing stop
    if (config.trailingEnabled && pos.unrealisedPnl > 0) {
      if (pos.side === "Buy" && cp > pos.trailPeak) {
        pos.trailPeak = cp;
        pos.trailActivated = true;
        pos.stopLoss = Math.max(pos.stopLoss, cp - pair.volatility * 15);
      } else if (pos.side === "Sell" && cp < pos.trailPeak) {
        pos.trailPeak = cp;
        pos.trailActivated = true;
        pos.stopLoss = Math.min(pos.stopLoss, cp + pair.volatility * 15);
      }
    }

    // Breakeven
    if (config.breakevenEnabled && !pos.breakeven) {
      const beThreshold = pair.pipSize * 15;
      if (pos.side === "Buy" && cp > pos.entryPrice + beThreshold) {
        pos.stopLoss = pos.entryPrice + pair.pipSize * 2;
        pos.breakeven = true;
      } else if (pos.side === "Sell" && cp < pos.entryPrice - beThreshold) {
        pos.stopLoss = pos.entryPrice - pair.pipSize * 2;
        pos.breakeven = true;
      }
    }

    // SL Hit
    if ((pos.side === "Buy" && cp <= pos.stopLoss) || (pos.side === "Sell" && cp >= pos.stopLoss)) {
      closeForexProPosition(pos.id, "SL");
      continue;
    }

    // TP Hit
    if ((pos.side === "Buy" && cp >= pos.takeProfit) || (pos.side === "Sell" && cp <= pos.takeProfit)) {
      closeForexProPosition(pos.id, "TP");
    }
  }

  // Update equity
  state.equity = state.balance + state.positions.reduce((sum, p) => sum + p.unrealisedPnl, 0);
}

// ─── Auto Engine ──────────────────────────────────────────────────────────────

let autoTimer: ReturnType<typeof setInterval> | null = null;
let isScanning = false;
let lastCycleAt: number | null = null;
let cycleCount = 0;

export function startForexProAutoEngine(): void {
  if (autoTimer) return;
  logger.info("Forex Pro auto engine dimulai");
  autoTimer = setInterval(runForexProCycle, config.intervalMs);
}

export function stopForexProAutoEngine(): void {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  logger.info("Forex Pro auto engine dihentikan");
}

async function runForexProCycle(): Promise<void> {
  if (isScanning || !config.autoEnabled) return;
  isScanning = true;
  cycleCount++;
  lastCycleAt = Date.now();

  try {
    updateOpenPositions();

    for (const pair of FOREX_PAIRS_PRO.slice(0, 6)) { // Scan 6 pair utama
      if (state.positions.length >= config.maxPositions) break;
      const analysis = analyzeForexPro(pair.symbol, config.preferredTimeframe, state, config);
      if (analysis.aiDecision.shouldTrade && analysis.aiDecision.direction) {
        const result = openForexProPosition(pair.symbol, analysis.aiDecision.direction, config.preferredTimeframe);
        if (result.ok) {
          logger.info({ symbol: pair.symbol, direction: analysis.aiDecision.direction }, "Forex Pro: auto trade dibuka");
        }
      }
    }
  } finally {
    isScanning = false;
  }
}

export function getForexProEngineStatus() {
  return {
    autoEnabled: config.autoEnabled,
    isRunning: autoTimer !== null,
    isScanning,
    lastCycleAt,
    cycleCount,
    intervalMs: config.intervalMs,
  };
}

export function getForexProStats() {
  const closed = state.tradeLog;
  const wins = closed.filter(t => t.pnl > 0).length;
  const losses = closed.filter(t => t.pnl < 0).length;
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const totalPips = closed.reduce((s, t) => s + t.pips, 0);
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
  const avgWin = wins > 0 ? closed.filter(t => t.pnl > 0).reduce((s,t) => s + t.pnl, 0) / wins : 0;
  const avgLoss = losses > 0 ? Math.abs(closed.filter(t => t.pnl < 0).reduce((s,t) => s + t.pnl, 0) / losses) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins) / (avgLoss * losses) : 0;
  const maxDD = calcMaxDrawdown(state.equityHistory.map(e => e.value));
  return {
    totalTrades: closed.length,
    wins, losses, winRate: parseFloat(winRate.toFixed(1)),
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    totalPips: parseFloat(totalPips.toFixed(1)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    maxDrawdown: parseFloat(maxDD.toFixed(2)),
    currentBalance: parseFloat(state.balance.toFixed(2)),
    currentEquity: parseFloat(state.equity.toFixed(2)),
    unrealisedPnl: parseFloat(state.positions.reduce((s,p) => s + p.unrealisedPnl, 0).toFixed(2)),
    dailyPnl: parseFloat(state.dailyStats.pnl.toFixed(2)),
    dailyTrades: state.dailyStats.trades,
    strategyStats: state.strategyStats,
    equityHistory: state.equityHistory.slice(-100),
    mistakesCount: state.mistakes.length,
  };
}

function calcMaxDrawdown(equityArr: number[]): number {
  if (equityArr.length < 2) return 0;
  let peak = equityArr[0]!;
  let maxDD = 0;
  for (const v of equityArr) {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

export function resetForexPro(): void {
  state = defaultState();
  saveState();
}

// ─── MetaTrader 5 Koneksi (via MetaApi) ───────────────────────────────────────

interface MT5ConnectionState {
  connected: boolean;
  server: string;
  login: string;
  accountName: string;
  balance: number;
  equity: number;
  currency: string;
  broker: string;
  leverage: number;
  connectedAt: number | null;
  accountId: string | null; // MetaApi account ID
  isReal: boolean; // true = koneksi nyata via MetaApi
}

const MT5_CONFIG_FILE = join(DATA_DIR, "mt5-connection.json");

let mt5State: MT5ConnectionState = {
  connected: false, server: "", login: "",
  accountName: "", balance: 0, equity: 0, currency: "USD",
  broker: "", leverage: 100, connectedAt: null,
  accountId: null, isReal: false,
};

// Load MT5 state from disk on startup
(function loadMT5State() {
  try {
    if (existsSync(MT5_CONFIG_FILE)) {
      const loaded = JSON.parse(readFileSync(MT5_CONFIG_FILE, "utf-8"));
      mt5State = { ...mt5State, ...loaded, connected: false }; // selalu mulai disconnected
    }
  } catch { /* ignore */ }
})();

function saveMT5State(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(MT5_CONFIG_FILE, JSON.stringify(mt5State, null, 2));
  } catch { /* ignore */ }
}

/**
 * Koneksi MT5 nyata via MetaApi jika METAAPI_TOKEN tersedia,
 * fallback ke simulasi jika tidak ada token.
 */
export async function connectMT5(
  server: string,
  login: string,
  password: string
): Promise<{
  connected: boolean; accountName?: string; balance?: number; equity?: number;
  currency?: string; broker?: string; leverage?: number;
  accountId?: string; isReal?: boolean; error?: string;
}> {
  // Validasi format dasar
  if (login.length < 4) {
    return { connected: false, error: "Nomor akun tidak valid (min 4 digit)" };
  }
  if (password.length < 4) {
    return { connected: false, error: "Password terlalu pendek" };
  }
  if (!server.includes(".") && !server.includes("-")) {
    return { connected: false, error: "Format server tidak valid (contoh: ICMarketsGlobal-Demo01)" };
  }

  // ── Koneksi nyata via MetaApi ──────────────────────────────────────────────
  if (hasMetaApiToken()) {
    try {
      const info = await connectMT5Real(server, login, password);
      mt5State = {
        connected: true,
        server,
        login,
        accountName: info.accountName,
        balance: info.balance,
        equity: info.equity,
        currency: info.currency,
        broker: info.broker,
        leverage: info.leverage,
        connectedAt: Date.now(),
        accountId: info.accountId,
        isReal: true,
      };
      saveMT5State();
      logger.info(
        { server, login: login.slice(0, 4) + "****", broker: info.broker, balance: info.balance },
        "MT5 terhubung nyata via MetaApi"
      );
      return {
        connected: true,
        accountName: info.accountName,
        balance: info.balance,
        equity: info.equity,
        currency: info.currency,
        broker: info.broker,
        leverage: info.leverage,
        accountId: info.accountId,
        isReal: true,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Koneksi MetaApi gagal";
      logger.error({ err: msg }, "MetaApi koneksi gagal");
      return { connected: false, error: msg };
    }
  }

  // ── Fallback simulasi (tanpa METAAPI_TOKEN) ───────────────────────────────
  const serverLower = server.toLowerCase();
  const isDemo = serverLower.includes("demo");
  const isCent = serverLower.includes("cent");

  let broker = "Unknown Broker";
  if (serverLower.includes("icmarket") || serverLower.includes("ic-")) broker = "IC Markets";
  else if (serverLower.includes("xm")) broker = "XM Global";
  else if (serverLower.includes("fbs")) broker = "FBS";
  else if (serverLower.includes("exness")) broker = "Exness";
  else if (serverLower.includes("fxpro")) broker = "FxPro";
  else if (serverLower.includes("pepperstone")) broker = "Pepperstone";
  else if (serverLower.includes("axiory")) broker = "Axiory";
  else if (serverLower.includes("hotforex") || serverLower.includes("hfm")) broker = "HFM";
  else broker = server.split("-")[0] ?? server.split(".")[0] ?? "Broker";

  const currency = isCent ? "USC" : "USD";
  const leverage = isCent ? 200 : 100;
  const baseBalance = isCent ? 100000 : 1000;
  const accountName = `${isDemo ? "Demo" : "Live"} #${login}`;

  mt5State = {
    connected: true, server, login, accountName,
    balance: baseBalance, equity: baseBalance,
    currency, broker, leverage,
    connectedAt: Date.now(), accountId: null, isReal: false,
  };
  saveMT5State();
  logger.warn(
    { server, login: login.slice(0, 4) + "****" },
    "MT5 terhubung dalam mode SIMULASI — set METAAPI_TOKEN untuk koneksi nyata"
  );

  return { connected: true, accountName, balance: baseBalance, equity: baseBalance, currency, broker, leverage, isReal: false };
}

export async function disconnectMT5(): Promise<void> {
  const { accountId, isReal } = mt5State;
  mt5State = { ...mt5State, connected: false, connectedAt: null, accountId: null, isReal: false };
  saveMT5State();
  if (isReal && accountId) {
    await disconnectMT5Real(accountId).catch(() => {});
  }
  logger.info("MT5 diputuskan");
}

export async function refreshMT5Balance(): Promise<void> {
  if (!mt5State.connected || !mt5State.isReal || !mt5State.accountId) return;
  try {
    const info = await fetchAccountInformation(mt5State.accountId);
    mt5State.balance = info.balance ?? mt5State.balance;
    mt5State.equity = info.equity ?? mt5State.equity;
  } catch { /* ignore */ }
}

export function getMT5Status(): MT5ConnectionState {
  return { ...mt5State };
}

export function getMT5AccountId(): string | null {
  return mt5State.accountId ?? null;
}

export function isMT5RealConnected(): boolean {
  return mt5State.connected && mt5State.isReal;
}
