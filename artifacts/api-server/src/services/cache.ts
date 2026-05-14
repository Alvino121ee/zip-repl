interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class InMemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Returns the expiry timestamp (ms since epoch) for a key, or null if not cached */
  getExpiresAt(key: string): number | null {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.expiresAt;
  }
}

export const cache = new InMemoryCache();

/** Duration that AI predictions are "locked" before recalculating (ms) */
export const PREDICTION_LOCK_MS = 5 * 60 * 1000; // 5 minutes

export const TTL = {
  CRYPTO_PRICES: 10_000,
  STOCK_PRICES: 10_000,
  MARKET_OVERVIEW: 15_000,
  TRENDING: 30_000,
  NEWS: 300_000,
  PREDICTIONS: PREDICTION_LOCK_MS,
  HISTORY: 300_000,
};
