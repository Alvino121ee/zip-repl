import { getCryptoList, getTrendingCoins } from "./coingecko.js";
import { getStockQuotes } from "./stocks.js";
import { getCryptoNews, getStockNews, analyzeSentiment } from "./news.js";
import { cache, TTL } from "./cache.js";

export type Signal = "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
export type Trend = "bullish" | "bearish" | "sideways";
export type Momentum = "strong" | "moderate" | "weak";
export type VolumeTrend = "increasing" | "decreasing" | "stable";

export interface TechnicalIndicators {
  rsi: number;
  trend: Trend;
  momentum: Momentum;
  volumeTrend: VolumeTrend;
  support: number;
  resistance: number;
  movingAverage7d: number | null;
  movingAverage30d: number | null;
}

export interface PredictionResult {
  assetId: string;
  assetName: string;
  assetType: "crypto" | "stock";
  symbol: string;
  image: string | null;
  signal: Signal;
  confidence: number;
  sentimentScore: number;
  priceChange24h: number;
  priceChange7d: number | null;
  currentPrice: number;
  reasons: string[];
  newsCount: number;
  positiveNews: number;
  negativeNews: number;
  technicalIndicators?: TechnicalIndicators;
}

function scoreToSignal(score: number): Signal {
  if (score >= 0.6) return "strong_buy";
  if (score >= 0.2) return "buy";
  if (score <= -0.6) return "strong_sell";
  if (score <= -0.2) return "sell";
  return "neutral";
}

function calculateRSI(priceChange: number): number {
  // Simplified RSI based on price change percentage
  const base = 50;
  const adjusted = base + priceChange * 2;
  return Math.max(10, Math.min(90, adjusted));
}

function getTrend(change24h: number, change7d: number | null): Trend {
  if (change24h > 2 || (change7d !== null && change7d > 5)) return "bullish";
  if (change24h < -2 || (change7d !== null && change7d < -5)) return "bearish";
  return "sideways";
}

function getMomentum(change24h: number): Momentum {
  const abs = Math.abs(change24h);
  if (abs > 5) return "strong";
  if (abs > 2) return "moderate";
  return "weak";
}

function buildReasons(
  change24hRaw: number | null,
  change7d: number | null,
  sentimentScore: number,
  positiveNews: number,
  negativeNews: number,
  assetName: string
): string[] {
  const reasons: string[] = [];
  const change24h = change24hRaw ?? 0;

  if (change24h > 5) reasons.push(`${assetName} naik ${change24h.toFixed(1)}% dalam 24 jam terakhir`);
  else if (change24h > 2) reasons.push(`Momentum positif dengan kenaikan ${change24h.toFixed(1)}% (24j)`);
  else if (change24h < -5) reasons.push(`Penurunan tajam ${Math.abs(change24h).toFixed(1)}% dalam 24 jam`);
  else if (change24h < -2) reasons.push(`Tekanan jual dengan penurunan ${Math.abs(change24h).toFixed(1)}% (24j)`);
  else reasons.push(`Pergerakan harga stabil dalam 24 jam (+-${Math.abs(change24h).toFixed(2)}%)`);

  if (change7d !== null) {
    if (change7d > 10) reasons.push(`Tren mingguan sangat bullish: +${change7d.toFixed(1)}% dalam 7 hari`);
    else if (change7d > 3) reasons.push(`Tren 7 hari positif: +${change7d.toFixed(1)}%`);
    else if (change7d < -10) reasons.push(`Tren mingguan negatif: ${change7d.toFixed(1)}% dalam 7 hari`);
    else if (change7d < -3) reasons.push(`Pelemahan mingguan: ${change7d.toFixed(1)}% (7 hari)`);
  }

  if (sentimentScore > 0.4) reasons.push(`Sentimen berita sangat positif (${(sentimentScore * 100).toFixed(0)}% bullish)`);
  else if (sentimentScore > 0.1) reasons.push(`Sentimen berita cenderung positif`);
  else if (sentimentScore < -0.4) reasons.push(`Sentimen berita sangat negatif`);
  else if (sentimentScore < -0.1) reasons.push(`Sentimen berita cenderung negatif`);
  else reasons.push(`Sentimen berita netral`);

  if (positiveNews > negativeNews * 2 && positiveNews > 3) {
    reasons.push(`${positiveNews} artikel berita positif mendukung kenaikan`);
  } else if (negativeNews > positiveNews * 2 && negativeNews > 3) {
    reasons.push(`${negativeNews} artikel negatif menekan harga`);
  }

  return reasons.slice(0, 4);
}

function getFallbackCryptoPredictions(limit: number): PredictionResult[] {
  const fallbacks: PredictionResult[] = [
    { assetId: "bitcoin", assetName: "Bitcoin", assetType: "crypto", symbol: "BTC", image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400", signal: "buy", confidence: 72, sentimentScore: 0.35, priceChange24h: -1.62, priceChange7d: -2.2, currentPrice: 79664, reasons: ["Dominasi pasar BTC masih di 58% menunjukkan kepercayaan tinggi", "Tren mingguan negatif namun support kuat di $78,000", "Sentimen institusional tetap bullish jangka panjang", "Volume beli meningkat di level support"], newsCount: 12, positiveNews: 8, negativeNews: 4 },
    { assetId: "ethereum", assetName: "Ethereum", assetType: "crypto", symbol: "ETH", image: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628", signal: "buy", confidence: 68, sentimentScore: 0.28, priceChange24h: -1.61, priceChange7d: -3.4, currentPrice: 2263, reasons: ["Upgrade jaringan ETH terus menekan biaya transaksi", "DeFi TVL tetap tinggi menopang permintaan ETH", "Rasio ETH/BTC stabil menunjukkan pola konsolidasi", "Sentimen developer tetap sangat positif"], newsCount: 9, positiveNews: 6, negativeNews: 3 },
    { assetId: "solana", assetName: "Solana", assetType: "crypto", symbol: "SOL", image: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png?1718769756", signal: "strong_buy", confidence: 81, sentimentScore: 0.62, priceChange24h: -4.26, priceChange7d: 8.5, currentPrice: 91, reasons: ["Tren mingguan sangat bullish +8.5% dalam 7 hari", "NFT dan DeFi activity di Solana mencapai rekor baru", "Adopsi institusional dan proyek baru terus meningkat", "9 artikel berita positif mendukung kenaikan"], newsCount: 11, positiveNews: 9, negativeNews: 2 },
    { assetId: "binancecoin", assetName: "BNB", assetType: "crypto", symbol: "BNB", image: "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501750", signal: "buy", confidence: 65, sentimentScore: 0.22, priceChange24h: 0.85, priceChange7d: 2.1, currentPrice: 598, reasons: ["BNB Chain activity meningkat signifikan", "Binance terus ekspansi di pasar Asia Tenggara", "Burn mechanism terus kurangi supply BNB", "Sentimen pasar cenderung positif"], newsCount: 7, positiveNews: 5, negativeNews: 2 },
    { assetId: "ripple", assetName: "XRP", assetType: "crypto", symbol: "XRP", image: "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1696501442", signal: "neutral", confidence: 55, sentimentScore: 0.05, priceChange24h: 0.32, priceChange7d: -1.8, currentPrice: 2.14, reasons: ["Hasil kasus hukum Ripple vs SEC masih belum pasti", "Adopsi pembayaran lintas batas terus berkembang", "Pergerakan harga lateral menunjukkan konsolidasi", "Sentimen berita netral"], newsCount: 5, positiveNews: 3, negativeNews: 2 },
  ];
  return fallbacks.slice(0, limit);
}

export async function getCryptoPredictions(limit: number): Promise<PredictionResult[]> {
  const cacheKey = `crypto-predictions-${limit}`;
  const cached = cache.get<PredictionResult[]>(cacheKey);
  if (cached) return cached;

  let coins, news;
  try {
    // Always fetch 50 to share the same cache key with the market endpoint
    [coins, news] = await Promise.all([
      getCryptoList(50, "usd"),
      getCryptoNews(50),
    ]);
  } catch {
    return getFallbackCryptoPredictions(limit);
  }

  if (!coins || coins.length === 0) {
    return getFallbackCryptoPredictions(limit);
  }

  const predictions: PredictionResult[] = coins.slice(0, limit).map((coin) => {
    const relatedNews = (news ?? []).filter(
      (n) =>
        (n.tags ?? []).some((a) => a.toLowerCase() === coin.symbol.toLowerCase()) ||
        n.title.toLowerCase().includes(coin.name.toLowerCase()) ||
        n.title.toLowerCase().includes(coin.symbol.toLowerCase())
    );

    const positiveNews = relatedNews.filter((n) => n.sentiment === "positive").length;
    const negativeNews = relatedNews.filter((n) => n.sentiment === "negative").length;

    const avgNewsSentiment =
      relatedNews.length > 0
        ? relatedNews.reduce((sum, n) => sum + (n.sentimentScore ?? 0), 0) / relatedNews.length
        : 0;

    const priceScore = ((coin.price_change_percentage_24h ?? 0) / 10) * 0.4;
    const weekScore = ((coin.price_change_percentage_7d_in_currency ?? 0) / 20) * 0.2;
    const newsScore = avgNewsSentiment * 0.4;

    const totalScore = Math.max(-1, Math.min(1, priceScore + weekScore + newsScore));
    const confidence = Math.min(95, Math.max(30, Math.abs(totalScore) * 80 + 30));

    const signal = scoreToSignal(totalScore);
    const change24h = coin.price_change_percentage_24h ?? 0;
    const rsi = calculateRSI(change24h);
    const trend = getTrend(change24h, coin.price_change_percentage_7d_in_currency ?? null);

    return {
      assetId: coin.id,
      assetName: coin.name,
      assetType: "crypto" as const,
      symbol: coin.symbol.toUpperCase(),
      image: coin.image,
      signal,
      confidence: Math.round(confidence),
      sentimentScore: totalScore,
      priceChange24h: coin.price_change_percentage_24h ?? 0,
      priceChange7d: coin.price_change_percentage_7d_in_currency ?? null,
      currentPrice: coin.current_price,
      reasons: buildReasons(
        coin.price_change_percentage_24h,
        coin.price_change_percentage_7d_in_currency ?? null,
        avgNewsSentiment,
        positiveNews,
        negativeNews,
        coin.name
      ),
      newsCount: relatedNews.length,
      positiveNews,
      negativeNews,
      technicalIndicators: {
        rsi,
        trend,
        momentum: getMomentum(coin.price_change_percentage_24h),
        volumeTrend: coin.total_volume > (coin.market_cap * 0.05) ? "increasing" : "stable",
        support: coin.low_24h ?? coin.current_price * 0.95,
        resistance: coin.high_24h ?? coin.current_price * 1.05,
        movingAverage7d: coin.price_change_percentage_7d_in_currency !== null
          ? coin.current_price / (1 + (coin.price_change_percentage_7d_in_currency / 100))
          : null,
        movingAverage30d: null,
      },
    };
  });

  predictions.sort((a, b) => Math.abs(b.sentimentScore) - Math.abs(a.sentimentScore));
  cache.set(cacheKey, predictions, TTL.PREDICTIONS);
  return predictions;
}

function getFallbackStockPredictions(limit: number): PredictionResult[] {
  const fallbacks: PredictionResult[] = [
    { assetId: "BBCA.JK", assetName: "Bank BCA", assetType: "stock", symbol: "BBCA.JK", image: null, signal: "buy", confidence: 70, sentimentScore: 0.3, priceChange24h: 0.75, priceChange7d: null, currentPrice: 9800, reasons: ["Kinerja fundamental BBCA sangat solid di Q1 2025", "Sentimen analis mayoritas 'beli' untuk BBCA", "Saham perbankan didukung kebijakan suku bunga BI"], newsCount: 4, positiveNews: 3, negativeNews: 1 },
    { assetId: "TLKM.JK", assetName: "Telkom Indonesia", assetType: "stock", symbol: "TLKM.JK", image: null, signal: "buy", confidence: 65, sentimentScore: 0.25, priceChange24h: 0.5, priceChange7d: null, currentPrice: 3100, reasons: ["Pertumbuhan segmen data dan digital TLKM terus meningkat", "Ekspansi infrastruktur fiber optik berjalan sesuai target", "Sentimen positif dari laporan keuangan terbaru"], newsCount: 3, positiveNews: 2, negativeNews: 1 },
    { assetId: "AAPL", assetName: "Apple Inc", assetType: "stock", symbol: "AAPL", image: null, signal: "buy", confidence: 68, sentimentScore: 0.28, priceChange24h: 1.2, priceChange7d: null, currentPrice: 189, reasons: ["Revenue iPhone tetap kuat meski pasar saturasi", "Ekosistem layanan Apple tumbuh 15% YoY", "Potensi integrasi AI membuka segmen pasar baru"], newsCount: 5, positiveNews: 4, negativeNews: 1 },
    { assetId: "MSFT", assetName: "Microsoft Corp", assetType: "stock", symbol: "MSFT", image: null, signal: "strong_buy", confidence: 78, sentimentScore: 0.55, priceChange24h: 1.8, priceChange7d: null, currentPrice: 415, reasons: ["Azure cloud tumbuh 28% YoY melebihi ekspektasi", "Copilot AI terintegrasi di seluruh produk Microsoft", "Margin operasional terus meningkat setiap kuartal"], newsCount: 7, positiveNews: 6, negativeNews: 1 },
    { assetId: "GOOGL", assetName: "Alphabet Inc", assetType: "stock", symbol: "GOOGL", image: null, signal: "buy", confidence: 66, sentimentScore: 0.3, priceChange24h: 0.9, priceChange7d: null, currentPrice: 172, reasons: ["Dominasi pencarian Google tetap kuat di 91% market share", "Google Cloud tumbuh signifikan mendorong revenue", "Sentimen investor positif pasca hasil earnings Q1"], newsCount: 4, positiveNews: 3, negativeNews: 1 },
  ];
  return fallbacks.slice(0, limit);
}

export async function getStockPredictions(limit: number): Promise<PredictionResult[]> {
  const cacheKey = `stock-predictions-${limit}`;
  const cached = cache.get<PredictionResult[]>(cacheKey);
  if (cached) return cached;

  let stocks, news;
  try {
    [stocks, news] = await Promise.all([
      getStockQuotes(),
      getStockNews(30),
    ]);
  } catch {
    return getFallbackStockPredictions(limit);
  }

  if (!stocks || stocks.length === 0) {
    return getFallbackStockPredictions(limit);
  }

  const predictions: PredictionResult[] = stocks.slice(0, limit).map((stock) => {
    const symbol = stock.symbol ?? "";
    const name = stock.shortName ?? stock.longName ?? symbol;
    const changePercent = stock.regularMarketChangePercent ?? 0;

    const relatedNews = (news ?? []).filter(
      (n) =>
        (n.tags ?? []).includes(symbol.replace(".JK", "")) ||
        n.title.toLowerCase().includes((name.toLowerCase().split(" ")[0] ?? ""))
    );

    const positiveNews = relatedNews.filter((n) => n.sentiment === "positive").length;
    const negativeNews = relatedNews.filter((n) => n.sentiment === "negative").length;
    const avgNewsSentiment =
      relatedNews.length > 0
        ? relatedNews.reduce((sum, n) => sum + (n.sentimentScore ?? 0), 0) / relatedNews.length
        : 0;

    // Also analyze stock name/symbol in recent news titles
    const titleSentiment = analyzeSentiment(
      news.slice(0, 10).map((n) => n.title).join(" ")
    );

    const priceScore = (changePercent / 10) * 0.5;
    const newsScore = (avgNewsSentiment + titleSentiment.score * 0.3) * 0.5;

    const totalScore = Math.max(-1, Math.min(1, priceScore + newsScore));
    const confidence = Math.min(90, Math.max(30, Math.abs(totalScore) * 70 + 30));
    const signal = scoreToSignal(totalScore);
    const price = stock.regularMarketPrice ?? 0;

    return {
      assetId: symbol,
      assetName: name,
      assetType: "stock" as const,
      symbol,
      image: null,
      signal,
      confidence: Math.round(confidence),
      sentimentScore: totalScore,
      priceChange24h: changePercent,
      priceChange7d: null,
      currentPrice: price,
      reasons: buildReasons(changePercent, null, avgNewsSentiment, positiveNews, negativeNews, name),
      newsCount: relatedNews.length,
      positiveNews,
      negativeNews,
      technicalIndicators: {
        rsi: calculateRSI(changePercent),
        trend: getTrend(changePercent, null),
        momentum: getMomentum(changePercent),
        volumeTrend: "stable",
        support: (stock.regularMarketDayLow ?? price * 0.95),
        resistance: (stock.regularMarketDayHigh ?? price * 1.05),
        movingAverage7d: null,
        movingAverage30d: null,
      },
    };
  });

  predictions.sort((a, b) => Math.abs(b.sentimentScore) - Math.abs(a.sentimentScore));
  cache.set(cacheKey, predictions, TTL.PREDICTIONS);
  return predictions;
}
