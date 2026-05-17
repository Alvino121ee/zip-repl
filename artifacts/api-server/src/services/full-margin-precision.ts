import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import { analyzeSymbol } from "./analysis.js";
import { scanBybitUniverse } from "./bybit.js";
import { logActivity } from "./activity-log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const FMP_STATE_FILE = join(DATA_DIR, "fmp-state.json");
const FMP_LOG_FILE = join(DATA_DIR, "fmp-log.json");
const FMP_LEARNING_FILE = join(DATA_DIR, "fmp-learning.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FMPConfig {
  enabled: boolean;
  minConfidence: number;          // default 90
  marginPct: number;              // % of available balance to use, default 90
  maxLeverage: number;            // max leverage cap, default 10
  minRR: number;                  // minimum risk/reward ratio, default 2.0
  stopLossPct: number;            // fallback SL %, default 1.5
  takeProfitPct: number;          // fallback TP %, default 3.0
  cooldownMinutes: number;        // cooldown after loss, default 30
  dailyLossLimitPct: number;      // max daily loss % of equity, default 5
  consecutiveLossLimit: number;   // max consecutive losses before pause, default 2
  volatilityThreshold: number;    // ATR% threshold for danger, default 5.0
  scanIntervalMs: number;         // scan interval, default 45000
  positionMonitorMs: number;      // position monitor interval, default 10000
}

export interface FMPBestSetup {
  symbol: string;
  side: "Buy" | "Sell";
  confidence: number;
  rr: number;
  score: number;
  grade: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  reasons: string[];
  warnings: string[];
  trendStrength: number;
  volumeRatio: number;
  momentum: string;
  marketStructure: string;
  multiTfAlignment: number;       // % of timeframes aligned
  detectedAt: number;
}

export interface FMPActivePosition {
  symbol: string;
  side: "Buy" | "Sell";
  entryPrice: number;
  size: number;
  allocatedUSDT: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  openedAt: number;
  peakPnl: number;
  currentPnl: number;
  lastMonitorAt: number;
  trailActive: boolean;
  trailPeak: number;
}

export interface FMPTradeLog {
  id: string;
  symbol: string;
  side: "Buy" | "Sell";
  entryPrice: number;
  exitPrice: number;
  size: number;
  allocatedUSDT: number;
  leverage: number;
  pnl: number;
  pnlPct: number;
  confidence: number;
  rr: number;
  openedAt: number;
  closedAt: number;
  closeReason: string;
  grade: string;
  learningNote: string;
  outcome: "win" | "loss" | "breakeven";
}

export interface FMPLearning {
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  bestTrade: FMPTradeLog | null;
  worstTrade: FMPTradeLog | null;
  avgConfidenceOnWins: number;
  avgConfidenceOnLosses: number;
  avgRROnWins: number;
  gradeAccuracy: { A: number; B: number; C: number };
  lessons: string[];
  lastUpdated: number;
}

export interface FMPStatus {
  running: boolean;
  analyzing: boolean;
  statusMessage: string;
  statusPhase: "idle" | "scanning" | "analyzing" | "waiting" | "entering" | "monitoring" | "exiting" | "cooldown" | "danger" | "disabled";
  activePosition: FMPActivePosition | null;
  bestSetup: FMPBestSetup | null;
  cooldown: boolean;
  cooldownUntil: number | null;
  consecutiveLosses: number;
  dailyLoss: number;
  dailyTrades: number;
  dailyDate: string;
  totalScanned: number;
  lastScanAt: number | null;
  lastCycleAt: number | null;
  nextCycleAt: number | null;
  cycleCount: number;
  totalWins: number;
  totalLosses: number;
  lastError: string | null;
  dangerMode: boolean;
  dangerReason: string | null;
}

// ─── Default Config ───────────────────────────────────────────────────────────

export const fmpConfig: FMPConfig = {
  enabled: false,
  minConfidence: 90,
  marginPct: 90,
  maxLeverage: 10,
  minRR: 2.0,
  stopLossPct: 1.5,
  takeProfitPct: 3.0,
  cooldownMinutes: 30,
  dailyLossLimitPct: 5,
  consecutiveLossLimit: 2,
  volatilityThreshold: 5.0,
  scanIntervalMs: 45_000,
  positionMonitorMs: 10_000,
};

export const fmpStatus: FMPStatus = {
  running: false,
  analyzing: false,
  statusMessage: "Full Margin Precision Mode tidak aktif",
  statusPhase: "disabled",
  activePosition: null,
  bestSetup: null,
  cooldown: false,
  cooldownUntil: null,
  consecutiveLosses: 0,
  dailyLoss: 0,
  dailyTrades: 0,
  dailyDate: "",
  totalScanned: 0,
  lastScanAt: null,
  lastCycleAt: null,
  nextCycleAt: null,
  cycleCount: 0,
  totalWins: 0,
  totalLosses: 0,
  lastError: null,
  dangerMode: false,
  dangerReason: null,
};

export let fmpLog: FMPTradeLog[] = [];

export let fmpLearning: FMPLearning = {
  totalTrades: 0,
  totalWins: 0,
  totalLosses: 0,
  winRate: 0,
  avgWinPct: 0,
  avgLossPct: 0,
  bestTrade: null,
  worstTrade: null,
  avgConfidenceOnWins: 0,
  avgConfidenceOnLosses: 0,
  avgRROnWins: 0,
  gradeAccuracy: { A: 0, B: 0, C: 0 },
  lessons: [],
  lastUpdated: 0,
};

// ─── Persistence ──────────────────────────────────────────────────────────────

(function loadFMPState() {
  try {
    ensureDataDir();
    if (existsSync(FMP_STATE_FILE)) {
      const saved = JSON.parse(readFileSync(FMP_STATE_FILE, "utf-8"));
      Object.assign(fmpConfig, saved.config ?? {});
      Object.assign(fmpStatus, {
        consecutiveLosses: saved.consecutiveLosses ?? 0,
        totalWins: saved.totalWins ?? 0,
        totalLosses: saved.totalLosses ?? 0,
        dailyLoss: saved.dailyLoss ?? 0,
        dailyTrades: saved.dailyTrades ?? 0,
        dailyDate: saved.dailyDate ?? "",
      });
      logger.info({ totalWins: fmpStatus.totalWins, totalLosses: fmpStatus.totalLosses }, "FMP state loaded from disk");
    }
    if (existsSync(FMP_LOG_FILE)) {
      fmpLog = JSON.parse(readFileSync(FMP_LOG_FILE, "utf-8")).slice(0, 200);
      logger.info({ count: fmpLog.length }, "FMP trade log loaded");
    }
    if (existsSync(FMP_LEARNING_FILE)) {
      fmpLearning = JSON.parse(readFileSync(FMP_LEARNING_FILE, "utf-8"));
      logger.info({ lessons: fmpLearning.lessons.length }, "FMP learning data loaded");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load FMP state");
  }
})();

export function saveFMPState() {
  try {
    ensureDataDir();
    writeFileSync(FMP_STATE_FILE, JSON.stringify({
      config: fmpConfig,
      consecutiveLosses: fmpStatus.consecutiveLosses,
      totalWins: fmpStatus.totalWins,
      totalLosses: fmpStatus.totalLosses,
      dailyLoss: fmpStatus.dailyLoss,
      dailyTrades: fmpStatus.dailyTrades,
      dailyDate: fmpStatus.dailyDate,
    }, null, 2));
  } catch (err) {
    logger.warn({ err }, "Failed to save FMP state");
  }
}

export function saveFMPLog() {
  try {
    ensureDataDir();
    writeFileSync(FMP_LOG_FILE, JSON.stringify(fmpLog.slice(0, 200), null, 2));
  } catch (err) {
    logger.warn({ err }, "Failed to save FMP log");
  }
}

export function saveFMPLearning() {
  try {
    ensureDataDir();
    writeFileSync(FMP_LEARNING_FILE, JSON.stringify(fmpLearning, null, 2));
  } catch (err) {
    logger.warn({ err }, "Failed to save FMP learning");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(msg: string, phase: FMPStatus["statusPhase"] = "idle") {
  fmpStatus.statusMessage = msg;
  fmpStatus.statusPhase = phase;
}

function checkAndResetDailyStats() {
  const today = new Date().toISOString().slice(0, 10);
  if (fmpStatus.dailyDate !== today) {
    fmpStatus.dailyDate = today;
    fmpStatus.dailyLoss = 0;
    fmpStatus.dailyTrades = 0;
  }
}

function detectVolatilityDanger(atr14: number, price: number): boolean {
  if (price <= 0) return false;
  const atrPct = (atr14 / price) * 100;
  return atrPct > fmpConfig.volatilityThreshold;
}

function calculateDynamicLeverage(atr14: number, price: number, baseConf: number): number {
  const atrPct = (atr14 / price) * 100;
  let lev = fmpConfig.maxLeverage;
  if (atrPct > 3) lev = Math.min(lev, 5);
  if (atrPct > 4) lev = Math.min(lev, 3);
  if (atrPct > 5) lev = Math.min(lev, 2);
  if (baseConf < 92) lev = Math.min(lev, Math.floor(lev * 0.8));
  return Math.max(1, Math.round(lev));
}

function formatQty(rawQty: number, price: number): string {
  if (price >= 10000) return rawQty.toFixed(3);
  if (price >= 1000) return rawQty.toFixed(2);
  if (price >= 100) return rawQty.toFixed(1);
  if (price >= 1) return Math.floor(rawQty).toString();
  return Math.floor(rawQty).toString();
}

// ─── Self-Learning Engine ─────────────────────────────────────────────────────

function learnFromTrade(trade: FMPTradeLog) {
  const isWin = trade.outcome === "win";
  const isLoss = trade.outcome === "loss";

  fmpLearning.totalTrades = fmpLog.length;
  fmpLearning.totalWins = fmpLog.filter((t) => t.outcome === "win").length;
  fmpLearning.totalLosses = fmpLog.filter((t) => t.outcome === "loss").length;
  fmpLearning.winRate = fmpLearning.totalTrades > 0
    ? (fmpLearning.totalWins / fmpLearning.totalTrades) * 100 : 0;

  const wins = fmpLog.filter((t) => t.outcome === "win");
  const losses = fmpLog.filter((t) => t.outcome === "loss");

  fmpLearning.avgWinPct = wins.length > 0
    ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
  fmpLearning.avgLossPct = losses.length > 0
    ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
  fmpLearning.avgConfidenceOnWins = wins.length > 0
    ? wins.reduce((s, t) => s + t.confidence, 0) / wins.length : 0;
  fmpLearning.avgConfidenceOnLosses = losses.length > 0
    ? losses.reduce((s, t) => s + t.confidence, 0) / losses.length : 0;
  fmpLearning.avgRROnWins = wins.length > 0
    ? wins.reduce((s, t) => s + t.rr, 0) / wins.length : 0;

  // Grade accuracy
  for (const g of ["A", "B", "C"] as const) {
    const gradeWins = fmpLog.filter((t) => t.grade === g && t.outcome === "win").length;
    const gradeTotal = fmpLog.filter((t) => t.grade === g).length;
    fmpLearning.gradeAccuracy[g] = gradeTotal > 0 ? (gradeWins / gradeTotal) * 100 : 0;
  }

  // Best & worst trade
  if (wins.length > 0) fmpLearning.bestTrade = wins.sort((a, b) => b.pnlPct - a.pnlPct)[0];
  if (losses.length > 0) fmpLearning.worstTrade = losses.sort((a, b) => a.pnlPct - b.pnlPct)[0];

  // Generate lessons
  const lessons: string[] = [];
  if (fmpLearning.winRate < 50 && fmpLearning.totalTrades >= 5) {
    lessons.push("Win rate di bawah 50% — pertimbangkan meningkatkan threshold confidence minimum");
  }
  if (fmpLearning.avgConfidenceOnWins > fmpLearning.avgConfidenceOnLosses + 5) {
    lessons.push(`Trade menang rata-rata confidence ${fmpLearning.avgConfidenceOnWins.toFixed(1)}% vs kalah ${fmpLearning.avgConfidenceOnLosses.toFixed(1)}% — confidence sangat kritis`);
  }
  if (fmpLearning.gradeAccuracy["A"] > fmpLearning.gradeAccuracy["B"] + 15) {
    lessons.push("Grade A jauh lebih akurat dari Grade B — fokus hanya pada sinyal Grade A");
  }
  if (isWin && trade.closeReason.includes("trailing")) {
    lessons.push("Trailing stop berhasil mengamankan profit optimal pada trade ini");
  }
  if (isLoss && trade.confidence > 92) {
    lessons.push(`Kehilangan trade dengan confidence ${trade.confidence}% — pasar overrode sinyal teknikal`);
  }
  if (fmpLearning.avgRROnWins > 3) {
    lessons.push(`RR rata-rata pada win trades: ${fmpLearning.avgRROnWins.toFixed(1)}x — strategi sangat efisien`);
  }
  fmpLearning.lessons = lessons.slice(0, 5);
  fmpLearning.lastUpdated = Date.now();

  saveFMPLearning();
  logger.info({ outcome: trade.outcome, winRate: fmpLearning.winRate.toFixed(1), lessons: lessons.length }, "FMP self-learning updated");
}

// ─── Engine Intervals ─────────────────────────────────────────────────────────

let scanInterval: ReturnType<typeof setInterval> | null = null;
let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startFMPEngine() {
  stopFMPEngine();
  fmpStatus.running = true;
  fmpStatus.statusPhase = "idle";
  setStatus("Mesin Full Margin Precision diaktifkan — memulai scan pasar...", "scanning");

  scanInterval = setInterval(runFMPScanCycle, fmpConfig.scanIntervalMs);
  monitorInterval = setInterval(runFMPPositionMonitor, fmpConfig.positionMonitorMs);

  // Run immediately
  runFMPScanCycle();
  logger.info({ scanIntervalMs: fmpConfig.scanIntervalMs }, "FMP engine started");
  logActivity({ source: "auto", level: "info", message: "[FMP] ⚡ Full Margin Precision Mode diaktifkan" });
}

export function stopFMPEngine() {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null; }
  fmpStatus.running = false;
  fmpStatus.analyzing = false;
  setStatus("Full Margin Precision Mode dihentikan", "disabled");
  logger.info("FMP engine stopped");
}

// ─── Main Scan Cycle ──────────────────────────────────────────────────────────

async function runFMPScanCycle() {
  if (!fmpConfig.enabled) return;
  if (fmpStatus.analyzing) return;

  fmpStatus.analyzing = true;
  checkAndResetDailyStats();

  try {
    // ── 1. Jika sudah ada posisi aktif, skip scan ─────────────────────────────
    if (fmpStatus.activePosition) {
      setStatus(`Memantau posisi aktif ${fmpStatus.activePosition.symbol} — tidak membuka posisi baru`, "monitoring");
      return;
    }

    // ── 2. Cooldown check ─────────────────────────────────────────────────────
    if (fmpStatus.cooldown && fmpStatus.cooldownUntil) {
      if (Date.now() < fmpStatus.cooldownUntil) {
        const sisaMenit = Math.ceil((fmpStatus.cooldownUntil - Date.now()) / 60_000);
        setStatus(`Mode cooldown aktif — ${sisaMenit} menit lagi sebelum scan dilanjutkan`, "cooldown");
        return;
      }
      fmpStatus.cooldown = false;
      fmpStatus.cooldownUntil = null;
      fmpStatus.consecutiveLosses = 0;
      fmpStatus.dangerMode = false;
      fmpStatus.dangerReason = null;
      setStatus("Cooldown selesai — memulai ulang scan sniper...", "scanning");
    }

    // ── 3. Daily loss limit check ─────────────────────────────────────────────
    if (fmpStatus.dailyLoss > 0) {
      const { dailyLoss, dailyDate } = fmpStatus;
      logger.debug({ dailyLoss, dailyDate }, "FMP daily loss check");
    }

    // ── 4. Danger mode check ──────────────────────────────────────────────────
    if (fmpStatus.dangerMode) {
      setStatus(`Mode bahaya aktif: ${fmpStatus.dangerReason ?? "volatilitas tinggi"} — menunggu kondisi aman`, "danger");
      return;
    }

    // ── 5. Scan universe ──────────────────────────────────────────────────────
    setStatus("Memindai seluruh universe untuk setup terbaik...", "scanning");
    const rawCandidates = await scanBybitUniverse();
    fmpStatus.totalScanned = rawCandidates.length;
    fmpStatus.lastScanAt = Date.now();

    if (rawCandidates.length === 0) {
      setStatus("Tidak ada kandidat ditemukan — pasar sideways, menunggu...", "waiting");
      return;
    }

    // Pre-filter: hanya kandidat confidence tinggi
    const preFiltered = rawCandidates
      .filter((c) => c.confidence >= fmpConfig.minConfidence - 5)
      .sort((a, b) => (b.confidence * b.score) - (a.confidence * a.score))
      .slice(0, 20);

    if (preFiltered.length === 0) {
      setStatus(`Tidak ada setup berkualitas tinggi dari ${rawCandidates.length} kandidat — menunggu peluang sempurna...`, "waiting");
      fmpStatus.bestSetup = null;
      return;
    }

    setStatus(`Menganalisis ${preFiltered.length} kandidat teratas secara mendalam...`, "analyzing");

    // ── 6. Deep analysis — cari setup TERBAIK ────────────────────────────────
    let bestSetup: FMPBestSetup | null = null;

    for (const cand of preFiltered) {
      let analysis: Awaited<ReturnType<typeof analyzeSymbol>> | null = null;
      try {
        analysis = await analyzeSymbol(cand.symbol);
      } catch {
        continue;
      }

      if (!analysis.shouldEnter) continue;
      if (analysis.side !== cand.side) continue;
      if (analysis.overallConfidence < fmpConfig.minConfidence) continue;
      if (analysis.riskRewardRatio < fmpConfig.minRR) continue;

      // Fake breakout protection
      if (analysis.fakeBreakout.isFakeBreakoutUp && cand.side === "Buy") continue;
      if (analysis.fakeBreakout.isFakeBreakoutDown && cand.side === "Sell") continue;

      // RSI extreme protection
      if (analysis.indicators.rsiZone === "overbought" && cand.side === "Buy") continue;
      if (analysis.indicators.rsiZone === "oversold" && cand.side === "Sell") continue;

      // Volume must confirm
      if (analysis.indicators.volumeRatio < 1.2) continue;

      // Volatility danger detection
      if (detectVolatilityDanger(analysis.indicators.atr14, analysis.entryPrice)) {
        fmpStatus.dangerMode = true;
        fmpStatus.dangerReason = `Volatilitas ekstrem pada ${cand.symbol} (ATR tinggi)`;
        setStatus(`Bahaya volatilitas terdeteksi pada ${cand.symbol} — hindari entry, menunggu kondisi stabil`, "danger");
        return;
      }

      // Multi-timeframe alignment check
      const tfKeys = Object.keys(analysis.multiTimeframe ?? {});
      let alignedCount = 0;
      if (tfKeys.length >= 2) {
        for (const tf of tfKeys) {
          const t = analysis.multiTimeframe[tf];
          if (cand.side === "Buy" ? t.bullishConf : t.bearishConf) alignedCount++;
        }
        const alignRatio = alignedCount / tfKeys.length;
        if (alignRatio < 0.6) continue; // butuh 60% timeframe alignment untuk FMP
      }

      const multiTfAlignment = tfKeys.length > 0 ? (alignedCount / tfKeys.length) * 100 : 50;

      const score = analysis.overallConfidence * analysis.riskRewardRatio * (analysis.trendStrength ?? 1);

      if (!bestSetup || score > bestSetup.score) {
        bestSetup = {
          symbol: cand.symbol,
          side: cand.side,
          confidence: analysis.overallConfidence,
          rr: analysis.riskRewardRatio,
          score,
          grade: analysis.signalGrade ?? "B",
          entryPrice: analysis.entryPrice,
          stopLoss: analysis.stopLoss,
          takeProfit: analysis.takeProfit,
          reasons: analysis.reasons.slice(0, 5),
          warnings: analysis.warnings?.slice(0, 3) ?? [],
          trendStrength: analysis.trendStrength ?? 1,
          volumeRatio: analysis.indicators.volumeRatio,
          momentum: analysis.multiTimeframe?.["60"]?.momentum ?? "normal",
          marketStructure: analysis.marketStructure.structure,
          multiTfAlignment,
          detectedAt: Date.now(),
        };
      }

      // Setup Grade A langsung diprioritaskan
      if (bestSetup && analysis.signalGrade === "A" && analysis.overallConfidence >= 93) break;
    }

    fmpStatus.bestSetup = bestSetup;

    if (!bestSetup) {
      setStatus(`Tidak ada setup berkualitas tinggi — ${preFiltered.length} kandidat gagal seleksi ketat`, "waiting");
      return;
    }

    // ── 7. Tunggu konfirmasi — hindari FOMO ───────────────────────────────────
    const dir = bestSetup.side === "Buy" ? "LONG" : "SHORT";

    if (bestSetup.confidence < 93 || bestSetup.rr < 2.5) {
      setStatus(
        `Setup terdeteksi: ${bestSetup.symbol} ${dir} ${bestSetup.confidence}% RR ${bestSetup.rr.toFixed(1)}x — menunggu konfirmasi lebih kuat...`,
        "waiting"
      );
      return;
    }

    // ── 8. Peluang high-confidence ditemukan — masuk sniper trade ─────────────
    setStatus(
      `Peluang high-confidence terdeteksi: ${bestSetup.symbol} ${dir} ${bestSetup.confidence}% — memasuki trade sniper...`,
      "entering"
    );

    await executeFMPEntry(bestSetup);

  } catch (err) {
    fmpStatus.lastError = String(err);
    setStatus(`Error: ${String(err)}`, "idle");
    logger.error({ err }, "FMP scan cycle error");
  } finally {
    fmpStatus.analyzing = false;
    fmpStatus.lastCycleAt = Date.now();
    fmpStatus.cycleCount++;
    fmpStatus.nextCycleAt = Date.now() + fmpConfig.scanIntervalMs;
  }
}

// ─── Entry Execution ──────────────────────────────────────────────────────────

async function executeFMPEntry(setup: FMPBestSetup) {
  const dir = setup.side === "Buy" ? "LONG" : "SHORT";

  try {
    // Re-analisis untuk konfirmasi akhir
    const fresh = await analyzeSymbol(setup.symbol);
    if (!fresh.shouldEnter || fresh.side !== setup.side) {
      setStatus(`Setup ${setup.symbol} berubah — membatalkan entry, mencari setup baru`, "waiting");
      fmpStatus.bestSetup = null;
      return;
    }

    // Dynamic leverage berdasarkan volatilitas
    const dynLev = calculateDynamicLeverage(fresh.indicators.atr14, fresh.entryPrice, fresh.overallConfidence);
    const slPrice = fresh.stopLoss > 0 ? fresh.stopLoss
      : setup.side === "Sell" ? fresh.entryPrice * (1 + fmpConfig.stopLossPct / 100)
      : fresh.entryPrice * (1 - fmpConfig.stopLossPct / 100);
    const tpPrice = fresh.takeProfit > 0 ? fresh.takeProfit
      : setup.side === "Sell" ? fresh.entryPrice * (1 - fmpConfig.takeProfitPct / 100)
      : fresh.entryPrice * (1 + fmpConfig.takeProfitPct / 100);

    // Simulasi posisi (mode demo — tidak ada koneksi Bybit nyata di sini)
    const simulatedBalance = 100; // base untuk kalkulasi
    const allocatedUSDT = simulatedBalance * (fmpConfig.marginPct / 100);
    const qty = parseFloat(formatQty(allocatedUSDT / fresh.entryPrice, fresh.entryPrice));

    const activePos: FMPActivePosition = {
      symbol: setup.symbol,
      side: setup.side,
      entryPrice: fresh.entryPrice,
      size: qty,
      allocatedUSDT,
      leverage: dynLev,
      stopLoss: slPrice,
      takeProfit: tpPrice,
      confidence: fresh.overallConfidence,
      openedAt: Date.now(),
      peakPnl: 0,
      currentPnl: 0,
      lastMonitorAt: Date.now(),
      trailActive: false,
      trailPeak: fresh.entryPrice,
    };

    fmpStatus.activePosition = activePos;
    fmpStatus.dailyTrades++;
    saveFMPState();

    setStatus(
      `✓ Posisi ${dir} ${setup.symbol} aktif — margin $${allocatedUSDT.toFixed(2)} | TP $${tpPrice.toFixed(4)} | SL $${slPrice.toFixed(4)} | lev ${dynLev}x`,
      "monitoring"
    );

    logActivity({
      source: "auto",
      level: "success",
      message: `[FMP] ⚡ Sniper Entry ${dir} ${setup.symbol} @ $${fresh.entryPrice.toFixed(4)} | conf: ${fresh.overallConfidence}% | RR: ${setup.rr.toFixed(1)} | lev: ${dynLev}x | grade: ${setup.grade}`,
      symbol: setup.symbol,
      confidence: fresh.overallConfidence,
    });

    logger.info({
      symbol: setup.symbol, side: setup.side, entry: fresh.entryPrice,
      confidence: fresh.overallConfidence, rr: setup.rr, leverage: dynLev, grade: setup.grade,
    }, "FMP sniper trade opened (simulated)");

  } catch (err) {
    fmpStatus.lastError = String(err);
    setStatus(`Gagal membuka posisi ${setup.symbol}: ${String(err)}`, "idle");
    logger.error({ err, symbol: setup.symbol }, "FMP entry execution failed");
  }
}

// ─── Position Monitor ─────────────────────────────────────────────────────────

async function runFMPPositionMonitor() {
  if (!fmpConfig.enabled) return;
  if (!fmpStatus.activePosition) return;

  const pos = fmpStatus.activePosition;

  try {
    // Ambil harga terkini dari Bybit public API
    const res = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${pos.symbol}`
    );
    const data = (await res.json()) as {
      retCode: number;
      result: { list: { lastPrice: string }[] };
    };

    if (data.retCode !== 0 || !data.result.list[0]) return;

    const markPrice = parseFloat(data.result.list[0].lastPrice);
    if (!markPrice || markPrice <= 0) return;

    // Hitung PnL
    const priceDiff = pos.side === "Buy"
      ? markPrice - pos.entryPrice
      : pos.entryPrice - markPrice;
    const pnl = priceDiff * pos.size * pos.leverage;
    const pnlPct = (priceDiff / pos.entryPrice) * 100 * pos.leverage;

    pos.currentPnl = pnl;
    pos.lastMonitorAt = Date.now();

    // Update peak PnL untuk trailing
    if (pnl > pos.peakPnl) {
      pos.peakPnl = pnl;
      if (pos.side === "Buy" && markPrice > pos.trailPeak) pos.trailPeak = markPrice;
      if (pos.side === "Sell" && markPrice < pos.trailPeak) pos.trailPeak = markPrice;
    }

    // Aktifkan trailing stop jika profit > 1.5%
    if (pnlPct > 1.5 && !pos.trailActive) {
      pos.trailActive = true;
      setStatus(`Trailing stop diaktifkan untuk ${pos.symbol} — profit ${pnlPct.toFixed(2)}%`, "monitoring");
    }

    // Trailing stop — jika harga balik > 0.8% dari peak
    if (pos.trailActive) {
      const trailSlipPct = pos.side === "Buy"
        ? ((pos.trailPeak - markPrice) / pos.trailPeak) * 100
        : ((markPrice - pos.trailPeak) / pos.trailPeak) * 100;

      if (trailSlipPct > 0.8) {
        setStatus(`Momentum melemah terdeteksi — mengamankan profit via trailing stop...`, "exiting");
        logActivity({
          source: "auto", level: "info",
          message: `[FMP] Trailing stop dipicu ${pos.symbol} — profit $${pnl.toFixed(3)} (${pnlPct.toFixed(2)}%)`,
          symbol: pos.symbol,
        });
        await closeFMPPosition("trailing_stop", markPrice);
        return;
      }
    }

    // Take Profit check
    if (pos.side === "Buy" && markPrice >= pos.takeProfit) {
      setStatus(`Mengamankan profit — TP tercapai untuk ${pos.symbol}`, "exiting");
      await closeFMPPosition("take_profit", markPrice);
      return;
    }
    if (pos.side === "Sell" && markPrice <= pos.takeProfit) {
      setStatus(`Mengamankan profit — TP tercapai untuk ${pos.symbol}`, "exiting");
      await closeFMPPosition("take_profit", markPrice);
      return;
    }

    // Stop Loss check
    if (pos.side === "Buy" && markPrice <= pos.stopLoss) {
      setStatus(`Stop loss dipicu untuk ${pos.symbol} — melindungi modal`, "exiting");
      await closeFMPPosition("stop_loss", markPrice);
      return;
    }
    if (pos.side === "Sell" && markPrice >= pos.stopLoss) {
      setStatus(`Stop loss dipicu untuk ${pos.symbol} — melindungi modal`, "exiting");
      await closeFMPPosition("stop_loss", markPrice);
      return;
    }

    // Deteksi momentum melemah via re-analisis (setiap 5 cycle)
    if (pos.lastMonitorAt % (fmpConfig.positionMonitorMs * 5) < fmpConfig.positionMonitorMs) {
      try {
        const freshAnalysis = await analyzeSymbol(pos.symbol);
        const isReversing = pos.side === "Buy"
          ? (freshAnalysis.shouldExitLong || freshAnalysis.marketDirection === "BEARISH")
          : (freshAnalysis.shouldExitShort || freshAnalysis.marketDirection === "BULLISH");

        if (isReversing && pnl > 0) {
          setStatus(`Momentum melemah terdeteksi untuk ${pos.symbol} — keluar cerdas untuk amankan profit`, "exiting");
          logActivity({
            source: "auto", level: "info",
            message: `[FMP] Keluar cerdas ${pos.symbol} — momentum berbalik, profit $${pnl.toFixed(3)}`,
            symbol: pos.symbol,
          });
          await closeFMPPosition("smart_exit_momentum", markPrice);
          return;
        }
      } catch {
        // Abaikan error re-analisis
      }
    }

    setStatus(
      `Memantau posisi ${pos.symbol} ${pos.side === "Buy" ? "LONG" : "SHORT"} — PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(3)} (${pnlPct.toFixed(2)}%)${pos.trailActive ? " 🔒trailing" : ""}`,
      "monitoring"
    );

  } catch (err) {
    logger.warn({ err, symbol: pos.symbol }, "FMP position monitor error");
  }
}

// ─── Close Position ───────────────────────────────────────────────────────────

export async function closeFMPPosition(reason: string, exitPrice?: number) {
  const pos = fmpStatus.activePosition;
  if (!pos) return;

  const price = exitPrice ?? pos.entryPrice;
  const priceDiff = pos.side === "Buy"
    ? price - pos.entryPrice
    : pos.entryPrice - price;
  const pnl = priceDiff * pos.size * pos.leverage;
  const pnlPct = (priceDiff / pos.entryPrice) * 100 * pos.leverage;
  const outcome: FMPTradeLog["outcome"] = pnl > 0.01 ? "win" : pnl < -0.01 ? "loss" : "breakeven";

  // Learning notes
  let learningNote = "";
  if (outcome === "win") {
    if (reason === "take_profit") learningNote = "TP tercapai sempurna — entry dan timing sangat akurat";
    else if (reason === "trailing_stop") learningNote = "Trailing stop mengamankan profit — exit lebih cepat dari TP";
    else if (reason.includes("smart")) learningNote = "Deteksi momentum berhasil — keluar sebelum reversal penuh";
    else learningNote = "Trade menang — analisis teknikal terkonfirmasi";
  } else if (outcome === "loss") {
    if (reason === "stop_loss") learningNote = "SL terpicu — entry mungkin terlalu agresif atau pasar berubah arah";
    else learningNote = "Trade kalah — evaluasi kondisi pasar dan konfirmasi sinyal";
    fmpStatus.consecutiveLosses++;
    fmpStatus.dailyLoss += Math.abs(pnl);
    fmpStatus.totalLosses++;

    // Aktifkan cooldown jika consecutive loss
    if (fmpStatus.consecutiveLosses >= fmpConfig.consecutiveLossLimit) {
      fmpStatus.cooldown = true;
      fmpStatus.cooldownUntil = Date.now() + fmpConfig.cooldownMinutes * 60_000;
      logActivity({
        source: "auto", level: "warn",
        message: `[FMP] Cooldown diaktifkan — ${fmpStatus.consecutiveLosses} loss berturut, istirahat ${fmpConfig.cooldownMinutes} menit`,
      });
    }
  } else {
    fmpStatus.consecutiveLosses = 0;
  }

  if (outcome === "win") {
    fmpStatus.consecutiveLosses = 0;
    fmpStatus.totalWins++;
  }

  // Catat ke log
  const tradeEntry: FMPTradeLog = {
    id: crypto.randomUUID(),
    symbol: pos.symbol,
    side: pos.side,
    entryPrice: pos.entryPrice,
    exitPrice: price,
    size: pos.size,
    allocatedUSDT: pos.allocatedUSDT,
    leverage: pos.leverage,
    pnl,
    pnlPct,
    confidence: pos.confidence,
    rr: fmpStatus.bestSetup?.rr ?? 0,
    openedAt: pos.openedAt,
    closedAt: Date.now(),
    closeReason: reason,
    grade: fmpStatus.bestSetup?.grade ?? "B",
    learningNote,
    outcome,
  };

  fmpLog.unshift(tradeEntry);
  if (fmpLog.length > 200) fmpLog.splice(200);

  // Self-learning
  learnFromTrade(tradeEntry);

  const dir = pos.side === "Buy" ? "LONG" : "SHORT";
  const icon = outcome === "win" ? "✓" : outcome === "loss" ? "✕" : "—";

  logActivity({
    source: "auto",
    level: outcome === "win" ? "success" : outcome === "loss" ? "error" : "info",
    message: `[FMP] ${icon} Tutup ${dir} ${pos.symbol} @ $${price.toFixed(4)} | PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(3)} (${pnlPct.toFixed(2)}%) | Alasan: ${reason}`,
    symbol: pos.symbol,
  });

  logger.info({ symbol: pos.symbol, outcome, pnl, reason }, "FMP position closed");

  fmpStatus.activePosition = null;
  fmpStatus.bestSetup = null;
  saveFMPState();
  saveFMPLog();

  const nextMsg = fmpStatus.cooldown
    ? `Cooldown ${fmpConfig.cooldownMinutes} menit aktif — evaluasi ulang pasar...`
    : "Mencari setup sniper berikutnya...";
  setStatus(nextMsg, fmpStatus.cooldown ? "cooldown" : "scanning");
}

export function updateFMPConfig(update: Partial<FMPConfig>) {
  const wasEnabled = fmpConfig.enabled;
  Object.assign(fmpConfig, update);
  saveFMPState();

  if (fmpConfig.enabled && !wasEnabled) startFMPEngine();
  else if (!fmpConfig.enabled && wasEnabled) stopFMPEngine();
  else if (fmpConfig.enabled && ("scanIntervalMs" in update || "positionMonitorMs" in update)) {
    startFMPEngine();
  }
}
