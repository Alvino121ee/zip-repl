import { Router } from "express";
import {
  getWalletBalance,
  getPositions,
  getOpenOrders,
  placeOrder,
  cancelOrder,
  closePosition,
  setPositionTPSL,
  getHighConfidenceSignals,
  scanBybitUniverse,
  autoConfig,
  tradeLog,
  startAutoEngine,
  stopAutoEngine,
  engineStatus,
  type AutoTradingConfig,
} from "../services/bybit.js";
import { analyzeSymbol } from "../services/analysis.js";

const router = Router();

// GET /api/trading/balance
router.get("/trading/balance", async (req, res) => {
  try {
    const result = await getWalletBalance();
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get wallet balance");
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/trading/positions
router.get("/trading/positions", async (req, res) => {
  try {
    const result = await getPositions();
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get positions");
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/trading/orders
router.get("/trading/orders", async (req, res) => {
  try {
    const result = await getOpenOrders();
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get open orders");
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/trading/signals
router.get("/trading/signals", async (req, res) => {
  try {
    const signals = await getHighConfidenceSignals();
    res.json(signals);
  } catch (err) {
    req.log.error({ err }, "Failed to get signals");
    res.status(502).json({ error: String(err) });
  }
});

// POST /api/trading/order
router.post("/trading/order", async (req, res) => {
  const { symbol, side, qty, takeProfit, stopLoss } = req.body as {
    symbol: string;
    side: "Buy" | "Sell";
    qty: string;
    takeProfit?: number;
    stopLoss?: number;
  };

  if (!symbol || !side || !qty) {
    res.status(400).json({ error: "symbol, side, qty are required" });
    return;
  }

  try {
    const result = await placeOrder({ symbol, side, qty });
    req.log.info({ symbol, side, qty, orderId: result.orderId }, "Manual order placed");

    // Wait 1.5s for market order to settle before setting TP/SL
    if (takeProfit || stopLoss) {
      await setPositionTPSL({ symbol, takeProfit, stopLoss }, 1500)
        .catch((e) => req.log.warn({ e, symbol }, "Failed to set TP/SL after order"));
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to place order");
    res.status(502).json({ error: String(err) });
  }
});

// POST /api/trading/position/tpsl
router.post("/trading/position/tpsl", async (req, res) => {
  const { symbol, takeProfit, stopLoss } = req.body as {
    symbol: string;
    takeProfit?: number;
    stopLoss?: number;
  };

  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }

  try {
    const result = await setPositionTPSL({ symbol, takeProfit, stopLoss });
    req.log.info({ symbol, takeProfit, stopLoss }, "Position TP/SL set");
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to set position TP/SL");
    res.status(502).json({ error: String(err) });
  }
});

// POST /api/trading/close-position  — closes an open position (reduceOnly market order)
router.post("/trading/close-position", async (req, res) => {
  const { symbol, side, qty } = req.body as {
    symbol: string;
    side: "Buy" | "Sell";  // side of the CLOSING order (opposite of open position)
    qty: string;
  };

  if (!symbol || !side || !qty) {
    res.status(400).json({ error: "symbol, side, qty are required" });
    return;
  }

  try {
    const result = await closePosition(symbol, side, qty);
    req.log.info({ symbol, side, qty, orderId: result.orderId }, "Position closed");
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to close position");
    res.status(502).json({ error: String(err) });
  }
});

// DELETE /api/trading/order/:orderId
router.delete("/trading/order/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const { symbol } = req.query as { symbol: string };

  if (!symbol) {
    res.status(400).json({ error: "symbol query param required" });
    return;
  }

  try {
    const result = await cancelOrder(orderId, symbol);
    req.log.info({ orderId, symbol }, "Order cancelled");
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to cancel order");
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/trading/config
router.get("/trading/config", (_req, res) => {
  res.json(autoConfig);
});

// PUT /api/trading/config
router.put("/trading/config", (req, res) => {
  const update = req.body as Partial<AutoTradingConfig>;
  const wasEnabled = autoConfig.enabled;

  const allowed: (keyof AutoTradingConfig)[] = [
    "enabled", "mode", "minConfidence", "maxPositionUSDT",
    "stopLossPct", "takeProfitPct", "maxPositions", "leverage", "intervalMs",
    "orderType", "limitOffsetPct", "scanSource",
    "scalpEnabled", "scalpTargetUSDT",
  ];

  for (const key of allowed) {
    if (key in update) {
      (autoConfig as unknown as Record<string, unknown>)[key] = update[key];
    }
  }

  if (autoConfig.enabled && !wasEnabled) {
    startAutoEngine();
  } else if (!autoConfig.enabled && wasEnabled) {
    stopAutoEngine();
  } else if (autoConfig.enabled && "intervalMs" in update) {
    startAutoEngine();
  }

  res.json(autoConfig);
});

// GET /api/trading/log
router.get("/trading/log", (_req, res) => {
  res.json(tradeLog.slice(0, 50));
});

// GET /api/trading/universe  — top Bybit universe candidates
router.get("/trading/universe", async (req, res) => {
  try {
    const candidates = await scanBybitUniverse();
    res.json(candidates);
  } catch (err) {
    req.log.error({ err }, "Universe scan failed");
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/trading/engine-status
router.get("/trading/engine-status", (_req, res) => {
  res.json({
    ...engineStatus,
    config: {
      enabled: autoConfig.enabled,
      mode: autoConfig.mode,
      maxPositions: autoConfig.maxPositions,
      minConfidence: autoConfig.minConfidence,
      maxPositionUSDT: autoConfig.maxPositionUSDT,
      intervalMs: autoConfig.intervalMs,
      scalpEnabled: autoConfig.scalpEnabled,
      scalpTargetUSDT: autoConfig.scalpTargetUSDT,
    },
  });
});

// GET /api/trading/analyze/:symbol  — full AI technical analysis
router.get("/trading/analyze/:symbol", async (req, res) => {
  const { symbol } = req.params;
  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  try {
    const analysis = await analyzeSymbol(symbol.toUpperCase());
    res.json(analysis);
  } catch (err) {
    req.log.error({ err, symbol }, "Analysis failed");
    res.status(502).json({ error: String(err) });
  }
});

export default router;
