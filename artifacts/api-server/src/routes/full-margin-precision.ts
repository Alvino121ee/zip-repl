import { Router } from "express";
import {
  fmpConfig,
  fmpStatus,
  fmpLog,
  fmpLearning,
  updateFMPConfig,
  closeFMPPosition,
  startFMPEngine,
  stopFMPEngine,
  type FMPConfig,
} from "../services/full-margin-precision.js";

const router = Router();

// GET /api/fmp/status
router.get("/fmp/status", (_req, res) => {
  res.json(fmpStatus);
});

// GET /api/fmp/config
router.get("/fmp/config", (_req, res) => {
  res.json(fmpConfig);
});

// PUT /api/fmp/config
router.put("/fmp/config", (req, res) => {
  const update = req.body as Partial<FMPConfig>;
  updateFMPConfig(update);
  res.json({ config: fmpConfig, status: fmpStatus });
});

// POST /api/fmp/start
router.post("/fmp/start", (_req, res) => {
  fmpConfig.enabled = true;
  startFMPEngine();
  res.json({ ok: true, status: fmpStatus });
});

// POST /api/fmp/stop
router.post("/fmp/stop", (_req, res) => {
  fmpConfig.enabled = false;
  stopFMPEngine();
  res.json({ ok: true, status: fmpStatus });
});

// POST /api/fmp/close — tutup posisi aktif secara manual
router.post("/fmp/close", async (req, res) => {
  if (!fmpStatus.activePosition) {
    res.status(400).json({ error: "Tidak ada posisi aktif" });
    return;
  }
  try {
    await closeFMPPosition("manual_close");
    res.json({ ok: true, status: fmpStatus });
  } catch (err) {
    req.log.error({ err }, "FMP manual close failed");
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/fmp/log
router.get("/fmp/log", (_req, res) => {
  res.json(fmpLog);
});

// GET /api/fmp/learning
router.get("/fmp/learning", (_req, res) => {
  res.json(fmpLearning);
});

export default router;
