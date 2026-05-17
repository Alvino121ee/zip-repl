import { Router } from "express";
import {
  getDemoBalance,
  getDemoPositions,
  getDemoLog,
  getDemoStats,
  openDemoPosition,
  closeDemoPosition,
  resetDemo,
  demoConfig,
  demoEngineStatus,
  startDemoAutoEngine,
  stopDemoAutoEngine,
  startDemoScalpEngine,
  stopDemoScalpEngine,
  triggerDemoEngineCycle,
  saveDemoConfig,
  type DemoConfig,
} from "../services/demo-trading.js";
import { analyzeSymbol } from "../services/analysis.js";
import { scanScalp5m, SCALP_PAIRS } from "../services/scalping5m.js";

const router = Router();

// GET /api/demo/balance
router.get("/demo/balance", (_req, res) => {
  res.json(getDemoBalance());
});

// GET /api/demo/positions
router.get("/demo/positions", (_req, res) => {
  res.json(getDemoPositions());
});

// GET /api/demo/log
router.get("/demo/log", (_req, res) => {
  res.json(getDemoLog());
});

// GET /api/demo/stats
router.get("/demo/stats", (_req, res) => {
  res.json(getDemoStats());
});

// GET /api/demo/config
router.get("/demo/config", (_req, res) => {
  res.json(demoConfig);
});

// PUT /api/demo/config
router.put("/demo/config", (req, res) => {
  const update = req.body as Partial<DemoConfig>;
  const wasAutoEnabled = demoConfig.autoEnabled;
  const wasScalpEnabled = demoConfig.scalpEnabled;

  const allowed: (keyof DemoConfig)[] = [
    "autoEnabled", "autoMode", "scalpEnabled", "scalpMode",
    "minConfidence", "maxPositionUSDT", "stopLossPct", "takeProfitPct",
    "maxPositions", "leverage", "intervalMs",
    "scalpMinConfidence", "scalpMaxPositionUSDT", "scalpStopLossPct", "scalpTakeProfitPct",
  ];
  for (const key of allowed) {
    if (key in update) (demoConfig as unknown as Record<string, unknown>)[key] = update[key];
  }

  saveDemoConfig();

  if (demoConfig.autoEnabled && !wasAutoEnabled) startDemoAutoEngine();
  else if (!demoConfig.autoEnabled && wasAutoEnabled) stopDemoAutoEngine();
  else if (demoConfig.autoEnabled && "intervalMs" in update) startDemoAutoEngine();

  if (demoConfig.scalpEnabled && !wasScalpEnabled) startDemoScalpEngine();
  else if (!demoConfig.scalpEnabled && wasScalpEnabled) stopDemoScalpEngine();

  res.json(demoConfig);
});

// GET /api/demo/engine-status
router.get("/demo/engine-status", (_req, res) => {
  res.json(demoEngineStatus);
});

// POST /api/demo/order
router.post("/demo/order", async (req, res) => {
  const { symbol, displayName, side, entryPrice, positionUSDT, leverage, stopLoss, takeProfit, confidence, signal, openReason, marketCondition } = req.body;
  if (!symbol || !side || !entryPrice) {
    return res.status(400).json({ error: "symbol, side, entryPrice wajib diisi" });
  }
  const result = openDemoPosition({
    symbol,
    displayName: displayName ?? symbol,
    side,
    entryPrice: Number(entryPrice),
    positionUSDT: Number(positionUSDT) || demoConfig.maxPositionUSDT,
    leverage: Number(leverage) || demoConfig.leverage,
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

// POST /api/demo/close/:id
router.post("/demo/close/:id", (req, res) => {
  const { reason } = req.body as { reason?: "tp" | "sl" | "manual" };
  const result = closeDemoPosition(req.params.id, reason ?? "manual");
  if ("error" in result) return res.status(400).json(result);
  res.json(result);
});

// POST /api/demo/reset
router.post("/demo/reset", (_req, res) => {
  stopDemoAutoEngine();
  stopDemoScalpEngine();
  resetDemo();
  res.json({ ok: true, message: "Demo trading direset ke $50 USDT" });
});

// POST /api/demo/engine/trigger
router.post("/demo/engine/trigger", (_req, res) => {
  if (!demoEngineStatus.autoRunning && !demoEngineStatus.scalpRunning) {
    return res.status(400).json({ error: "Engine belum aktif. Aktifkan terlebih dahulu." });
  }
  triggerDemoEngineCycle();
  res.json({ ok: true, message: "Siklus pindai dipaksa — hasil akan muncul dalam beberapa detik" });
});

// GET /api/demo/signals
router.get("/demo/signals", async (req, res) => {
  try {
    const { symbol } = req.query;
    if (symbol) {
      const analysis = await analyzeSymbol(String(symbol).toUpperCase());
      return res.json(analysis);
    }
    const signals = await scanScalp5m();
    res.json(signals);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/demo/analyze/:symbol
router.get("/demo/analyze/:symbol", async (req, res) => {
  try {
    const analysis = await analyzeSymbol(req.params.symbol.toUpperCase());
    res.json(analysis);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/demo/scalp5m/signals
router.get("/demo/scalp5m/signals", async (_req, res) => {
  try {
    const signals = await scanScalp5m();
    res.json(signals);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

export default router;
