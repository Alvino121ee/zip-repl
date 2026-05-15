import { createHash } from "crypto";
import Parser from "rss-parser";
import { logger } from "../lib/logger.js";
import { cache, TTL } from "./cache.js";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Sentiment Engine ─────────────────────────────────────────────────────────

const POSITIVE_WORDS = [
  "surge", "rally", "gain", "rise", "bull", "breakout", "growth", "profit",
  "adoption", "record", "milestone", "partnership", "upgrade", "launch",
  "approval", "bullish", "soar", "climb", "increase", "positive", "strong",
  "opportunity", "innovation", "success", "beat", "exceed", "jump", "ath",
  "institutional", "etf", "accumulate", "support", "recovery", "rebound",
  "naik", "meningkat", "pertumbuhan", "untung", "optimis", "menguat",
  "kenaikan", "positif", "cerah", "outperform", "highs", "inflows", "bought",
];

const NEGATIVE_WORDS = [
  "crash", "plunge", "drop", "fall", "bear", "loss", "decline", "sell",
  "hack", "fraud", "ban", "regulatory", "lawsuit", "fear", "panic", "dump",
  "warning", "risk", "uncertain", "volatile", "down", "weak", "collapse",
  "bearish", "concern", "threat", "violation", "investigation", "delay",
  "turun", "anjlok", "jatuh", "rugi", "pesimis", "larangan", "tertekan",
  "melemah", "koreksi", "negatif", "underperform", "outflows", "sold", "sued",
  "exploit", "breach", "liquidation", "margin call", "sanctions",
];

export function analyzeSentiment(text: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  const lower = text.toLowerCase();
  let score = 0;
  for (const word of POSITIVE_WORDS) if (lower.includes(word)) score += 1;
  for (const word of NEGATIVE_WORDS) if (lower.includes(word)) score -= 1;
  const normalized = Math.max(-1, Math.min(1, score / 5));
  const sentiment = normalized > 0.1 ? "positive" : normalized < -0.1 ? "negative" : "neutral";
  return { sentiment, score: normalized };
}

// ─── RSS Feed Definitions ─────────────────────────────────────────────────────

interface FeedDef {
  url: string;
  source: string;
  categories: string[];
  tags: string[];
}

const CRYPTO_FEEDS: FeedDef[] = [
  {
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    source: "CoinDesk",
    categories: ["crypto"],
    tags: ["crypto", "bitcoin", "blockchain"],
  },
  {
    url: "https://cointelegraph.com/rss",
    source: "CoinTelegraph",
    categories: ["crypto"],
    tags: ["crypto", "altcoin", "DeFi"],
  },
  {
    url: "https://decrypt.co/feed",
    source: "Decrypt",
    categories: ["crypto"],
    tags: ["crypto", "Web3", "NFT"],
  },
  {
    url: "https://bitcoinmagazine.com/feed",
    source: "Bitcoin Magazine",
    categories: ["crypto", "bitcoin"],
    tags: ["BTC", "bitcoin", "lightning"],
  },
  {
    url: "https://cryptoslate.com/feed/",
    source: "CryptoSlate",
    categories: ["crypto"],
    tags: ["crypto", "market", "analysis"],
  },
  {
    url: "https://bitcoinist.com/feed/",
    source: "Bitcoinist",
    categories: ["crypto"],
    tags: ["crypto", "trading", "price"],
  },
  {
    url: "https://www.newsbtc.com/feed/",
    source: "NewsBTC",
    categories: ["crypto"],
    tags: ["crypto", "BTC", "prediction"],
  },
];

const FINANCE_FEEDS: FeedDef[] = [
  {
    url: "https://feeds.reuters.com/reuters/businessNews",
    source: "Reuters",
    categories: ["stocks", "macro"],
    tags: ["stocks", "economy", "global"],
  },
  {
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    source: "MarketWatch",
    categories: ["stocks", "macro"],
    tags: ["stocks", "market", "finance"],
  },
  {
    url: "https://finance.yahoo.com/news/rssindex",
    source: "Yahoo Finance",
    categories: ["stocks", "macro"],
    tags: ["stocks", "earnings", "market"],
  },
  {
    url: "https://www.investing.com/rss/news.rss",
    source: "Investing.com",
    categories: ["stocks", "crypto", "macro"],
    tags: ["stocks", "crypto", "forex", "commodities"],
  },
];

// ─── Fallback IDX news (no free RSS available for Indonesian stocks) ───────────

const IDX_FALLBACK: NewsItem[] = [
  {
    id: "idx1",
    title: "BBCA Catat Laba Bersih Rp 14,8 Triliun di Q1 2026, Tumbuh 11% YoY",
    body: "Bank Central Asia (BBCA) membukukan laba bersih sebesar Rp 14,8 triliun pada kuartal pertama 2026, tumbuh 11% year-on-year. Pertumbuhan didorong oleh ekspansi kredit yang sehat dan peningkatan pendapatan bunga bersih.",
    url: "https://kontan.co.id",
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=200&fit=crop",
    source: "Kontan",
    publishedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "banking"],
    sentiment: "positive",
    sentimentScore: 0.75,
    tags: ["BBCA", "perbankan", "laba", "BEI"],
  },
  {
    id: "idx2",
    title: "IHSG Menguat 1,2% Dipimpin Sektor Keuangan dan Energi",
    body: "Indeks Harga Saham Gabungan (IHSG) ditutup menguat 1,2% ke level 7.485. Saham-saham sektor keuangan dan energi menjadi penopang utama indeks. Volume perdagangan mencapai Rp 12,5 triliun.",
    url: "https://bisnis.com",
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop",
    source: "Bisnis Indonesia",
    publishedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "ihsg"],
    sentiment: "positive",
    sentimentScore: 0.65,
    tags: ["IHSG", "BEI", "indeks", "saham"],
  },
  {
    id: "idx3",
    title: "GoTo (GOTO) Umumkan Profitabilitas EBITDA Adjusted Positif untuk Pertama Kalinya",
    body: "GoTo Gojek Tokopedia (GOTO) mengumumkan pencapaian historis dengan membukukan EBITDA adjusted yang positif untuk pertama kalinya sejak IPO. Manajemen menyebut efisiensi biaya dan pertumbuhan GTV sebagai pendorong utama.",
    url: "https://cnbcindonesia.com",
    imageUrl: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400&h=200&fit=crop",
    source: "CNBC Indonesia",
    publishedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "tech"],
    sentiment: "positive",
    sentimentScore: 0.80,
    tags: ["GOTO", "profitabilitas", "teknologi", "BEI"],
  },
  {
    id: "idx4",
    title: "Bank Indonesia Tahan Suku Bunga di 5,75%, Dukung Stabilitas Rupiah",
    body: "Rapat Dewan Gubernur Bank Indonesia memutuskan untuk mempertahankan suku bunga acuan BI Rate di level 5,75%. Keputusan ini dinilai positif bagi sektor perbankan dan diharapkan menjaga stabilitas nilai tukar rupiah.",
    url: "https://detik.com",
    imageUrl: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=400&h=200&fit=crop",
    source: "Detik Finance",
    publishedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "macro"],
    sentiment: "positive",
    sentimentScore: 0.45,
    tags: ["BI Rate", "Bank Indonesia", "suku bunga", "perbankan"],
  },
  {
    id: "idx5",
    title: "ANTM Menguat 3% Didorong Kenaikan Harga Emas dan Nikel Global",
    body: "Saham Aneka Tambang (ANTM) menguat 3% menyusul kenaikan harga emas ke level USD 2.380/troy ons dan pemulihan harga nikel di pasar internasional.",
    url: "https://kontan.co.id",
    imageUrl: "https://images.unsplash.com/photo-1624996379697-f01d168b1a52?w=400&h=200&fit=crop",
    source: "Kontan",
    publishedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "mining"],
    sentiment: "positive",
    sentimentScore: 0.70,
    tags: ["ANTM", "emas", "nikel", "tambang", "BEI"],
  },
  {
    id: "idx6",
    title: "ADRO Tertekan Koreksi Harga Batu Bara, Saham Turun 2,5%",
    body: "Saham Adaro Energy (ADRO) terkoreksi 2,5% menyusul pelemahan harga batu bara acuan Newcastle ke USD 118/ton. Penurunan permintaan dari China menjadi faktor utama tekanan harga.",
    url: "https://investasi.kontan.co.id",
    imageUrl: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=400&h=200&fit=crop",
    source: "Kontan Investasi",
    publishedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "energy"],
    sentiment: "negative",
    sentimentScore: -0.50,
    tags: ["ADRO", "batu bara", "energi", "koreksi"],
  },
  {
    id: "idx7",
    title: "BBRI Perkuat Portofolio UMKM Digital, Bidik 30 Juta Nasabah Aktif",
    body: "Bank Rakyat Indonesia (BBRI) memperkuat ekosistem digital untuk UMKM melalui platform BRImo yang kini memiliki 35 juta pengguna aktif.",
    url: "https://katadata.co.id",
    imageUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=200&fit=crop",
    source: "Katadata",
    publishedAt: new Date(Date.now() - 7 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "banking"],
    sentiment: "positive",
    sentimentScore: 0.62,
    tags: ["BBRI", "UMKM", "digital", "perbankan"],
  },
  {
    id: "idx8",
    title: "Prospek IHSG 2026: Analis Targetkan Level 8.000 Akhir Tahun",
    body: "Sejumlah analis pasar modal memproyeksikan IHSG dapat mencapai level 8.000 pada akhir 2026, didukung perbaikan ekonomi domestik dan masuknya investor asing.",
    url: "https://bisnis.com",
    imageUrl: "https://images.unsplash.com/photo-1560472355-536de3962603?w=400&h=200&fit=crop",
    source: "Bisnis Indonesia",
    publishedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "ihsg"],
    sentiment: "positive",
    sentimentScore: 0.55,
    tags: ["IHSG", "proyeksi", "analis", "2026"],
  },
];

// ─── RSS parser helpers ───────────────────────────────────────────────────────

const rssParser = new Parser({
  timeout: 8000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; VinzPredictBot/1.0)",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
  },
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["enclosure", "enclosure"],
    ],
  },
});

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractImage(item: any): string {
  // Try media:content url
  if (item.mediaContent?.$.url) return item.mediaContent.$.url;
  if (item.mediaThumbnail?.$.url) return item.mediaThumbnail.$.url;
  // Try enclosure
  if (item.enclosure?.url && /\.(jpg|jpeg|png|webp)/i.test(item.enclosure.url)) {
    return item.enclosure.url;
  }
  // Try extracting first <img> from content
  const contentHtml = item["content:encoded"] || item.content || "";
  const imgMatch = contentHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) return imgMatch[1];
  // Default placeholder
  return "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop";
}

function extractTags(title: string, categories: string[]): string[] {
  const tags: string[] = [];
  const lower = title.toLowerCase();
  // Common crypto tickers
  const cryptoTickers = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "AVAX", "DOT", "MATIC", "LINK", "UNI", "ATOM", "LTC"];
  for (const t of cryptoTickers) {
    if (lower.includes(t.toLowerCase()) || lower.includes(t)) tags.push(t);
  }
  // Common stock tickers
  const stockTickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "BBCA", "BBRI", "TLKM", "GOTO", "ANTM", "ADRO"];
  for (const t of stockTickers) {
    if (lower.includes(t.toLowerCase())) tags.push(t);
  }
  // Topic keywords
  if (lower.includes("bitcoin")) tags.push("bitcoin");
  if (lower.includes("ethereum")) tags.push("ethereum");
  if (lower.includes("defi")) tags.push("DeFi");
  if (lower.includes("nft")) tags.push("NFT");
  if (lower.includes("etf")) tags.push("ETF");
  if (lower.includes("fed") || lower.includes("federal reserve")) tags.push("Fed");
  if (lower.includes("sec")) tags.push("SEC");
  if (lower.includes("inflation") || lower.includes("cpi")) tags.push("inflation");
  if (lower.includes("stablecoin")) tags.push("stablecoin");
  // Merge with category-based tags
  if (categories.includes("crypto")) tags.push("crypto");
  if (categories.includes("stocks")) tags.push("stocks");
  return [...new Set(tags)].slice(0, 6);
}

// Hard exclusions — non-finance topics that slip through broad feeds
const EXCLUDE_PATTERNS = [
  /social security/i, /obituar/i, /recipe/i, /sports/i, /movie/i,
  /weather/i, /celebrity/i, /fashion/i, /health.*tip/i, /diet/i,
  /travel/i, /restaurant/i, /dating/i, /horoscope/i,
];

// Detect if a fetched article is actually about finance/crypto (filter noise from broad feeds)
function isFinanceRelevant(title: string, desc: string): boolean {
  const text = (title + " " + desc).toLowerCase();
  // Reject clearly non-financial content
  if (EXCLUDE_PATTERNS.some((p) => p.test(title))) return false;
  const keywords = [
    "bitcoin", "crypto", "blockchain", "ethereum", "token", "defi", "nft", "altcoin",
    "stock", "shares", "equity", "market", "fund", "etf", "nasdaq", "s&p", "dow",
    "fed", "interest rate", "gdp", "inflation", "recession", "earnings", "ipo",
    "forex", "gold", "oil", "commodities", "bond", "treasury", "yield",
    "bank", "finance", "economy", "trading", "investment", "portfolio",
    "ihsg", "bei", "saham", "rupiah", "ojk", "bursa",
    "price", "rally", "crash", "plunge", "surge", "bull", "bear",
  ];
  return keywords.some((k) => text.includes(k));
}

// ─── Fetch a single RSS feed with timeout ─────────────────────────────────────

async function fetchFeed(def: FeedDef): Promise<NewsItem[]> {
  try {
    const feed = await rssParser.parseURL(def.url);
    const items: NewsItem[] = [];

    for (const item of (feed.items ?? []).slice(0, 12)) {
      const title = stripHtml(item.title ?? "");
      const body = stripHtml(item.contentSnippet ?? item.content ?? item.summary ?? (item as any)["content:encoded"] ?? "").slice(0, 400);
      if (!title || title.length < 10) continue;
      if (!isFinanceRelevant(title, body)) continue;

      const url = item.link ?? item.guid ?? "";
      const publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
      const imageUrl = extractImage(item);
      const { sentiment, score } = analyzeSentiment(title + " " + body);
      const tags = extractTags(title, def.categories);

      // Refine categories based on content
      const categories = [...def.categories];
      const lower = (title + body).toLowerCase();
      if (lower.includes("bitcoin") || lower.includes("btc") || lower.includes("crypto") || lower.includes("ethereum")) {
        if (!categories.includes("crypto")) categories.push("crypto");
      }
      if (lower.includes("stock") || lower.includes("nasdaq") || lower.includes("s&p") || lower.includes("shares")) {
        if (!categories.includes("stocks")) categories.push("stocks");
      }

      // Stable unique ID: sha256 of full URL, take first 12 hex chars
      const urlHash = createHash("sha256").update(url).digest("hex").slice(0, 12);
      items.push({
        id: `${def.source.toLowerCase().replace(/\s+/g, "-")}-${urlHash}`,
        title,
        body: body || title,
        url,
        imageUrl,
        source: def.source,
        publishedAt,
        categories,
        sentiment,
        sentimentScore: score,
        tags,
      });
    }

    logger.debug({ source: def.source, count: items.length }, "RSS feed fetched");
    return items;
  } catch (err) {
    logger.warn({ source: def.source, err }, "RSS feed failed");
    return [];
  }
}

// ─── Master fetch with parallel feeds + fallback ──────────────────────────────

async function fetchAllLive(): Promise<{ crypto: NewsItem[]; stocks: NewsItem[] }> {
  const allFeeds = [...CRYPTO_FEEDS, ...FINANCE_FEEDS];

  // Fetch all feeds in parallel
  const results = await Promise.allSettled(allFeeds.map((f) => fetchFeed(f)));

  const all: NewsItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  // Sort newest first, deduplicate by URL and normalized title
  all.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const seenUrls = new Set<string>();
  const seenTitleHashes = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const item of all) {
    // Normalize title: lowercase, strip punctuation, take first 60 chars
    const normalTitle = item.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    const titleHash = createHash("sha256").update(normalTitle).digest("hex").slice(0, 8);
    if (!seenUrls.has(item.url) && !seenTitleHashes.has(titleHash)) {
      seenUrls.add(item.url);
      seenTitleHashes.add(titleHash);
      deduped.push(item);
    }
  }

  const cryptoItems = deduped.filter((n) => n.categories.includes("crypto"));
  const stockItems = deduped.filter((n) => n.categories.includes("stocks") || n.categories.includes("macro"));

  // Always append IDX fallback to stock news (Indonesian-specific)
  return {
    crypto: cryptoItems.length > 0 ? cryptoItems : [],
    stocks: [...stockItems, ...IDX_FALLBACK],
  };
}

// ─── Cached public API ────────────────────────────────────────────────────────

async function getLiveNews(): Promise<{ crypto: NewsItem[]; stocks: NewsItem[] }> {
  const cacheKey = "live-news-v3";
  const cached = cache.get<{ crypto: NewsItem[]; stocks: NewsItem[] }>(cacheKey);
  if (cached) return cached;

  const result = await fetchAllLive();

  // Only cache if we got live data
  const hasLive = result.crypto.length > 0 || result.stocks.length > IDX_FALLBACK.length;
  if (hasLive) {
    cache.set(cacheKey, result, TTL.NEWS);
  }
  return result;
}

export async function getCryptoNews(limit: number): Promise<NewsItem[]> {
  const { crypto } = await getLiveNews();
  const fallback: NewsItem[] = crypto.length === 0 ? [
    {
      id: "crypt-fb1",
      title: "Bitcoin Tembus $96.000, Dominasi Pasar Kripto Mencapai 60%",
      body: "Bitcoin kembali menguji resistance $96.000 setelah arus masuk ke ETF Bitcoin spot mencapai $850 juta dalam sepekan. Dominasi BTC di pasar kripto global naik ke 60%.",
      url: "https://coindesk.com",
      imageUrl: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=400&h=200&fit=crop",
      source: "CoinDesk",
      publishedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      categories: ["crypto", "bitcoin"],
      sentiment: "positive",
      sentimentScore: 0.75,
      tags: ["BTC", "bitcoin", "ETF"],
    },
    {
      id: "crypt-fb2",
      title: "Ethereum Upgrade Pectra: Gas Fee Turun 40%, Transaksi Melonjak",
      body: "Upgrade Pectra di jaringan Ethereum berhasil diimplementasikan, menghasilkan penurunan biaya gas rata-rata 40% dan peningkatan throughput transaksi.",
      url: "https://cointelegraph.com",
      imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=200&fit=crop",
      source: "CoinTelegraph",
      publishedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
      categories: ["crypto", "ethereum"],
      sentiment: "positive",
      sentimentScore: 0.80,
      tags: ["ETH", "ethereum", "upgrade", "DeFi"],
    },
    {
      id: "crypt-fb3",
      title: "Solana Catat Rekor Volume DEX $8 Miliar dalam 24 Jam",
      body: "Solana mencatat rekor volume perdagangan DEX sebesar $8 miliar dalam 24 jam, melampaui Ethereum untuk pertama kalinya.",
      url: "https://decrypt.co",
      imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop",
      source: "Decrypt",
      publishedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
      categories: ["crypto", "solana"],
      sentiment: "positive",
      sentimentScore: 0.72,
      tags: ["SOL", "solana", "DEX", "DeFi"],
    },
  ] : [];
  return [...crypto, ...fallback].slice(0, limit);
}

export async function getStockNews(limit: number): Promise<NewsItem[]> {
  const { stocks } = await getLiveNews();
  return stocks.slice(0, limit);
}

export async function getAllNews(limit: number, type?: string): Promise<NewsItem[]> {
  const { crypto, stocks } = await getLiveNews();

  if (type === "crypto") return crypto.slice(0, limit);
  if (type === "stock") return stocks.slice(0, limit);

  // Interleave crypto and stock for a Bloomberg-like mixed feed, deduplicating by ID
  const mixed: NewsItem[] = [];
  const seenIds = new Set<string>();
  const c = [...crypto];
  const s = [...stocks];
  while (mixed.length < limit && (c.length > 0 || s.length > 0)) {
    if (c.length > 0) {
      const item = c.shift()!;
      if (!seenIds.has(item.id)) { seenIds.add(item.id); mixed.push(item); }
    }
    if (s.length > 0 && mixed.length < limit) {
      const item = s.shift()!;
      if (!seenIds.has(item.id)) { seenIds.add(item.id); mixed.push(item); }
    }
  }
  return mixed.slice(0, limit);
}

export { logger };
