import { Router } from "express";
import {
  getForexBalance,
  getForexPositions,
  getForexLog,
  getForexStats,
  openForexPosition,
  closeForexPosition,
  resetForexDemo,
  forexConfig,
  forexEngineStatus,
  startForexAutoEngine,
  stopForexAutoEngine,
  triggerForexEngineCycle,
  saveForexConfig,
  scanForexUniverse,
  FOREX_UNIVERSE,
  type ForexConfig,
} from "../services/demo-forex.js";
import { analyzeInstitutional, getAIStatus } from "../services/institutional-engine.js";

const router = Router();

// GET /api/forex-demo/balance
router.get("/forex-demo/balance", (_req, res) => {
  res.json(getForexBalance());
});

// GET /api/forex-demo/positions
router.get("/forex-demo/positions", (_req, res) => {
  res.json(getForexPositions());
});

// GET /api/forex-demo/log
router.get("/forex-demo/log", (_req, res) => {
  res.json(getForexLog());
});

// GET /api/forex-demo/stats
router.get("/forex-demo/stats", (_req, res) => {
  res.json(getForexStats());
});

// GET /api/forex-demo/config
router.get("/forex-demo/config", (_req, res) => {
  res.json(forexConfig);
});

// PUT /api/forex-demo/config
router.put("/forex-demo/config", (req, res) => {
  const update = req.body as Partial<ForexConfig>;
  const wasAutoEnabled = forexConfig.autoEnabled;

  const allowed: (keyof ForexConfig)[] = [
    "autoEnabled", "autoMode", "minConfidence", "maxPositionUSDT",
    "stopLossPct", "takeProfitPct", "maxPositions", "leverage", "intervalMs",
  ];
  for (const key of allowed) {
    if (key in update) (forexConfig as unknown as Record<string, unknown>)[key] = update[key];
  }

  saveForexConfig();

  if (forexConfig.autoEnabled && !wasAutoEnabled) startForexAutoEngine();
  else if (!forexConfig.autoEnabled && wasAutoEnabled) stopForexAutoEngine();
  else if (forexConfig.autoEnabled && "intervalMs" in update) startForexAutoEngine();

  res.json(forexConfig);
});

// GET /api/forex-demo/engine-status
router.get("/forex-demo/engine-status", (_req, res) => {
  res.json(forexEngineStatus);
});

// POST /api/forex-demo/order
router.post("/forex-demo/order", async (req, res) => {
  const { symbol, side, entryPrice, positionUSDT, leverage, stopLoss, takeProfit, confidence, signal, openReason, marketCondition } = req.body;
  if (!symbol || !side || !entryPrice) {
    return res.status(400).json({ error: "symbol, side, entryPrice wajib diisi" });
  }
  const result = openForexPosition({
    symbol,
    side,
    entryPrice: Number(entryPrice),
    positionUSDT: Number(positionUSDT) || forexConfig.maxPositionUSDT,
    leverage: Number(leverage) || forexConfig.leverage,
    stopLoss: stopLoss ? Number(stopLoss) : null,
    takeProfit: takeProfit ? Number(takeProfit) : null,
    confidence: Number(confidence) || 0,
    signal: signal ?? "manual",
    source: "manual",
    openReason: openReason ?? undefined,
    marketCondition: marketCondition ?? undefined,
  });
  if ("error" in result) return res.status(400).json(result);
  res.status(201).json(result);
});

// POST /api/forex-demo/close/:id
router.post("/forex-demo/close/:id", (req, res) => {
  const { reason } = req.body as { reason?: "tp" | "sl" | "manual" };
  const result = closeForexPosition(req.params.id, reason ?? "manual");
  if ("error" in result) return res.status(400).json(result);
  res.json(result);
});

// POST /api/forex-demo/reset
router.post("/forex-demo/reset", (_req, res) => {
  stopForexAutoEngine();
  resetForexDemo();
  res.json({ ok: true, message: "Demo Forex direset ke $50 USDT" });
});

// POST /api/forex-demo/engine/trigger
router.post("/forex-demo/engine/trigger", (_req, res) => {
  if (!forexEngineStatus.autoRunning) {
    return res.status(400).json({ error: "Engine Forex belum aktif. Aktifkan terlebih dahulu." });
  }
  triggerForexEngineCycle();
  res.json({ ok: true, message: "Siklus forex dipaksa — hasil akan muncul dalam beberapa detik" });
});

// GET /api/forex-demo/universe — daftar pair forex yang tersedia
router.get("/forex-demo/universe", (_req, res) => {
  res.json(FOREX_UNIVERSE);
});

// GET /api/forex-demo/scan — live scan dengan harga terkini
router.get("/forex-demo/scan", async (_req, res) => {
  try {
    const results = await scanForexUniverse();
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/forex-demo/analyze/:symbol — deep institutional analysis
router.get("/forex-demo/analyze/:symbol", async (req, res) => {
  try {
    const sym = req.params.symbol.toUpperCase();
    const analysis = await analyzeInstitutional(sym);
    res.json(analysis);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/forex-demo/ai-status
router.get("/forex-demo/ai-status", (_req, res) => {
  res.json(getAIStatus());
});

export default router;
