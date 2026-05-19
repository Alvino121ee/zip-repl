import { Router } from "express";
import {
  FOREX_PAIRS_PRO,
  TIMEFRAMES,
  type Timeframe,
  getForexProState,
  getForexProConfig,
  updateForexProConfig,
  analyzeForexPro,
  openForexProPosition,
  closeForexProPosition,
  updateOpenPositions,
  getForexProStats,
  getForexProEngineStatus,
  getSessions,
  getCandles,
  resetForexPro,
  startForexProAutoEngine,
  stopForexProAutoEngine,
} from "../services/forex-pro.js";

const router = Router();

// ─── Pasangan & Info ──────────────────────────────────────────────────────────

router.get("/forex-pro/pairs", (_req, res) => {
  res.json(FOREX_PAIRS_PRO);
});

router.get("/forex-pro/sessions", (_req, res) => {
  res.json(getSessions());
});

// ─── Data Chart ────────────────────────────────────────────────────────────────

router.get("/forex-pro/candles/:symbol/:timeframe", (req, res) => {
  const { symbol, timeframe } = req.params;
  if (!TIMEFRAMES.includes(timeframe as Timeframe)) {
    return res.status(400).json({ error: "Timeframe tidak valid" });
  }
  const count = parseInt(String(req.query.count ?? "100"));
  const candles = getCandles(symbol, timeframe as Timeframe, Math.min(count, 300));
  res.json(candles);
});

// ─── Analisis AI ──────────────────────────────────────────────────────────────

router.get("/forex-pro/analyze/:symbol", (req, res) => {
  const { symbol } = req.params;
  const timeframe = (req.query.timeframe as Timeframe) ?? "H1";
  const state = getForexProState();
  const config = getForexProConfig();

  if (!FOREX_PAIRS_PRO.find(p => p.symbol === symbol)) {
    return res.status(404).json({ error: "Pair tidak ditemukan" });
  }

  const analysis = analyzeForexPro(symbol, timeframe, state, config);
  res.json(analysis);
});

// ─── State & Statistik ────────────────────────────────────────────────────────

router.get("/forex-pro/state", (_req, res) => {
  updateOpenPositions();
  const state = getForexProState();
  res.json(state);
});

router.get("/forex-pro/stats", (_req, res) => {
  res.json(getForexProStats());
});

router.get("/forex-pro/balance", (_req, res) => {
  const state = getForexProState();
  const unrealisedPnl = state.positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  res.json({
    balance: state.balance,
    equity: state.equity,
    unrealisedPnl,
    usedMargin: state.positions.reduce((s, p) => s + p.margin, 0),
  });
});

router.get("/forex-pro/positions", (_req, res) => {
  updateOpenPositions();
  res.json(getForexProState().positions);
});

router.get("/forex-pro/log", (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "50"));
  const state = getForexProState();
  res.json(state.tradeLog.slice(0, limit));
});

router.get("/forex-pro/mistakes", (_req, res) => {
  res.json(getForexProState().mistakes);
});

router.get("/forex-pro/strategy-stats", (_req, res) => {
  res.json(getForexProState().strategyStats);
});

// ─── Engine Status & Config ───────────────────────────────────────────────────

router.get("/forex-pro/engine/status", (_req, res) => {
  res.json(getForexProEngineStatus());
});

router.put("/forex-pro/config", (req, res) => {
  const updated = updateForexProConfig(req.body);
  if (updated.autoEnabled) startForexProAutoEngine();
  else stopForexProAutoEngine();
  res.json(updated);
});

router.get("/forex-pro/config", (_req, res) => {
  res.json(getForexProConfig());
});

// ─── Order Management ─────────────────────────────────────────────────────────

router.post("/forex-pro/order", (req, res) => {
  const { symbol, direction, timeframe, lot } = req.body as {
    symbol: string;
    direction: "Buy" | "Sell";
    timeframe?: Timeframe;
    lot?: number;
  };

  if (!symbol || !direction) {
    return res.status(400).json({ error: "symbol dan direction wajib diisi" });
  }

  const result = openForexProPosition(symbol, direction, timeframe ?? "H1", true, lot);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.post("/forex-pro/close/:id", (req, res) => {
  const { id } = req.params;
  const result = closeForexProPosition(id, "Manual");
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json(result);
});

// ─── Scan Semua Pair ──────────────────────────────────────────────────────────

router.get("/forex-pro/scan", (_req, res) => {
  const state = getForexProState();
  const config = getForexProConfig();
  const results = FOREX_PAIRS_PRO.slice(0, 8).map(pair => {
    const analysis = analyzeForexPro(pair.symbol, config.preferredTimeframe, state, config);
    return {
      symbol: pair.symbol,
      name: pair.name,
      emoji: pair.emoji,
      category: pair.category,
      price: analysis.currentPrice,
      bid: analysis.bid,
      ask: analysis.ask,
      spread: analysis.spread,
      trend: analysis.technical.trendBias,
      rsi: analysis.technical.rsi,
      confidence: analysis.aiDecision.confidence,
      direction: analysis.aiDecision.direction,
      shouldTrade: analysis.aiDecision.shouldTrade,
      strategy: analysis.aiDecision.strategy,
      qualityScore: analysis.aiDecision.qualityScore,
      activeSession: analysis.activeSession,
    };
  });
  res.json(results);
});

// ─── Auto Engine ──────────────────────────────────────────────────────────────

router.post("/forex-pro/engine/start", (_req, res) => {
  startForexProAutoEngine();
  updateForexProConfig({ autoEnabled: true });
  res.json({ ok: true, message: "Engine Forex Pro dimulai" });
});

router.post("/forex-pro/engine/stop", (_req, res) => {
  stopForexProAutoEngine();
  updateForexProConfig({ autoEnabled: false });
  res.json({ ok: true, message: "Engine Forex Pro dihentikan" });
});

// ─── Reset ────────────────────────────────────────────────────────────────────

router.post("/forex-pro/reset", (_req, res) => {
  resetForexPro();
  res.json({ ok: true, message: "Forex Pro direset ke saldo awal $1000" });
});

export default router;
