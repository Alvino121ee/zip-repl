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
  // Jika MT5 real terhubung, refresh balance dari server MT5
  if (isMT5RealConnected()) {
    await refreshMT5Balance().catch(() => {});
  }
  const state = getForexProState();
  const mt5Status = getMT5Status();
  const unrealisedPnl = state.positions.reduce((s, p) => s + p.unrealisedPnl, 0);

  // Jika real mode, kembalikan balance MT5 asli
  if (isMT5RealConnected()) {
    res.json({
      balance: mt5Status.balance,
      equity: mt5Status.equity,
      unrealisedPnl,
      usedMargin: state.positions.reduce((s, p) => s + p.margin, 0),
      isReal: true,
      currency: mt5Status.currency,
    });
    return;
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
  // Jika MT5 real terhubung, ambil posisi dari MT5 nyata
  if (isMT5RealConnected()) {
    const accountId = getMT5AccountId();
    if (accountId) {
      const realPositions = await fetchPositionsReal(accountId);
      // Map format MetaApi ke format aplikasi
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
  const { symbol, direction, timeframe, lot, accountMode } = req.body as {
    symbol: string;
    direction: "Buy" | "Sell";
    timeframe?: Timeframe;
    lot?: number;
    accountMode?: "demo" | "real";
  };

  if (!symbol || !direction) {
    return res.status(400).json({ error: "symbol dan direction wajib diisi" });
  }

  // Jika mode real dan MT5 nyata terhubung, kirim order ke MT5 sungguhan
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

  // Mode demo atau MT5 tidak terhubung — gunakan engine internal
  const result = openForexProPosition(symbol, direction, timeframe ?? "H1", true, lot);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.post("/forex-pro/close/:id", async (req, res) => {
  const { id } = req.params;

  // Jika MT5 real terhubung, tutup posisi di MT5 nyata
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
  res.json({
    hasMetaApiToken: hasMetaApiToken(),
    message: hasMetaApiToken()
      ? "MetaApi token tersedia — koneksi MT5 nyata aktif"
      : "METAAPI_TOKEN belum diset — koneksi MT5 berjalan dalam mode simulasi",
  });
});

router.post("/forex-pro/mt5/connect", async (req, res) => {
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
  const status = getMT5Status();
  res.json({ ...status, hasMetaApiToken: hasMetaApiToken() });
});

export default router;
