import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import { learnFromOutcome, detectMarketCondition } from "./ai-brain.js";

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

function generateAILearning(lock: LockedPrediction, finalPrice: number): string {
  const delta = lock.priceDeltaPct?.toFixed(2) ?? "0";
  const result = lock.result ?? "NEUTRAL";
  const dir = lock.direction === "LONG" ? "LONG (beli)" : "SHORT (jual)";

  const condition = detectMarketCondition({ priceChange24h: lock.priceDeltaPct ?? 0 });

  // Kirim ke brain untuk belajar
  learnFromOutcome({
    id: lock.id,
    symbol: lock.symbol,
    direction: lock.direction,
    confidence: lock.confidence,
    signal: lock.signal,
    result: result as "WIN" | "LOSS" | "NEUTRAL",
    priceDeltaPct: lock.priceDeltaPct ?? 0,
    reasoning: lock.reasoning,
    indicatorsActive: extractIndicatorsFromReasoning(lock.reasoning),
    condition,
    strategy: lock.strategy,
    virtualPnl: lock.virtualPnl ?? 0,
  });

  // Buat teks pembelajaran dari brain
  const lines: string[] = [];
  lines.push(`📚 **Pembelajaran Brain — ${lock.assetName} (${lock.symbol})**`);
  lines.push(`Prediksi ${dir} | Entry: ${lock.entryPrice.toFixed(6)} → Akhir: ${finalPrice.toFixed(6)} | Δ ${delta}%`);
  lines.push(`Hasil: **${result === "WIN" ? "✅ WIN" : result === "LOSS" ? "❌ LOSS" : "➖ NETRAL"}**`);
  lines.push(``);

  if (result === "WIN") {
    lines.push(`1. Prediksi benar — pasar bergerak sesuai arah ${dir}.`);
    lines.push(`2. Confidence ${lock.confidence}% terbukti akurat untuk setup ini.`);
    lines.push(`3. Pertahankan: konfirmasi sinyal ${lock.signal.replace(/_/g, " ")} di kondisi serupa.`);
    lines.push(`4. Brain mencatat pola sukses ini untuk digunakan kembali.`);
  } else if (result === "LOSS") {
    lines.push(`1. Prediksi salah — pasar bergerak ${Math.abs(parseFloat(delta)).toFixed(2)}% berlawanan arah.`);
    lines.push(`2. Kondisi ${condition.replace(/_/g, " ")} kemungkinan tidak ideal untuk ${dir}.`);
    lines.push(`3. Perbaikan: perkuat konfirmasi multi-timeframe dan volume sebelum entry.`);
    lines.push(`4. Brain mengurangi bobot indikator yang berkontribusi pada prediksi ini.`);
  } else {
    lines.push(`1. Pergerakan ${Math.abs(parseFloat(delta)).toFixed(2)}% terlalu kecil untuk dikonfirmasi.`);
    lines.push(`2. Timing entry perlu diperbaiki — tunggu breakout yang lebih jelas.`);
    lines.push(`3. Confidence ${lock.confidence}% mungkin terlalu tinggi untuk setup tanpa momentum.`);
    lines.push(`4. Brain mencatat: kondisi sideways memerlukan konfirmasi volume lebih kuat.`);
  }

  return lines.join("\n");
}

function extractIndicatorsFromReasoning(reasoning: string[]): string[] {
  const indicators: string[] = [];
  const text = reasoning.join(" ").toLowerCase();
  if (text.includes("rsi") && (text.includes("oversold") || text.includes("< 30"))) indicators.push("rsi_oversold");
  if (text.includes("rsi") && (text.includes("overbought") || text.includes("> 70"))) indicators.push("rsi_overbought");
  if (text.includes("ema") && text.includes("golden")) indicators.push("ema_golden_cross");
  if (text.includes("ema") && text.includes("death")) indicators.push("ema_death_cross");
  if (text.includes("macd") && text.includes("bull")) indicators.push("macd_bullish");
  if (text.includes("macd") && text.includes("bear")) indicators.push("macd_bearish");
  if (text.includes("volume")) indicators.push("volume_spike");
  if (text.includes("bos") || text.includes("break of structure")) indicators.push("bos_bullish");
  if (text.includes("order block")) indicators.push("order_block_demand");
  if (text.includes("fvg") || text.includes("fair value")) indicators.push("fvg_bullish");
  if (text.includes("vwap")) indicators.push("vwap_above");
  if (text.includes("multi") && text.includes("timeframe")) indicators.push("multi_tf_aligned");
  if (indicators.length === 0) indicators.push("momentum_strong");
  return indicators;
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

  // Brain belajar dari hasil — sinkron, tidak perlu await
  updated.aiLearning = generateAILearning(updated, finalPrice);

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
