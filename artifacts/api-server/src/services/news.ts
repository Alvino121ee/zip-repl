import { logger } from "../lib/logger.js";
import { cache, TTL } from "./cache.js";

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  url: string;
  imageUrl: string;
  source: string;
  publishedAt: string;
  categories: string[];
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
  tags: string[];
}

const POSITIVE_WORDS = [
  "surge", "rally", "gain", "rise", "bull", "breakout", "growth", "profit",
  "adoption", "record", "milestone", "partnership", "upgrade", "launch",
  "approval", "bullish", "soar", "climb", "increase", "positive", "strong",
  "opportunity", "innovation", "success", "beat", "exceed", "jump",
  "naik", "meningkat", "pertumbuhan", "untung", "bullish", "optimis",
];

const NEGATIVE_WORDS = [
  "crash", "plunge", "drop", "fall", "bear", "loss", "decline", "sell",
  "hack", "fraud", "ban", "regulatory", "lawsuit", "fear", "panic", "dump",
  "warning", "risk", "uncertain", "volatile", "down", "weak", "collapse",
  "bearish", "concern", "threat", "violation", "investigation", "delay",
  "turun", "anjlok", "jatuh", "rugi", "bearish", "pesimis", "larangan",
];

export function analyzeSentiment(text: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  const lower = text.toLowerCase();
  let score = 0;
  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) score += 1;
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) score -= 1;
  }
  const normalized = Math.max(-1, Math.min(1, score / 5));
  const sentiment = normalized > 0.1 ? "positive" : normalized < -0.1 ? "negative" : "neutral";
  return { sentiment, score: normalized };
}

const FALLBACK_NEWS: NewsItem[] = [
  {
    id: "fn1",
    title: "Bitcoin Consolidates Above $79K as Institutional Demand Remains Strong",
    body: "Bitcoin continues to trade above the critical $79,000 support level as institutional investors maintain their buying pressure. Major asset managers report growing interest in Bitcoin ETFs following record inflows last week.",
    url: "https://coindesk.com",
    imageUrl: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=400&h=200&fit=crop",
    source: "CoinDesk",
    publishedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    categories: ["crypto", "bitcoin"],
    sentiment: "positive",
    sentimentScore: 0.6,
    tags: ["BTC", "institutional", "ETF"],
  },
  {
    id: "fn2",
    title: "Ethereum Network Activity Surges as DeFi TVL Approaches $60B",
    body: "Total Value Locked in DeFi protocols built on Ethereum has reached near $60 billion, signaling strong adoption of decentralized finance. Layer 2 solutions continue reducing gas fees, attracting more users.",
    url: "https://cointelegraph.com",
    imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=200&fit=crop",
    source: "CoinTelegraph",
    publishedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    categories: ["crypto", "ethereum", "defi"],
    sentiment: "positive",
    sentimentScore: 0.7,
    tags: ["ETH", "DeFi", "Layer2"],
  },
  {
    id: "fn3",
    title: "Solana NFT Volume Hits Monthly High Amid Growing Ecosystem",
    body: "Solana NFT trading volume reached its highest point this month as new collections gain traction. The network's high throughput and low fees continue attracting developers and users from other blockchains.",
    url: "https://decrypt.co",
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop",
    source: "Decrypt",
    publishedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    categories: ["crypto", "solana", "nft"],
    sentiment: "positive",
    sentimentScore: 0.65,
    tags: ["SOL", "NFT", "ecosystem"],
  },
  {
    id: "fn4",
    title: "Regulasi Kripto Indonesia: OJK Siapkan Kerangka Komprehensif",
    body: "Otoritas Jasa Keuangan (OJK) mengumumkan persiapan kerangka regulasi komprehensif untuk aset kripto di Indonesia. Langkah ini dinilai positif oleh pelaku industri karena memberikan kepastian hukum bagi investor.",
    url: "https://coinmarketcap.com",
    imageUrl: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=400&h=200&fit=crop",
    source: "CoinMarketCap",
    publishedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    categories: ["crypto", "regulation", "indonesia"],
    sentiment: "positive",
    sentimentScore: 0.4,
    tags: ["OJK", "regulasi", "Indonesia"],
  },
  {
    id: "fn5",
    title: "Fed Rate Decision Weighs on Risk Assets Including Crypto and Stocks",
    body: "Federal Reserve's cautious stance on interest rate cuts continues to pressure risk assets. Cryptocurrency markets and tech stocks have shown correlation as investors reassess their portfolios amid uncertain monetary policy.",
    url: "https://reuters.com",
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop",
    source: "Reuters",
    publishedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    categories: ["macro", "crypto", "stocks"],
    sentiment: "negative",
    sentimentScore: -0.4,
    tags: ["Fed", "rates", "macro"],
  },
  {
    id: "fn6",
    title: "Apple Reported to Explore Blockchain Integration for Services",
    body: "Reports suggest Apple is exploring blockchain technology integration for its services ecosystem. Analysts say this could be a significant catalyst for mainstream adoption of crypto technology.",
    url: "https://bloomberg.com",
    imageUrl: "https://images.unsplash.com/photo-1621768216002-5ac171661961?w=400&h=200&fit=crop",
    source: "Bloomberg",
    publishedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    categories: ["stocks", "crypto", "tech"],
    sentiment: "positive",
    sentimentScore: 0.55,
    tags: ["AAPL", "blockchain", "adoption"],
  },
  {
    id: "fn7",
    title: "BNB Chain Records Highest Daily Transactions as GameFi Grows",
    body: "BNB Smart Chain processed a record number of daily transactions driven by GameFi and DeFi activity. Binance continues to expand its ecosystem with new projects launching on the chain.",
    url: "https://binance.com",
    imageUrl: "https://images.unsplash.com/photo-1543699565-003b8adda5fc?w=400&h=200&fit=crop",
    source: "Binance Blog",
    publishedAt: new Date(Date.now() - 7 * 3600000).toISOString(),
    categories: ["crypto", "bnb", "gamefi"],
    sentiment: "positive",
    sentimentScore: 0.58,
    tags: ["BNB", "GameFi", "DeFi"],
  },
  {
    id: "fn8",
    title: "Saham Teknologi Asia Menguat Didukung Kinerja Laporan Keuangan Positif",
    body: "Saham-saham teknologi di bursa Asia mencatat penguatan signifikan setelah sejumlah perusahaan melaporkan hasil keuangan kuartal yang melampaui ekspektasi analis. IHSG turut menguat di sesi perdagangan pagi.",
    url: "https://cnbcindonesia.com",
    imageUrl: "https://images.unsplash.com/photo-1560472355-536de3962603?w=400&h=200&fit=crop",
    source: "CNBC Indonesia",
    publishedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "tech"],
    sentiment: "positive",
    sentimentScore: 0.45,
    tags: ["IHSG", "saham", "teknologi"],
  },
  {
    id: "fn9",
    title: "XRP Legal Battle Nears Resolution: Key Ruling Expected This Month",
    body: "The long-running legal dispute between Ripple Labs and the SEC is approaching a critical juncture. Legal experts predict a favorable outcome for Ripple could unlock significant price appreciation for XRP.",
    url: "https://cointelegraph.com",
    imageUrl: "https://images.unsplash.com/photo-1605792657660-596af9009e82?w=400&h=200&fit=crop",
    source: "CoinTelegraph",
    publishedAt: new Date(Date.now() - 9 * 3600000).toISOString(),
    categories: ["crypto", "xrp", "regulation"],
    sentiment: "neutral",
    sentimentScore: 0.1,
    tags: ["XRP", "SEC", "lawsuit"],
  },
  {
    id: "fn10",
    title: "BBCA dan TLKM Catat Kinerja Solid di Tengah Ketidakpastian Global",
    body: "Bank BCA dan Telkom Indonesia mencatat kinerja fundamental yang solid di kuartal pertama 2025 meski dihadapkan pada ketidakpastian ekonomi global. Analis mempertahankan rekomendasi beli untuk kedua saham unggulan tersebut.",
    url: "https://kontan.co.id",
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=200&fit=crop",
    source: "Kontan",
    publishedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
    categories: ["stocks", "indonesia"],
    sentiment: "positive",
    sentimentScore: 0.5,
    tags: ["BBCA", "TLKM", "BEI"],
  },
  {
    id: "fn11",
    title: "Crypto Market Fear & Greed Index Shows 'Fear' as Volatility Rises",
    body: "The Crypto Fear & Greed Index has dropped into the 'Fear' territory as market volatility increases. Historical data suggests such periods often precede buying opportunities for long-term investors.",
    url: "https://alternative.me",
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop",
    source: "Alternative.me",
    publishedAt: new Date(Date.now() - 11 * 3600000).toISOString(),
    categories: ["crypto", "market", "sentiment"],
    sentiment: "negative",
    sentimentScore: -0.3,
    tags: ["Fear", "sentiment", "volatility"],
  },
  {
    id: "fn12",
    title: "Polygon zkEVM Achieves Milestone With 1M Daily Transactions",
    body: "Polygon's zero-knowledge Ethereum Virtual Machine has surpassed 1 million daily transactions, demonstrating growing adoption of ZK rollup technology and its potential to scale the Ethereum ecosystem.",
    url: "https://polygon.technology",
    imageUrl: "https://images.unsplash.com/photo-1516245834210-c4c142787335?w=400&h=200&fit=crop",
    source: "Polygon Blog",
    publishedAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    categories: ["crypto", "polygon", "layer2"],
    sentiment: "positive",
    sentimentScore: 0.72,
    tags: ["MATIC", "zkEVM", "Layer2"],
  },
];

export async function getCryptoNews(limit: number): Promise<NewsItem[]> {
  const cacheKey = `news-crypto-${limit}`;
  const cached = cache.get<NewsItem[]>(cacheKey);
  if (cached) return cached;

  const result = FALLBACK_NEWS.filter((n) => n.categories.includes("crypto")).slice(0, limit);
  cache.set(cacheKey, result, TTL.NEWS);
  return result;
}

export async function getStockNews(limit: number): Promise<NewsItem[]> {
  const cacheKey = `news-stock-${limit}`;
  const cached = cache.get<NewsItem[]>(cacheKey);
  if (cached) return cached;

  const result = FALLBACK_NEWS.filter((n) => n.categories.includes("stocks")).slice(0, limit);
  cache.set(cacheKey, result, TTL.NEWS);
  return result;
}

export async function getAllNews(limit: number, type?: string): Promise<NewsItem[]> {
  const cacheKey = `news-all-${type}-${limit}`;
  const cached = cache.get<NewsItem[]>(cacheKey);
  if (cached) return cached;

  let filtered = FALLBACK_NEWS;
  if (type === "crypto") {
    filtered = FALLBACK_NEWS.filter((n) => n.categories.includes("crypto"));
  } else if (type === "stock") {
    filtered = FALLBACK_NEWS.filter((n) => n.categories.includes("stocks"));
  }

  const result = filtered.slice(0, limit);
  cache.set(cacheKey, result, TTL.NEWS);
  return result;
}
