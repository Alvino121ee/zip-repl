import { Router } from "express";
import {
  getWalletBalance,
  getPositions,
  getOpenOrders,
  placeOrder,
  cancelOrder,
  setPositionTPSL,
  getHighConfidenceSignals,
  autoConfig,
  tradeLog,
  startAutoEngine,
  stopAutoEngine,
  type AutoTradingConfig,
} from "../services/bybit.js";

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

    // Set TP/SL separately after order fill
    if (takeProfit || stopLoss) {
      await setPositionTPSL({ symbol, takeProfit, stopLoss })
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
  ];

  for (const key of allowed) {
    if (key in update) {
      (autoConfig as Record<string, unknown>)[key] = update[key];
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

export default router;
