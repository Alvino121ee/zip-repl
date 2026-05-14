import { logger } from "../lib/logger.js";
import { cache, TTL } from "./cache.js";

const BASE = "https://api.coingecko.com/api/v3";

async function cgFetch<T>(path: string, cacheKey: string, ttl: number): Promise<T> {
  const cached = cache.get<T>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    logger.warn({ status: res.status, path }, "CoinGecko request failed");
    // On 429 rate limit, return empty array for list endpoints so caller can use fallback
    if (res.status === 429) throw new Error(`CoinGecko error 429`);
    throw new Error(`CoinGecko error ${res.status}`);
  }

  const data = (await res.json()) as T;
  cache.set(cacheKey, data, ttl);
  return data;
}

export interface CGCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number | null;
  low_24h: number | null;
  price_change_24h: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency: number | null;
  market_cap_change_percentage_24h: number;
  circulating_supply: number | null;
  total_supply: number | null;
  ath: number | null;
  ath_change_percentage: number | null;
}

export interface CGGlobal {
  data: {
    active_cryptocurrencies: number;
    total_market_cap: Record<string, number>;
    total_volume: Record<string, number>;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
  };
}

export interface CGTrendingItem {
  item: {
    id: string;
    name: string;
    symbol: string;
    market_cap_rank: number;
    thumb: string;
    small: string;
    large: string;
    data?: {
      price: number;
      price_change_percentage_24h?: Record<string, number>;
    };
  };
}

export interface CGTrending {
  coins: CGTrendingItem[];
}

export interface CGCoinDetail {
  id: string;
  symbol: string;
  name: string;
  image: { large: string; small: string; thumb: string };
  market_data: {
    current_price: Record<string, number>;
    market_cap: Record<string, number>;
    total_volume: Record<string, number>;
    high_24h: Record<string, number>;
    low_24h: Record<string, number>;
    price_change_percentage_24h: number;
    price_change_percentage_7d: number | null;
    price_change_percentage_30d: number | null;
    ath: Record<string, number>;
    circulating_supply: number | null;
  };
  description: Record<string, string>;
  categories: string[];
}

export interface CGMarketChart {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

export async function getCryptoList(limit: number, currency: string): Promise<CGCoin[]> {
  return cgFetch<CGCoin[]>(
    `/coins/markets?vs_currency=${currency}&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=7d`,
    `crypto-list-${limit}-${currency}`,
    TTL.CRYPTO_PRICES
  );
}

export async function getGlobalData(): Promise<CGGlobal> {
  return cgFetch<CGGlobal>("/global", "global", TTL.MARKET_OVERVIEW);
}

export async function getTrendingCoins(): Promise<CGTrending> {
  return cgFetch<CGTrending>("/search/trending", "trending", TTL.TRENDING);
}

export async function getCoinDetail(id: string): Promise<CGCoinDetail> {
  return cgFetch<CGCoinDetail>(
    `/coins/${id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`,
    `coin-detail-${id}`,
    TTL.CRYPTO_PRICES
  );
}

export async function getCoinHistory(id: string, days: number): Promise<CGMarketChart> {
  return cgFetch<CGMarketChart>(
    `/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=${days <= 1 ? "hourly" : "daily"}`,
    `coin-history-${id}-${days}`,
    TTL.HISTORY
  );
}
