import OpenAI from "openai";
import { cache } from "./cache.js";
import { logger } from "../lib/logger.js";

export const client = new OpenAI({
  apiKey: process.env.KISSAPI_API_KEY ?? "",
  baseURL: "https://api.kissapi.ai/v1",
});

export const MODEL = "claude-opus-4-7";

// ─── Shared system prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Kamu adalah KristalAI, mesin analisis keuangan AI yang ahli dalam pasar crypto dan saham Indonesia (IDX).
Tugasmu adalah menganalisis data pasar secara akurat dan mengembalikan keputusan trading dalam format JSON yang tepat.
Kamu memahami: RSI, MACD, Bollinger Bands, EMA, support/resistance, Smart Money Concepts (BOS, CHOCH, FVG, Order Blocks), dan manajemen risiko.
Selalu gunakan Bahasa Indonesia dalam reasoning, tapi format JSON harus valid dan akurat.`;

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

  const prompt = `Berikan analisis singkat dan actionable untuk ${data.name} (${data.symbol.toUpperCase()}) berdasarkan data:\n\n${buildContextString(data)}\n\nBerikan:\n1. Ringkasan kondisi\n2. Level kunci\n3. Skenario bullish & bearish\n4. Saran risk management\n\nMaksimal 300 kata.`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_tokens: 600,
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

  const prompt = `Berikan ringkasan kondisi pasar crypto global saat ini:
- Fear & Greed Index: ${overviewData.fearGreedIndex} (${overviewData.fearGreedLabel})
- BTC Dominance: ${overviewData.btcDominance.toFixed(1)}%
- Total Market Cap: $${(overviewData.totalMarketCap / 1e9).toFixed(0)}B
- Perubahan 24h: ${overviewData.marketCapChange24h?.toFixed(2) ?? "N/A"}%
${overviewData.topMovers ? `- Top Movers: ${overviewData.topMovers.slice(0, 5).map(m => `${m.symbol} ${m.change > 0 ? "+" : ""}${m.change.toFixed(1)}%`).join(", ")}` : ""}

Berikan analisis 2-3 paragraf singkat untuk trader Indonesia.`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_tokens: 400,
    temperature: 0.6,
  });

  const result = response.choices[0]?.message?.content ?? "Ringkasan tidak tersedia.";
  cache.set(cacheKey, result, 10 * 60 * 1000);
  return result;
}

// ─── AI Brain: Batch Predictions ──────────────────────────────────────────────

export interface AIAssetInput {
  assetId: string;
  assetName: string;
  assetType: "crypto" | "stock";
  symbol: string;
  currentPrice: number;
  change24h: number;
  change7d: number | null;
  rsi: number;
  macdBullish: boolean;
  macdHistogram: number;
  bbPosition: number;
  emaScore: number;
  volumeRatio: number;
  trend: string;
  bosActive: boolean;
  bosDirection: string;
  fvgExists: boolean;
  fvgDirection: string;
  support: number;
  resistance: number;
  sentimentScore: number;
  positiveNews: number;
  negativeNews: number;
  newsCount: number;
}

export interface AIPredictionOutput {
  assetId: string;
  signal: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
  confidence: number;
  sentimentScore: number;
  reasons: string[];
  stopLoss: number;
  takeProfit: number;
}

export async function aiBatchPredictions(assets: AIAssetInput[]): Promise<AIPredictionOutput[]> {
  const cacheKey = `ai-batch-pred-${assets.map(a => a.assetId).join("-").slice(0, 80)}-${Math.floor(Date.now() / (15 * 60 * 1000))}`;
  const cached = cache.get<AIPredictionOutput[]>(cacheKey);
  if (cached) return cached;

  const assetSummaries = assets.map(a => {
    const rr = a.resistance > a.support && a.support > 0
      ? `SL=${a.support.toFixed(2)},TP=${a.resistance.toFixed(2)}`
      : "SL/TP=auto";
    return `{id:"${a.assetId}",name:"${a.assetName}",type:"${a.assetType}",sym:"${a.symbol}",price:${a.currentPrice},chg24h:${a.change24h.toFixed(2)}%,chg7d:${a.change7d?.toFixed(2) ?? "N/A"}%,RSI:${a.rsi.toFixed(1)},MACD:${a.macdBullish ? "bullish" : "bearish"}(hist:${a.macdHistogram.toFixed(3)}),BB:${(a.bbPosition * 100).toFixed(0)}%,EMA:${a.emaScore.toFixed(2)},vol:${a.volumeRatio.toFixed(2)}x,trend:${a.trend},BOS:${a.bosActive ? a.bosDirection : "none"},FVG:${a.fvgExists ? a.fvgDirection : "none"},sentiment:${a.sentimentScore.toFixed(2)},news:+${a.positiveNews}/-${a.negativeNews},${rr}}`;
  }).join("\n");

  const prompt = `Kamu adalah AI trading engine. Analisis setiap aset berikut dan kembalikan sinyal trading dalam JSON.

DATA ASET (${assets.length} aset):
${assetSummaries}

Kembalikan JSON array PERSIS format ini, tanpa teks lain:
[
  {
    "assetId": "id_aset",
    "signal": "strong_buy|buy|neutral|sell|strong_sell",
    "confidence": 30-95,
    "sentimentScore": -1.0_sampai_1.0,
    "reasons": ["alasan1_bahasa_indonesia","alasan2","alasan3"],
    "stopLoss": harga_float,
    "takeProfit": harga_float
  }
]

Panduan signal:
- strong_buy: RSI<45 + MACD bullish + trend bullish + sentiment positif + BOS/FVG bullish
- buy: 2-3 faktor bullish
- neutral: mixed atau sideways
- sell: 2-3 faktor bearish
- strong_sell: RSI>65 + MACD bearish + trend bearish + sentiment negatif

Confidence 30-95 (bukan 100).
SL/TP harus angka harga yang masuk akal (bukan 0).
Reasons max 4 poin, pakai bahasa Indonesia, spesifik dengan angka.`;

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Kamu adalah trading AI engine yang mengembalikan JSON valid tanpa teks tambahan." },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content ?? "[]";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in response");

    const parsed = JSON.parse(jsonMatch[0]) as AIPredictionOutput[];
    const valid = parsed.filter(p =>
      p.assetId && p.signal && typeof p.confidence === "number" && Array.isArray(p.reasons)
    );

    logger.info({ count: valid.length, total: assets.length }, "AI batch predictions complete");
    cache.set(cacheKey, valid, 15 * 60 * 1000);
    return valid;
  } catch (err) {
    logger.error({ err }, "AI batch predictions failed");
    return [];
  }
}

// ─── AI Brain: Scalping Signal ────────────────────────────────────────────────

export interface AIScalpInput {
  symbol: string;
  displayName: string;
  price: number;
  ema9: number;
  ema21: number;
  rsi14: number;
  volumeRatio: number;
  trend15m: "bullish" | "bearish" | "sideways";
  crossoverType: "golden" | "death" | "none";
  crossoverBarsAgo: number;
  nearestSupport: number;
  nearestResistance: number;
  sessionName: string;
  sessionQuality: string;
  wibTime: string;
  recentCandles: Array<{ o: number; h: number; l: number; c: number; v: number }>;
}

export interface AIScalpOutput {
  side: "Buy" | "Sell" | null;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  reasons: string[];
  warnings: string[];
  isHighRisk: boolean;
  riskReason: string | null;
  entryQuality: "at_zone" | "near_zone" | "wait_pullback" | "chase";
}

export async function aiScalpDecision(input: AIScalpInput): Promise<AIScalpOutput | null> {
  const cacheKey = `ai-scalp-${input.symbol}-${Math.floor(Date.now() / (2 * 60 * 1000))}`;
  const cached = cache.get<AIScalpOutput>(cacheKey);
  if (cached) return cached;

  const recentStr = input.recentCandles.slice(-10).map(c =>
    `O:${c.o.toFixed(2)} H:${c.h.toFixed(2)} L:${c.l.toFixed(2)} C:${c.c.toFixed(2)} V:${c.v.toFixed(0)}`
  ).join(" | ");

  const prompt = `Analisis scalping 5M untuk ${input.displayName}:

DATA TEKNIKAL:
- Harga saat ini: ${input.price}
- EMA9: ${input.ema9.toFixed(4)} | EMA21: ${input.ema21.toFixed(4)} | ${input.ema9 > input.ema21 ? "EMA9 DIATAS EMA21 (bullish)" : "EMA9 DIBAWAH EMA21 (bearish)"}
- RSI(14): ${input.rsi14.toFixed(1)}
- Volume Ratio: ${input.volumeRatio.toFixed(2)}x rata-rata
- Trend 15M: ${input.trend15m.toUpperCase()}
- EMA Crossover: ${input.crossoverType === "none" ? "Tidak ada crossover" : `${input.crossoverType} (${input.crossoverBarsAgo} candle lalu)`}
- Support terdekat: ${input.nearestSupport.toFixed(4)}
- Resistance terdekat: ${input.nearestResistance.toFixed(4)}
- Sesi trading: ${input.sessionName} (${input.sessionQuality}) jam ${input.wibTime}

10 CANDLE TERAKHIR (5M):
${recentStr}

Kembalikan JSON PERSIS format ini tanpa teks lain:
{
  "side": "Buy"|"Sell"|null,
  "confidence": 30-90,
  "entryPrice": float,
  "stopLoss": float,
  "takeProfit": float,
  "riskReward": float,
  "reasons": ["reason1_bahasa_indonesia","reason2","reason3"],
  "warnings": ["warning1_jika_ada"],
  "isHighRisk": true|false,
  "riskReason": "alasan_risiko"|null,
  "entryQuality": "at_zone"|"near_zone"|"wait_pullback"|"chase"
}

Aturan:
- null jika kondisi tidak jelas/sideways
- SL Buy = dibawah support/EMA21, TP = 1.5x jarak SL
- SL Sell = diatas resistance/EMA21, TP = 1.5x jarak SL
- isHighRisk=true jika: RSI ekstrem (>72 Buy atau <28 Sell), volume<0.8x, sesi "avoid", atau resistance/support terlalu dekat
- entryQuality: at_zone jika <0.3% dari EMA/support, near_zone <1%, wait_pullback <2.5%, chase >2.5%`;

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Kamu adalah scalping AI engine. Kembalikan JSON valid tanpa teks tambahan." },
        { role: "user", content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]) as AIScalpOutput;
    if (typeof parsed.confidence !== "number") throw new Error("Invalid output");

    logger.info({ symbol: input.symbol, side: parsed.side, confidence: parsed.confidence }, "AI scalp decision complete");
    cache.set(cacheKey, parsed, 2 * 60 * 1000);
    return parsed;
  } catch (err) {
    logger.error({ err, symbol: input.symbol }, "AI scalp decision failed");
    return null;
  }
}

// ─── AI Brain: Auto-Trading Filter ───────────────────────────────────────────

export interface AITradingCandidate {
  symbol: string;
  price: number;
  change24h: number;
  volume24hUsdt: number;
  side: "Buy" | "Sell";
  ruleScore: number;
}

export interface AITradingDecision {
  symbol: string;
  side: "Buy" | "Sell";
  confidence: number;
  reason: string;
  approved: boolean;
  riskLevel: "low" | "medium" | "high";
}

export async function aiTradingFilter(
  candidates: AITradingCandidate[],
  currentPositions: string[],
  maxPositions: number
): Promise<AITradingDecision[]> {
  if (candidates.length === 0) return [];

  const cacheKey = `ai-trading-filter-${candidates.map(c => c.symbol).join("-").slice(0, 60)}-${Math.floor(Date.now() / 60_000)}`;
  const cached = cache.get<AITradingDecision[]>(cacheKey);
  if (cached) return cached;

  const candidateStr = candidates.slice(0, 15).map(c =>
    `${c.symbol}: ${c.side}, harga $${c.price.toFixed(4)}, chg24h=${c.change24h.toFixed(1)}%, vol=$${(c.volume24hUsdt / 1e6).toFixed(1)}M, skor=${c.ruleScore.toFixed(1)}`
  ).join("\n");

  const prompt = `Kamu adalah AI auto-trading engine. Evaluasi kandidat trading berikut dan pilih yang paling layak untuk dieksekusi.

POSISI AKTIF SAAT INI: ${currentPositions.length > 0 ? currentPositions.join(", ") : "tidak ada"}
SLOT TERSEDIA: ${Math.max(0, maxPositions - currentPositions.length)} dari ${maxPositions}

KANDIDAT TRADING:
${candidateStr}

Kembalikan JSON array untuk SEMUA kandidat (approved=true jika layak trade, false jika ditolak):
[
  {
    "symbol": "BTCUSDT",
    "side": "Buy"|"Sell",
    "confidence": 40-90,
    "reason": "alasan_singkat_bahasa_indonesia",
    "approved": true|false,
    "riskLevel": "low"|"medium"|"high"
  }
]

Kriteria approval:
- Approved jika: volume tinggi >$10M, momentum kuat, belum di posisi aktif, perubahan signifikan >2%
- Tolak jika: perubahan <1%, volume rendah, sudah ada di posisi aktif, atau sinyal lemah
- Pilih max ${Math.max(0, maxPositions - currentPositions.length)} kandidat terbaik untuk approved=true
- Prioritaskan: volume tinggi + momentum kuat + confidence tinggi`;

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Kamu adalah auto-trading AI. Kembalikan JSON array valid tanpa teks tambahan." },
        { role: "user", content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content ?? "[]";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array");

    const parsed = JSON.parse(jsonMatch[0]) as AITradingDecision[];
    logger.info({ total: candidates.length, approved: parsed.filter(p => p.approved).length }, "AI trading filter complete");

    cache.set(cacheKey, parsed, 60_000);
    return parsed;
  } catch (err) {
    logger.error({ err }, "AI trading filter failed");
    return [];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildContextString(data: AnalysisRequest): string {
  const lines = [
    `Aset: ${data.name} (${data.symbol.toUpperCase()}) — ${data.assetType === "crypto" ? "Cryptocurrency" : "Saham IDX"}`,
    `Harga: ${data.assetType === "crypto" ? `$${data.currentPrice.toLocaleString("en-US", { maximumFractionDigits: 6 })}` : `Rp ${data.currentPrice.toLocaleString("id-ID")}`}`,
    `Perubahan 24h: ${data.priceChange24h >= 0 ? "+" : ""}${data.priceChange24h.toFixed(2)}%`,
  ];
  if (data.priceChange7d != null) lines.push(`Perubahan 7d: ${data.priceChange7d >= 0 ? "+" : ""}${data.priceChange7d.toFixed(2)}%`);
  if (data.high24h != null) lines.push(`High 24h: ${data.high24h.toLocaleString()}`);
  if (data.low24h != null) lines.push(`Low 24h: ${data.low24h.toLocaleString()}`);
  if (data.signal) lines.push(`Sinyal: ${data.signal.replace("_", " ").toUpperCase()}`);
  if (data.confidence != null) lines.push(`Confidence: ${(data.confidence * 100).toFixed(0)}%`);
  if (data.rsi != null) lines.push(`RSI: ${data.rsi.toFixed(1)}`);
  if (data.macd) lines.push(`MACD: ${data.macd.bullish ? "Bullish" : "Bearish"} (hist: ${data.macd.histogram.toFixed(4)})`);
  if (data.marketCap != null) lines.push(`Market Cap: $${(data.marketCap / 1e9).toFixed(2)}B`);
  return lines.join("\n");
}
