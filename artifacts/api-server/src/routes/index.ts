import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import marketRouter from "./market.js";
import newsRouter from "./news.js";
import predictionsRouter from "./predictions.js";
import tradingRouter from "./trading.js";
import aiRouter from "./ai.js";
import predictionLocksRouter from "./prediction-locks.js";
import demoTradingRouter from "./demo-trading.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketRouter);
router.use(newsRouter);
router.use(predictionsRouter);
router.use(tradingRouter);
router.use(aiRouter);
router.use(predictionLocksRouter);
router.use(demoTradingRouter);

export default router;
