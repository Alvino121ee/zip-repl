import { Router, type IRouter } from "express";
import {
  runGeminiSession,
  startAutoLearning,
  stopAutoLearning,
  startContinuousMode,
  stopContinuousMode,
  isContinuousActive,
  getGeminiStatus,
  getApiKeyStatus,
  addStoredKey,
  removeStoredKey,
  getAvailableTopics,
  getTotalQuestions,
  getSkillNeeds,
} from "../services/gemini-learning.js";

const router: IRouter = Router();

router.get("/gemini-learning/status", (_req, res) => {
  res.json(getGeminiStatus());
});

router.get("/gemini-learning/topics", (_req, res) => {
  res.json({ topics: getAvailableTopics(), totalQuestions: getTotalQuestions() });
});

router.get("/gemini-learning/skill-needs", (_req, res) => {
  res.json({ skills: getSkillNeeds() });
});

router.get("/gemini-learning/keys", (_req, res) => {
  res.json({ keys: getApiKeyStatus() });
});

router.post("/gemini-learning/keys", (req, res) => {
  const { key } = (req.body ?? {}) as { key?: string };
  if (!key?.trim()) {
    res.status(400).json({ ok: false, message: "Key tidak boleh kosong" });
    return;
  }
  const result = addStoredKey(key.trim());
  res.status(result.ok ? 200 : 400).json(result);
});

router.delete("/gemini-learning/keys/:index", (req, res) => {
  const index = parseInt(req.params.index ?? "-1", 10);
  const result = removeStoredKey(index);
  res.status(result.ok ? 200 : 400).json(result);
});

router.post("/gemini-learning/session", async (req, res) => {
  const { questionCount } = (req.body ?? {}) as { questionCount?: number };
  const count = Math.min(Math.max(Number(questionCount) || 5, 1), 15);
  try {
    const session = await runGeminiSession(count);
    res.json({ success: true, session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

router.post("/gemini-learning/auto/start", (req, res) => {
  const { intervalMinutes } = (req.body ?? {}) as { intervalMinutes?: number };
  const interval = Math.min(Math.max(Number(intervalMinutes) || 60, 10), 1440);
  startAutoLearning(interval);
  res.json({ started: true, intervalMinutes: interval, message: `Mode otomatis aktif — sesi setiap ${interval} menit` });
});

router.post("/gemini-learning/auto/stop", (_req, res) => {
  stopAutoLearning();
  res.json({ stopped: true, message: "Mode otomatis dinonaktifkan" });
});

router.post("/gemini-learning/continuous/start", (req, res) => {
  const { questionCount } = (req.body ?? {}) as { questionCount?: number };
  const count = Math.min(Math.max(Number(questionCount) || 5, 1), 15);
  if (isContinuousActive()) {
    res.status(409).json({ error: "Mode berkelanjutan sudah aktif" });
    return;
  }
  startContinuousMode(count).catch(() => {});
  res.json({ started: true, message: `Mode belajar berkelanjutan dimulai (${count} pertanyaan/sesi)` });
});

router.post("/gemini-learning/continuous/stop", (_req, res) => {
  stopContinuousMode();
  res.json({ stopped: true, message: "Mode belajar berkelanjutan dihentikan setelah sesi ini selesai" });
});

export default router;
