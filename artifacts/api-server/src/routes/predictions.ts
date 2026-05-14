import { Router } from "express";
import { getCryptoPredictions, getStockPredictions } from "../services/predictions.js";
import { getCryptoNews, getStockNews } from "../services/news.js";
import { GetPredictionsQueryParams, GetPredictionDetailParams } from "@workspace/api-zod";
import { cache, PREDICTION_LOCK_MS } from "../services/cache.js";

const router = Router();

/** Attach lock metadata headers so the client knows when predictions expire */
function attachLockHeaders(res: import("express").Response, type: string, limit: number): void {
  const cryptoKey = `crypto-predictions-${type === "stock" ? 0 : limit}`;
  const stockKey = `stock-predictions-${type === "crypto" ? 0 : limit}`;
  // Use the earliest non-null expiry so client refreshes at the right time
  const expiryA = cache.getExpiresAt(cryptoKey);
  const expiryB = cache.getExpiresAt(stockKey);
  const lockedUntil = expiryA ?? expiryB ?? Date.now() + PREDICTION_LOCK_MS;
  res.setHeader("X-Prediction-Locked-Until", String(lockedUntil));
  res.setHeader("X-Prediction-Lock-Duration-Ms", String(PREDICTION_LOCK_MS));
}

router.get("/predictions", async (req, res) => {
  const parse = GetPredictionsQueryParams.safeParse(req.query);
  const type = parse.success ? (parse.data.type ?? "all") : "all";
  const limit = parse.success ? (parse.data.limit ?? 20) : 20;

  try {
    if (type === "crypto") {
      const preds = await getCryptoPredictions(limit);
      attachLockHeaders(res, type, limit);
      res.json(preds.map(({ technicalIndicators: _ti, ...p }) => p));
      return;
    }

    if (type === "stock") {
      const preds = await getStockPredictions(limit);
      attachLockHeaders(res, type, limit);
      res.json(preds.map(({ technicalIndicators: _ti, ...p }) => p));
      return;
    }

    const [cryptoPreds, stockPreds] = await Promise.all([
      getCryptoPredictions(Math.ceil(limit * 0.6)),
      getStockPredictions(Math.floor(limit * 0.4)),
    ]);

    const merged = [...cryptoPreds, ...stockPreds]
      .map(({ technicalIndicators: _ti, ...p }) => p)
      .sort((a, b) => Math.abs(b.sentimentScore) - Math.abs(a.sentimentScore));

    attachLockHeaders(res, type, limit);
    res.json(merged.slice(0, limit));
  } catch (err) {
    req.log.error({ err }, "Failed to get predictions");
    res.status(502).json({ error: "Failed to fetch predictions" });
  }
});

router.get("/predictions/:assetType/:assetId", async (req, res) => {
  const parse = GetPredictionDetailParams.safeParse(req.params);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const { assetType, assetId } = parse.data;

  try {
    let predictions;
    if (assetType === "crypto") {
      predictions = await getCryptoPredictions(100);
    } else {
      predictions = await getStockPredictions(50);
    }

    const found = predictions.find(
      (p) => p.assetId === assetId || p.symbol.toLowerCase() === assetId.toLowerCase()
    );

    if (!found) {
      res.status(404).json({ error: "Asset prediction not found" });
      return;
    }

    // Attach related news
    const news =
      assetType === "crypto" ? await getCryptoNews(50) : await getStockNews(30);

    const relatedNews = news
      .filter(
        (n) =>
          (n.tags ?? []).some(
            (a) => a.toLowerCase() === found.symbol.toLowerCase()
          ) ||
          n.title.toLowerCase().includes(found.assetName.toLowerCase()) ||
          n.title.toLowerCase().includes(found.symbol.toLowerCase())
      )
      .slice(0, 10);

    res.json({
      ...found,
      newsItems: relatedNews,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get prediction detail");
    res.status(502).json({ error: "Failed to fetch prediction detail" });
  }
});

export default router;
