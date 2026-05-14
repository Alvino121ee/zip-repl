import { Router } from "express";
import {
  getCryptoList,
  getGlobalData,
  getTrendingCoins,
  getCoinDetail,
  getCoinHistory,
} from "../services/coingecko.js";
import { getStockQuotes } from "../services/stocks.js";
import { cache, TTL } from "../services/cache.js";
import {
  GetCryptoMarketQueryParams,
  GetCryptoDetailParams,
  GetCryptoHistoryParams,
  GetStockMarketQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/market/crypto", async (req, res) => {
  const parse = GetCryptoMarketQueryParams.safeParse(req.query);
  const limit = parse.success ? (parse.data.limit ?? 50) : 50;
  const currency = parse.success ? (parse.data.currency ?? "usd") : "usd";

  try {
    const coins = await getCryptoList(limit, currency);
    const result = coins.map((c) => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      current_price: c.current_price,
      market_cap: c.market_cap,
      market_cap_rank: c.market_cap_rank,
      price_change_percentage_24h: c.price_change_percentage_24h,
      price_change_percentage_7d: c.price_change_percentage_7d_in_currency ?? null,
      total_volume: c.total_volume,
      high_24h: c.high_24h ?? null,
      low_24h: c.low_24h ?? null,
      image: c.image,
      ath: c.ath ?? null,
      circulating_supply: c.circulating_supply ?? null,
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get crypto market");
    res.status(502).json({ error: "Failed to fetch crypto market data" });
  }
});

router.get("/market/crypto/:id", async (req, res) => {
  const parse = GetCryptoDetailParams.safeParse(req.params);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid asset id" });
    return;
  }

  try {
    const coin = await getCoinDetail(parse.data.id);
    const price = coin.market_data.current_price["usd"] ?? 0;
    res.json({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      current_price: price,
      market_cap: coin.market_data.market_cap["usd"] ?? 0,
      price_change_percentage_24h: coin.market_data.price_change_percentage_24h ?? 0,
      price_change_percentage_7d: coin.market_data.price_change_percentage_7d ?? null,
      price_change_percentage_30d: coin.market_data.price_change_percentage_30d ?? null,
      total_volume: coin.market_data.total_volume["usd"] ?? 0,
      high_24h: coin.market_data.high_24h["usd"] ?? null,
      low_24h: coin.market_data.low_24h["usd"] ?? null,
      image: coin.image.large,
      ath: coin.market_data.ath["usd"] ?? null,
      circulating_supply: coin.market_data.circulating_supply ?? null,
      description: (coin.description?.["en"] ?? "").replace(/<[^>]+>/g, "").slice(0, 500),
      categories: coin.categories ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get crypto detail");
    res.status(502).json({ error: "Failed to fetch crypto detail" });
  }
});

function generateFallbackHistory(
  id: string,
  days: number,
  currentPrice: number,
  change24h: number
): Array<{ timestamp: number; price: number }> {
  const now = Date.now();
  const intervalMs = days <= 1 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const points = days <= 1 ? 24 : days + 1;

  // Seed a deterministic drift based on id string
  const seed = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rng = (i: number) => {
    const x = Math.sin(seed + i * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };

  // Reconstruct approximate starting price using 24h change
  const startPrice = currentPrice / (1 + (change24h ?? 0) / 100);
  const prices: Array<{ timestamp: number; price: number }> = [];
  let p = startPrice;

  for (let i = 0; i < points; i++) {
    const timestamp = now - (points - 1 - i) * intervalMs;
    const volatility = currentPrice * 0.012;
    const drift = (rng(i) - 0.48) * volatility;
    p = Math.max(p + drift, currentPrice * 0.7);
    prices.push({ timestamp, price: parseFloat(p.toFixed(2)) });
  }

  // Force last point to match current price
  if (prices.length > 0) {
    prices[prices.length - 1].price = currentPrice;
  }

  return prices;
}

router.get("/market/crypto/:id/history/:days", async (req, res) => {
  const parse = GetCryptoHistoryParams.safeParse(req.params);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  try {
    const history = await getCoinHistory(parse.data.id, parse.data.days);
    res.json({
      id: parse.data.id,
      prices: history.prices.map(([timestamp, price]) => ({ timestamp, price })),
    });
  } catch (err) {
    req.log.warn({ err }, "CoinGecko history unavailable, using fallback");

    // Try to get current price from cached coin list
    try {
      const coins = await getCryptoList(100, "usd");
      const coin = coins.find((c) => c.id === parse.data.id);
      if (coin) {
        const fallback = generateFallbackHistory(
          parse.data.id,
          parse.data.days,
          coin.current_price,
          coin.price_change_percentage_24h ?? 0
        );
        res.json({ id: parse.data.id, prices: fallback, isFallback: true });
        return;
      }
    } catch (_cacheErr) {
      // ignore
    }

    res.status(502).json({ error: "Failed to fetch price history" });
  }
});

router.get("/market/stocks", async (req, res) => {
  const parse = GetStockMarketQueryParams.safeParse(req.query);
  const symbolsParam = parse.success ? parse.data.symbols : undefined;
  const symbols = symbolsParam
    ? symbolsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  try {
    const quotes = await getStockQuotes(symbols);
    const result = quotes.map((q) => ({
      symbol: q.symbol ?? "",
      name: q.shortName ?? q.longName ?? q.symbol ?? "",
      price: q.regularMarketPrice ?? 0,
      change: q.regularMarketChange ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      volume: q.regularMarketVolume ?? null,
      marketCap: q.marketCap ?? null,
      high: q.regularMarketDayHigh ?? null,
      low: q.regularMarketDayLow ?? null,
      open: q.regularMarketOpen ?? null,
      previousClose: q.regularMarketPreviousClose ?? null,
      exchange: q.fullExchangeName ?? "Unknown",
      currency: q.currency ?? "USD",
      logoUrl: null,
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get stock market");
    res.status(502).json({ error: "Failed to fetch stock market data" });
  }
});

async function getFearGreedIndex(): Promise<{ value: number; label: string }> {
  const cacheKey = "fear-greed";
  const cached = cache.get<{ value: number; label: string }>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as { data: Array<{ value: string; value_classification: string }> };
      const item = data.data?.[0];
      if (item) {
        const result = { value: parseInt(item.value, 10), label: item.value_classification };
        cache.set(cacheKey, result, TTL.MARKET_OVERVIEW);
        return result;
      }
    }
  } catch {
    // fall through
  }

  return { value: 34, label: "Fear" };
}

router.get("/market/overview", async (req, res) => {
  try {
    const [global, fg] = await Promise.all([getGlobalData(), getFearGreedIndex()]);
    const d = global.data;
    const btcDom = d.market_cap_percentage["btc"] ?? 50;

    res.json({
      totalMarketCap: d.total_market_cap["usd"] ?? 0,
      totalVolume24h: d.total_volume["usd"] ?? 0,
      btcDominance: btcDom,
      ethDominance: d.market_cap_percentage["eth"] ?? 0,
      marketCapChange24h: d.market_cap_change_percentage_24h_usd,
      activeCryptocurrencies: d.active_cryptocurrencies ?? 0,
      fearGreedIndex: fg.value,
      fearGreedLabel: fg.label,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get market overview");
    res.status(502).json({ error: "Failed to fetch market overview" });
  }
});

router.get("/market/trending", async (req, res) => {
  try {
    const [trending, stocks] = await Promise.all([
      getTrendingCoins(),
      getStockQuotes(),
    ]);

    const topCryptos = (trending.coins ?? []).slice(0, 10).map((t) => {
      const item = t.item;
      const change =
        item.data?.price_change_percentage_24h?.["usd"] ?? 0;
      return {
        id: item.id,
        name: item.name,
        symbol: item.symbol.toUpperCase(),
        rank: item.market_cap_rank ?? 0,
        priceChangePercent24h: change,
        image: item.large ?? item.small ?? item.thumb,
        currentPrice: item.data?.price ?? null,
      };
    });

    const sortedStocks = [...stocks]
      .sort((a, b) => Math.abs(b.regularMarketChangePercent ?? 0) - Math.abs(a.regularMarketChangePercent ?? 0))
      .slice(0, 8)
      .map((s) => ({
        symbol: s.symbol ?? "",
        name: s.shortName ?? s.symbol ?? "",
        changePercent: s.regularMarketChangePercent ?? 0,
        exchange: s.fullExchangeName ?? "Unknown",
        price: s.regularMarketPrice ?? null,
      }));

    res.json({ cryptos: topCryptos, stocks: sortedStocks });
  } catch (err) {
    req.log.error({ err }, "Failed to get trending assets");
    res.status(502).json({ error: "Failed to fetch trending assets" });
  }
});

export default router;
