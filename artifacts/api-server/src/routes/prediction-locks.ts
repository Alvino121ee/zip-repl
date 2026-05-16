import { Router } from "express";
import {
  createLock,
  getAllLocks,
  getLockById,
  forceValidate,
  deleteLock,
  getStats,
  type LockDirection,
  type LockDuration,
} from "../services/prediction-locks.js";

const router = Router();

// GET /api/prediction-locks/stats (must be before /:id)
router.get("/prediction-locks/stats", (_req, res) => {
  try {
    res.json(getStats());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/prediction-locks — all locks
router.get("/prediction-locks", (_req, res) => {
  try {
    res.json(getAllLocks());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/prediction-locks/:id
router.get("/prediction-locks/:id", (req, res) => {
  try {
    const lock = getLockById(req.params.id);
    if (!lock) return res.status(404).json({ error: "Lock not found" });
    res.json(lock);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/prediction-locks — create lock
router.post("/prediction-locks", (req, res) => {
  try {
    const {
      assetId, assetName, assetType, symbol, image,
      direction, entryPrice, lockDurationMinutes,
      confidence, signal, reasoning, strategy,
    } = req.body;

    if (!assetId || !assetName || !assetType || !symbol || !direction || !entryPrice || !lockDurationMinutes) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["LONG", "SHORT"].includes(direction)) {
      return res.status(400).json({ error: "direction must be LONG or SHORT" });
    }

    const validDurations: LockDuration[] = [15, 60, 180, 360, 720, 1440];
    if (!validDurations.includes(lockDurationMinutes)) {
      return res.status(400).json({ error: `lockDurationMinutes must be one of: ${validDurations.join(", ")}` });
    }

    const lock = createLock({
      assetId,
      assetName,
      assetType,
      symbol,
      image: image ?? null,
      direction: direction as LockDirection,
      entryPrice: Number(entryPrice),
      lockDurationMinutes: lockDurationMinutes as LockDuration,
      confidence: Number(confidence) || 50,
      signal: signal || "neutral",
      reasoning: Array.isArray(reasoning) ? reasoning : [],
      strategy: strategy || "rule-based",
    });

    res.status(201).json(lock);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/prediction-locks/:id/validate — force validate
router.post("/prediction-locks/:id/validate", async (req, res) => {
  try {
    const lock = await forceValidate(req.params.id);
    if (!lock) return res.status(404).json({ error: "Lock not found" });
    res.json(lock);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/prediction-locks/:id
router.delete("/prediction-locks/:id", (req, res) => {
  try {
    const deleted = deleteLock(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Lock not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
