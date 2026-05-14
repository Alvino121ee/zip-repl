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

export const IDX_STOCKS = [
  "BBCA.JK", "BBRI.JK", "BMRI.JK", "BBNI.JK", "BNGA.JK",
  "TLKM.JK", "EXCL.JK", "ISAT.JK",
  "ASII.JK", "AALI.JK",
  "UNVR.JK", "ICBP.JK", "INDF.JK", "MYOR.JK", "HMSP.JK", "GGRM.JK",
  "GOTO.JK", "BUKA.JK", "EMTK.JK",
  "KLBF.JK", "SIDO.JK",
  "ANTM.JK", "ADRO.JK", "PTBA.JK", "INCO.JK", "TINS.JK", "MDKA.JK",
  "PGAS.JK", "MEDC.JK",
  "SMGR.JK",
  "BBTN.JK", "BRIS.JK",
];

const FALLBACK_IDX: Record<string, Partial<YahooQuote>> = {
  "BBCA.JK":  { shortName: "Bank Central Asia Tbk",          regularMarketPrice: 9350,  regularMarketChange: 75,   regularMarketChangePercent: 0.81,  regularMarketVolume: 18_500_000, marketCap: 1_145_000_000_000_000, regularMarketDayHigh: 9400,  regularMarketDayLow: 9275,  fullExchangeName: "IDX", currency: "IDR" },
  "BBRI.JK":  { shortName: "Bank Rakyat Indonesia Tbk",      regularMarketPrice: 4500,  regularMarketChange: -30,  regularMarketChangePercent: -0.66, regularMarketVolume: 52_000_000, marketCap: 552_000_000_000_000,   regularMarketDayHigh: 4550,  regularMarketDayLow: 4475,  fullExchangeName: "IDX", currency: "IDR" },
  "BMRI.JK":  { shortName: "Bank Mandiri Tbk",               regularMarketPrice: 5950,  regularMarketChange: 100,  regularMarketChangePercent: 1.71,  regularMarketVolume: 32_000_000, marketCap: 554_000_000_000_000,   regularMarketDayHigh: 5975,  regularMarketDayLow: 5850,  fullExchangeName: "IDX", currency: "IDR" },
  "BBNI.JK":  { shortName: "Bank Negara Indonesia Tbk",      regularMarketPrice: 4940,  regularMarketChange: 20,   regularMarketChangePercent: 0.41,  regularMarketVolume: 14_000_000, marketCap: 184_000_000_000_000,   regularMarketDayHigh: 4960,  regularMarketDayLow: 4900,  fullExchangeName: "IDX", currency: "IDR" },
  "BNGA.JK":  { shortName: "Bank CIMB Niaga Tbk",            regularMarketPrice: 1580,  regularMarketChange: -10,  regularMarketChangePercent: -0.63, regularMarketVolume: 7_000_000,  marketCap: 38_000_000_000_000,    regularMarketDayHigh: 1600,  regularMarketDayLow: 1570,  fullExchangeName: "IDX", currency: "IDR" },
  "TLKM.JK":  { shortName: "Telekomunikasi Indonesia Tbk",   regularMarketPrice: 3100,  regularMarketChange: 30,   regularMarketChangePercent: 0.98,  regularMarketVolume: 45_000_000, marketCap: 306_000_000_000_000,   regularMarketDayHigh: 3120,  regularMarketDayLow: 3075,  fullExchangeName: "IDX", currency: "IDR" },
  "EXCL.JK":  { shortName: "XL Axiata Tbk",                  regularMarketPrice: 2340,  regularMarketChange: -20,  regularMarketChangePercent: -0.85, regularMarketVolume: 10_000_000, marketCap: 25_000_000_000_000,    regularMarketDayHigh: 2380,  regularMarketDayLow: 2320,  fullExchangeName: "IDX", currency: "IDR" },
  "ISAT.JK":  { shortName: "Indosat Tbk",                    regularMarketPrice: 11800, regularMarketChange: 200,  regularMarketChangePercent: 1.72,  regularMarketVolume: 5_000_000,  marketCap: 66_000_000_000_000,    regularMarketDayHigh: 11900, regularMarketDayLow: 11650, fullExchangeName: "IDX", currency: "IDR" },
  "ASII.JK":  { shortName: "Astra International Tbk",        regularMarketPrice: 5225,  regularMarketChange: -50,  regularMarketChangePercent: -0.95, regularMarketVolume: 28_000_000, marketCap: 211_000_000_000_000,   regularMarketDayHigh: 5300,  regularMarketDayLow: 5200,  fullExchangeName: "IDX", currency: "IDR" },
  "AALI.JK":  { shortName: "Astra Agro Lestari Tbk",         regularMarketPrice: 15750, regularMarketChange: 150,  regularMarketChangePercent: 0.96,  regularMarketVolume: 1_200_000,  marketCap: 25_000_000_000_000,    regularMarketDayHigh: 15800, regularMarketDayLow: 15600, fullExchangeName: "IDX", currency: "IDR" },
  "UNVR.JK":  { shortName: "Unilever Indonesia Tbk",         regularMarketPrice: 2740,  regularMarketChange: -10,  regularMarketChangePercent: -0.36, regularMarketVolume: 9_000_000,  marketCap: 104_000_000_000_000,   regularMarketDayHigh: 2760,  regularMarketDayLow: 2720,  fullExchangeName: "IDX", currency: "IDR" },
  "ICBP.JK":  { shortName: "Indofood CBP Sukses Makmur Tbk", regularMarketPrice: 10400, regularMarketChange: 50,   regularMarketChangePercent: 0.48,  regularMarketVolume: 5_000_000,  marketCap: 121_000_000_000_000,   regularMarketDayHigh: 10450, regularMarketDayLow: 10350, fullExchangeName: "IDX", currency: "IDR" },
  "INDF.JK":  { shortName: "Indofood Sukses Makmur Tbk",     regularMarketPrice: 6375,  regularMarketChange: 25,   regularMarketChangePercent: 0.39,  regularMarketVolume: 8_000_000,  marketCap: 56_000_000_000_000,    regularMarketDayHigh: 6400,  regularMarketDayLow: 6325,  fullExchangeName: "IDX", currency: "IDR" },
  "MYOR.JK":  { shortName: "Mayora Indah Tbk",               regularMarketPrice: 2790,  regularMarketChange: 30,   regularMarketChangePercent: 1.09,  regularMarketVolume: 4_000_000,  marketCap: 62_000_000_000_000,    regularMarketDayHigh: 2820,  regularMarketDayLow: 2760,  fullExchangeName: "IDX", currency: "IDR" },
  "HMSP.JK":  { shortName: "HM Sampoerna Tbk",               regularMarketPrice: 750,   regularMarketChange: -5,   regularMarketChangePercent: -0.66, regularMarketVolume: 20_000_000, marketCap: 87_000_000_000_000,    regularMarketDayHigh: 760,   regularMarketDayLow: 745,   fullExchangeName: "IDX", currency: "IDR" },
  "GGRM.JK":  { shortName: "Gudang Garam Tbk",               regularMarketPrice: 19750, regularMarketChange: -250, regularMarketChangePercent: -1.25, regularMarketVolume: 800_000,    marketCap: 38_000_000_000_000,    regularMarketDayHigh: 20000, regularMarketDayLow: 19700, fullExchangeName: "IDX", currency: "IDR" },
  "GOTO.JK":  { shortName: "GoTo Gojek Tokopedia Tbk",       regularMarketPrice: 68,    regularMarketChange: 2,    regularMarketChangePercent: 3.03,  regularMarketVolume: 850_000_000, marketCap: 73_000_000_000_000,   regularMarketDayHigh: 70,    regularMarketDayLow: 66,    fullExchangeName: "IDX", currency: "IDR" },
  "BUKA.JK":  { shortName: "Bukalapak.com Tbk",              regularMarketPrice: 108,   regularMarketChange: -4,   regularMarketChangePercent: -3.57, regularMarketVolume: 200_000_000, marketCap: 11_000_000_000_000,   regularMarketDayHigh: 114,   regularMarketDayLow: 106,   fullExchangeName: "IDX", currency: "IDR" },
  "EMTK.JK":  { shortName: "Elang Mahkota Teknologi Tbk",    regularMarketPrice: 670,   regularMarketChange: 10,   regularMarketChangePercent: 1.51,  regularMarketVolume: 6_000_000,  marketCap: 30_000_000_000_000,    regularMarketDayHigh: 680,   regularMarketDayLow: 660,   fullExchangeName: "IDX", currency: "IDR" },
  "KLBF.JK":  { shortName: "Kalbe Farma Tbk",                regularMarketPrice: 1740,  regularMarketChange: 10,   regularMarketChangePercent: 0.58,  regularMarketVolume: 12_000_000, marketCap: 81_000_000_000_000,    regularMarketDayHigh: 1760,  regularMarketDayLow: 1725,  fullExchangeName: "IDX", currency: "IDR" },
  "SIDO.JK":  { shortName: "Industri Jamu Sido Muncul Tbk",  regularMarketPrice: 620,   regularMarketChange: 5,    regularMarketChangePercent: 0.81,  regularMarketVolume: 5_000_000,  marketCap: 18_600_000_000_000,    regularMarketDayHigh: 625,   regularMarketDayLow: 615,   fullExchangeName: "IDX", currency: "IDR" },
  "ANTM.JK":  { shortName: "Aneka Tambang Tbk",              regularMarketPrice: 1760,  regularMarketChange: 30,   regularMarketChangePercent: 1.73,  regularMarketVolume: 35_000_000, marketCap: 42_000_000_000_000,    regularMarketDayHigh: 1790,  regularMarketDayLow: 1730,  fullExchangeName: "IDX", currency: "IDR" },
  "ADRO.JK":  { shortName: "Adaro Energy Indonesia Tbk",     regularMarketPrice: 2040,  regularMarketChange: -20,  regularMarketChangePercent: -0.97, regularMarketVolume: 18_000_000, marketCap: 64_000_000_000_000,    regularMarketDayHigh: 2080,  regularMarketDayLow: 2030,  fullExchangeName: "IDX", currency: "IDR" },
  "PTBA.JK":  { shortName: "Bukit Asam Tbk",                 regularMarketPrice: 3050,  regularMarketChange: 50,   regularMarketChangePercent: 1.67,  regularMarketVolume: 10_000_000, marketCap: 35_000_000_000_000,    regularMarketDayHigh: 3075,  regularMarketDayLow: 3000,  fullExchangeName: "IDX", currency: "IDR" },
  "INCO.JK":  { shortName: "Vale Indonesia Tbk",             regularMarketPrice: 2900,  regularMarketChange: 40,   regularMarketChangePercent: 1.40,  regularMarketVolume: 7_000_000,  marketCap: 28_000_000_000_000,    regularMarketDayHigh: 2930,  regularMarketDayLow: 2860,  fullExchangeName: "IDX", currency: "IDR" },
  "TINS.JK":  { shortName: "Timah Tbk",                      regularMarketPrice: 1185,  regularMarketChange: -15,  regularMarketChangePercent: -1.25, regularMarketVolume: 15_000_000, marketCap: 8_800_000_000_000,     regularMarketDayHigh: 1210,  regularMarketDayLow: 1175,  fullExchangeName: "IDX", currency: "IDR" },
  "MDKA.JK":  { shortName: "Merdeka Copper Gold Tbk",        regularMarketPrice: 2120,  regularMarketChange: 30,   regularMarketChangePercent: 1.44,  regularMarketVolume: 20_000_000, marketCap: 58_000_000_000_000,    regularMarketDayHigh: 2150,  regularMarketDayLow: 2090,  fullExchangeName: "IDX", currency: "IDR" },
  "PGAS.JK":  { shortName: "Perusahaan Gas Negara Tbk",      regularMarketPrice: 1490,  regularMarketChange: 10,   regularMarketChangePercent: 0.68,  regularMarketVolume: 22_000_000, marketCap: 36_000_000_000_000,    regularMarketDayHigh: 1510,  regularMarketDayLow: 1475,  fullExchangeName: "IDX", currency: "IDR" },
  "MEDC.JK":  { shortName: "Medco Energi Internasional Tbk", regularMarketPrice: 810,   regularMarketChange: 10,   regularMarketChangePercent: 1.25,  regularMarketVolume: 14_000_000, marketCap: 26_000_000_000_000,    regularMarketDayHigh: 820,   regularMarketDayLow: 800,   fullExchangeName: "IDX", currency: "IDR" },
  "SMGR.JK":  { shortName: "Semen Indonesia Tbk",            regularMarketPrice: 5350,  regularMarketChange: -75,  regularMarketChangePercent: -1.38, regularMarketVolume: 5_000_000,  marketCap: 31_000_000_000_000,    regularMarketDayHigh: 5450,  regularMarketDayLow: 5325,  fullExchangeName: "IDX", currency: "IDR" },
  "BBTN.JK":  { shortName: "Bank Tabungan Negara Tbk",       regularMarketPrice: 1390,  regularMarketChange: 10,   regularMarketChangePercent: 0.72,  regularMarketVolume: 16_000_000, marketCap: 14_700_000_000_000,    regularMarketDayHigh: 1410,  regularMarketDayLow: 1375,  fullExchangeName: "IDX", currency: "IDR" },
  "BRIS.JK":  { shortName: "Bank Syariah Indonesia Tbk",     regularMarketPrice: 2760,  regularMarketChange: 20,   regularMarketChangePercent: 0.73,  regularMarketVolume: 30_000_000, marketCap: 131_000_000_000_000,   regularMarketDayHigh: 2790,  regularMarketDayLow: 2740,  fullExchangeName: "IDX", currency: "IDR" },
};

async function fetchYahooV7(symbols: string[]): Promise<YahooQuote[] | null> {
  const symbolStr = symbols.join(",");
  const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolStr)}&fields=shortName,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,regularMarketDayHigh,regularMarketDayLow,regularMarketOpen,regularMarketPreviousClose,fullExchangeName,currency`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
        "Referer": "https://finance.yahoo.com/",
        "Origin": "https://finance.yahoo.com",
      },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Yahoo Finance v7 request failed");
      return null;
    }
    const data = (await res.json()) as YahooResponse;
    const results = data?.quoteResponse?.result ?? [];
    return results.length > 0 ? results : null;
  } catch (err) {
    logger.warn({ err }, "Yahoo Finance v7 fetch error");
    return null;
  }
}

async function fetchYahooV8Single(symbol: string): Promise<YahooQuote | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice as number;
    // chartPreviousClose is the reliable field in the v8 chart endpoint
    const closeArr: (number | null)[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const lastValidClose = [...closeArr].reverse().find((v) => typeof v === "number" && v !== null);
    const prevClose = (meta.chartPreviousClose ?? lastValidClose ?? price) as number;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return {
      symbol,
      shortName: meta.longName ?? meta.symbol,
      regularMarketPrice: price,
      regularMarketChange: change,
      regularMarketChangePercent: changePercent,
      regularMarketVolume: meta.regularMarketVolume as number | undefined,
      regularMarketDayHigh: meta.regularMarketDayHigh as number | undefined,
      regularMarketDayLow: meta.regularMarketDayLow as number | undefined,
      regularMarketPreviousClose: prevClose,
      fullExchangeName: meta.fullExchangeName ?? meta.exchangeName,
      currency: meta.currency,
    };
  } catch {
    return null;
  }
}

export async function getIDXStockQuotes(symbols?: string[]): Promise<YahooQuote[]> {
  const targetSymbols = symbols ?? IDX_STOCKS;
  const key = `idx-quotes-${targetSymbols.slice(0, 5).join(",")}`;
  const cached = cache.get<YahooQuote[]>(key);
  if (cached) return cached;

  // Try batch v7 first
  const v7 = await fetchYahooV7(targetSymbols);
  if (v7 && v7.length > 0) {
    cache.set(key, v7, TTL.STOCK_PRICES);
    return v7;
  }

  // Try v8 chart API for each symbol in parallel (batch of 10)
  logger.info("Falling back to Yahoo Finance v8 chart API for IDX stocks");
  const batches: string[][] = [];
  for (let i = 0; i < targetSymbols.length; i += 10) {
    batches.push(targetSymbols.slice(i, i + 10));
  }
  const results: YahooQuote[] = [];
  for (const batch of batches) {
    const batchResults = await Promise.all(batch.map(fetchYahooV8Single));
    results.push(...batchResults.filter((r): r is YahooQuote => r !== null));
  }

  if (results.length >= 5) {
    // Merge with fallback for any missing symbols
    const fetched = new Set(results.map((r) => r.symbol));
    for (const sym of targetSymbols) {
      if (!fetched.has(sym) && FALLBACK_IDX[sym]) {
        results.push(buildFallback(sym));
      }
    }
    const sorted = targetSymbols
      .map((s) => results.find((r) => r.symbol === s))
      .filter((r): r is YahooQuote => r !== undefined);
    cache.set(key, sorted, TTL.STOCK_PRICES);
    return sorted;
  }

  // Full fallback
  logger.warn("Using static fallback for IDX stocks");
  const fallback = buildFallbackList(targetSymbols);
  cache.set(key, fallback, TTL.STOCK_PRICES);
  return fallback;
}

function buildFallback(sym: string): YahooQuote {
  const fb = FALLBACK_IDX[sym] ?? {};
  return {
    symbol: sym,
    shortName: fb.shortName ?? sym,
    regularMarketPrice: fb.regularMarketPrice ?? 0,
    regularMarketChange: fb.regularMarketChange ?? 0,
    regularMarketChangePercent: fb.regularMarketChangePercent ?? 0,
    regularMarketVolume: fb.regularMarketVolume,
    marketCap: fb.marketCap,
    regularMarketDayHigh: fb.regularMarketDayHigh,
    regularMarketDayLow: fb.regularMarketDayLow,
    fullExchangeName: fb.fullExchangeName ?? "IDX",
    currency: fb.currency ?? "IDR",
  };
}

function buildFallbackList(symbols: string[]): YahooQuote[] {
  return symbols.map(buildFallback);
}

// Legacy compatibility — used by routes/market.ts for global stocks view
export async function getStockQuotes(symbols?: string[]): Promise<YahooQuote[]> {
  return getIDXStockQuotes(symbols);
}
