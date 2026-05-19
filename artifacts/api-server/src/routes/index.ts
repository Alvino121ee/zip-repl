import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import marketRouter from "./market.js";
import newsRouter from "./news.js";
import predictionsRouter from "./predictions.js";
import tradingRouter from "./trading.js";
import aiRouter from "./ai.js";
import predictionLocksRouter from "./prediction-locks.js";
import demoTradingRouter from "./demo-trading.js";
import trainingLabRouter from "./training-lab.js";
import slAnalysisRouter from "./sl-analysis.js";
import fmpRouter from "./full-margin-precision.js";
import geminiLearningRouter from "./gemini-learning.js";
import demoForexRouter from "./demo-forex.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketRouter);
router.use(newsRouter);
router.use(predictionsRouter);
router.use(tradingRouter);
router.use(aiRouter);
router.use(predictionLocksRouter);
router.use(demoTradingRouter);
router.use(demoForexRouter);
router.use(trainingLabRouter);
router.use(slAnalysisRouter);
router.use(fmpRouter);
router.use(geminiLearningRouter);

export default router;
