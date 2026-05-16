import { Router } from "express";
import {
  generateChatResponse,
  generateAssetAnalysis,
  generateMarketSummary,
  getBrainStats,
  getBrainRecommendedConfig,
  learnFromOutcome,
  adjustConfidence,
  isSymbolEligible,
  resetBrainMemory,
  detectMarketCondition,
  type ChatMessage,
  type AssetAnalysisInput,
  type MarketCondition,
} from "../services/ai-brain.js";

const router = Router();

// POST /api/ai/chat — Obrolan dengan AI Brain
router.post("/ai/chat", (req, res) => {
  try {
    const { messages, context } = req.body as {
      messages: ChatMessage[];
      context?: AssetAnalysisInput;
    };
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages harus berupa array yang tidak kosong" });
      return;
    }
    const reply = generateChatResponse(messages, context);
    res.json({ reply });
  } catch (err) {
    req.log.error({ err }, "AI chat error");
    res.status(500).json({ error: "Gagal memproses obrolan AI." });
  }
});

// POST /api/ai/analyze — Analisis aset oleh Brain
router.post("/ai/analyze", (req, res) => {
  try {
    const data = req.body as AssetAnalysisInput;
    if (!data.symbol || !data.assetType || data.currentPrice == null) {
      res.status(400).json({ error: "Data aset tidak lengkap" });
      return;
    }
    const analysis = generateAssetAnalysis(data);
    res.json({ analysis });
  } catch (err) {
    req.log.error({ err }, "AI analyze error");
    res.status(500).json({ error: "Gagal menganalisis aset." });
  }
});

// POST /api/ai/market-summary — Ringkasan pasar oleh Brain
router.post("/ai/market-summary", (req, res) => {
  try {
    const data = req.body;
    const summary = generateMarketSummary(data);
    res.json({ summary });
  } catch (err) {
    req.log.error({ err }, "AI market summary error");
    res.status(500).json({ error: "Gagal membuat ringkasan pasar." });
  }
});

// GET /api/ai/brain/stats — Statistik lengkap AI Brain
router.get("/ai/brain/stats", (_req, res) => {
  try {
    res.json(getBrainStats());
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil statistik brain." });
  }
});

// GET /api/ai/brain/recommend-config — Konfigurasi trading optimal dari Brain
router.get("/ai/brain/recommend-config", (_req, res) => {
  try {
    res.json(getBrainRecommendedConfig());
  } catch (err) {
    res.status(500).json({ error: "Gagal membuat rekomendasi konfigurasi." });
  }
});

// POST /api/ai/brain/learn — Paksa brain belajar dari outcome
router.post("/ai/brain/learn", (req, res) => {
  try {
    const input = req.body;
    if (!input.id || !input.symbol || !input.result) {
      res.status(400).json({ error: "id, symbol, dan result diperlukan" });
      return;
    }
    const condition: MarketCondition = input.condition ?? detectMarketCondition({
      priceChange24h: input.priceChange24h ?? 0,
    });
    learnFromOutcome({ ...input, condition });
    res.json({ ok: true, message: "Brain berhasil belajar dari outcome." });
  } catch (err) {
    res.status(500).json({ error: "Gagal memproses pembelajaran." });
  }
});

// GET /api/ai/brain/eligible/:symbol — Cek apakah symbol layak ditrade
router.get("/ai/brain/eligible/:symbol", (req, res) => {
  try {
    const result = isSymbolEligible(req.params.symbol.toUpperCase());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Gagal memeriksa kelayakan symbol." });
  }
});

// POST /api/ai/brain/confidence — Hitung confidence yang disesuaikan
router.post("/ai/brain/confidence", (req, res) => {
  try {
    const { baseConfidence, symbol, condition, indicatorsActive, strategy } = req.body;
    const adjusted = adjustConfidence(
      Number(baseConfidence) || 70,
      String(symbol || ""),
      (condition as MarketCondition) || "sideways",
      Array.isArray(indicatorsActive) ? indicatorsActive : [],
      strategy,
    );
    res.json({ adjusted });
  } catch (err) {
    res.status(500).json({ error: "Gagal menghitung confidence." });
  }
});

// POST /api/ai/brain/reset — Reset memori brain (hati-hati!)
router.post("/ai/brain/reset", (_req, res) => {
  try {
    resetBrainMemory();
    res.json({ ok: true, message: "Memori AI Brain telah direset." });
  } catch (err) {
    res.status(500).json({ error: "Gagal mereset brain." });
  }
});

export default router;
