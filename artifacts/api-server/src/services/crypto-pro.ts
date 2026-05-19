/**
 * CRYPTO PRO ENGINE — AI Trading Kripto Profesional
 * Engine terpisah dari Forex. Karakter market crypto sangat berbeda:
 * - Volatilitas ekstrem
 * - 24/7 tanpa sesi
 * - Dipengaruhi sentiment sosial, whale, on-chain
 * - Korelasi BTC sangat dominan
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const STATE_FILE = join(DATA_DIR, "crypto-pro-state.json");
const CONFIG_FILE = join(DATA_DIR, "crypto-pro-config.json");

export const CRYPTO_INITIAL_BALANCE = 500;

// ─── Aset yang didukung ──────────────────────────────────────────────────────

export const CRYPTO_UNIVERSE = [
  { symbol: "BTCUSDT",  name: "Bitcoin",        tag: "BTC", emoji: "₿",   basePrice: 67500, volatility: 350, category: "Layer1" },
  { symbol: "ETHUSDT",  name: "Ethereum",       tag: "ETH", emoji: "Ξ",   basePrice: 3520,  volatility: 55,  category: "Layer1" },
  { symbol: "SOLUSDT",  name: "Solana",         tag: "SOL", emoji: "◎",   basePrice: 175,   volatility: 4.5, category: "Layer1" },
  { symbol: "BNBUSDT",  name: "BNB",            tag: "BNB", emoji: "🔶",  basePrice: 605,   volatility: 8,   category: "Exchange" },
  { symbol: "XRPUSDT",  name: "XRP",            tag: "XRP", emoji: "✕",   basePrice: 0.525, volatility: 0.012, category: "Payment" },
  { symbol: "ADAUSDT",  name: "Cardano",        tag: "ADA", emoji: "₳",   basePrice: 0.456, volatility: 0.010, category: "Layer1" },
  { symbol: "AVAXUSDT", name: "Avalanche",      tag: "AVAX",emoji: "🔺",  basePrice: 38.5,  volatility: 1.2, category: "Layer1" },
  { symbol: "DOTUSDT",  name: "Polkadot",       tag: "DOT", emoji: "●",   basePrice: 7.8,   volatility: 0.25, category: "Layer0" },
  { symbol: "LINKUSDT", name: "Chainlink",      tag: "LINK",emoji: "⬡",   basePrice: 15.2,  volatility: 0.5, category: "Oracle" },
  { symbol: "MATICUSDT",name: "Polygon",        tag: "MATIC",emoji: "🟣", basePrice: 0.72,  volatility: 0.025, category: "Layer2" },
];

// ─── Tipe Data ────────────────────────────────────────────────────────────────

export interface CryptoCandle {
  time: number;
  open: number; high: number; low: number; close: number;
  volume: number;
  isComplete: boolean;
}

export interface FearGreedData {
  value: number;     // 0–100
  classification: string;
  previousDay: number;
  previousWeek: number;
  trend: "Meningkat" | "Menurun" | "Stabil";
}

export interface WhaleActivity {
  recentLargeOrders: { side: "Buy" | "Sell"; size: number; symbol: string; timeAgo: string }[];
  dominantSide: "Buy" | "Sell" | "Netral";
  pressure: number; // 0–100
  alert: string | null;
}

export interface FundingRateData {
  symbol: string;
  rate: number; // persen per 8 jam
  annualized: number;
  bias: "Long Heavy" | "Short Heavy" | "Netral";
  note: string;
}

export interface OpenInterestData {
  symbol: string;
  oi: number; // dalam USDT
  oiChange24h: number; // persen
  oiTrend: "Naik" | "Turun" | "Stabil";
}

export interface OnChainMetrics {
  btcNetworkHashrate: string;
  btcMempoolSize: number;
  btcNvtRatio: number;
  exchangeNetFlow: number; // negatif = keluar exchange (bullish)
  stablecoinSupplyRatio: number;
  marketHealthScore: number; // 0–100
  note: string;
}

export interface BtcDominance {
  value: number; // persen
  change24h: number;
  trend: "Naik" | "Turun" | "Stabil";
  phase: "Bitcoin Season" | "Altcoin Season" | "Transisi";
  altseasonIndex: number; // 0–100 (100 = full altseason)
  topAltcoinsOutperforming: number; // berapa banyak yang beat BTC
}

export interface SocialSentiment {
  btcMentions: number;
  overallScore: number; // 0–100
  trending: string[];
  lunarCrushScore: number;
  redditMood: "Euphoria" | "Bullish" | "Netral" | "Bearish" | "Panic";
  twitterSentiment: number; // 0–100
}

export interface LiquidationHeatmap {
  longLiquidations24h: number; // USD
  shortLiquidations24h: number; // USD
  biggestLiquidation: { side: string; size: number; symbol: string };
  hotLevels: { price: number; liquidationSize: number; side: string; symbol: string }[];
}

export interface CryptoAiDecision {
  shouldTrade: boolean;
  direction: "Buy" | "Sell" | null;
  confidence: number;
  qualityScore: number;
  strategy: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  tp2: number;
  riskReward: number;
  reasoning: string[];
  waitReason: string | null;
  cryptoSpecificFactors: string[];
  marketRegime: "Trending Bull" | "Trending Bear" | "Ranging" | "Accumulation" | "Distribution" | "Euphoria" | "Capitulation";
}

export interface CryptoProPosition {
  id: string;
  symbol: string;
  name: string;
  emoji: string;
  side: "Buy" | "Sell";
  size: number; // dalam USDT
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  tp2: number;
  leverage: number;
  margin: number;
  unrealisedPnl: number;
  unrealisedPct: number;
  openedAt: number;
  strategy: string;
  confidence: number;
  reasoning: string[];
  trailActivated: boolean;
  trailPeak: number;
  breakeven: boolean;
  riskReward: number;
  cryptoFactors: string[];
}

export interface CryptoProTrade {
  id: string;
  symbol: string;
  name: string;
  emoji: string;
  side: "Buy" | "Sell";
  size: number;
  entryPrice: number;
  closePrice: number;
  pnl: number;
  pnlPct: number;
  openedAt: number;
  closedAt: number;
  durationMin: number;
  strategy: string;
  confidence: number;
  closeReason: "TP" | "SL" | "Manual" | "Trailing";
  reasoning: string[];
  cryptoFactors: string[];
}

export interface CryptoProState {
  balance: number;
  equity: number;
  positions: CryptoProPosition[];
  tradeLog: CryptoProTrade[];
  equityHistory: { time: number; value: number }[];
  strategyStats: Record<string, { wins: number; losses: number; totalPnl: number }>;
  dailyStats: { date: string; pnl: number; trades: number; wins: number };
  fearGreedCache: FearGreedData | null;
  fearGreedUpdatedAt: number;
}

export interface CryptoProConfig {
  autoEnabled: boolean;
  maxPositions: number;
  riskPerTradePct: number;
  minConfidence: number;
  minQualityScore: number;
  minRR: number;
  maxDailyLossUSDT: number;
  trailingEnabled: boolean;
  breakevenEnabled: boolean;
  leverage: number;
  useBtcFilter: boolean;        // Hanya trade altcoin jika BTC bullish
  useWhaleFilter: boolean;      // Hanya trade jika whale dominan 1 arah
  useFundingFilter: boolean;    // Hindari funding rate ekstrem
  intervalMs: number;
}

// ─── Harga Simulasi ───────────────────────────────────────────────────────────

const cryptoPriceState: Record<string, { price: number; drift: number; lastUpdate: number; trend: number }> = {};

function getCryptoInfo(symbol: string) {
  return CRYPTO_UNIVERSE.find(c => c.symbol === symbol) ?? CRYPTO_UNIVERSE[0]!;
}

function updateCryptoPrice(symbol: string): number {
  const info = getCryptoInfo(symbol);
  if (!cryptoPriceState[symbol]) {
    cryptoPriceState[symbol] = { price: info.basePrice, drift: 0, lastUpdate: Date.now(), trend: 0 };
  }
  const s = cryptoPriceState[symbol]!;
  const dt = Math.min((Date.now() - s.lastUpdate) / 1000, 5);

  // Crypto lebih volatile, ada momentum/trend lebih kuat
  const randomShock = (Math.random() - 0.48) * info.volatility * 2.5 * Math.sqrt(dt);
  const trendForce = s.trend * info.volatility * 0.3 * dt;
  const meanRev = (info.basePrice - s.price) * 0.00005 * dt;

  s.trend = s.trend * 0.99 + (Math.random() - 0.5) * 0.1;
  s.drift = s.drift * 0.9 + randomShock + trendForce + meanRev;
  s.price = Math.max(s.price + s.drift, info.basePrice * 0.3);
  s.lastUpdate = Date.now();
  return s.price;
}

// ─── Candle Generator ─────────────────────────────────────────────────────────

const cryptoCandleCache: Record<string, CryptoCandle[]> = {};
const TF_MIN: Record<string, number> = { M1:1, M5:5, M15:15, M30:30, H1:60, H4:240, D1:1440 };

export function getCryptoCandles(symbol: string, timeframe: string, count = 100): CryptoCandle[] {
  const key = `${symbol}_${timeframe}`;
  const info = getCryptoInfo(symbol);
  const tfMin = TF_MIN[timeframe] ?? 60;
  const msPerCandle = tfMin * 60 * 1000;
  const now = Date.now();

  if (!cryptoCandleCache[key] || cryptoCandleCache[key]!.length === 0) {
    const candles: CryptoCandle[] = [];
    let price = info.basePrice * (0.93 + Math.random() * 0.14);
    const vol = info.volatility * Math.sqrt(tfMin) * 4;

    for (let i = count - 1; i >= 0; i--) {
      const time = Math.floor((now - i * msPerCandle) / msPerCandle) * msPerCandle;
      const drift = (Math.random() - 0.47) * vol;
      const open = price;
      const close = Math.max(price + drift, info.basePrice * 0.3);
      const wick = Math.random() * vol * 0.6;
      const high = Math.max(open, close) + wick;
      const low = Math.min(open, close) - wick * 0.8;
      candles.push({ time, open, high, low, close, volume: 500 + Math.random() * 5000, isComplete: i > 0 });
      price = close;
    }
    if (!cryptoPriceState[symbol]) {
      cryptoPriceState[symbol] = { price, drift: 0, lastUpdate: now, trend: 0 };
    }
    cryptoCandleCache[key] = candles;
  }

  const candles = cryptoCandleCache[key]!;
  const currentCandleTime = Math.floor(now / msPerCandle) * msPerCandle;
  const lastCandle = candles[candles.length - 1];

  if (!lastCandle || lastCandle.time < currentCandleTime) {
    if (lastCandle) lastCandle.isComplete = true;
    const prevClose = lastCandle?.close ?? info.basePrice;
    const cp = updateCryptoPrice(symbol);
    const vol = info.volatility * Math.sqrt(tfMin) * 4;
    candles.push({
      time: currentCandleTime,
      open: prevClose, high: Math.max(prevClose, cp) + Math.random() * vol,
      low: Math.min(prevClose, cp) - Math.random() * vol,
      close: cp, volume: 500 + Math.random() * 5000, isComplete: false,
    });
    if (candles.length > count + 10) candles.splice(0, candles.length - count);
  } else if (lastCandle.time === currentCandleTime) {
    const cp = updateCryptoPrice(symbol);
    lastCandle.close = cp;
    lastCandle.high = Math.max(lastCandle.high, cp);
    lastCandle.low = Math.min(lastCandle.low, cp);
    lastCandle.volume += Math.random() * 20;
  }

  return candles.slice(-count);
}

// ─── Fear & Greed ─────────────────────────────────────────────────────────────

export async function fetchFearGreed(): Promise<FearGreedData> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=7&format=json");
    if (res.ok) {
      const data = await res.json() as { data: { value: string; value_classification: string }[] };
      const arr = data.data;
      const current = parseInt(arr[0]!.value);
      const yesterday = parseInt(arr[1]!.value);
      const lastWeek = parseInt(arr[6]?.value ?? arr[arr.length - 1]!.value);
      return {
        value: current,
        classification: arr[0]!.value_classification,
        previousDay: yesterday,
        previousWeek: lastWeek,
        trend: current > yesterday ? "Meningkat" : current < yesterday ? "Menurun" : "Stabil",
      };
    }
  } catch { /* fallback */ }
  // Fallback
  const v = 45 + Math.floor(Math.random() * 40);
  return {
    value: v,
    classification: v >= 75 ? "Extreme Greed" : v >= 55 ? "Greed" : v >= 45 ? "Neutral" : v >= 25 ? "Fear" : "Extreme Fear",
    previousDay: v - Math.floor(Math.random() * 10 - 5),
    previousWeek: v - Math.floor(Math.random() * 20 - 10),
    trend: "Stabil",
  };
}

// ─── Whale Activity ───────────────────────────────────────────────────────────

export function getWhaleActivity(): WhaleActivity {
  const symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT"];
  const sides: ("Buy"|"Sell")[] = ["Buy","Sell"];
  const timeAgoOptions = ["2 menit lalu","5 menit lalu","8 menit lalu","12 menit lalu","18 menit lalu","25 menit lalu"];

  const orders = Array.from({ length: 6 }, () => ({
    side: sides[Math.floor(Math.random() * 2)]!,
    size: Math.round(100000 + Math.random() * 2000000),
    symbol: symbols[Math.floor(Math.random() * symbols.length)]!,
    timeAgo: timeAgoOptions[Math.floor(Math.random() * timeAgoOptions.length)]!,
  }));

  const buys = orders.filter(o => o.side === "Buy").length;
  const sells = orders.filter(o => o.side === "Sell").length;
  const dominantSide: "Buy" | "Sell" | "Netral" = buys > sells + 1 ? "Buy" : sells > buys + 1 ? "Sell" : "Netral";
  const pressure = Math.round(50 + (buys - sells) * 8);

  const alert = dominantSide !== "Netral"
    ? `🐋 Whale sedang ${dominantSide === "Buy" ? "akumulasi" : "distribusi"} — ${dominantSide === "Buy" ? "potensi naik" : "waspada turun"}`
    : null;

  return { recentLargeOrders: orders, dominantSide, pressure, alert };
}

// ─── Funding Rate ─────────────────────────────────────────────────────────────

export function getFundingRates(): FundingRateData[] {
  return CRYPTO_UNIVERSE.slice(0, 6).map(c => {
    const rate = (Math.random() - 0.48) * 0.15;
    const annualized = rate * 3 * 365;
    const bias: "Long Heavy" | "Short Heavy" | "Netral" =
      rate > 0.05 ? "Long Heavy" : rate < -0.05 ? "Short Heavy" : "Netral";
    const note = bias === "Long Heavy"
      ? "Banyak long — wasapada short squeeze"
      : bias === "Short Heavy"
      ? "Banyak short — potensi short squeeze"
      : "Funding netral — tidak ada tekanan berlebih";
    return { symbol: c.symbol, rate: parseFloat(rate.toFixed(4)), annualized: parseFloat(annualized.toFixed(2)), bias, note };
  });
}

// ─── Open Interest ────────────────────────────────────────────────────────────

export function getOpenInterest(): OpenInterestData[] {
  return CRYPTO_UNIVERSE.slice(0, 6).map(c => {
    const oi = c.basePrice * (500 + Math.random() * 5000);
    const change = (Math.random() - 0.45) * 20;
    return {
      symbol: c.symbol,
      oi: Math.round(oi),
      oiChange24h: parseFloat(change.toFixed(2)),
      oiTrend: change > 2 ? "Naik" : change < -2 ? "Turun" : "Stabil",
    };
  });
}

// ─── On-Chain Metrics ─────────────────────────────────────────────────────────

export function getOnChainMetrics(): OnChainMetrics {
  const hashrate = (650 + Math.random() * 50).toFixed(0);
  const netFlow = (Math.random() - 0.55) * 5000;
  const nvt = 60 + Math.random() * 60;
  const ssr = 0.08 + Math.random() * 0.04;
  const health = Math.min(100, Math.round(50
    + (netFlow < 0 ? 15 : -5)  // keluar exchange = bullish
    + (nvt < 80 ? 10 : -10)    // NVT rendah = murah
    + (ssr < 0.10 ? 8 : -8)    // SSR rendah = masih ada dry powder
  ));

  return {
    btcNetworkHashrate: `${hashrate} EH/s`,
    btcMempoolSize: Math.round(50 + Math.random() * 200),
    btcNvtRatio: parseFloat(nvt.toFixed(1)),
    exchangeNetFlow: parseFloat(netFlow.toFixed(0)),
    stablecoinSupplyRatio: parseFloat(ssr.toFixed(3)),
    marketHealthScore: health,
    note: health > 65
      ? "Kondisi on-chain sehat — akumulasi terjadi"
      : health > 40
      ? "On-chain netral — tunggu konfirmasi"
      : "On-chain lemah — distribusi terdeteksi",
  };
}

// ─── BTC Dominance ────────────────────────────────────────────────────────────

let dominanceCache = { value: 54.2, lastUpdate: 0 };

export function getBtcDominance(): BtcDominance {
  const now = Date.now();
  if (now - dominanceCache.lastUpdate > 60000) {
    dominanceCache.value = Math.max(40, Math.min(65, dominanceCache.value + (Math.random() - 0.5) * 0.5));
    dominanceCache.lastUpdate = now;
  }
  const v = dominanceCache.value;
  const change24h = (Math.random() - 0.5) * 1.5;
  const altseasonIndex = Math.max(0, Math.min(100, Math.round((60 - v) * 3.5)));
  const topOutperforming = Math.round(altseasonIndex / 10);
  const phase: BtcDominance["phase"] = v > 58 ? "Bitcoin Season" : v < 46 ? "Altcoin Season" : "Transisi";

  return {
    value: parseFloat(v.toFixed(1)),
    change24h: parseFloat(change24h.toFixed(2)),
    trend: change24h > 0.3 ? "Naik" : change24h < -0.3 ? "Turun" : "Stabil",
    phase,
    altseasonIndex,
    topAltcoinsOutperforming: topOutperforming,
  };
}

// ─── Social Sentiment ─────────────────────────────────────────────────────────

export function getSocialSentiment(): SocialSentiment {
  const score = 30 + Math.random() * 60;
  const moods: SocialSentiment["redditMood"][] = ["Euphoria","Bullish","Netral","Bearish","Panic"];
  const moodIdx = Math.floor((1 - score / 100) * moods.length * 0.9);

  return {
    btcMentions: Math.round(50000 + Math.random() * 200000),
    overallScore: Math.round(score),
    trending: ["#Bitcoin","#BTC","#ETH","#Crypto","#HODL"].slice(0, 3 + Math.floor(Math.random() * 2)),
    lunarCrushScore: Math.round(score * 0.9 + Math.random() * 15),
    redditMood: moods[Math.max(0, Math.min(moodIdx, moods.length - 1))]!,
    twitterSentiment: Math.round(score * 0.8 + Math.random() * 20),
  };
}

// ─── Liquidation Heatmap ──────────────────────────────────────────────────────

export function getLiquidationHeatmap(): LiquidationHeatmap {
  const symbols = ["BTCUSDT","ETHUSDT","SOLUSDT"];
  const longLiqs = 5_000_000 + Math.random() * 50_000_000;
  const shortLiqs = 5_000_000 + Math.random() * 30_000_000;
  const biggestSide = longLiqs > shortLiqs ? "Long" : "Short";
  const biggestSymbol = symbols[Math.floor(Math.random() * symbols.length)]!;

  const btcPrice = cryptoPriceState["BTCUSDT"]?.price ?? 67500;
  const hotLevels = [
    { price: btcPrice * 0.97, liquidationSize: 8_000_000 + Math.random() * 20_000_000, side: "Long", symbol: "BTCUSDT" },
    { price: btcPrice * 0.94, liquidationSize: 15_000_000 + Math.random() * 30_000_000, side: "Long", symbol: "BTCUSDT" },
    { price: btcPrice * 1.03, liquidationSize: 5_000_000 + Math.random() * 15_000_000, side: "Short", symbol: "BTCUSDT" },
    { price: btcPrice * 1.06, liquidationSize: 10_000_000 + Math.random() * 25_000_000, side: "Short", symbol: "BTCUSDT" },
  ];

  return {
    longLiquidations24h: Math.round(longLiqs),
    shortLiquidations24h: Math.round(shortLiqs),
    biggestLiquidation: { side: biggestSide, size: Math.round(Math.max(longLiqs, shortLiqs)), symbol: biggestSymbol },
    hotLevels,
  };
}

// ─── AI Decision Engine Crypto ────────────────────────────────────────────────

export function makeCryptoAiDecision(
  symbol: string,
  fearGreed: FearGreedData | null,
  whale: WhaleActivity,
  funding: FundingRateData | undefined,
  onChain: OnChainMetrics,
  btcDom: BtcDominance,
  config: CryptoProConfig,
  state: CryptoProState
): CryptoAiDecision {
  const info = getCryptoInfo(symbol);
  const candles = getCryptoCandles(symbol, "H1", 80);
  const closes = candles.map(c => c.close);
  const cp = closes[closes.length - 1] ?? info.basePrice;

  const reasoning: string[] = [];
  const cryptoFactors: string[] = [];
  let bullScore = 0;
  let bearScore = 0;
  let qualityScore = 50;

  // ─ 1. Fear & Greed ───────────────────────────────────────────────────────
  if (fearGreed) {
    if (fearGreed.value < 25) {
      bullScore += 18;
      reasoning.push(`✅ Fear & Greed: ${fearGreed.value} (Extreme Fear) — kesempatan beli institusi`);
      cryptoFactors.push("Extreme Fear Zone — Zona beli optimal");
    } else if (fearGreed.value > 80) {
      bearScore += 15;
      reasoning.push(`⚠️ Fear & Greed: ${fearGreed.value} (Extreme Greed) — potensi distribusi`);
      cryptoFactors.push("Extreme Greed — Waspadai distribusi");
    } else if (fearGreed.value > 55) {
      bullScore += 8;
      cryptoFactors.push(`Sentiment positif (${fearGreed.value})`);
    }
  }

  // ─ 2. BTC Dominance ───────────────────────────────────────────────────────
  if (symbol !== "BTCUSDT") {
    if (btcDom.phase === "Altcoin Season") {
      bullScore += 12;
      reasoning.push(`✅ Altcoin Season aktif (dominance ${btcDom.value}%) — kondisi ideal untuk altcoin`);
      cryptoFactors.push("Altcoin Season — Altcoin outperform BTC");
    } else if (btcDom.phase === "Bitcoin Season" && config.useBtcFilter) {
      bearScore += 10;
      reasoning.push(`⚠️ Bitcoin Season — kapital mengalir ke BTC, bukan altcoin`);
    }
  } else {
    if (btcDom.trend === "Naik") { bullScore += 10; cryptoFactors.push("Dominance BTC naik — BTC kuat"); }
  }

  // ─ 3. On-chain Health ───────────────────────────────────────────────────
  if (onChain.marketHealthScore > 65) {
    bullScore += 10;
    reasoning.push(`✅ On-chain sehat (score: ${onChain.marketHealthScore}) — akumulasi terdeteksi`);
  } else if (onChain.marketHealthScore < 35) {
    bearScore += 10;
    reasoning.push(`⚠️ On-chain lemah (score: ${onChain.marketHealthScore}) — distribusi terjadi`);
  }

  if (onChain.exchangeNetFlow < -1000) {
    bullScore += 8;
    cryptoFactors.push("Net flow keluar exchange — HODLer akumulasi");
  }

  // ─ 4. Whale Activity ────────────────────────────────────────────────────
  if (config.useWhaleFilter) {
    if (whale.dominantSide === "Buy" && whale.pressure > 65) {
      bullScore += 15;
      reasoning.push(`✅ Whale sedang akumulasi (tekanan: ${whale.pressure}%)`);
      cryptoFactors.push("Whale Buy Pressure tinggi");
    } else if (whale.dominantSide === "Sell" && whale.pressure < 35) {
      bearScore += 15;
      reasoning.push(`⚠️ Whale sedang distribusi — waspada dump`);
    }
  }

  // ─ 5. Funding Rate ──────────────────────────────────────────────────────
  if (funding && config.useFundingFilter) {
    if (funding.bias === "Long Heavy") {
      bearScore += 8;
      reasoning.push(`⚠️ Funding rate tinggi (${funding.rate}%) — terlalu banyak long, waspada long squeeze`);
    } else if (funding.bias === "Short Heavy") {
      bullScore += 8;
      reasoning.push(`✅ Funding negatif (${funding.rate}%) — banyak short, potensi short squeeze`);
    }
  }

  // ─ 6. Analisis Teknikal ──────────────────────────────────────────────────
  const ema9 = calcCryptoEMA(closes, 9);
  const ema21 = calcCryptoEMA(closes, 21);
  const ema50 = calcCryptoEMA(closes, 50);
  const rsi = calcCryptoRSI(closes);
  const atr = calcCryptoATR(candles);

  if (ema9 > ema21 && ema21 > ema50) {
    bullScore += 12;
    reasoning.push("✅ EMA alignment bullish — tren naik kuat");
  } else if (ema9 < ema21 && ema21 < ema50) {
    bearScore += 12;
    reasoning.push("✅ EMA alignment bearish — tren turun kuat");
  }

  if (rsi > 55 && rsi < 72) { bullScore += 8; }
  else if (rsi < 45 && rsi > 28) { bearScore += 8; }
  else if (rsi < 20) { bullScore += 15; reasoning.push(`✅ RSI ${rsi.toFixed(0)} sangat oversold — bottom fishing`); }
  else if (rsi > 80) { bearScore += 12; reasoning.push(`⚠️ RSI ${rsi.toFixed(0)} sangat overbought`); }

  // ─ Quality & Confidence ─────────────────────────────────────────────────
  const totalScore = bullScore + bearScore;
  const dominance = Math.abs(bullScore - bearScore);
  const confidence = Math.min(92, Math.round(35 + (dominance / Math.max(totalScore, 1)) * 65));
  const direction: "Buy" | "Sell" | null = bullScore > bearScore ? "Buy" : bearScore > bullScore ? "Sell" : null;

  qualityScore = Math.min(100, Math.round(
    qualityScore + confidence * 0.5 + (dominance > 25 ? 15 : dominance > 12 ? 8 : 0)
  ));

  if (confidence < config.minConfidence || qualityScore < config.minQualityScore || !direction) {
    return {
      shouldTrade: false, direction: null, confidence, qualityScore,
      strategy: "No Trade", entryPrice: cp, stopLoss: cp, takeProfit: cp, tp2: cp,
      riskReward: 0, lotSize: 0,
      reasoning: [`❌ Setup tidak memenuhi syarat — confidence ${confidence}%, quality ${qualityScore}`],
      waitReason: direction === null ? "Sinyal konflik" : `Confidence ${confidence}% atau quality ${qualityScore} di bawah minimum`,
      cryptoSpecificFactors: cryptoFactors,
      marketRegime: detectMarketRegime(fearGreed, onChain, whale),
    } as any;
  }

  // ─ Entry / SL / TP ───────────────────────────────────────────────────────
  const spread = cp * 0.0002;
  const entryPrice = direction === "Buy" ? cp + spread : cp - spread;
  const slDistance = atr * 1.8;
  const stopLoss = direction === "Buy" ? entryPrice - slDistance : entryPrice + slDistance;
  const takeProfit = direction === "Buy" ? entryPrice + slDistance * 2.5 : entryPrice - slDistance * 2.5;
  const tp2 = direction === "Buy" ? entryPrice + slDistance * 4 : entryPrice - slDistance * 4;
  const riskReward = 2.5;

  const riskUSDT = state.balance * (config.riskPerTradePct / 100);
  const margin = Math.min(riskUSDT * config.leverage, state.balance * 0.5);

  const strategy = selectCryptoStrategy(fearGreed, whale, btcDom, rsi, ema9, ema21);
  reasoning.push(`🎯 Strategi: ${strategy}`);
  reasoning.push(`📊 Confidence: ${confidence}% | Quality: ${qualityScore}/100`);

  return {
    shouldTrade: true, direction, confidence, qualityScore, strategy,
    entryPrice, stopLoss, takeProfit, tp2, riskReward,
    lotSize: parseFloat((margin / entryPrice).toFixed(4)),
    reasoning, waitReason: null,
    cryptoSpecificFactors: cryptoFactors,
    marketRegime: detectMarketRegime(fearGreed, onChain, whale),
  } as any;
}

function detectMarketRegime(fg: FearGreedData | null, oc: OnChainMetrics, whale: WhaleActivity): CryptoAiDecision["marketRegime"] {
  if (!fg) return "Ranging";
  if (fg.value > 85 && oc.exchangeNetFlow > 500) return "Euphoria";
  if (fg.value < 15 && oc.exchangeNetFlow < -500) return "Capitulation";
  if (fg.value > 60 && whale.dominantSide === "Buy") return "Trending Bull";
  if (fg.value < 40 && whale.dominantSide === "Sell") return "Trending Bear";
  if (oc.exchangeNetFlow < 0 && fg.value < 50) return "Accumulation";
  if (oc.exchangeNetFlow > 0 && fg.value > 70) return "Distribution";
  return "Ranging";
}

function selectCryptoStrategy(fg: FearGreedData | null, whale: WhaleActivity, btcDom: BtcDominance, rsi: number, ema9: number, ema21: number): string {
  if (fg && fg.value < 20) return "Extreme Fear Buy (Contrarian)";
  if (fg && fg.value > 82) return "Extreme Greed Short (Contrarian)";
  if (whale.dominantSide !== "Netral") return "Whale Follow Strategy";
  if (btcDom.phase === "Altcoin Season" && btcDom.altseasonIndex > 60) return "Altseason Momentum";
  if (rsi < 30) return "Oversold Bounce";
  if (rsi > 70) return "Overbought Reversal";
  if (ema9 > ema21) return "Trend Following (EMA)";
  return "Confluence Setup";
}

function calcCryptoEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) ema = prices[i]! * k + ema * (1 - k);
  return ema;
}

function calcCryptoRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i]! - closes[i-1]!;
    if (d > 0) g += d; else l -= d;
  }
  const rs = (g / period) / Math.max(l / period, 0.0001);
  return 100 - 100 / (1 + rs);
}

function calcCryptoATR(candles: CryptoCandle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs = candles.slice(-period-1).map((c, i, arr) => {
    if (i === 0) return c.high - c.low;
    const p = arr[i-1]!;
    return Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  });
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

// ─── State Management ─────────────────────────────────────────────────────────

function defaultCryptoState(): CryptoProState {
  return {
    balance: CRYPTO_INITIAL_BALANCE,
    equity: CRYPTO_INITIAL_BALANCE,
    positions: [],
    tradeLog: [],
    equityHistory: [{ time: Date.now(), value: CRYPTO_INITIAL_BALANCE }],
    strategyStats: {},
    dailyStats: { date: new Date().toDateString(), pnl: 0, trades: 0, wins: 0 },
    fearGreedCache: null,
    fearGreedUpdatedAt: 0,
  };
}

function defaultCryptoConfig(): CryptoProConfig {
  return {
    autoEnabled: false,
    maxPositions: 3,
    riskPerTradePct: 2,
    minConfidence: 68,
    minQualityScore: 60,
    minRR: 2,
    maxDailyLossUSDT: 50,
    trailingEnabled: true,
    breakevenEnabled: true,
    leverage: 5,
    useBtcFilter: true,
    useWhaleFilter: true,
    useFundingFilter: true,
    intervalMs: 30000,
  };
}

let cryptoState: CryptoProState = defaultCryptoState();
let cryptoConfig: CryptoProConfig = defaultCryptoConfig();

export function loadCryptoProState(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(STATE_FILE)) {
      cryptoState = { ...defaultCryptoState(), ...JSON.parse(readFileSync(STATE_FILE, "utf-8")) };
      logger.info({ balance: cryptoState.balance, positions: cryptoState.positions.length }, "Crypto Pro state loaded");
    }
    if (existsSync(CONFIG_FILE)) {
      cryptoConfig = { ...defaultCryptoConfig(), ...JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) };
    }
  } catch (e) {
    logger.warn("Gagal load crypto pro state", { error: String(e) });
    cryptoState = defaultCryptoState();
  }
}

function saveCryptoState(): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(cryptoState, null, 2));
  } catch { /* ignore */ }
}

export function getCryptoProState() { return { ...cryptoState }; }
export function getCryptoProConfig() { return { ...cryptoConfig }; }

export function updateCryptoProConfig(updates: Partial<CryptoProConfig>): CryptoProConfig {
  cryptoConfig = { ...cryptoConfig, ...updates };
  try { writeFileSync(CONFIG_FILE, JSON.stringify(cryptoConfig, null, 2)); } catch { /* ignore */ }
  return cryptoConfig;
}

export function openCryptoProPosition(
  symbol: string,
  direction: "Buy" | "Sell",
  manual = false,
  customSize?: number,
): { ok: boolean; position?: CryptoProPosition; error?: string } {
  const info = getCryptoInfo(symbol);
  const fg = cryptoState.fearGreedCache;
  const whale = getWhaleActivity();
  const funding = getFundingRates().find(f => f.symbol === symbol);
  const onChain = getOnChainMetrics();
  const btcDom = getBtcDominance();
  const decision = makeCryptoAiDecision(symbol, fg, whale, funding, onChain, btcDom, cryptoConfig, cryptoState);

  if (!manual && !decision.shouldTrade) {
    return { ok: false, error: decision.waitReason ?? "AI tidak merekomendasikan trade" };
  }

  const riskUSDT = customSize ?? (cryptoState.balance * cryptoConfig.riskPerTradePct / 100 * cryptoConfig.leverage);
  const margin = riskUSDT / cryptoConfig.leverage;

  if (cryptoState.positions.length >= cryptoConfig.maxPositions) {
    return { ok: false, error: `Maksimal ${cryptoConfig.maxPositions} posisi` };
  }

  const cp = updateCryptoPrice(symbol);
  const spread = cp * 0.0002;
  const entryPrice = direction === "Buy" ? cp + spread : cp - spread;
  const atr = calcCryptoATR(getCryptoCandles(symbol, "H1", 30));
  const stopLoss = direction === "Buy" ? entryPrice - atr * 1.8 : entryPrice + atr * 1.8;
  const takeProfit = direction === "Buy" ? entryPrice + atr * 4.5 : entryPrice - atr * 4.5;
  const tp2 = direction === "Buy" ? entryPrice + atr * 7 : entryPrice - atr * 7;

  const pos: CryptoProPosition = {
    id: `cp_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    symbol, name: info.name, emoji: info.emoji,
    side: direction, size: riskUSDT, entryPrice, currentPrice: entryPrice,
    stopLoss, takeProfit, tp2,
    leverage: cryptoConfig.leverage, margin,
    unrealisedPnl: 0, unrealisedPct: 0,
    openedAt: Date.now(),
    strategy: decision.strategy, confidence: decision.confidence,
    reasoning: decision.reasoning, trailActivated: false,
    trailPeak: entryPrice, breakeven: false, riskReward: 2.5,
    cryptoFactors: decision.cryptoSpecificFactors,
  };

  cryptoState.positions.push(pos);
  cryptoState.balance -= margin;
  saveCryptoState();
  return { ok: true, position: pos };
}

export function closeCryptoProPosition(id: string, reason: CryptoProTrade["closeReason"] = "Manual"): { ok: boolean; trade?: CryptoProTrade } {
  const idx = cryptoState.positions.findIndex(p => p.id === id);
  if (idx < 0) return { ok: false };
  const pos = cryptoState.positions[idx]!;
  const cp = updateCryptoPrice(pos.symbol);
  const pnlPct = pos.side === "Buy" ? (cp - pos.entryPrice) / pos.entryPrice * 100 * pos.leverage : (pos.entryPrice - cp) / pos.entryPrice * 100 * pos.leverage;
  const pnl = pos.margin * pnlPct / 100;

  const trade: CryptoProTrade = {
    id: pos.id, symbol: pos.symbol, name: pos.name, emoji: pos.emoji,
    side: pos.side, size: pos.size, entryPrice: pos.entryPrice, closePrice: cp,
    pnl: parseFloat(pnl.toFixed(2)), pnlPct: parseFloat(pnlPct.toFixed(2)),
    openedAt: pos.openedAt, closedAt: Date.now(),
    durationMin: Math.round((Date.now() - pos.openedAt) / 60000),
    strategy: pos.strategy, confidence: pos.confidence,
    closeReason: reason, reasoning: pos.reasoning, cryptoFactors: pos.cryptoFactors,
  };

  cryptoState.balance += pos.margin + pnl;
  cryptoState.positions.splice(idx, 1);
  cryptoState.tradeLog.unshift(trade);
  if (cryptoState.tradeLog.length > 200) cryptoState.tradeLog.pop();
  cryptoState.equity = cryptoState.balance + cryptoState.positions.reduce((s,p) => s + p.unrealisedPnl, 0);
  cryptoState.equityHistory.push({ time: Date.now(), value: cryptoState.equity });
  const ss = cryptoState.strategyStats[pos.strategy] ?? { wins: 0, losses: 0, totalPnl: 0 };
  if (pnl > 0) ss.wins++; else ss.losses++;
  ss.totalPnl += pnl;
  cryptoState.strategyStats[pos.strategy] = ss;
  const today = new Date().toDateString();
  if (cryptoState.dailyStats.date !== today) cryptoState.dailyStats = { date: today, pnl: 0, trades: 0, wins: 0 };
  cryptoState.dailyStats.pnl += pnl;
  cryptoState.dailyStats.trades++;
  if (pnl > 0) cryptoState.dailyStats.wins++;

  saveCryptoState();
  return { ok: true, trade };
}

export function updateCryptoOpenPositions(): void {
  for (const pos of cryptoState.positions) {
    const info = getCryptoInfo(pos.symbol);
    const cp = updateCryptoPrice(pos.symbol);
    pos.currentPrice = cp;
    const pnlPct = pos.side === "Buy"
      ? (cp - pos.entryPrice) / pos.entryPrice * 100 * pos.leverage
      : (pos.entryPrice - cp) / pos.entryPrice * 100 * pos.leverage;
    pos.unrealisedPct = parseFloat(pnlPct.toFixed(2));
    pos.unrealisedPnl = parseFloat((pos.margin * pnlPct / 100).toFixed(2));

    // Trailing
    if (cryptoConfig.trailingEnabled && pnlPct > 0) {
      if (pos.side === "Buy" && cp > pos.trailPeak) {
        pos.trailPeak = cp;
        pos.trailActivated = true;
        pos.stopLoss = Math.max(pos.stopLoss, cp - info.volatility * 20);
      } else if (pos.side === "Sell" && cp < pos.trailPeak) {
        pos.trailPeak = cp;
        pos.trailActivated = true;
        pos.stopLoss = Math.min(pos.stopLoss, cp + info.volatility * 20);
      }
    }

    // SL/TP check
    if ((pos.side === "Buy" && cp <= pos.stopLoss) || (pos.side === "Sell" && cp >= pos.stopLoss)) {
      closeCryptoProPosition(pos.id, "SL");
    } else if ((pos.side === "Buy" && cp >= pos.takeProfit) || (pos.side === "Sell" && cp <= pos.takeProfit)) {
      closeCryptoProPosition(pos.id, "TP");
    }
  }
  cryptoState.equity = cryptoState.balance + cryptoState.positions.reduce((s,p) => s + p.unrealisedPnl, 0);
}

export function getCryptoProStats() {
  const closed = cryptoState.tradeLog;
  const wins = closed.filter(t => t.pnl > 0).length;
  const losses = closed.filter(t => t.pnl <= 0).length;
  const totalPnl = closed.reduce((s,t) => s + t.pnl, 0);
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
  return {
    totalTrades: closed.length, wins, losses,
    winRate: parseFloat(winRate.toFixed(1)),
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    currentBalance: parseFloat(cryptoState.balance.toFixed(2)),
    currentEquity: parseFloat(cryptoState.equity.toFixed(2)),
    dailyPnl: parseFloat(cryptoState.dailyStats.pnl.toFixed(2)),
    equityHistory: cryptoState.equityHistory.slice(-100),
    strategyStats: cryptoState.strategyStats,
  };
}

export function resetCryptoPro(): void {
  cryptoState = defaultCryptoState();
  saveCryptoState();
}
