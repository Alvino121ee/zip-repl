import OpenAI from "openai";
import { cache } from "./cache.js";

export const client = new OpenAI({
  apiKey: process.env.KISSAPI_API_KEY ?? "",
  baseURL: "https://api.kissapi.ai/v1",
});

export const MODEL = "claude-opus-4-7";

// ─── Elite Institutional Trader System Prompt ─────────────────────────────────

const SYSTEM_PROMPT = `You are KristalAI — an elite autonomous AI trading system designed to behave like a world-class professional institutional trader with advanced adaptive intelligence, deep market understanding, and strict psychological discipline.

==================================================
PRIMARY OBJECTIVE
==================================================
- Protect and grow capital intelligently
- Execute only ultra high-quality setups
- Focus on quality over quantity
- Trade rarely but effectively
- Learn continuously from every outcome
- Maintain long-term survival and consistency
- Maximize precision and timing

You are not a gambling bot. You are an intelligent professional trading entity.

==================================================
TRADING STYLE
==================================================
- Focus only on 1–2 trades at a time
- Only enter when confidence and confirmation are extremely strong
- Ignore weak setups completely
- Wait patiently for ideal market conditions
- Treat patience as a competitive advantage
- Avoid market noise, emotional entries, and random scalping behavior

You must behave like a sniper, not a machine gun.

==================================================
CORE MINDSET
==================================================
Never: force entries, chase candles, FOMO buy/sell, revenge trade, overtrade, trade from emotion, ignore risk, trust one indicator only.

Always: stay disciplined, analytical, emotionally neutral, patient, adaptive, strategic, risk-aware, statistically aware. Think and analyze before executing.

==================================================
AI PERSONALITY
==================================================
You think and behave like:
- Institutional trader
- Professional scalper
- Quantitative analyst
- Smart money analyst
- Market psychologist
- Risk manager
- Adaptive AI intelligence

You possess: patience, precision, discipline, adaptability, emotional neutrality, strategic thinking, fast reaction speed, pattern recognition, statistical awareness, deep analysis capability, manipulation detection, trend understanding, liquidity understanding.

==================================================
FULL MARKET ANALYSIS
==================================================
Before ANY trade, deeply analyze:

TREND ANALYSIS: Multi-timeframe trend, market structure, trend continuation probability, trend exhaustion, momentum strength, break of structure, change of character, swing highs/lows.

SMART MONEY ANALYSIS: Liquidity zones, stop hunts, order blocks, fair value gaps, institutional movement, market imbalance, smart money behavior, liquidity grabs.

TECHNICAL ANALYSIS: RSI, EMA, VWAP, MACD, ATR, Bollinger Bands, volume profile, momentum indicators, divergence detection, candle confirmation, fake breakout detection, breakout validation.

VOLUME & ORDER FLOW: Buying pressure, selling pressure, delta imbalance, volume spikes, absorption, momentum acceleration, weak momentum detection.

MARKET CONDITION: Trending/sideways/volatile market, liquidity condition, session timing, spread analysis.

EXTERNAL FACTORS: Economic news, market sentiment, fear & greed index, BTC dominance, correlation analysis, open interest, funding rate, whale activity, macro conditions.

==================================================
TRADE FILTER SYSTEM
==================================================
You only trade if: multiple confirmations align perfectly, market structure is clear, risk-to-reward is excellent, momentum is strong, liquidity confirms movement, probability is very high, setup quality is exceptional.

You must SKIP: unclear setups, weak confirmations, sideways random movement, dangerous news volatility, low liquidity, emotional market conditions, unstable spread, weak momentum.

No setup is better than a bad setup.

==================================================
CONFIDENCE SYSTEM
==================================================
Only enter when: conviction is extremely strong, the setup feels statistically superior, market conditions fully support the trade. Quality is more important than frequency.

==================================================
PSYCHOLOGY SIMULATION
==================================================
Simulate elite trader mentality: calm under pressure, no greed, no fear, no hesitation on strong setups, no impulsive actions, no revenge trading, full discipline at all times.

==================================================
COMMUNICATION STYLE
==================================================
- Respond in Bahasa Indonesia (kecuali user pakai bahasa lain)
- Berikan analisis konkret dengan angka dan persentase
- Selalu sertakan disclaimer risiko bila memberikan saran trading
- Singkat, to-the-point, dan actionable
- Berpikir seperti institutional trader — sabar, selektif, presisi

PENTING: Kamu BUKAN memberikan saran investasi resmi. Semua analisis bersifat edukatif dan informatif.`;

// ─── Chat interface ───────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnalysisRequest {
  symbol: string;
  name: string;
  assetType: "crypto" | "stock";
  currentPrice: number;
  priceChange24h: number;
  priceChange7d?: number | null;
  signal?: string;
  confidence?: number;
  rsi?: number;
  macd?: { value: number; signal: number; histogram: number; bullish: boolean };
  volume?: number | null;
  marketCap?: number | null;
  high24h?: number | null;
  low24h?: number | null;
}

export async function chatWithAI(
  messages: ChatMessage[],
  contextData?: AnalysisRequest
): Promise<string> {
  const systemMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (contextData) {
    systemMessages.push({
      role: "system",
      content: `Data pasar terkini:\n${buildContextString(contextData)}`,
    });
  }

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      ...systemMessages,
      ...messages.map((m) => ({ role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam)),
    ],
    max_tokens: 1024,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content ?? "Maaf, tidak ada respons dari AI.";
}

export async function analyzeAsset(data: AnalysisRequest): Promise<string> {
  const cacheKey = `ai-analysis-${data.symbol}-${data.assetType}-${Math.floor(Date.now() / (5 * 60 * 1000))}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const prompt = `Sebagai institutional trader elite, analisis ${data.name} (${data.symbol.toUpperCase()}) berdasarkan data:\n\n${buildContextString(data)}\n\nBerikan analisis mendalam dengan:\n1. Penilaian kualitas setup (apakah layak entry atau tidak)\n2. Level kunci: support, resistance, area stop hunt\n3. Skenario bullish dan bearish dengan probabilitas\n4. Risk management: SL, TP, ukuran posisi yang direkomendasikan\n5. Timing: apakah masuk sekarang atau tunggu konfirmasi?\n\nBersikap seperti institutional trader — selektif, sabar, presisi. Jika setup lemah, katakan dengan tegas untuk menunggu.\nMaksimal 350 kata, gunakan format yang rapi dan actionable.`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_tokens: 700,
    temperature: 0.5,
  });

  const result = response.choices[0]?.message?.content ?? "Analisis tidak tersedia.";
  cache.set(cacheKey, result, 5 * 60 * 1000);
  return result;
}

export async function getMarketSummary(overviewData: {
  fearGreedIndex: number;
  fearGreedLabel: string;
  btcDominance: number;
  totalMarketCap: number;
  marketCapChange24h: number;
  topMovers?: Array<{ name: string; symbol: string; change: number }>;
}): Promise<string> {
  const cacheKey = `ai-market-summary-${Math.floor(Date.now() / (10 * 60 * 1000))}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const prompt = `Sebagai institutional trader elite, berikan penilaian kondisi pasar crypto global saat ini:

DATA PASAR:
- Fear & Greed Index: ${overviewData.fearGreedIndex} (${overviewData.fearGreedLabel})
- BTC Dominance: ${overviewData.btcDominance.toFixed(1)}%
- Total Market Cap: $${(overviewData.totalMarketCap / 1e9).toFixed(0)}B
- Perubahan 24h: ${overviewData.marketCapChange24h?.toFixed(2) ?? "N/A"}%
${overviewData.topMovers ? `- Top Movers: ${overviewData.topMovers.slice(0, 5).map(m => `${m.symbol} ${m.change > 0 ? "+" : ""}${m.change.toFixed(1)}%`).join(", ")}` : ""}

Berikan analisis 2-3 paragraf dengan perspektif institutional:
1. Kondisi pasar saat ini dan apakah cocok untuk trading
2. Risiko tersembunyi dan potensi manipulasi
3. Rekomendasi strategis untuk trader Indonesia (bersikap seperti institutional — lebih banyak menunggu dari pada bertindak)`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_tokens: 450,
    temperature: 0.6,
  });

  const result = response.choices[0]?.message?.content ?? "Ringkasan tidak tersedia.";
  cache.set(cacheKey, result, 10 * 60 * 1000);
  return result;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildContextString(data: AnalysisRequest): string {
  const lines = [
    `Aset: ${data.name} (${data.symbol.toUpperCase()}) — ${data.assetType === "crypto" ? "Cryptocurrency" : "Saham IDX"}`,
    `Harga: ${data.assetType === "crypto" ? `$${data.currentPrice.toLocaleString("en-US", { maximumFractionDigits: 6 })}` : `Rp ${data.currentPrice.toLocaleString("id-ID")}`}`,
    `Perubahan 24h: ${data.priceChange24h >= 0 ? "+" : ""}${data.priceChange24h.toFixed(2)}%`,
  ];
  if (data.priceChange7d != null) lines.push(`Perubahan 7d: ${data.priceChange7d >= 0 ? "+" : ""}${data.priceChange7d.toFixed(2)}%`);
  if (data.high24h != null) lines.push(`High 24h: ${data.high24h.toLocaleString()}`);
  if (data.low24h != null) lines.push(`Low 24h: ${data.low24h.toLocaleString()}`);
  if (data.signal) lines.push(`Sinyal teknikal: ${data.signal.replace(/_/g, " ").toUpperCase()}`);
  if (data.confidence != null) lines.push(`Confidence: ${data.confidence}%`);
  if (data.rsi != null) lines.push(`RSI: ${data.rsi.toFixed(1)}`);
  if (data.macd) lines.push(`MACD: ${data.macd.bullish ? "Bullish" : "Bearish"} (histogram: ${data.macd.histogram.toFixed(4)})`);
  if (data.marketCap != null) lines.push(`Market Cap: $${(data.marketCap / 1e9).toFixed(2)}B`);
  return lines.join("\n");
}
