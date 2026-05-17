import { Router, type IRouter } from "express";
import {
  runGeminiSession,
  startAutoLearning,
  stopAutoLearning,
  startContinuousMode,
  stopContinuousMode,
  isContinuousActive,
  getGeminiStatus,
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
  res.json({ started: true, message: `Mode belajar berkelanjutan dimulai — terus jalan sampai dimatikan (${count} pertanyaan/sesi)` });
});

router.post("/gemini-learning/continuous/stop", (_req, res) => {
  stopContinuousMode();
  res.json({ stopped: true, message: "Mode belajar berkelanjutan dihentikan setelah sesi ini selesai" });
});

export default router;
