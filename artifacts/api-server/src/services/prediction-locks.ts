import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import { client, MODEL } from "./ai.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const DATA_FILE = join(DATA_DIR, "prediction-locks.json");

// ─── Types ────────────────────────────────────────────────────────────────────

export type LockDirection = "LONG" | "SHORT";
export type LockResult = "WIN" | "LOSS" | "NEUTRAL";
export type LockStatus = "active" | "validated" | "expired";
export type LockDuration = 15 | 60 | 180 | 360 | 720 | 1440; // minutes

export interface LockedPrediction {
  id: string;
  assetId: string;
  assetName: string;
  assetType: "crypto" | "stock";
  symbol: string;
  image: string | null;
  direction: LockDirection;
  entryPrice: number;
  lockedAt: number;
  lockDurationMs: number;
  expiresAt: number;
  confidence: number;
  signal: string;
  reasoning: string[];
  strategy: string;
  status: LockStatus;
  result: LockResult | null;
  finalPrice: number | null;
  priceDeltaPct: number | null;
  virtualPnl: number | null;
  maxDrawdown: number | null;
  marketVolatility: string | null;
  validatedAt: number | null;
  aiLearning: string | null;
}

export interface LockStats {
  total: number;
  active: number;
  wins: number;
  losses: number;
  neutrals: number;
  winRate: number;
  totalVirtualPnl: number;
  avgConfidence: number;
  bestStreak: number;
  currentStreak: number;
  avgPnlOnWin: number;
  avgPnlOnLoss: number;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

let locks: Map<string, LockedPrediction> = new Map();

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadFromDisk() {
  try {
    ensureDataDir();
    if (!existsSync(DATA_FILE)) return;
    const raw = readFileSync(DATA_FILE, "utf-8");
    const arr: LockedPrediction[] = JSON.parse(raw);
    locks = new Map(arr.map((l) => [l.id, l]));
    logger.info({ count: locks.size }, "Prediction locks loaded from disk");
  } catch (err) {
    logger.warn({ err }, "Failed to load prediction locks from disk");
  }
}

function saveToDisk() {
  try {
    ensureDataDir();
    const arr = Array.from(locks.values());
    writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to save prediction locks to disk");
  }
}

loadFromDisk();

// ─── Price fetching ───────────────────────────────────────────────────────────

async function fetchCurrentPrice(assetId: string, assetType: "crypto" | "stock", symbol: string): Promise<number | null> {
  try {
    if (assetType === "crypto") {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(assetId)}&vs_currencies=usd`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) {
        // Fallback: try Bybit
        const sym = symbol.replace("/", "") + "USDT";
        const bybitRes = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`);
        if (!bybitRes.ok) return null;
        const bData = await bybitRes.json() as { retCode: number; result: { list: { lastPrice: string }[] } };
        if (bData.retCode !== 0 || !bData.result.list[0]) return null;
        return parseFloat(bData.result.list[0].lastPrice);
      }
      const data = await res.json() as Record<string, { usd: number }>;
      return data[assetId]?.usd ?? null;
    } else {
      // For stocks use a simple price endpoint
      const sym = encodeURIComponent(symbol);
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&range=1d`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) return null;
      const data = await res.json() as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } };
      return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    }
  } catch (err) {
    logger.warn({ err, assetId }, "Failed to fetch current price for validation");
    return null;
  }
}

// ─── AI Self-Learning ─────────────────────────────────────────────────────────

async function generateAILearning(lock: LockedPrediction, finalPrice: number): Promise<string> {
  try {
    const delta = lock.priceDeltaPct?.toFixed(2) ?? "0";
    const result = lock.result ?? "NEUTRAL";

    const prompt = `Sebagai institutional trader elite, analisis hasil prediksi berikut dan berikan pembelajaran:

PREDIKSI:
- Aset: ${lock.assetName} (${lock.symbol})
- Arah: ${lock.direction} (${lock.direction === "LONG" ? "ekspektasi naik" : "ekspektasi turun"})
- Harga Entry: ${lock.entryPrice.toFixed(6)}
- Harga Akhir: ${finalPrice.toFixed(6)}
- Perubahan: ${delta}%
- Confidence: ${lock.confidence}%
- Durasi: ${Math.round(lock.lockDurationMs / 60000)} menit
- Sinyal: ${lock.signal}
- Reasoning awal: ${lock.reasoning.slice(0, 3).join("; ")}

HASIL: ${result} (${result === "WIN" ? "Prediksi benar" : result === "LOSS" ? "Prediksi salah" : "Netral/tidak signifikan"})

Berikan analisis pembelajaran dalam 3-4 poin ringkas:
1. Mengapa prediksi ${result === "WIN" ? "berhasil" : result === "LOSS" ? "gagal" : "netral"}?
2. Kondisi pasar apa yang memengaruhi hasil?
3. Pelajaran untuk prediksi berikutnya (apa yang harus diperbaiki/dipertahankan)?
4. Confidence score ${lock.confidence}% — apakah tepat untuk setup ini?

Format: Poin-poin singkat, bahasa Indonesia, max 200 kata.`;

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Kamu adalah AI trading analyst yang belajar dari setiap prediksi. Berikan analisis singkat dan actionable." },
        { role: "user", content: prompt },
      ],
      max_tokens: 350,
      temperature: 0.5,
    });

    return response.choices[0]?.message?.content ?? "Analisis pembelajaran tidak tersedia.";
  } catch {
    return "Analisis pembelajaran tidak tersedia (AI offline).";
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

async function validateLock(lock: LockedPrediction): Promise<void> {
  const finalPrice = await fetchCurrentPrice(lock.assetId, lock.assetType, lock.symbol);
  if (finalPrice === null) {
    logger.warn({ id: lock.id, assetId: lock.assetId }, "Validation skipped: price unavailable");
    return;
  }

  const priceDeltaPct = ((finalPrice - lock.entryPrice) / lock.entryPrice) * 100;

  let result: LockResult;
  const NEUTRAL_THRESHOLD = 0.3; // < 0.3% movement = NEUTRAL
  if (Math.abs(priceDeltaPct) < NEUTRAL_THRESHOLD) {
    result = "NEUTRAL";
  } else if (lock.direction === "LONG") {
    result = priceDeltaPct > 0 ? "WIN" : "LOSS";
  } else {
    result = priceDeltaPct < 0 ? "WIN" : "LOSS";
  }

  // Virtual PnL: directional pct (positive for WIN, negative for LOSS)
  const virtualPnl = lock.direction === "LONG" ? priceDeltaPct : -priceDeltaPct;

  // Max drawdown approximation (worst case direction against trade)
  const maxDrawdown = result === "WIN" ? Math.min(0, virtualPnl * 0.3) : virtualPnl; // simplified

  // Market volatility estimate based on price movement
  const volatility = Math.abs(priceDeltaPct) > 5 ? "high" :
    Math.abs(priceDeltaPct) > 2 ? "medium" : "low";

  const updated: LockedPrediction = {
    ...lock,
    status: "validated",
    result,
    finalPrice,
    priceDeltaPct,
    virtualPnl,
    maxDrawdown,
    marketVolatility: volatility,
    validatedAt: Date.now(),
  };

  // Generate AI learning analysis
  updated.aiLearning = await generateAILearning(updated, finalPrice);

  locks.set(lock.id, updated);
  saveToDisk();
  logger.info({ id: lock.id, symbol: lock.symbol, result, priceDeltaPct: priceDeltaPct.toFixed(2) }, "Prediction validated");
}

// ─── Background auto-validator ────────────────────────────────────────────────

async function runAutoValidator() {
  const now = Date.now();
  const expired = Array.from(locks.values()).filter(
    (l) => l.status === "active" && l.expiresAt <= now
  );

  for (const lock of expired) {
    // Mark as expired first to prevent concurrent validation
    locks.set(lock.id, { ...lock, status: "expired" });
    try {
      await validateLock({ ...lock, status: "expired" });
    } catch (err) {
      logger.error({ err, id: lock.id }, "Auto-validation error");
    }
  }
}

// Run every 30 seconds
setInterval(() => {
  runAutoValidator().catch((err) => logger.error({ err }, "Auto-validator error"));
}, 30_000);

// ─── Public API ───────────────────────────────────────────────────────────────

export function createLock(data: {
  assetId: string;
  assetName: string;
  assetType: "crypto" | "stock";
  symbol: string;
  image: string | null;
  direction: LockDirection;
  entryPrice: number;
  lockDurationMinutes: LockDuration;
  confidence: number;
  signal: string;
  reasoning: string[];
  strategy: string;
}): LockedPrediction {
  const id = crypto.randomUUID();
  const now = Date.now();
  const lockDurationMs = data.lockDurationMinutes * 60 * 1000;

  const lock: LockedPrediction = {
    id,
    assetId: data.assetId,
    assetName: data.assetName,
    assetType: data.assetType,
    symbol: data.symbol,
    image: data.image,
    direction: data.direction,
    entryPrice: data.entryPrice,
    lockedAt: now,
    lockDurationMs,
    expiresAt: now + lockDurationMs,
    confidence: data.confidence,
    signal: data.signal,
    reasoning: data.reasoning,
    strategy: data.strategy,
    status: "active",
    result: null,
    finalPrice: null,
    priceDeltaPct: null,
    virtualPnl: null,
    maxDrawdown: null,
    marketVolatility: null,
    validatedAt: null,
    aiLearning: null,
  };

  locks.set(id, lock);
  saveToDisk();
  logger.info({ id, symbol: data.symbol, direction: data.direction, lockDurationMinutes: data.lockDurationMinutes }, "Prediction locked");
  return lock;
}

export function getAllLocks(): LockedPrediction[] {
  return Array.from(locks.values()).sort((a, b) => b.lockedAt - a.lockedAt);
}

export function getLockById(id: string): LockedPrediction | undefined {
  return locks.get(id);
}

export async function forceValidate(id: string): Promise<LockedPrediction | null> {
  const lock = locks.get(id);
  if (!lock) return null;
  if (lock.status === "validated") return lock;
  await validateLock(lock);
  return locks.get(id) ?? null;
}

export function deleteLock(id: string): boolean {
  const existed = locks.has(id);
  locks.delete(id);
  if (existed) saveToDisk();
  return existed;
}

export function getStats(): LockStats {
  const all = Array.from(locks.values());
  const validated = all.filter((l) => l.status === "validated");
  const active = all.filter((l) => l.status === "active");
  const wins = validated.filter((l) => l.result === "WIN");
  const losses = validated.filter((l) => l.result === "LOSS");
  const neutrals = validated.filter((l) => l.result === "NEUTRAL");

  const totalVirtualPnl = validated.reduce((sum, l) => sum + (l.virtualPnl ?? 0), 0);
  const avgConfidence = all.length > 0
    ? all.reduce((sum, l) => sum + l.confidence, 0) / all.length
    : 0;

  // Calculate streaks
  const sortedValidated = [...validated].sort((a, b) => (b.validatedAt ?? 0) - (a.validatedAt ?? 0));
  let currentStreak = 0;
  let bestStreak = 0;
  let streak = 0;
  let streakType: LockResult | null = null;

  for (const v of sortedValidated) {
    if (v.result === streakType) {
      streak++;
    } else {
      bestStreak = Math.max(bestStreak, streak);
      streak = 1;
      streakType = v.result;
    }
  }
  bestStreak = Math.max(bestStreak, streak);
  currentStreak = sortedValidated.length > 0 ? streak : 0;

  const avgPnlOnWin = wins.length > 0
    ? wins.reduce((sum, l) => sum + (l.virtualPnl ?? 0), 0) / wins.length
    : 0;
  const avgPnlOnLoss = losses.length > 0
    ? losses.reduce((sum, l) => sum + (l.virtualPnl ?? 0), 0) / losses.length
    : 0;

  return {
    total: all.length,
    active: active.length,
    wins: wins.length,
    losses: losses.length,
    neutrals: neutrals.length,
    winRate: validated.length > 0 ? (wins.length / validated.length) * 100 : 0,
    totalVirtualPnl,
    avgConfidence,
    bestStreak,
    currentStreak,
    avgPnlOnWin,
    avgPnlOnLoss,
  };
}
