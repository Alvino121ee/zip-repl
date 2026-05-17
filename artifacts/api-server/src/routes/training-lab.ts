import { Router, type IRouter } from "express";
import {
  runTrainingLab, stopTrainingLab, getTrainingLabState,
  getTrainingLabResults, getStrategyComparison,
  TRAINING_PAIRS, TRAINING_STRATEGIES, type StrategyName,
} from "../services/ai-training-lab.js";
import {
  getBrainStats, getMemoryBank, startContinuousLearning,
  stopContinuousLearning, isLearningActive, resetBrainStats,
  manualTrain,
} from "../services/ai-continuous-learning.js";

const STRATEGY_LABELS: Record<StrategyName, string> = {
  scalp_5m:      "Scalping 5M (EMA Cross)",
  bos_choch:     "Break of Structure / CHOCH",
  order_block:   "Order Block Bounce",
  momentum:      "Momentum (RSI + MACD)",
  reversal:      "Reversal di Level Ekstrem",
  ema_crossover: "EMA 9/21 Crossover",
  vwap_bounce:   "VWAP Bounce",
};

const router: IRouter = Router();

// ─── Backtest Routes ───────────────────────────────────────────────────────────

router.get("/training-lab/state",      (_req, res) => res.json(getTrainingLabState()));
router.get("/training-lab/results",    (_req, res) => res.json(getTrainingLabResults()));
router.get("/training-lab/comparison", (_req, res) => res.json(getStrategyComparison()));
router.get("/training-lab/pairs",      (_req, res) => res.json({ pairs: TRAINING_PAIRS }));
router.get("/training-lab/strategies", (_req, res) => res.json({
  strategies: TRAINING_STRATEGIES.map(s => ({ key: s, label: STRATEGY_LABELS[s] })),
}));

router.post("/training-lab/start", async (req, res) => {
  const { pairs, strategies } = (req.body ?? {}) as { pairs?: string[]; strategies?: StrategyName[] };
  const state = getTrainingLabState();
  if (state.isRunning) { res.status(409).json({ error: "Training sedang berjalan" }); return; }
  runTrainingLab({ pairs, strategies }).catch(() => {});
  res.json({ started: true, message: "Training lab dimulai" });
});

router.post("/training-lab/stop", (_req, res) => {
  stopTrainingLab();
  res.json({ stopped: true, message: "Training dihentikan" });
});

// ─── AI Brain / Continuous Learning Routes ────────────────────────────────────

router.get("/training-lab/ai-brain", (_req, res) => {
  res.json(getBrainStats());
});

router.get("/training-lab/memory", (_req, res) => {
  res.json(getMemoryBank());
});

router.get("/training-lab/live-activities", (_req, res) => {
  const stats = getBrainStats();
  res.json({
    activities: stats.liveActivities ?? [],
    currentActivity: stats.currentActivity,
    currentSymbol: stats.currentSymbol,
    isLearning: stats.isLearning,
  });
});

router.get("/training-lab/evolution", (_req, res) => {
  const stats = getBrainStats();
  res.json({
    history: stats.evolutionHistory,
    current: {
      iq: stats.iq,
      level: stats.level,
      chartsAnalyzed: stats.chartsAnalyzed,
      predictionAccuracy: stats.predictionAccuracy,
      marketReading: stats.marketReading,
    },
  });
});

router.post("/training-lab/continuous/start", (_req, res) => {
  if (isLearningActive()) { res.status(409).json({ error: "Pembelajaran sudah berjalan" }); return; }
  const started = startContinuousLearning();
  res.json({ started, message: started ? "Pembelajaran berkelanjutan dimulai" : "Sudah berjalan" });
});

router.post("/training-lab/continuous/stop", (_req, res) => {
  stopContinuousLearning();
  res.json({ stopped: true, message: "Pembelajaran dihentikan" });
});

router.post("/training-lab/ai-brain/reset", (_req, res) => {
  resetBrainStats();
  res.json({ reset: true, message: "AI Brain direset ke kondisi awal" });
});

router.post("/training-lab/manual-train", (req, res) => {
  const { text } = (req.body ?? {}) as { text?: string };
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Field 'text' wajib diisi" });
    return;
  }
  if (text.trim().length < 10) {
    res.status(400).json({ error: "Teks terlalu pendek — minimal 10 karakter" });
    return;
  }
  if (text.length > 5000) {
    res.status(400).json({ error: "Teks terlalu panjang — maksimal 5000 karakter" });
    return;
  }
  const result = manualTrain(text);
  // Tambahkan koneksi pengetahuan dinamis berdasarkan kategori yang terdeteksi
  const knowledgeConnections = buildKnowledgeConnections(result.categoriesHit, result.conceptsFound);
  res.json({ ...result, knowledgeConnections });
});

// ─── Endpoint Bank Pengetahuan (terorganisir per kategori) ───────────────────

router.get("/training-lab/knowledge-bank", (_req, res) => {
  const memory = getMemoryBank();
  const allEntries = [
    ...memory.learnedPatterns,
    ...memory.bestSetups,
    ...memory.worstSetups,
    ...memory.dangerousConditions,
  ].filter(e => e.type === "manual");

  const CATEGORY_KEYWORDS: Record<string, string[]> = {
    "Indikator Teknikal":   ["indikator teknikal", "technical"],
    "Pola Chart":           ["pola chart"],
    "Konsep Pasar":         ["konsep pasar"],
    "Manajemen Risiko":     ["manajemen risiko"],
    "Psikologi Trading":    ["psikologi trading"],
    "Strategi":             ["strategi"],
    "Smart Money":          ["smart money"],
    "Volatilitas":          ["volatilitas"],
    "Momentum":             ["momentum"],
    "Manajemen Trade":      ["manajemen trade"],
  };

  const categories: Record<string, typeof allEntries> = {};
  let total = 0;

  for (const entry of allEntries) {
    const tagsLower = entry.tags.join(" ").toLowerCase();
    const descLower = entry.description.toLowerCase();
    let matched = false;
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(k => tagsLower.includes(k) || descLower.includes(k))) {
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({ ...entry, category: cat });
        matched = true;
        break;
      }
    }
    if (!matched) {
      const defaultCat = "Pengetahuan Umum";
      if (!categories[defaultCat]) categories[defaultCat] = [];
      categories[defaultCat].push({ ...entry, category: defaultCat });
    }
    total++;
  }

  res.json({ categories, total });
});

// ─── Helper: Koneksi Pengetahuan ─────────────────────────────────────────────

function buildKnowledgeConnections(categories: string[], concepts: string[]): string[] {
  const connections: string[] = [];
  const lower = [...categories.map(c => c.toLowerCase()), ...concepts];

  if (lower.some(w => w.includes("breakout") || w.includes("fake"))) {
    connections.push("Terhubung dengan: Deteksi Fake Breakout & Trap Likuiditas");
  }
  if (lower.some(w => w.includes("volume"))) {
    connections.push("Terhubung dengan: Analisis Momentum & Konfirmasi Volume");
  }
  if (lower.some(w => w.includes("psikologi") || w.includes("emosi") || w.includes("fomo"))) {
    connections.push("Terhubung dengan: Disiplin Trading & Kontrol Emosional");
  }
  if (lower.some(w => w.includes("smart money") || w.includes("liquidity") || w.includes("order block"))) {
    connections.push("Terhubung dengan: Pola Institusional & Perilaku Smart Money");
  }
  if (lower.some(w => w.includes("stop loss") || w.includes("risk") || w.includes("risiko"))) {
    connections.push("Terhubung dengan: Kalkulasi Position Sizing & Capital Preservation");
  }
  if (lower.some(w => w.includes("ema") || w.includes("sma") || w.includes("moving average"))) {
    connections.push("Terhubung dengan: Analisis Tren Multi-Timeframe");
  }
  if (lower.some(w => w.includes("rsi") || w.includes("macd") || w.includes("divergen"))) {
    connections.push("Terhubung dengan: Deteksi Divergensi & Konfirmasi Reversal");
  }

  return connections.slice(0, 4);
}

export default router;
