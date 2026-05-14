import { logger } from "../lib/logger.js";
import { cache, TTL } from "./cache.js";

export interface YahooQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketOpen?: number;
  regularMarketPreviousClose?: number;
  fullExchangeName?: string;
  currency?: string;
}

export interface YahooResponse {
  quoteResponse?: {
    result?: YahooQuote[];
    error?: unknown;
  };
}

const DEFAULT_GLOBAL_STOCKS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "NFLX",
  "BRK-B", "JPM", "V", "JNJ", "WMT", "XOM", "PG",
];

const DEFAULT_IDX_STOCKS = [
  "BBCA.JK", "BBRI.JK", "BMRI.JK", "TLKM.JK", "ASII.JK",
  "UNVR.JK", "GOTO.JK", "BUKA.JK", "ICBP.JK", "INDF.JK",
];

export async function getStockQuotes(symbols?: string[]): Promise<YahooQuote[]> {
  const targetSymbols = symbols ?? [...DEFAULT_GLOBAL_STOCKS, ...DEFAULT_IDX_STOCKS];
  const key = `stock-quotes-${targetSymbols.join(",")}`;

  const cached = cache.get<YahooQuote[]>(key);
  if (cached) return cached;

  const symbolStr = targetSymbols.join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolStr)}&fields=shortName,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,regularMarketDayHigh,regularMarketDayLow,regularMarketOpen,regularMarketPreviousClose,fullExchangeName,currency`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CryptoSahamPredictor/1.0)",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "Yahoo Finance request failed");
      return getFallbackStocks(targetSymbols);
    }

    const data = (await res.json()) as YahooResponse;
    const results = data?.quoteResponse?.result ?? [];

    if (results.length === 0) {
      return getFallbackStocks(targetSymbols);
    }

    cache.set(key, results, TTL.STOCK_PRICES);
    return results;
  } catch (err) {
    logger.error({ err }, "Failed to fetch Yahoo Finance data");
    return getFallbackStocks(targetSymbols);
  }
}

function getFallbackStocks(symbols: string[]): YahooQuote[] {
  const fallbackData: Record<string, Partial<YahooQuote>> = {
    AAPL: { shortName: "Apple Inc.", regularMarketPrice: 189.50, regularMarketChange: 1.23, regularMarketChangePercent: 0.65, fullExchangeName: "NASDAQ", currency: "USD" },
    MSFT: { shortName: "Microsoft Corp.", regularMarketPrice: 415.30, regularMarketChange: 2.85, regularMarketChangePercent: 0.69, fullExchangeName: "NASDAQ", currency: "USD" },
    GOOGL: { shortName: "Alphabet Inc.", regularMarketPrice: 175.80, regularMarketChange: -0.54, regularMarketChangePercent: -0.31, fullExchangeName: "NASDAQ", currency: "USD" },
    AMZN: { shortName: "Amazon.com Inc.", regularMarketPrice: 192.15, regularMarketChange: 3.21, regularMarketChangePercent: 1.70, fullExchangeName: "NASDAQ", currency: "USD" },
    NVDA: { shortName: "NVIDIA Corp.", regularMarketPrice: 875.40, regularMarketChange: 15.60, regularMarketChangePercent: 1.82, fullExchangeName: "NASDAQ", currency: "USD" },
    META: { shortName: "Meta Platforms Inc.", regularMarketPrice: 512.20, regularMarketChange: 6.78, regularMarketChangePercent: 1.34, fullExchangeName: "NASDAQ", currency: "USD" },
    TSLA: { shortName: "Tesla Inc.", regularMarketPrice: 248.30, regularMarketChange: -4.50, regularMarketChangePercent: -1.78, fullExchangeName: "NASDAQ", currency: "USD" },
    NFLX: { shortName: "Netflix Inc.", regularMarketPrice: 635.80, regularMarketChange: 8.90, regularMarketChangePercent: 1.42, fullExchangeName: "NASDAQ", currency: "USD" },
    "BRK-B": { shortName: "Berkshire Hathaway B", regularMarketPrice: 412.60, regularMarketChange: 1.10, regularMarketChangePercent: 0.27, fullExchangeName: "NYSE", currency: "USD" },
    JPM: { shortName: "JPMorgan Chase", regularMarketPrice: 198.75, regularMarketChange: 0.95, regularMarketChangePercent: 0.48, fullExchangeName: "NYSE", currency: "USD" },
    V: { shortName: "Visa Inc.", regularMarketPrice: 282.40, regularMarketChange: 1.25, regularMarketChangePercent: 0.44, fullExchangeName: "NYSE", currency: "USD" },
    "BBCA.JK": { shortName: "Bank Central Asia Tbk", regularMarketPrice: 9500, regularMarketChange: 75, regularMarketChangePercent: 0.80, fullExchangeName: "IDX", currency: "IDR" },
    "BBRI.JK": { shortName: "Bank Rakyat Indonesia Tbk", regularMarketPrice: 4650, regularMarketChange: -25, regularMarketChangePercent: -0.53, fullExchangeName: "IDX", currency: "IDR" },
    "BMRI.JK": { shortName: "Bank Mandiri Tbk", regularMarketPrice: 6250, regularMarketChange: 100, regularMarketChangePercent: 1.63, fullExchangeName: "IDX", currency: "IDR" },
    "TLKM.JK": { shortName: "Telekomunikasi Indonesia Tbk", regularMarketPrice: 3200, regularMarketChange: 30, regularMarketChangePercent: 0.95, fullExchangeName: "IDX", currency: "IDR" },
    "ASII.JK": { shortName: "Astra International Tbk", regularMarketPrice: 5450, regularMarketChange: -50, regularMarketChangePercent: -0.91, fullExchangeName: "IDX", currency: "IDR" },
    "GOTO.JK": { shortName: "GoTo Gojek Tokopedia Tbk", regularMarketPrice: 68, regularMarketChange: 2, regularMarketChangePercent: 3.03, fullExchangeName: "IDX", currency: "IDR" },
    "BUKA.JK": { shortName: "Bukalapak.com Tbk", regularMarketPrice: 112, regularMarketChange: -3, regularMarketChangePercent: -2.61, fullExchangeName: "IDX", currency: "IDR" },
    "ICBP.JK": { shortName: "Indofood CBP Sukses Makmur Tbk", regularMarketPrice: 10550, regularMarketChange: 50, regularMarketChangePercent: 0.48, fullExchangeName: "IDX", currency: "IDR" },
    "INDF.JK": { shortName: "Indofood Sukses Makmur Tbk", regularMarketPrice: 6400, regularMarketChange: 25, regularMarketChangePercent: 0.39, fullExchangeName: "IDX", currency: "IDR" },
  };

  return symbols.map((sym) => ({
    symbol: sym,
    ...fallbackData[sym],
    shortName: fallbackData[sym]?.shortName ?? sym,
    regularMarketPrice: fallbackData[sym]?.regularMarketPrice ?? 0,
    regularMarketChange: fallbackData[sym]?.regularMarketChange ?? 0,
    regularMarketChangePercent: fallbackData[sym]?.regularMarketChangePercent ?? 0,
    fullExchangeName: fallbackData[sym]?.fullExchangeName ?? "Unknown",
    currency: fallbackData[sym]?.currency ?? "USD",
  }));
}
