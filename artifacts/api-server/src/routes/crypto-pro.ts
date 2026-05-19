import { Router } from "express";
import {
  CRYPTO_UNIVERSE,
  getCryptoProState,
  getCryptoProConfig,
  updateCryptoProConfig,
  getCryptoCandles,
  getCryptoProStats,
  openCryptoProPosition,
  closeCryptoProPosition,
  updateCryptoOpenPositions,
  getBtcDominance,
  getFundingRates,
  getOpenInterest,
  getOnChainMetrics,
  getSocialSentiment,
  getWhaleActivity,
  getLiquidationHeatmap,
  fetchFearGreed,
  resetCryptoPro,
  makeCryptoAiDecision,
} from "../services/crypto-pro.js";

const router = Router();

// ─── Aset & Pasangan ──────────────────────────────────────────────────────────

router.get("/crypto-pro/universe", (_req, res) => {
  res.json(CRYPTO_UNIVERSE);
});

// ─── Data Chart ────────────────────────────────────────────────────────────────

router.get("/crypto-pro/candles/:symbol/:timeframe", (req, res) => {
  const { symbol, timeframe } = req.params;
  const count = parseInt(String(req.query.count ?? "100"));
  const candles = getCryptoCandles(symbol, timeframe, Math.min(count, 300));
  res.json(candles);
});

// ─── State & Statistik ────────────────────────────────────────────────────────

router.get("/crypto-pro/state", (_req, res) => {
  updateCryptoOpenPositions();
  res.json(getCryptoProState());
});

router.get("/crypto-pro/stats", (_req, res) => {
  res.json(getCryptoProStats());
});

router.get("/crypto-pro/balance", (_req, res) => {
  const state = getCryptoProState();
  res.json({
    balance: state.balance,
    equity: state.equity,
    unrealisedPnl: state.positions.reduce((s, p) => s + p.unrealisedPnl, 0),
    usedMargin: state.positions.reduce((s, p) => s + p.margin, 0),
  });
});

router.get("/crypto-pro/positions", (_req, res) => {
  updateCryptoOpenPositions();
  res.json(getCryptoProState().positions);
});

router.get("/crypto-pro/log", (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "50"));
  res.json(getCryptoProState().tradeLog.slice(0, limit));
});

// ─── Indikator Crypto Khusus ──────────────────────────────────────────────────

router.get("/crypto-pro/fear-greed", async (_req, res) => {
  try {
    const data = await fetchFearGreed();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "Gagal ambil Fear & Greed" });
  }
});

router.get("/crypto-pro/btc-dominance", (_req, res) => {
  res.json(getBtcDominance());
});

router.get("/crypto-pro/funding-rates", (_req, res) => {
  res.json(getFundingRates());
});

router.get("/crypto-pro/open-interest", (_req, res) => {
  res.json(getOpenInterest());
});

router.get("/crypto-pro/on-chain", (_req, res) => {
  res.json(getOnChainMetrics());
});

router.get("/crypto-pro/social-sentiment", (_req, res) => {
  res.json(getSocialSentiment());
});

router.get("/crypto-pro/whale-activity", (_req, res) => {
  res.json(getWhaleActivity());
});

router.get("/crypto-pro/liquidation-heatmap", (_req, res) => {
  res.json(getLiquidationHeatmap());
});

// ─── Analisis AI ──────────────────────────────────────────────────────────────

router.get("/crypto-pro/analyze/:symbol", async (req, res) => {
  const { symbol } = req.params;
  if (!CRYPTO_UNIVERSE.find(c => c.symbol === symbol)) {
    return res.status(404).json({ error: "Simbol tidak ditemukan" });
  }

  const state = getCryptoProState();
  const config = getCryptoProConfig();
  const fg = await fetchFearGreed().catch(() => null);
  const whale = getWhaleActivity();
  const funding = getFundingRates().find(f => f.symbol === symbol);
  const onChain = getOnChainMetrics();
  const btcDom = getBtcDominance();
  const decision = makeCryptoAiDecision(symbol, fg, whale, funding, onChain, btcDom, config, state);

  res.json({
    symbol,
    analyzedAt: Date.now(),
    fearGreed: fg,
    whale,
    fundingRate: funding,
    onChain,
    btcDominance: btcDom,
    social: getSocialSentiment(),
    liquidations: getLiquidationHeatmap(),
    aiDecision: decision,
  });
});

// ─── Scan Semua Aset ──────────────────────────────────────────────────────────

router.get("/crypto-pro/scan", async (_req, res) => {
  const state = getCryptoProState();
  const config = getCryptoProConfig();
  const fg = await fetchFearGreed().catch(() => null);
  const whale = getWhaleActivity();
  const onChain = getOnChainMetrics();
  const btcDom = getBtcDominance();
  const fundingRates = getFundingRates();

  const results = CRYPTO_UNIVERSE.slice(0, 8).map(asset => {
    const candles = getCryptoCandles(asset.symbol, "H1", 50);
    const closes = candles.map(c => c.close);
    const cp = closes[closes.length - 1] ?? asset.basePrice;
    const funding = fundingRates.find(f => f.symbol === asset.symbol);
    const decision = makeCryptoAiDecision(asset.symbol, fg, whale, funding, onChain, btcDom, config, state);

    return {
      symbol: asset.symbol,
      name: asset.name,
      emoji: asset.emoji,
      category: asset.category,
      price: cp,
      change24h: ((cp - asset.basePrice) / asset.basePrice * 100).toFixed(2),
      confidence: decision.confidence,
      direction: decision.direction,
      shouldTrade: decision.shouldTrade,
      strategy: decision.strategy,
      qualityScore: decision.qualityScore,
      marketRegime: decision.marketRegime,
      fundingRate: funding?.rate ?? 0,
    };
  });

  res.json(results);
});

// ─── Order Management ─────────────────────────────────────────────────────────

router.post("/crypto-pro/order", (req, res) => {
  const { symbol, direction, size } = req.body as {
    symbol: string; direction: "Buy" | "Sell"; size?: number;
  };
  if (!symbol || !direction) return res.status(400).json({ error: "symbol dan direction wajib" });
  const result = openCryptoProPosition(symbol, direction, true, size);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.post("/crypto-pro/close/:id", (req, res) => {
  const result = closeCryptoProPosition(req.params.id, "Manual");
  if (!result.ok) return res.status(404).json({ error: "Posisi tidak ditemukan" });
  res.json(result);
});

// ─── Config ───────────────────────────────────────────────────────────────────

router.get("/crypto-pro/config", (_req, res) => {
  res.json(getCryptoProConfig());
});

router.put("/crypto-pro/config", (req, res) => {
  res.json(updateCryptoProConfig(req.body));
});

// ─── Reset ────────────────────────────────────────────────────────────────────

router.post("/crypto-pro/reset", (_req, res) => {
  resetCryptoPro();
  res.json({ ok: true, message: "Crypto Pro direset ke saldo awal $500" });
});

export default router;
