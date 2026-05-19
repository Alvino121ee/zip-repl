/**
 * MT5 Python Bridge — Route Handler
 * Endpoint yang dipanggil oleh script Python di PC Windows user.
 */

import { Router } from "express";
import {
  validateSecret,
  receivePushData,
  getBridgeStatus,
  consumePendingOrders,
  reportOrderResult,
  getBridgeSecret,
} from "../services/mt5-python-bridge.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Push data dari Python script ─────────────────────────────────────────────
// Dipanggil script Python setiap beberapa detik
router.post("/mt5-bridge/push", (req, res) => {
  const { secret, account, positions, prices } = req.body as {
    secret: string;
    account: any;
    positions: any[];
    prices: Record<string, any>;
  };

  if (!validateSecret(secret)) {
    logger.warn("MT5 Bridge: secret tidak cocok, push ditolak");
    return res.status(401).json({ error: "Secret tidak valid" });
  }

  if (!account || !positions || !prices) {
    return res.status(400).json({ error: "Data tidak lengkap (butuh: account, positions, prices)" });
  }

  receivePushData({ account, positions, prices });
  res.json({ ok: true, serverTime: Date.now() });
});

// ─── Status bridge ─────────────────────────────────────────────────────────────
// Dicek oleh frontend
router.get("/mt5-bridge/status", (_req, res) => {
  res.json(getBridgeStatus());
});

// ─── Python script ambil pending orders ───────────────────────────────────────
// Python polling ini untuk tau ada order yang harus dieksekusi
router.get("/mt5-bridge/orders/pending", (req, res) => {
  const { secret } = req.query as { secret?: string };
  if (!secret || !validateSecret(secret)) {
    return res.status(401).json({ error: "Secret tidak valid" });
  }
  const orders = consumePendingOrders();
  res.json(orders);
});

// ─── Python script lapor hasil order ──────────────────────────────────────────
router.post("/mt5-bridge/orders/result", (req, res) => {
  const { secret, id, ok, ticket, error: errMsg } = req.body as {
    secret: string;
    id: string;
    ok: boolean;
    ticket?: number;
    error?: string;
  };

  if (!validateSecret(secret)) {
    return res.status(401).json({ error: "Secret tidak valid" });
  }

  if (!id) {
    return res.status(400).json({ error: "id order wajib diisi" });
  }

  reportOrderResult({ id, ok, ticket, error: errMsg });
  res.json({ ok: true });
});

// ─── Info untuk frontend (URL + secret hint) ──────────────────────────────────
router.get("/mt5-bridge/info", (_req, res) => {
  res.json({
    secretHint: getBridgeSecret().slice(0, 4) + "****",
    note: "Gunakan secret dari env MT5_BRIDGE_SECRET (default: vinzpredict2024)",
  });
});

export default router;
