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
  connectMT5,
  disconnectMT5,
  getMT5Status,
  refreshMT5Balance,
  getMT5AccountId,
  isMT5RealConnected,
} from "../services/forex-pro.js";
import { hasMetaApiToken, placeOrderReal, fetchPositionsReal } from "../services/metaapi-mt5.js";
import {
  isPythonBridgeConnected,
  getBridgeAccount,
  getBridgePositions,
  getBridgeStatus,
  queueOrder,
  getOrderResult,
  removeOrderResult,
} from "../services/mt5-python-bridge.js";
import { randomUUID } from "crypto";

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

router.get("/forex-pro/balance", async (_req, res) => {
  // Prioritas 1: Python Bridge
  if (isPythonBridgeConnected()) {
    const acc = getBridgeAccount();
    if (acc) {
      const bridgePositions = getBridgePositions();
      const unrealisedPnl = bridgePositions.reduce((s, p) => s + p.profit, 0);
      return res.json({
        balance: acc.balance,
        equity: acc.equity,
        unrealisedPnl,
        usedMargin: acc.margin,
        isReal: true,
        isPythonBridge: true,
        currency: acc.currency,
      });
    }
  }

  // Prioritas 2: MetaApi Real
  if (isMT5RealConnected()) {
    await refreshMT5Balance().catch(() => {});
  }
  const state = getForexProState();
  const mt5Status = getMT5Status();
  const unrealisedPnl = state.positions.reduce((s, p) => s + p.unrealisedPnl, 0);

  if (isMT5RealConnected()) {
    return res.json({
      balance: mt5Status.balance,
      equity: mt5Status.equity,
      unrealisedPnl,
      usedMargin: state.positions.reduce((s, p) => s + p.margin, 0),
      isReal: true,
      currency: mt5Status.currency,
    });
  }

  res.json({
    balance: state.balance,
    equity: state.equity,
    unrealisedPnl,
    usedMargin: state.positions.reduce((s, p) => s + p.margin, 0),
    isReal: false,
  });
});

router.get("/forex-pro/positions", async (_req, res) => {
  // Prioritas 1: Python Bridge
  if (isPythonBridgeConnected()) {
    const bridgePositions = getBridgePositions();
    const mapped = bridgePositions.map((p) => {
      const pairInfo = FOREX_PAIRS_PRO.find(x => x.symbol === p.symbol);
      return {
        id: String(p.ticket),
        symbol: p.symbol,
        pairName: pairInfo?.name ?? p.symbol,
        emoji: pairInfo?.emoji ?? "📊",
        side: p.type === "buy" ? "Buy" : "Sell",
        lotSize: p.volume,
        entryPrice: p.priceOpen,
        currentPrice: p.priceCurrent,
        stopLoss: p.sl,
        takeProfit: p.tp,
        leverage: 100,
        margin: 0,
        unrealisedPnl: p.profit,
        unrealisedPips: 0,
        openedAt: p.openTime,
        strategy: "MT5 Python Bridge",
        confidence: 100,
        reasoning: ["Posisi nyata dari MetaTrader 5 via Python Bridge"],
        trailActivated: false,
        breakeven: false,
        riskReward: 2,
        timeframe: "H1",
        aiNote: p.comment || "Posisi live dari akun MT5 nyata",
      };
    });
    return res.json(mapped);
  }

  // Prioritas 2: MetaApi Real
  if (isMT5RealConnected()) {
    const accountId = getMT5AccountId();
    if (accountId) {
      const realPositions = await fetchPositionsReal(accountId);
      const mapped = realPositions.map((p: any) => ({
        id: p.id,
        symbol: p.symbol,
        pairName: p.symbol,
        emoji: "📊",
        side: p.type === "POSITION_TYPE_BUY" ? "Buy" : "Sell",
        lotSize: p.volume ?? 0,
        entryPrice: p.openPrice ?? 0,
        currentPrice: p.currentPrice ?? p.openPrice ?? 0,
        stopLoss: p.stopLoss ?? 0,
        takeProfit: p.takeProfit ?? 0,
        leverage: 100,
        margin: p.margin ?? 0,
        unrealisedPnl: p.unrealizedProfit ?? 0,
        unrealisedPips: 0,
        openedAt: p.time ? new Date(p.time).getTime() : Date.now(),
        strategy: "MT5 Real",
        confidence: 100,
        reasoning: ["Posisi nyata dari MetaTrader 5"],
        trailActivated: false,
        breakeven: false,
        riskReward: 2,
        timeframe: "H1",
        aiNote: "Posisi live dari akun MT5 nyata",
      }));
      res.json(mapped);
      return;
    }
  }

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

router.post("/forex-pro/order", async (req, res) => {
  const { symbol, direction, timeframe, lot, sl, tp, accountMode } = req.body as {
    symbol: string;
    direction: "Buy" | "Sell";
    timeframe?: Timeframe;
    lot?: number;
    sl?: number;
    tp?: number;
    accountMode?: "demo" | "real";
  };

  if (!symbol || !direction) {
    return res.status(400).json({ error: "symbol dan direction wajib diisi" });
  }

  // Prioritas 1: Python Bridge (mode real)
  if (accountMode === "real" && isPythonBridgeConnected()) {
    const orderId = randomUUID();
    const volume = lot ?? 0.01;
    queueOrder({
      id: orderId,
      symbol,
      type: direction === "Buy" ? "buy" : "sell",
      volume,
      sl,
      tp,
      comment: "VINZ-PREDICT",
    });

    // Tunggu hasil hingga 10 detik
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const result = getOrderResult(orderId);
      if (result) {
        removeOrderResult(orderId);
        if (!result.ok) return res.status(400).json({ error: result.error ?? "Order gagal di MT5" });
        return res.json({ ok: true, ticket: result.ticket, isReal: true, isPythonBridge: true, symbol, direction, volume });
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return res.status(408).json({ error: "Timeout: script Python tidak merespons dalam 10 detik. Pastikan script sedang berjalan." });
  }

  // Prioritas 2: MetaApi Real
  if (accountMode === "real" && isMT5RealConnected()) {
    const accountId = getMT5AccountId();
    if (accountId) {
      const orderType = direction === "Buy" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL";
      const volume = lot ?? 0.01;
      const result = await placeOrderReal(accountId, symbol, orderType, volume);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      return res.json({ ok: true, orderId: result.orderId, isReal: true, symbol, direction, volume });
    }
  }

  // Mode demo atau tidak ada koneksi real
  const result = openForexProPosition(symbol, direction, timeframe ?? "H1", true, lot);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.post("/forex-pro/close/:id", async (req, res) => {
  const { id } = req.params;

  // Prioritas 1: Python Bridge
  if (isPythonBridgeConnected()) {
    const orderId = randomUUID();
    queueOrder({
      id: orderId,
      symbol: "CLOSE",
      type: "sell",
      volume: 0,
      comment: `CLOSE:${id}`,
    });

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const result = getOrderResult(orderId);
      if (result) {
        removeOrderResult(orderId);
        if (!result.ok) return res.status(400).json({ error: result.error ?? "Gagal tutup posisi" });
        return res.json({ ok: true, isReal: true, isPythonBridge: true });
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return res.status(408).json({ error: "Timeout: script Python tidak merespons" });
  }

  // Prioritas 2: MetaApi Real
  if (isMT5RealConnected()) {
    const accountId = getMT5AccountId();
    if (accountId) {
      const { closePositionReal } = await import("../services/metaapi-mt5.js");
      const r = await closePositionReal(accountId, id);
      if (!r.ok) return res.status(400).json({ error: r.error });
      return res.json({ ok: true, isReal: true });
    }
  }

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

// ─── MetaTrader 5 Koneksi ─────────────────────────────────────────────────────

router.get("/forex-pro/mt5/capability", (_req, res) => {
  const pythonBridge = getBridgeStatus();
  res.json({
    hasMetaApiToken: hasMetaApiToken(),
    hasPythonBridge: pythonBridge.connected,
    pythonBridge,
    message: pythonBridge.connected
      ? "Python Bridge aktif — MT5 terhubung via script Python"
      : hasMetaApiToken()
        ? "MetaApi token tersedia — koneksi MT5 nyata aktif"
        : "Belum ada koneksi MT5. Jalankan script mt5_bridge.py di PC dengan MT5.",
  });
});

router.post("/forex-pro/mt5/connect", async (req, res) => {
  // Jika Python Bridge sudah aktif, kembalikan info bridge langsung
  if (isPythonBridgeConnected()) {
    const acc = getBridgeAccount();
    if (acc) {
      return res.json({
        connected: true,
        accountId: "python-bridge",
        login: acc.login,
        server: acc.server,
        accountName: acc.name || `Akun #${acc.login}`,
        balance: acc.balance,
        equity: acc.equity,
        currency: acc.currency,
        broker: acc.broker || acc.server,
        leverage: acc.leverage,
        isPythonBridge: true,
      });
    }
  }

  const { server, login, password } = req.body as { server: string; login: string; password: string };
  if (!server || !login || !password) {
    return res.status(400).json({ error: "server, login, dan password wajib diisi" });
  }
  try {
    const result = await connectMT5(server, login, password);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Koneksi gagal";
    res.status(500).json({ connected: false, error: msg });
  }
});

router.post("/forex-pro/mt5/disconnect", async (_req, res) => {
  await disconnectMT5();
  res.json({ ok: true, message: "MT5 diputuskan" });
});

router.get("/forex-pro/mt5/status", (_req, res) => {
  const pythonBridge = getBridgeStatus();
  if (pythonBridge.connected) {
    const acc = getBridgeAccount();
    return res.json({
      connected: true,
      isPythonBridge: true,
      hasMetaApiToken: hasMetaApiToken(),
      login: acc?.login ?? "",
      server: acc?.server ?? "",
      accountName: acc?.name ?? "",
      balance: acc?.balance ?? 0,
      equity: acc?.equity ?? 0,
      currency: acc?.currency ?? "USD",
      broker: acc?.broker ?? "",
      leverage: acc?.leverage ?? 100,
      secondsSinceLastPush: pythonBridge.secondsSinceLastPush,
    });
  }
  const status = getMT5Status();
  res.json({ ...status, hasMetaApiToken: hasMetaApiToken(), isPythonBridge: false });
});

export default router;
