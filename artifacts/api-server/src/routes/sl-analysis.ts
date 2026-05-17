import { Router, type IRouter } from "express";
import {
  analyzeSLFailure,
  getSLAnalyticsStats,
  getSLFailureRecord,
  getAllSLRecords,
  getSLPatterns,
  getShouldAvoidSetup,
  FAILURE_CAUSE_LABELS,
  FAILURE_CAUSE_ICONS,
  type SLAnalysisInput,
} from "../services/sl-failure-analysis.js";

const router: IRouter = Router();

// GET /api/sl-analysis/stats — aggregate analytics & stats
router.get("/sl-analysis/stats", (_req, res) => {
  res.json(getSLAnalyticsStats());
});

// GET /api/sl-analysis/records — all SL failure records (paginated)
router.get("/sl-analysis/records", (req, res) => {
  const limit = parseInt((req.query.limit as string) ?? "50", 10);
  const offset = parseInt((req.query.offset as string) ?? "0", 10);
  const all = getAllSLRecords();
  res.json({
    total: all.length,
    records: all.slice(offset, offset + limit),
  });
});

// GET /api/sl-analysis/patterns — detected recurring patterns
router.get("/sl-analysis/patterns", (_req, res) => {
  res.json(getSLPatterns());
});

// GET /api/sl-analysis/causes — cause labels + icons reference
router.get("/sl-analysis/causes", (_req, res) => {
  res.json(
    Object.entries(FAILURE_CAUSE_LABELS).map(([key, label]) => ({
      key,
      label,
      icon: FAILURE_CAUSE_ICONS[key as keyof typeof FAILURE_CAUSE_ICONS] ?? "❓",
    }))
  );
});

// GET /api/sl-analysis/:id — single record detail
router.get("/sl-analysis/:id", (req, res) => {
  const record = getSLFailureRecord(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Record tidak ditemukan" });
    return;
  }
  res.json(record);
});

// POST /api/sl-analysis/analyze — manually trigger analysis (for testing / replay)
router.post("/sl-analysis/analyze", (req, res) => {
  const input = req.body as SLAnalysisInput;
  if (!input?.symbol || !input?.tradeId) {
    res.status(400).json({ error: "Field wajib: symbol, tradeId" });
    return;
  }
  const record = analyzeSLFailure(input);
  res.json(record);
});

// GET /api/sl-analysis/check-setup — check if current conditions should be avoided
router.get("/sl-analysis/check-setup", (req, res) => {
  const confidence = req.query.confidence ? parseFloat(req.query.confidence as string) : undefined;
  const volumeRatio = req.query.volumeRatio ? parseFloat(req.query.volumeRatio as string) : undefined;
  const marketCondition = req.query.marketCondition as string | undefined;
  const isChoppy = req.query.isChoppy === "true";
  const result = getShouldAvoidSetup({ marketCondition, confidence, volumeRatio, isChoppy });
  res.json(result ?? { shouldAvoid: false, reason: null });
});

export default router;
