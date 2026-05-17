/**
 * AI Training Lab — Mesin backtesting institusional
 *
 * Menggunakan historical klines dari Bybit untuk:
 * - Menguji berbagai strategi trading
 * - Membandingkan performa antar strategi
 * - Menghitung Sharpe ratio, drawdown, profit factor
 * - Training berkelanjutan tanpa modal nyata
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const LAB_FILE = join(DATA_DIR, "training-lab.json");
const BYBIT_BASE = "https://api.bybit.com";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StrategyName =
  | "scalp_5m"
  | "bos_choch"
  | "order_block"
  | "momentum"
  | "reversal"
  | "ema_crossover"
  | "vwap_bounce";

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  symbol: string;
  strategy: StrategyName;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
  result: "win" | "loss";
  exitReason: "tp" | "sl" | "timeout";
  holdBars: number;
  confidence: number;
}

export interface StrategyResult {
  strategy: StrategyName;
  strategyLabel: string;
  symbol: string;
  interval: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalReturnPct: number;
  avgHoldBars: number;
  bestTrade: number;
  worstTrade: number;
  avgConfidence: number;
  backtestAt: number;
}

export interface TrainingLabState {
  isRunning: boolean;
  progress: number;
  phase: string;
  currentSymbol: string | null;
  currentStrategy: string | null;
  results: StrategyResult[];
  allTrades: BacktestTrade[];
  lastRun: number | null;
  totalBarsAnalyzed: number;
  log: string[];
  bestStrategy: { name: string; label: string; winRate: number; sharpe: number; pf: number } | null;
  summary: {
    totalBacktested: number;
    bestWinRate: number;
    bestSharpe: number;
    bestProfitFactor: number;
    totalTrades: number;
  };
}

const STRATEGY_LABELS: Record<StrategyName, string> = {
  scalp_5m: "Scalping 5M (EMA Cross)",
  bos_choch: "Break of Structure / CHOCH",
  order_block: "Order Block Bounce",
  momentum: "Momentum (RSI + MACD)",
  reversal: "Reversal di Level Ekstrem",
  ema_crossover: "EMA 9/21 Crossover",
  vwap_bounce: "VWAP Bounce",
};

// Pairs to backtest
export const TRAINING_PAIRS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT",
];

export const TRAINING_STRATEGIES: StrategyName[] = [
  "scalp_5m", "bos_choch", "order_block", "momentum", "reversal", "ema_crossover", "vwap_bounce",
];

// ─── State ────────────────────────────────────────────────────────────────────

let labState: TrainingLabState = {
  isRunning: false,
  progress: 0,
  phase: "Standby",
  currentSymbol: null,
  currentStrategy: null,
  results: [],
  allTrades: [],
  lastRun: null,
  totalBarsAnalyzed: 0,
  log: [],
  bestStrategy: null,
  summary: { totalBacktested: 0, bestWinRate: 0, bestSharpe: 0, bestProfitFactor: 0, totalTrades: 0 },
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function saveLabState() {
  try {
    ensureDataDir();
    const toSave = { ...labState, isRunning: false };
    writeFileSync(LAB_FILE, JSON.stringify(toSave, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to save training lab state");
  }
}

function loadLabState() {
  try {
    ensureDataDir();
    if (!existsSync(LAB_FILE)) return;
    const saved = JSON.parse(readFileSync(LAB_FILE, "utf-8")) as Partial<TrainingLabState>;
    labState = {
      ...labState,
      ...saved,
      isRunning: false,
    };
    logger.info({ results: labState.results.length }, "Training lab state loaded");
  } catch (err) {
    logger.warn({ err }, "Failed to load training lab state");
  }
}

loadLabState();

function addLog(msg: string) {
  const ts = new Date().toLocaleTimeString("id-ID", { hour12: false });
  labState.log.unshift(`[${ts}] ${msg}`);
  if (labState.log.length > 200) labState.log.splice(200);
}

// ─── Kline Fetcher ────────────────────────────────────────────────────────────

interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchKlines(symbol: string, interval: string, limit = 300): Promise<Kline[]> {
  try {
    const url = `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json() as { retCode: number; result: { list: string[][] } };
    if (data.retCode !== 0 || !data.result?.list) return [];
    return data.result.list
      .map(r => ({
        time: parseInt(r[0]),
        open: parseFloat(r[1]),
        high: parseFloat(r[2]),
        low: parseFloat(r[3]),
        close: parseFloat(r[4]),
        volume: parseFloat(r[5]),
      }))
      .reverse(); // oldest first
  } catch {
    return [];
  }
}

// ─── Indicator Calculators ─────────────────────────────────────────────────────

function ema(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = closes[0];
  for (const c of closes) {
    prev = c * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function rsi(closes: number[], period = 14): number[] {
  const result: number[] = new Array(period).fill(50);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

function macd(closes: number[]): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

function volumeAvg(volumes: number[], period = 20): number[] {
  const result: number[] = [];
  for (let i = 0; i < volumes.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = volumes.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

// ─── Strategy Signal Generators ───────────────────────────────────────────────

type SignalResult = { side: "long" | "short" | null; confidence: number; reason: string };

function strategyScalp5m(klines: Kline[], idx: number): SignalResult {
  if (idx < 30) return { side: null, confidence: 0, reason: "Insufficient data" };
  const closes = klines.slice(0, idx + 1).map(k => k.close);
  const volumes = klines.slice(0, idx + 1).map(k => k.volume);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const rsiVals = rsi(closes);
  const volAvgs = volumeAvg(volumes);

  const i = closes.length - 1;
  const e9 = ema9[i]; const e21 = ema21[i];
  const e9Prev = ema9[i - 1]; const e21Prev = ema21[i - 1];
  const rsiNow = rsiVals[i];
  const volRatio = volumes[i] / (volAvgs[i] || 1);

  const goldenCross = e9Prev < e21Prev && e9 > e21;
  const deathCross = e9Prev > e21Prev && e9 < e21;
  const volOk = volRatio > 1.3;

  if (goldenCross && rsiNow > 50 && rsiNow < 70 && volOk) {
    const conf = Math.min(92, 60 + (rsiNow - 50) * 0.8 + Math.min(15, volRatio * 5));
    return { side: "long", confidence: Math.round(conf), reason: `Golden cross EMA 9/21, RSI ${rsiNow.toFixed(0)}, Vol ${volRatio.toFixed(1)}x` };
  }
  if (deathCross && rsiNow < 50 && rsiNow > 30 && volOk) {
    const conf = Math.min(92, 60 + (50 - rsiNow) * 0.8 + Math.min(15, volRatio * 5));
    return { side: "short", confidence: Math.round(conf), reason: `Death cross EMA 9/21, RSI ${rsiNow.toFixed(0)}, Vol ${volRatio.toFixed(1)}x` };
  }
  return { side: null, confidence: 0, reason: "No EMA crossover" };
}

function strategyBosChoch(klines: Kline[], idx: number): SignalResult {
  if (idx < 20) return { side: null, confidence: 0, reason: "Insufficient data" };
  const slice = klines.slice(Math.max(0, idx - 20), idx + 1);
  const highs = slice.map(k => k.high);
  const lows = slice.map(k => k.low);
  const closes = slice.map(k => k.close);
  const i = slice.length - 1;

  // Find swing highs/lows
  const swingHigh = Math.max(...highs.slice(0, i));
  const swingLow = Math.min(...lows.slice(0, i));
  const curr = closes[i];
  const prev = closes[i - 1];
  const rsiVals = rsi(klines.slice(0, idx + 1).map(k => k.close));
  const rsiNow = rsiVals[rsiVals.length - 1];

  // BOS Bullish: price breaks above recent swing high
  if (prev < swingHigh && curr > swingHigh * 1.001 && rsiNow > 50) {
    const conf = Math.min(88, 65 + Math.min(20, (curr - swingHigh) / swingHigh * 1000));
    return { side: "long", confidence: Math.round(conf), reason: `BOS Bullish — break above $${swingHigh.toFixed(4)}` };
  }
  // BOS Bearish: price breaks below recent swing low
  if (prev > swingLow && curr < swingLow * 0.999 && rsiNow < 50) {
    const conf = Math.min(88, 65 + Math.min(20, (swingLow - curr) / swingLow * 1000));
    return { side: "short", confidence: Math.round(conf), reason: `BOS Bearish — break below $${swingLow.toFixed(4)}` };
  }
  return { side: null, confidence: 0, reason: "No structure break" };
}

function strategyOrderBlock(klines: Kline[], idx: number): SignalResult {
  if (idx < 15) return { side: null, confidence: 0, reason: "Insufficient data" };
  // Find last strong bullish/bearish candle (order block)
  let demandBlock: { high: number; low: number } | null = null;
  let supplyBlock: { high: number; low: number } | null = null;

  for (let j = idx - 1; j >= Math.max(0, idx - 15); j--) {
    const k = klines[j];
    const body = Math.abs(k.close - k.open);
    const range = k.high - k.low;
    const bodyRatio = range > 0 ? body / range : 0;
    if (bodyRatio > 0.7 && k.close > k.open && !demandBlock) {
      demandBlock = { high: k.high, low: k.low };
    }
    if (bodyRatio > 0.7 && k.close < k.open && !supplyBlock) {
      supplyBlock = { high: k.high, low: k.low };
    }
    if (demandBlock && supplyBlock) break;
  }

  const curr = klines[idx].close;
  const rsiVals = rsi(klines.slice(0, idx + 1).map(k => k.close));
  const rsiNow = rsiVals[rsiVals.length - 1];

  if (demandBlock && curr >= demandBlock.low && curr <= demandBlock.high && rsiNow < 55) {
    return { side: "long", confidence: 78, reason: `Demand OB tap $${demandBlock.low.toFixed(4)}–$${demandBlock.high.toFixed(4)}` };
  }
  if (supplyBlock && curr >= supplyBlock.low && curr <= supplyBlock.high && rsiNow > 45) {
    return { side: "short", confidence: 78, reason: `Supply OB tap $${supplyBlock.low.toFixed(4)}–$${supplyBlock.high.toFixed(4)}` };
  }
  return { side: null, confidence: 0, reason: "Price not in order block" };
}

function strategyMomentum(klines: Kline[], idx: number): SignalResult {
  if (idx < 35) return { side: null, confidence: 0, reason: "Insufficient data" };
  const closes = klines.slice(0, idx + 1).map(k => k.close);
  const rsiVals = rsi(closes);
  const { macdLine, signalLine, histogram } = macd(closes);
  const i = closes.length - 1;
  const rsiNow = rsiVals[i]; const rsiPrev = rsiVals[i - 1];
  const histNow = histogram[i]; const histPrev = histogram[i - 1];

  const rsiStrong = rsiNow > 55 && rsiNow > rsiPrev;
  const macdBullish = histNow > 0 && histNow > histPrev && macdLine[i] > signalLine[i];
  const rsiWeakening = rsiNow < 45 && rsiNow < rsiPrev;
  const macdBearish = histNow < 0 && histNow < histPrev && macdLine[i] < signalLine[i];

  if (rsiStrong && macdBullish) {
    const conf = Math.min(90, 65 + Math.min(20, (rsiNow - 55) * 1.5));
    return { side: "long", confidence: Math.round(conf), reason: `Momentum Bull: RSI ${rsiNow.toFixed(0)}, MACD hist ${histNow.toFixed(5)}` };
  }
  if (rsiWeakening && macdBearish) {
    const conf = Math.min(90, 65 + Math.min(20, (45 - rsiNow) * 1.5));
    return { side: "short", confidence: Math.round(conf), reason: `Momentum Bear: RSI ${rsiNow.toFixed(0)}, MACD hist ${histNow.toFixed(5)}` };
  }
  return { side: null, confidence: 0, reason: "No momentum confluence" };
}

function strategyReversal(klines: Kline[], idx: number): SignalResult {
  if (idx < 20) return { side: null, confidence: 0, reason: "Insufficient data" };
  const closes = klines.slice(0, idx + 1).map(k => k.close);
  const rsiVals = rsi(closes);
  const i = closes.length - 1;
  const rsiNow = rsiVals[i]; const rsiPrev = rsiVals[i - 1];

  // Bearish reversal after overbought
  if (rsiPrev >= 75 && rsiNow < rsiPrev) {
    const conf = Math.min(88, 62 + (rsiPrev - rsiNow) * 3);
    return { side: "short", confidence: Math.round(conf), reason: `RSI reversal dari OB ${rsiPrev.toFixed(0)} → ${rsiNow.toFixed(0)}` };
  }
  // Bullish reversal after oversold
  if (rsiPrev <= 25 && rsiNow > rsiPrev) {
    const conf = Math.min(88, 62 + (rsiNow - rsiPrev) * 3);
    return { side: "long", confidence: Math.round(conf), reason: `RSI reversal dari OS ${rsiPrev.toFixed(0)} → ${rsiNow.toFixed(0)}` };
  }
  return { side: null, confidence: 0, reason: "No reversal signal" };
}

function strategyEmaCrossover(klines: Kline[], idx: number): SignalResult {
  if (idx < 50) return { side: null, confidence: 0, reason: "Insufficient data" };
  const closes = klines.slice(0, idx + 1).map(k => k.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const i = closes.length - 1;
  const e20 = ema20[i]; const e50 = ema50[i];
  const e20p = ema20[i - 1]; const e50p = ema50[i - 1];
  const rsiVals = rsi(closes);

  if (e20p < e50p && e20 > e50 && rsiVals[i] > 50) {
    return { side: "long", confidence: 75, reason: `EMA 20 cross above EMA 50, RSI ${rsiVals[i].toFixed(0)}` };
  }
  if (e20p > e50p && e20 < e50 && rsiVals[i] < 50) {
    return { side: "short", confidence: 75, reason: `EMA 20 cross below EMA 50, RSI ${rsiVals[i].toFixed(0)}` };
  }
  return { side: null, confidence: 0, reason: "No EMA 20/50 cross" };
}

function strategyVwapBounce(klines: Kline[], idx: number): SignalResult {
  if (idx < 10) return { side: null, confidence: 0, reason: "Insufficient data" };
  const slice = klines.slice(Math.max(0, idx - 100), idx + 1);
  const totalVolume = slice.reduce((s, k) => s + k.volume, 0);
  const vwap = totalVolume > 0
    ? slice.reduce((s, k) => s + ((k.high + k.low + k.close) / 3) * k.volume, 0) / totalVolume
    : slice[slice.length - 1].close;

  const curr = klines[idx].close;
  const prev = klines[idx - 1].close;
  const rsiVals = rsi(klines.slice(0, idx + 1).map(k => k.close));
  const rsiNow = rsiVals[rsiVals.length - 1];
  const distPct = Math.abs(curr - vwap) / vwap * 100;

  // Price bouncing off VWAP
  if (prev < vwap && curr > vwap && rsiNow > 48 && distPct < 0.5) {
    return { side: "long", confidence: 77, reason: `VWAP bounce up $${vwap.toFixed(4)}, dist ${distPct.toFixed(2)}%` };
  }
  if (prev > vwap && curr < vwap && rsiNow < 52 && distPct < 0.5) {
    return { side: "short", confidence: 77, reason: `VWAP bounce down $${vwap.toFixed(4)}, dist ${distPct.toFixed(2)}%` };
  }
  return { side: null, confidence: 0, reason: "No VWAP interaction" };
}

function getSignal(strategy: StrategyName, klines: Kline[], idx: number): SignalResult {
  switch (strategy) {
    case "scalp_5m": return strategyScalp5m(klines, idx);
    case "bos_choch": return strategyBosChoch(klines, idx);
    case "order_block": return strategyOrderBlock(klines, idx);
    case "momentum": return strategyMomentum(klines, idx);
    case "reversal": return strategyReversal(klines, idx);
    case "ema_crossover": return strategyEmaCrossover(klines, idx);
    case "vwap_bounce": return strategyVwapBounce(klines, idx);
  }
}

// ─── Performance Calculations ─────────────────────────────────────────────────

function calcSharpeRatio(returns: number[]): number {
  if (returns.length < 3) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  // Annualize assuming ~4320 trades/year on 5m bars (365d * 24h * 12bars)
  return parseFloat(((mean / std) * Math.sqrt(4320)).toFixed(2));
}

function calcMaxDrawdown(returns: number[]): number {
  let peak = 0;
  let equity = 0;
  let maxDD = 0;
  for (const r of returns) {
    equity += r;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }
  return parseFloat(maxDD.toFixed(2));
}

function calcProfitFactor(trades: BacktestTrade[]): number {
  const grossWin = trades.filter(t => t.result === "win").reduce((s, t) => s + t.pnlPct, 0);
  const grossLoss = Math.abs(trades.filter(t => t.result === "loss").reduce((s, t) => s + t.pnlPct, 0));
  if (grossLoss === 0) return grossWin > 0 ? 999 : 0;
  return parseFloat((grossWin / grossLoss).toFixed(2));
}

// ─── Backtest Runner ──────────────────────────────────────────────────────────

async function backtestStrategy(
  symbol: string,
  strategy: StrategyName,
  interval = "5"
): Promise<{ result: StrategyResult; trades: BacktestTrade[] }> {
  const klines = await fetchKlines(symbol, interval, 300);
  if (klines.length < 50) {
    return {
      result: {
        strategy, strategyLabel: STRATEGY_LABELS[strategy], symbol, interval,
        totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0,
        sharpeRatio: 0, maxDrawdown: 0, totalReturnPct: 0, avgHoldBars: 0,
        bestTrade: 0, worstTrade: 0, avgConfidence: 0, backtestAt: Date.now(),
      },
      trades: [],
    };
  }

  const trades: BacktestTrade[] = [];
  const TP_PCT = 1.5;  // 1.5% take profit
  const SL_PCT = 0.75; // 0.75% stop loss (R:R = 2:1)
  const MAX_HOLD_BARS = 12; // max 12 bars before timeout

  let inTrade = false;
  let tradeEntry = 0;
  let tradeSide: "long" | "short" = "long";
  let tradeEntryIdx = 0;
  let tradeConf = 0;
  let tradeReason = "";

  // Cooldown after signal to avoid repeated entries
  let cooldownBars = 0;

  for (let i = 50; i < klines.length; i++) {
    if (cooldownBars > 0) { cooldownBars--; continue; }

    if (!inTrade) {
      const signal = getSignal(strategy, klines, i);
      if (signal.side && signal.confidence >= 70) {
        inTrade = true;
        tradeEntry = klines[i].close;
        tradeSide = signal.side;
        tradeEntryIdx = i;
        tradeConf = signal.confidence;
        tradeReason = signal.reason;
        cooldownBars = 3; // don't re-enter immediately
      }
    } else {
      const curr = klines[i].close;
      const pnlPct = tradeSide === "long"
        ? (curr - tradeEntry) / tradeEntry * 100
        : (tradeEntry - curr) / tradeEntry * 100;
      const holdBars = i - tradeEntryIdx;

      let exitReason: "tp" | "sl" | "timeout" | null = null;
      let exitPrice = curr;

      if (pnlPct >= TP_PCT) { exitReason = "tp"; exitPrice = tradeSide === "long" ? tradeEntry * (1 + TP_PCT / 100) : tradeEntry * (1 - TP_PCT / 100); }
      else if (pnlPct <= -SL_PCT) { exitReason = "sl"; exitPrice = tradeSide === "long" ? tradeEntry * (1 - SL_PCT / 100) : tradeEntry * (1 + SL_PCT / 100); }
      else if (holdBars >= MAX_HOLD_BARS) { exitReason = "timeout"; }

      if (exitReason) {
        const finalPnl = tradeSide === "long"
          ? (exitPrice - tradeEntry) / tradeEntry * 100
          : (tradeEntry - exitPrice) / tradeEntry * 100;

        trades.push({
          entryTime: klines[tradeEntryIdx].time,
          exitTime: klines[i].time,
          symbol,
          strategy,
          side: tradeSide,
          entryPrice: tradeEntry,
          exitPrice,
          pnlPct: parseFloat(finalPnl.toFixed(4)),
          result: finalPnl > 0 ? "win" : "loss",
          exitReason,
          holdBars,
          confidence: tradeConf,
        });

        inTrade = false;
        cooldownBars = 5;
      }
    }
  }

  const returns = trades.map(t => t.pnlPct);
  const wins = trades.filter(t => t.result === "win").length;
  const pf = calcProfitFactor(trades);

  const result: StrategyResult = {
    strategy,
    strategyLabel: STRATEGY_LABELS[strategy],
    symbol,
    interval,
    totalTrades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length > 0 ? parseFloat(((wins / trades.length) * 100).toFixed(1)) : 0,
    profitFactor: pf,
    sharpeRatio: calcSharpeRatio(returns),
    maxDrawdown: calcMaxDrawdown(returns),
    totalReturnPct: parseFloat(returns.reduce((a, b) => a + b, 0).toFixed(2)),
    avgHoldBars: trades.length > 0 ? Math.round(trades.reduce((s, t) => s + t.holdBars, 0) / trades.length) : 0,
    bestTrade: trades.length > 0 ? parseFloat(Math.max(...returns).toFixed(2)) : 0,
    worstTrade: trades.length > 0 ? parseFloat(Math.min(...returns).toFixed(2)) : 0,
    avgConfidence: trades.length > 0 ? Math.round(trades.reduce((s, t) => s + t.confidence, 0) / trades.length) : 0,
    backtestAt: Date.now(),
  };

  return { result, trades };
}

// ─── Training Lab Engine ──────────────────────────────────────────────────────

let labTimer: ReturnType<typeof setTimeout> | null = null;

export async function runTrainingLab(options?: {
  pairs?: string[];
  strategies?: StrategyName[];
}): Promise<void> {
  if (labState.isRunning) return;

  const pairs = options?.pairs ?? TRAINING_PAIRS.slice(0, 5);
  const strategies = options?.strategies ?? TRAINING_STRATEGIES;
  const total = pairs.length * strategies.length;
  let done = 0;

  labState = {
    ...labState,
    isRunning: true,
    progress: 0,
    phase: "Memulai AI Training Lab...",
    currentSymbol: null,
    currentStrategy: null,
    results: [],
    allTrades: [],
    log: labState.log,
  };

  addLog(`Training dimulai — ${pairs.length} pair × ${strategies.length} strategi = ${total} backtest`);

  try {
    for (const symbol of pairs) {
      for (const strategy of strategies) {
        labState.currentSymbol = symbol;
        labState.currentStrategy = STRATEGY_LABELS[strategy];
        labState.phase = `Backtesting ${strategy} pada ${symbol}...`;

        addLog(`Menganalisis ${symbol} dengan strategi ${STRATEGY_LABELS[strategy]}`);

        const { result, trades } = await backtestStrategy(symbol, strategy);
        labState.results.push(result);
        labState.allTrades.push(...trades);
        labState.totalBarsAnalyzed += 300;
        done++;
        labState.progress = Math.round((done / total) * 100);

        if (result.totalTrades > 0) {
          addLog(
            `${symbol} [${STRATEGY_LABELS[strategy]}]: ${result.totalTrades} trade, WR ${result.winRate}%, PF ${result.profitFactor}, Sharpe ${result.sharpeRatio}`
          );
        }

        // Small delay to not hammer Bybit
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Compute summary
    const allResults = labState.results.filter(r => r.totalTrades >= 3);
    if (allResults.length > 0) {
      const bestByWinRate = allResults.reduce((best, r) => r.winRate > best.winRate ? r : best);
      const bestBySharpe = allResults.reduce((best, r) => r.sharpeRatio > best.sharpeRatio ? r : best);
      const bestByPF = allResults.reduce((best, r) => r.profitFactor > best.profitFactor ? r : best);

      labState.bestStrategy = {
        name: bestByWinRate.strategy,
        label: bestByWinRate.strategyLabel,
        winRate: bestByWinRate.winRate,
        sharpe: bestBySharpe.sharpeRatio,
        pf: bestByPF.profitFactor,
      };
      labState.summary = {
        totalBacktested: done,
        bestWinRate: bestByWinRate.winRate,
        bestSharpe: bestBySharpe.sharpeRatio,
        bestProfitFactor: bestByPF.profitFactor,
        totalTrades: labState.allTrades.length,
      };
      addLog(`Training selesai! Best WR: ${bestByWinRate.strategyLabel} (${bestByWinRate.winRate}%). Best Sharpe: ${bestBySharpe.strategyLabel} (${bestBySharpe.sharpeRatio})`);
    }

  } catch (err) {
    addLog(`Error: ${String(err).slice(0, 100)}`);
    logger.error({ err }, "Training lab error");
  } finally {
    labState.isRunning = false;
    labState.progress = 100;
    labState.phase = "Training selesai";
    labState.currentSymbol = null;
    labState.currentStrategy = null;
    labState.lastRun = Date.now();
    saveLabState();
  }
}

export function stopTrainingLab(): void {
  if (labTimer) { clearTimeout(labTimer); labTimer = null; }
  labState.isRunning = false;
  labState.phase = "Dihentikan manual";
  addLog("Training dihentikan oleh user");
}

export function getTrainingLabState(): TrainingLabState {
  return { ...labState };
}

export function getTrainingLabResults(): StrategyResult[] {
  return [...labState.results];
}

export function getStrategyComparison(): Record<StrategyName, { winRate: number; sharpe: number; pf: number; trades: number }> {
  const comparison: Partial<Record<StrategyName, { winRate: number; sharpe: number; pf: number; trades: number }>> = {};
  for (const s of TRAINING_STRATEGIES) {
    const stratResults = labState.results.filter(r => r.strategy === s && r.totalTrades >= 3);
    if (stratResults.length === 0) continue;
    const avgWR = stratResults.reduce((s, r) => s + r.winRate, 0) / stratResults.length;
    const avgSharpe = stratResults.reduce((s, r) => s + r.sharpeRatio, 0) / stratResults.length;
    const avgPF = stratResults.reduce((s, r) => s + r.profitFactor, 0) / stratResults.length;
    const totalTrades = stratResults.reduce((s, r) => s + r.totalTrades, 0);
    comparison[s] = {
      winRate: parseFloat(avgWR.toFixed(1)),
      sharpe: parseFloat(avgSharpe.toFixed(2)),
      pf: parseFloat(avgPF.toFixed(2)),
      trades: totalTrades,
    };
  }
  return comparison as Record<StrategyName, { winRate: number; sharpe: number; pf: number; trades: number }>;
}
