/**
 * MetaApi MT5 Bridge — Koneksi nyata ke MetaTrader 5
 * Menggunakan MetaApi REST API (metaapi.cloud)
 * Tidak perlu SDK besar, cukup fetch ke REST endpoint
 */

import { logger } from "../lib/logger.js";

const PROVISIONING_BASE =
  "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/v1";
const CLIENT_BASE =
  "https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai/v1";

export function hasMetaApiToken(): boolean {
  return !!process.env.METAAPI_TOKEN;
}

function getToken(): string {
  const t = process.env.METAAPI_TOKEN;
  if (!t) throw new Error("METAAPI_TOKEN belum dikonfigurasi di Secrets");
  return t;
}

function authHeaders(): Record<string, string> {
  return {
    "auth-token": getToken(),
    "Content-Type": "application/json",
  };
}

// ─── Tipe ─────────────────────────────────────────────────────────────────────

export interface MT5RealAccountInfo {
  accountId: string;
  login: string;
  server: string;
  accountName: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  currency: string;
  broker: string;
  leverage: number;
  connected: boolean;
}

// ─── Provisioning API ─────────────────────────────────────────────────────────

async function findExistingAccount(
  login: string,
  server: string
): Promise<string | null> {
  try {
    const r = await fetch(
      `${PROVISIONING_BASE}/users/current/accounts?limit=1000`,
      { headers: authHeaders() }
    );
    if (!r.ok) return null;
    const accounts = (await r.json()) as any[];
    if (!Array.isArray(accounts)) return null;
    const found = accounts.find(
      (a: any) => String(a.login) === String(login) && a.server === server
    );
    return found ? (found._id ?? found.id) : null;
  } catch {
    return null;
  }
}

async function createAccount(
  server: string,
  login: string,
  password: string
): Promise<string> {
  const r = await fetch(`${PROVISIONING_BASE}/users/current/accounts`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name: `VINZ-${login}`,
      type: "cloud",
      login,
      password,
      server,
      platform: "mt5",
      application: "MetaApi",
      magic: 0,
      region: "singapore",
    }),
  });
  const body = await r.json().catch(() => ({})) as any;
  if (!r.ok) {
    throw new Error(body.message ?? `Gagal membuat akun MetaApi: HTTP ${r.status}`);
  }
  const id = body._id ?? body.id;
  if (!id) throw new Error("MetaApi tidak mengembalikan account ID");
  return id;
}

async function deployAccount(accountId: string): Promise<void> {
  const r = await fetch(
    `${PROVISIONING_BASE}/users/current/accounts/${accountId}/deploy`,
    { method: "POST", headers: authHeaders() }
  );
  if (!r.ok && r.status !== 409) {
    const body = await r.json().catch(() => ({})) as any;
    throw new Error(body.message ?? `Deploy gagal: HTTP ${r.status}`);
  }
}

async function waitForConnected(
  accountId: string,
  timeoutMs = 120000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(
        `${PROVISIONING_BASE}/users/current/accounts/${accountId}`,
        { headers: authHeaders() }
      );
      if (r.ok) {
        const acc = (await r.json()) as any;
        logger.info(
          { state: acc.state, connectionStatus: acc.connectionStatus },
          "MetaApi: status akun"
        );
        if (
          acc.state === "DEPLOYED" &&
          acc.connectionStatus === "CONNECTED"
        ) {
          return true;
        }
        if (acc.state === "DEPLOY_FAILED") {
          throw new Error(
            "Deploy MT5 gagal — periksa server broker, nomor login, dan password."
          );
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Deploy MT5 gagal"))
        throw e;
    }
    await new Promise((res) => setTimeout(res, 4000));
  }
  return false;
}

// ─── Client API ───────────────────────────────────────────────────────────────

export async function fetchAccountInformation(
  accountId: string
): Promise<any> {
  const r = await fetch(
    `${CLIENT_BASE}/users/current/accounts/${accountId}/account-information`,
    { headers: authHeaders() }
  );
  if (!r.ok) {
    throw new Error(`Gagal mengambil info akun: HTTP ${r.status}`);
  }
  return r.json();
}

export async function fetchPositionsReal(accountId: string): Promise<any[]> {
  try {
    const r = await fetch(
      `${CLIENT_BASE}/users/current/accounts/${accountId}/positions`,
      { headers: authHeaders() }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function placeOrderReal(
  accountId: string,
  symbol: string,
  type: "ORDER_TYPE_BUY" | "ORDER_TYPE_SELL",
  volume: number,
  stopLoss?: number,
  takeProfit?: number
): Promise<{ orderId?: string; error?: string }> {
  try {
    const r = await fetch(
      `${CLIENT_BASE}/users/current/accounts/${accountId}/trade`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          actionType: type,
          symbol,
          volume,
          ...(stopLoss ? { stopLoss } : {}),
          ...(takeProfit ? { takeProfit } : {}),
        }),
      }
    );
    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      return { error: data.message ?? `Order gagal: HTTP ${r.status}` };
    }
    return { orderId: data.orderId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error tidak diketahui" };
  }
}

export async function closePositionReal(
  accountId: string,
  positionId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(
      `${CLIENT_BASE}/users/current/accounts/${accountId}/trade`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          actionType: "POSITION_CLOSE_ID",
          positionId,
        }),
      }
    );
    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      return { ok: false, error: data.message ?? `Gagal tutup posisi: HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error tidak diketahui" };
  }
}

// ─── Main Connect ──────────────────────────────────────────────────────────────

export async function connectMT5Real(
  server: string,
  login: string,
  password: string
): Promise<MT5RealAccountInfo> {
  logger.info(
    { server, login: login.slice(0, 4) + "****" },
    "MetaApi: memulai koneksi MT5"
  );

  let accountId = await findExistingAccount(login, server);

  if (accountId) {
    logger.info({ accountId }, "MetaApi: akun ditemukan, menghubungkan ulang");
  } else {
    logger.info("MetaApi: membuat koneksi MT5 baru");
    accountId = await createAccount(server, login, password);
    logger.info({ accountId }, "MetaApi: akun berhasil dibuat");
  }

  await deployAccount(accountId);
  logger.info({ accountId }, "MetaApi: deploy dimulai, menunggu koneksi MT5...");

  const connected = await waitForConnected(accountId, 120000);
  if (!connected) {
    throw new Error(
      "Timeout 120 detik: MT5 belum terhubung. Coba lagi dalam beberapa menit atau periksa kredensial."
    );
  }

  const info = await fetchAccountInformation(accountId);

  const serverLower = server.toLowerCase();
  let broker = "Unknown Broker";
  if (serverLower.includes("icmarket") || serverLower.includes("ic-"))
    broker = "IC Markets";
  else if (serverLower.includes("xm")) broker = "XM Global";
  else if (serverLower.includes("exness")) broker = "Exness";
  else if (serverLower.includes("fbs")) broker = "FBS";
  else if (serverLower.includes("fxpro")) broker = "FxPro";
  else if (serverLower.includes("pepperstone")) broker = "Pepperstone";
  else if (serverLower.includes("axiory")) broker = "Axiory";
  else if (serverLower.includes("hotforex") || serverLower.includes("hfm"))
    broker = "HFM";
  else broker = server.split("-")[0] ?? server.split(".")[0] ?? "Broker";

  return {
    accountId,
    login,
    server,
    accountName: info.name ?? `Akun #${login}`,
    balance: info.balance ?? 0,
    equity: info.equity ?? 0,
    margin: info.margin ?? 0,
    freeMargin: info.freeMargin ?? 0,
    currency: info.currency ?? "USD",
    broker,
    leverage: info.leverage ?? 100,
    connected: true,
  };
}

export async function disconnectMT5Real(accountId: string): Promise<void> {
  try {
    const r = await fetch(
      `${PROVISIONING_BASE}/users/current/accounts/${accountId}/undeploy`,
      { method: "POST", headers: authHeaders() }
    );
    if (!r.ok) {
      logger.warn({ status: r.status }, "MetaApi: undeploy gagal (diabaikan)");
    } else {
      logger.info({ accountId }, "MetaApi: akun berhasil di-undeploy");
    }
  } catch (e) {
    logger.warn({ err: e }, "MetaApi: error saat undeploy (diabaikan)");
  }
}

export function getBrokerFromServer(server: string): string {
  const serverLower = server.toLowerCase();
  if (serverLower.includes("icmarket") || serverLower.includes("ic-"))
    return "IC Markets";
  if (serverLower.includes("xm")) return "XM Global";
  if (serverLower.includes("exness")) return "Exness";
  if (serverLower.includes("fbs")) return "FBS";
  if (serverLower.includes("fxpro")) return "FxPro";
  if (serverLower.includes("pepperstone")) return "Pepperstone";
  if (serverLower.includes("axiory")) return "Axiory";
  if (serverLower.includes("hotforex") || serverLower.includes("hfm"))
    return "HFM";
  return server.split("-")[0] ?? server.split(".")[0] ?? "Broker";
}
