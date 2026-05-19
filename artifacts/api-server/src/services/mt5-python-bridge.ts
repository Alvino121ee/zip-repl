/**
 * MT5 Python Bridge Service
 * Menerima data dari script Python yang berjalan di PC Windows dengan MT5 terpasang.
 * Gratis — pakai library resmi MetaTrader5 dari MetaQuotes.
 */

import { logger } from "../lib/logger.js";

const BRIDGE_TIMEOUT_MS = 20000; // 20 detik tanpa push = dianggap putus

export interface BridgeAccount {
  login: string;
  server: string;
  broker: string;
  name: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  profit: number;
  currency: string;
  leverage: number;
}

export interface BridgePosition {
  ticket: number;
  symbol: string;
  type: "buy" | "sell";
  volume: number;
  priceOpen: number;
  priceCurrent: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  comment: string;
  openTime: number;
}

export interface BridgePrice {
  bid: number;
  ask: number;
  time: number;
}

export interface PendingOrder {
  id: string;
  symbol: string;
  type: "buy" | "sell";
  volume: number;
  sl?: number;
  tp?: number;
  comment?: string;
  createdAt: number;
}

export interface OrderResult {
  id: string;
  ok: boolean;
  ticket?: number;
  error?: string;
  doneAt: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface BridgeState {
  connected: boolean;
  lastSeen: number;
  account: BridgeAccount | null;
  positions: BridgePosition[];
  prices: Record<string, BridgePrice>;
  pendingOrders: PendingOrder[];
  orderResults: Record<string, OrderResult>;
  secret: string;
}

const state: BridgeState = {
  connected: false,
  lastSeen: 0,
  account: null,
  positions: [],
  prices: {},
  pendingOrders: [],
  orderResults: {},
  secret: process.env["MT5_BRIDGE_SECRET"] ?? "vinzpredict2024",
};

// ─── Fungsi Utama ─────────────────────────────────────────────────────────────

export function isPythonBridgeConnected(): boolean {
  return Date.now() - state.lastSeen < BRIDGE_TIMEOUT_MS;
}

export function getBridgeSecret(): string {
  return state.secret;
}

export function validateSecret(incoming: string): boolean {
  return incoming === state.secret;
}

export function receivePushData(data: {
  account: BridgeAccount;
  positions: BridgePosition[];
  prices: Record<string, BridgePrice>;
}): void {
  const wasConnected = isPythonBridgeConnected();
  state.lastSeen = Date.now();
  state.connected = true;
  state.account = data.account;
  state.positions = data.positions;
  state.prices = data.prices;

  if (!wasConnected) {
    logger.info(
      { login: data.account.login, server: data.account.server },
      "MT5 Python Bridge: terhubung"
    );
  }
}

export function getBridgeAccount(): BridgeAccount | null {
  if (!isPythonBridgeConnected()) return null;
  return state.account;
}

export function getBridgePositions(): BridgePosition[] {
  if (!isPythonBridgeConnected()) return [];
  return state.positions;
}

export function getBridgePrices(): Record<string, BridgePrice> {
  if (!isPythonBridgeConnected()) return {};
  return state.prices;
}

export function getBridgeStatus() {
  const connected = isPythonBridgeConnected();
  return {
    connected,
    lastSeen: state.lastSeen,
    secondsSinceLastPush: state.lastSeen
      ? Math.floor((Date.now() - state.lastSeen) / 1000)
      : null,
    account: connected ? state.account : null,
    positionCount: connected ? state.positions.length : 0,
  };
}

// ─── Antrian Order ────────────────────────────────────────────────────────────

export function queueOrder(order: Omit<PendingOrder, "createdAt">): PendingOrder {
  const full: PendingOrder = { ...order, createdAt: Date.now() };
  state.pendingOrders.push(full);
  logger.info({ orderId: order.id, symbol: order.symbol, type: order.type }, "MT5 Bridge: order diantrekan");
  return full;
}

export function getPendingOrders(): PendingOrder[] {
  // Bersihkan order yang sudah lebih dari 2 menit (timeout)
  const cutoff = Date.now() - 120_000;
  state.pendingOrders = state.pendingOrders.filter(o => o.createdAt > cutoff);
  return state.pendingOrders;
}

export function consumePendingOrders(): PendingOrder[] {
  const orders = [...state.pendingOrders];
  state.pendingOrders = [];
  return orders;
}

export function reportOrderResult(result: Omit<OrderResult, "doneAt">): void {
  const full: OrderResult = { ...result, doneAt: Date.now() };
  state.orderResults[result.id] = full;
  logger.info({ orderId: result.id, ok: result.ok, ticket: result.ticket }, "MT5 Bridge: hasil order diterima");
  // Hapus hasil lama (lebih dari 5 menit)
  const cutoff = Date.now() - 300_000;
  for (const key of Object.keys(state.orderResults)) {
    if ((state.orderResults[key]?.doneAt ?? 0) < cutoff) {
      delete state.orderResults[key];
    }
  }
}

export function getOrderResult(id: string): OrderResult | null {
  return state.orderResults[id] ?? null;
}

export function removeOrderResult(id: string): void {
  delete state.orderResults[id];
}
