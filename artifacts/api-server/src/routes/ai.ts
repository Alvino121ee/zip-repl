import { Router } from "express";
import { chatWithAI, analyzeAsset, getMarketSummary } from "../services/ai.js";
import type { ChatMessage, AnalysisRequest } from "../services/ai.js";

const router = Router();

router.post("/ai/chat", async (req, res) => {
  try {
    const { messages, context } = req.body as {
      messages: ChatMessage[];
      context?: AnalysisRequest;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages harus berupa array yang tidak kosong" });
      return;
    }

    const reply = await chatWithAI(messages, context);
    res.json({ reply });
  } catch (err) {
    req.log.error({ err }, "AI chat error");
    res.status(502).json({ error: "Gagal menghubungi AI. Coba lagi." });
  }
});

router.post("/ai/analyze", async (req, res) => {
  try {
    const data = req.body as AnalysisRequest;

    if (!data.symbol || !data.assetType || data.currentPrice == null) {
      res.status(400).json({ error: "Data aset tidak lengkap" });
      return;
    }

    const analysis = await analyzeAsset(data);
    res.json({ analysis });
  } catch (err) {
    req.log.error({ err }, "AI analyze error");
    res.status(502).json({ error: "Gagal menganalisis aset. Coba lagi." });
  }
});

router.post("/ai/market-summary", async (req, res) => {
  try {
    const data = req.body;
    const summary = await getMarketSummary(data);
    res.json({ summary });
  } catch (err) {
    req.log.error({ err }, "AI market summary error");
    res.status(502).json({ error: "Gagal membuat ringkasan pasar. Coba lagi." });
  }
});

export default router;
