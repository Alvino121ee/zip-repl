import { Router, type IRouter } from "express";
import {
  runTrainingLab,
  stopTrainingLab,
  getTrainingLabState,
  getTrainingLabResults,
  getStrategyComparison,
  TRAINING_PAIRS,
  TRAINING_STRATEGIES,
  type StrategyName,
} from "../services/ai-training-lab.js";

const STRATEGY_LABELS: Record<StrategyName, string> = {
  scalp_5m: "Scalping 5M (EMA Cross)",
  bos_choch: "Break of Structure / CHOCH",
  order_block: "Order Block Bounce",
  momentum: "Momentum (RSI + MACD)",
  reversal: "Reversal di Level Ekstrem",
  ema_crossover: "EMA 9/21 Crossover",
  vwap_bounce: "VWAP Bounce",
};

const router: IRouter = Router();

router.get("/training-lab/state", (_req, res) => {
  res.json(getTrainingLabState());
});

router.get("/training-lab/results", (_req, res) => {
  res.json(getTrainingLabResults());
});

router.get("/training-lab/comparison", (_req, res) => {
  res.json(getStrategyComparison());
});

router.get("/training-lab/pairs", (_req, res) => {
  res.json({ pairs: TRAINING_PAIRS });
});

router.get("/training-lab/strategies", (_req, res) => {
  res.json({
    strategies: TRAINING_STRATEGIES.map(s => ({
      key: s,
      label: STRATEGY_LABELS[s],
    })),
  });
});

router.post("/training-lab/start", async (req, res) => {
  const { pairs, strategies } = (req.body ?? {}) as {
    pairs?: string[];
    strategies?: StrategyName[];
  };
  const state = getTrainingLabState();
  if (state.isRunning) {
    res.status(409).json({ error: "Training sedang berjalan" });
    return;
  }
  runTrainingLab({ pairs, strategies }).catch(() => {});
  res.json({ started: true, message: "Training lab dimulai" });
});

router.post("/training-lab/stop", (_req, res) => {
  stopTrainingLab();
  res.json({ stopped: true, message: "Training dihentikan" });
});

export default router;
