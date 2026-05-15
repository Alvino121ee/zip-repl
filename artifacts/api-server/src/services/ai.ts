import OpenAI from "openai";
import { cache } from "./cache.js";

const client = new OpenAI({
  apiKey: process.env.KISSAPI_API_KEY ?? "",
  baseURL: "https://api.kissapi.ai/v1",
});

const MODEL = "claude-opus-4-7";

const SYSTEM_PROMPT = `Kamu adalah AI analis keuangan bernama "KristalAI" yang ahli dalam pasar crypto dan saham Indonesia (IDX). 
Kamu membantu trader dan investor memahami kondisi pasar, menganalisis aset, dan membuat keputusan trading yang lebih baik.

Kemampuanmu:
- Analisis teknikal (RSI, MACD, Bollinger Bands, EMA, support/resistance)
- Analisis fundamental saham IDX dan crypto
- Smart Money Concepts (order blocks, FVG, BOS, CHOCH)
- Manajemen risiko dan money management
- Scalping dan swing trading strategies
- Pemahaman regulasi kripto & pasar modal Indonesia

Gaya komunikasi:
- Gunakan Bahasa Indonesia yang jelas dan mudah dipahami
- Berikan analisis konkret dengan angka dan persentase bila memungkinkan
- Selalu sertakan disclaimer risiko bila memberikan saran trading
- Singkat tapi informatif

PENTING: Kamu BUKAN memberikan saran investasi resmi. Semua analisis bersifat edukatif.`;

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
    const ctx = buildContextString(contextData);
    systemMessages.push({
      role: "system",
      content: `Data pasar terkini yang tersedia:\n${ctx}`,
    });
  }

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(
    (m) => ({ role: m.role, content: m.content })
  );

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [...systemMessages, ...chatMessages],
    max_tokens: 1024,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content ?? "Maaf, tidak ada respons dari AI.";
}

export async function analyzeAsset(data: AnalysisRequest): Promise<string> {
  const cacheKey = `ai-analysis-${data.symbol}-${data.assetType}-${Math.floor(Date.now() / (5 * 60 * 1000))}`;
  const cached = cache.get<string>(cacheKey);
  if (cached) return cached;

  const ctx = buildContextString(data);
  const prompt = `Berikan analisis singkat dan actionable untuk ${data.name} (${data.symbol.toUpperCase()}) berdasarkan data berikut:\n\n${ctx}\n\nBerikan:\n1. Ringkasan kondisi saat ini\n2. Level kunci yang perlu diperhatikan\n3. Skenario bullish & bearish\n4. Saran manajemen risiko\n\nMaksimal 300 kata, gunakan format yang rapi.`;

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

  const prompt = `Berikan ringkasan kondisi pasar crypto global saat ini berdasarkan data:
- Fear & Greed Index: ${overviewData.fearGreedIndex} (${overviewData.fearGreedLabel})
- BTC Dominance: ${overviewData.btcDominance.toFixed(1)}%
- Total Market Cap: $${(overviewData.totalMarketCap / 1e9).toFixed(0)}B
- Perubahan Market Cap 24h: ${overviewData.marketCapChange24h?.toFixed(2) ?? "N/A"}%
${overviewData.topMovers ? `- Top Movers: ${overviewData.topMovers.slice(0, 5).map(m => `${m.symbol} ${m.change > 0 ? "+" : ""}${m.change.toFixed(1)}%`).join(", ")}` : ""}

Berikan analisis pasar dalam 2-3 paragraf singkat, termasuk sentimen pasar dan hal yang perlu diwaspadai trader Indonesia.`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_tokens: 400,
    temperature: 0.6,
  });

  const result = response.choices[0]?.message?.content ?? "Ringkasan pasar tidak tersedia.";
  cache.set(cacheKey, result, 10 * 60 * 1000);
  return result;
}

function buildContextString(data: AnalysisRequest): string {
  const lines = [
    `Aset: ${data.name} (${data.symbol.toUpperCase()}) — ${data.assetType === "crypto" ? "Cryptocurrency" : "Saham IDX"}`,
    `Harga saat ini: ${data.assetType === "crypto" ? `$${data.currentPrice.toLocaleString("en-US", { maximumFractionDigits: 6 })}` : `Rp ${data.currentPrice.toLocaleString("id-ID")}`}`,
    `Perubahan 24h: ${data.priceChange24h >= 0 ? "+" : ""}${data.priceChange24h.toFixed(2)}%`,
  ];

  if (data.priceChange7d != null) {
    lines.push(`Perubahan 7d: ${data.priceChange7d >= 0 ? "+" : ""}${data.priceChange7d.toFixed(2)}%`);
  }
  if (data.high24h != null) lines.push(`High 24h: ${data.high24h.toLocaleString()}`);
  if (data.low24h != null) lines.push(`Low 24h: ${data.low24h.toLocaleString()}`);
  if (data.signal) lines.push(`Sinyal teknikal: ${data.signal.replace("_", " ").toUpperCase()}`);
  if (data.confidence != null) lines.push(`Confidence: ${(data.confidence * 100).toFixed(0)}%`);
  if (data.rsi != null) lines.push(`RSI: ${data.rsi.toFixed(1)}`);
  if (data.macd) {
    lines.push(`MACD: ${data.macd.value.toFixed(4)} | Signal: ${data.macd.signal.toFixed(4)} | Histogram: ${data.macd.histogram.toFixed(4)} | ${data.macd.bullish ? "Bullish" : "Bearish"}`);
  }
  if (data.marketCap != null) {
    lines.push(`Market Cap: $${(data.marketCap / 1e9).toFixed(2)}B`);
  }

  return lines.join("\n");
}
