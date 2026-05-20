import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { loadForexProState, startForexProAutoEngine, getForexProConfig } from "./services/forex-pro.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ─── Boot: load Forex Pro state & auto-start engine ───────────────────────────
try {
  loadForexProState();
  const fpCfg = getForexProConfig();
  if (fpCfg.autoEnabled) {
    startForexProAutoEngine();
    logger.info("Forex Pro auto engine dimulai dari saved config");
  }
} catch (e) {
  logger.warn({ err: e }, "Forex Pro boot init gagal (diabaikan)");
}

export default app;
