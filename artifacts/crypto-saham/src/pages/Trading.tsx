import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity, AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronUp,
  CircleDollarSign, Clock, Loader2, Power, RefreshCw, Settings, ShieldAlert,
  TrendingUp, Wallet, XCircle, Zap, Target, Bell,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  assetId: string;
  symbol: string;
  bybitSymbol: string;
  signal: "strong_buy" | "buy";
  confidence: number;
  price: number;
  riskLevel: "low" | "medium" | "high";
  stopLoss: number | null;
  takeProfit: number | null;
}

interface Position {
  symbol: string;
  side: string;
  size: string;
  avgPrice: string;
  unrealisedPnl: string;
  percentage: string;
  markPrice: string;
  leverage: string;
}

interface AutoConfig {
  enabled: boolean;
  mode: "auto" | "semi";
  minConfidence: number;
  maxPositionUSDT: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPositions: number;
  leverage: number;
  intervalMs: number;
  orderType: "Market" | "Limit";
  limitOffsetPct: number;
  scanSource: "universe" | "predictions";
}

interface TradeLog {
  id: string;
  timestamp: number;
  symbol: string;
  side: string;
  qty: string;
  price: number;
  confidence: number;
  signal: string;
  status: "executed" | "pending" | "rejected" | "cancelled";
  reason?: string;
  orderId?: string;
}

interface EngineStatusData {
  running: boolean;
  analyzing: boolean;
  lastCycleAt: number | null;
  nextCycleAt: number | null;
  cycleCount: number;
  lastSignalsFound: number;
  lastOrdersPlaced: number;
  lastError: string | null;
  config: {
    enabled: boolean;
    mode: string;
    maxPositions: number;
    minConfidence: number;
    maxPositionUSDT: number;
    intervalMs: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

function formatUSDT(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pnlColor(v: string) {
  const n = parseFloat(v);
  if (isNaN(n)) return "text-muted-foreground";
  return n >= 0 ? "text-green-400" : "text-red-400";
}

function smartQty(price: number, usdtAmount: number): string {
  if (!price || price === 0) return "—";
  const raw = usdtAmount / price;
  if (price >= 10000) return Math.max(0.001, Math.floor(raw * 1000) / 1000).toFixed(3);
  if (price >= 100) return Math.max(0.01, Math.floor(raw * 100) / 100).toFixed(2);
  if (price >= 1) return Math.max(1, Math.floor(raw * 10) / 10).toFixed(1);
  return Math.max(10, Math.floor(raw)).toFixed(0);
}

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "baru saja";
  if (diff < 60) return `${diff}s lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
  return `${Math.floor(diff / 3600)}j lalu`;
}

function timeUntil(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.ceil((ts - Date.now()) / 1000);
  if (diff <= 0) return "segera…";
  return `${diff}s`;
}

// ─── Signal Badge ─────────────────────────────────────────────────────────────

function SignalBadge({ signal }: { signal: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    strong_buy: { label: "⚡ STRONG BUY", cls: "bg-green-500/20 text-green-400 border-green-500/40" },
    buy:        { label: "↑ BUY",         cls: "bg-blue-500/20  text-blue-400  border-blue-500/40"  },
  };
  const m = map[signal] ?? { label: signal.toUpperCase(), cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.cls}`}>
      {m.label}
    </span>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

function SignalCard({
  sig, config, onExecute, executing,
}: {
  sig: Signal;
  config: AutoConfig;
  onExecute: (sig: Signal) => void;
  executing: string | null;
}) {
  const qty = smartQty(sig.price, config.maxPositionUSDT);
  const sl = sig.stopLoss ?? sig.price * (1 - config.stopLossPct / 100);
  const tp = sig.takeProfit ?? sig.price * (1 + config.takeProfitPct / 100);
  const isExec = executing === sig.bybitSymbol;

  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-bold text-base">{sig.symbol}</div>
            <div className="text-xs text-muted-foreground">{sig.bybitSymbol}</div>
          </div>
          <div className="text-right">
            <SignalBadge signal={sig.signal} />
            <div className="text-sm font-semibold mt-1">${formatUSDT(sig.price)}</div>
            <div className="text-xs text-muted-foreground">Current Price</div>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Confidence</span>
            <span className="font-semibold text-foreground">{sig.confidence}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${sig.confidence >= 85 ? "bg-green-500" : "bg-blue-500"}`}
              style={{ width: `${sig.confidence}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
          <div className="bg-muted/40 rounded p-2">
            <div className="text-muted-foreground">Qty</div>
            <div className="font-medium">{qty}</div>
          </div>
          <div className="bg-red-950/20 rounded p-2 border border-red-500/20">
            <div className="text-muted-foreground">Stop Loss</div>
            <div className="font-medium text-red-400">{sl != null ? `$${formatUSDT(sl)}` : "—"}</div>
          </div>
          <div className="bg-green-950/20 rounded p-2 border border-green-500/20">
            <div className="text-muted-foreground">Take Profit</div>
            <div className="font-medium text-green-400">{tp != null ? `$${formatUSDT(tp)}` : "—"}</div>
          </div>
        </div>

        {config.mode === "semi" && (
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            size="sm"
            disabled={isExec}
            onClick={() => onExecute(sig)}
          >
            {isExec ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Executing…</>
            ) : (
              <><Zap className="h-3.5 w-3.5 mr-1" /> Execute Order</>
            )}
          </Button>
        )}

        {config.mode === "auto" && config.enabled && (
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <Bot className="h-3.5 w-3.5" />
            <span>Auto-engine akan eksekusi saat kondisi terpenuhi</span>
          </div>
        )}

        {config.mode === "auto" && !config.enabled && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Power className="h-3.5 w-3.5" />
            <span>Aktifkan engine untuk auto-eksekusi</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Position Row ─────────────────────────────────────────────────────────────

function PositionRow({ pos, onSetTPSL }: { pos: Position; onSetTPSL: (p: Position) => void }) {
  const pnl = parseFloat(pos.unrealisedPnl ?? "0");
  const pct = parseFloat(pos.percentage ?? "0");

  return (
    <div className="flex items-start justify-between py-3 border-b border-border last:border-0 gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm">{pos.symbol}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-400 border-blue-500/40">
            {pos.side}
          </Badge>
          <span className="text-xs text-muted-foreground">{pos.leverage}x</span>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>Ukuran: <span className="text-foreground">{pos.size}</span></div>
          <div>Avg Price: <span className="text-foreground">${formatUSDT(pos.avgPrice)}</span></div>
          <div>Mark Price: <span className="text-foreground">${formatUSDT(pos.markPrice)}</span></div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-bold text-base ${pnlColor(pos.unrealisedPnl)}`}>
          {pnl >= 0 ? "+" : ""}{formatUSDT(pnl)} USDT
        </div>
        <div className={`text-xs ${pnlColor(pos.unrealisedPnl)}`}>
          ({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 text-xs h-7 px-2"
          onClick={() => onSetTPSL(pos)}
        >
          <Target className="h-3 w-3 mr-1" /> TP/SL
        </Button>
      </div>
    </div>
  );
}

// ─── TPSL Dialog ──────────────────────────────────────────────────────────────

function TPSLDialog({
  pos, config, onClose, onSave,
}: {
  pos: Position;
  config: AutoConfig;
  onClose: () => void;
  onSave: (symbol: string, tp: number, sl: number) => Promise<void>;
}) {
  const markPrice = parseFloat(pos.markPrice);
  const [tp, setTp] = useState(markPrice * (1 + config.takeProfitPct / 100));
  const [sl, setSl] = useState(markPrice * (1 - config.stopLossPct / 100));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(pos.symbol, tp, sl);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl p-5 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Set TP/SL — {pos.symbol}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Take Profit (USDT)</label>
            <input
              type="number"
              value={tp}
              onChange={(e) => setTp(parseFloat(e.target.value))}
              className="w-full bg-background border border-green-500/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 text-green-400"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Stop Loss (USDT)</label>
            <input
              type="number"
              value={sl}
              onChange={(e) => setSl(parseFloat(e.target.value))}
              className="w-full bg-background border border-red-500/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 text-red-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-center">
          <div className="bg-green-950/20 border border-green-500/20 rounded p-2">
            <div>Profit target</div>
            <div className="text-green-400 font-semibold">
              {(((tp - markPrice) / markPrice) * 100).toFixed(2)}%
            </div>
          </div>
          <div className="bg-red-950/20 border border-red-500/20 rounded p-2">
            <div>Max loss</div>
            <div className="text-red-400 font-semibold">
              {(((sl - markPrice) / markPrice) * 100).toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Set TP/SL
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Engine Status Panel ──────────────────────────────────────────────────────

function EngineStatusPanel({ stat, config }: { stat: EngineStatusData | null; config: AutoConfig }) {
  const [, forceUpdate] = useState(0);

  // Tick every second to update countdown
  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!config.enabled || config.mode !== "auto") return null;

  const isAnalyzing = stat?.analyzing ?? false;
  const lastCycle = stat?.lastCycleAt ?? null;
  const nextCycle = stat?.nextCycleAt ?? null;
  const cycleCount = stat?.cycleCount ?? 0;
  const lastSignals = stat?.lastSignalsFound ?? 0;
  const lastOrders = stat?.lastOrdersPlaced ?? 0;
  const lastError = stat?.lastError ?? null;

  return (
    <div className="mt-3 rounded-lg bg-green-950/20 border border-green-500/20 p-3 space-y-2">
      {/* Analyzing indicator */}
      {isAnalyzing ? (
        <div className="flex items-center gap-2 text-sm text-green-300 font-medium">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Sedang menganalisis sinyal…</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-green-400 font-medium">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          Engine aktif — scan otomatis berjalan
        </div>
      )}

      {/* Timing info */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Scan terakhir: <span className="text-foreground">{timeAgo(lastCycle)}</span></span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span>Berikutnya: <span className="text-foreground">{timeUntil(nextCycle)}</span></span>
        </div>
      </div>

      {/* Last cycle stats */}
      {cycleCount > 0 && (
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>Scan ke-<span className="text-foreground font-medium">{cycleCount}</span></span>
          <span>Sinyal ditemukan: <span className="text-foreground font-medium">{lastSignals}</span></span>
          <span>Order: <span className={lastOrders > 0 ? "text-green-400 font-medium" : "text-foreground font-medium"}>{lastOrders}</span></span>
        </div>
      )}

      {/* Error display */}
      {lastError && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-950/30 rounded p-2 border border-red-500/20">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{lastError}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Trading() {
  const { toast } = useToast();

  const [signals, setSignals] = useState<Signal[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [config, setConfig] = useState<AutoConfig>({
    enabled: false,
    mode: "semi",
    minConfidence: 80,
    maxPositionUSDT: 50,
    stopLossPct: 2,
    takeProfitPct: 4,
    maxPositions: 5,
    leverage: 1,
    intervalMs: 60_000,
    orderType: "Market",
    limitOffsetPct: 0.3,
    scanSource: "universe",
  });
  const [engineStat, setEngineStat] = useState<EngineStatusData | null>(null);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"signals" | "positions" | "log">("signals");
  const [tpslPos, setTpslPos] = useState<Position | null>(null);

  const prevPosCount = useRef<number>(-1);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const [sigRes, posRes, cfgRes, logRes, balRes] = await Promise.allSettled([
        apiFetch<Signal[]>("/api/trading/signals"),
        apiFetch<{ list: Position[] }>("/api/trading/positions"),
        apiFetch<AutoConfig>("/api/trading/config"),
        apiFetch<TradeLog[]>("/api/trading/log"),
        apiFetch<{ list: { coin: { coin: string; walletBalance: string }[] }[] }>("/api/trading/balance"),
      ]);

      if (sigRes.status === "fulfilled") setSignals(sigRes.value);
      if (cfgRes.status === "fulfilled") setConfig(cfgRes.value);
      if (logRes.status === "fulfilled") setTradeLogs(logRes.value);

      if (posRes.status === "fulfilled") {
        const newPositions = posRes.value.list ?? [];
        const newCount = newPositions.length;

        // Detect new position opened
        if (prevPosCount.current >= 0 && newCount > prevPosCount.current) {
          const diff = newCount - prevPosCount.current;
          toast({
            title: `🔔 ${diff} Posisi Baru Dibuka!`,
            description: `Kamu sekarang punya ${newCount} posisi aktif di Bybit. Cek tab Positions.`,
          });
          setActiveTab("positions");
        }
        prevPosCount.current = newCount;
        setPositions(newPositions);
      }

      if (balRes.status === "fulfilled") {
        const coins = balRes.value.list?.[0]?.coin ?? [];
        const usdt = coins.find((c) => c.coin === "USDT");
        setBalance(usdt ? parseFloat(usdt.walletBalance) : null);
      }
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  const loadEngineStat = useCallback(async () => {
    try {
      const stat = await apiFetch<EngineStatusData>("/api/trading/engine-status");
      setEngineStat(stat);
    } catch {
      // silently ignore
    }
  }, []);

  // Initial load
  useEffect(() => { void loadAll(); }, [loadAll]);

  // Poll engine status every 5s when in auto mode
  useEffect(() => {
    void loadEngineStat();
    const id = setInterval(() => { void loadEngineStat(); }, 5000);
    return () => clearInterval(id);
  }, [loadEngineStat]);

  // Auto-refresh all data every 30s when engine is active
  useEffect(() => {
    if (!config.enabled || config.mode !== "auto") return;
    const id = setInterval(() => { void loadAll(true); }, 30_000);
    return () => clearInterval(id);
  }, [config.enabled, config.mode, loadAll]);

  async function updateConfig(patch: Partial<AutoConfig>) {
    const isToggle = "enabled" in patch;
    if (isToggle) setToggling(true);
    const next = { ...config, ...patch };
    setConfig(next);
    try {
      const updated = await apiFetch<AutoConfig>("/api/trading/config", {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      setConfig(updated);

      if (isToggle && "enabled" in patch) {
        if (patch.enabled) {
          toast({ title: "Engine Aktif", description: "Auto-trading engine dimulai. Scan sinyal tiap " + Math.round(updated.intervalMs / 1000) + "s." });
          // Trigger first status refresh
          setTimeout(() => { void loadEngineStat(); }, 500);
        } else {
          toast({ title: "Engine Dimatikan", description: "Auto-trading dihentikan." });
        }
      }
    } catch (err) {
      setConfig(config); // revert on error
      toast({ title: "Config error", description: String(err), variant: "destructive" });
    } finally {
      if (isToggle) setToggling(false);
    }
  }

  function calcQty(price: number, usdtAmount: number): string {
    const raw = usdtAmount / price;
    if (price >= 10000) return Math.max(0.001, Math.floor(raw * 1000) / 1000).toFixed(3);
    if (price >= 100)   return Math.max(0.01,  Math.floor(raw * 100)  / 100 ).toFixed(2);
    if (price >= 1)     return Math.max(1,      Math.floor(raw * 10)   / 10  ).toFixed(1);
    return Math.max(10, Math.floor(raw)).toFixed(0);
  }

  async function executeOrder(sig: Signal) {
    setExecuting(sig.bybitSymbol);
    try {
      const qty = calcQty(sig.price, config.maxPositionUSDT);
      const slPrice = sig.stopLoss ?? sig.price * (1 - config.stopLossPct / 100);
      const tpPrice = sig.takeProfit ?? sig.price * (1 + config.takeProfitPct / 100);

      await apiFetch("/api/trading/order", {
        method: "POST",
        body: JSON.stringify({ symbol: sig.bybitSymbol, side: "Buy", qty, takeProfit: tpPrice, stopLoss: slPrice }),
      });

      toast({
        title: "✅ Order Berhasil!",
        description: `Buy ${qty} ${sig.symbol} @ $${formatUSDT(sig.price)} — TP/SL sedang diset`,
      });

      setTimeout(() => { void loadAll(true); }, 2500);
    } catch (err) {
      toast({ title: "Order Gagal", description: String(err), variant: "destructive" });
    } finally {
      setExecuting(null);
    }
  }

  async function handleSetTPSL(symbol: string, tp: number, sl: number) {
    try {
      await apiFetch("/api/trading/position/tpsl", {
        method: "POST",
        body: JSON.stringify({ symbol, takeProfit: tp, stopLoss: sl }),
      });
      toast({ title: "✅ TP/SL Diperbarui", description: `${symbol} TP: $${tp.toFixed(4)} · SL: $${sl.toFixed(4)}` });
      void loadAll(true);
    } catch (err) {
      toast({ title: "TP/SL Gagal", description: String(err), variant: "destructive" });
    }
  }

  const totalPnl = positions.reduce((sum, p) => sum + parseFloat(p.unrealisedPnl ?? "0"), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Bybit Auto Trading
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI-driven signals connected to Bybit Mainnet
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadAll(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Mainnet Warning */}
      <div className="flex items-start gap-2.5 rounded-lg border border-yellow-500/40 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-300">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">Mainnet aktif</span> — Semua order menggunakan uang nyata.
          Pastikan kamu memahami risikonya sebelum mengaktifkan Auto Mode.
        </div>
      </div>

      {/* Open Positions Warning Banner */}
      {positions.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-orange-500/40 bg-orange-950/20 px-4 py-3">
          <Bell className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-orange-300">
              {positions.length} Posisi Sedang Terbuka
            </div>
            <div className="text-xs text-orange-300/70 mt-0.5 space-y-0.5">
              {positions.map((p) => {
                const pnl = parseFloat(p.unrealisedPnl ?? "0");
                return (
                  <span key={p.symbol + p.side} className="inline-flex items-center gap-1 mr-3">
                    <span className="font-medium">{p.symbol}</span>
                    <span className={pnl >= 0 ? "text-green-400" : "text-red-400"}>
                      {pnl >= 0 ? "+" : ""}{formatUSDT(pnl)} USDT
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
          <button
            className="text-xs text-orange-400 hover:text-orange-300 shrink-0 underline underline-offset-2"
            onClick={() => setActiveTab("positions")}
          >
            Lihat posisi
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">USDT Balance</div>
              <div className="font-bold text-lg truncate">
                {balance !== null ? `$${formatUSDT(balance)}` : "—"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors ${positions.length > 0 ? "border-orange-500/40" : ""}`}
          onClick={() => positions.length > 0 && setActiveTab("positions")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className={`h-5 w-5 shrink-0 ${positions.length > 0 ? "text-orange-400" : "text-blue-400"}`} />
            <div>
              <div className="text-xs text-muted-foreground">Open Positions</div>
              <div className={`font-bold text-lg ${positions.length > 0 ? "text-orange-400" : ""}`}>{positions.length}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CircleDollarSign className={`h-5 w-5 shrink-0 ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`} />
            <div>
              <div className="text-xs text-muted-foreground">Unrealised PnL</div>
              <div className={`font-bold text-lg ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {totalPnl >= 0 ? "+" : ""}{formatUSDT(totalPnl)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-green-400 shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">High-Conf Signals</div>
              <div className="font-bold text-lg">{signals.length}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Auto Trading Control */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Auto Trading Engine
            </CardTitle>
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
              {settingsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Mode</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {config.mode === "auto"
                  ? "Otomatis eksekusi tanpa konfirmasi"
                  : "Kamu klik tombol untuk eksekusi tiap sinyal"}
              </div>
            </div>
            <Tabs value={config.mode} onValueChange={(v) => void updateConfig({ mode: v as "auto" | "semi" })}>
              <TabsList className="h-8">
                <TabsTrigger value="semi" className="text-xs px-3">Semi-Auto</TabsTrigger>
                <TabsTrigger value="auto" className="text-xs px-3">Full Auto</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Full Auto limits info */}
          {config.mode === "auto" && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 border border-primary/20 rounded-full px-3 py-1 text-primary">
                <Bot className="h-3 w-3" />
                {config.scanSource === "universe" ? "Semua token Bybit" : "Prediksi AI"}
              </span>
              <span className="inline-flex items-center gap-1 text-xs bg-muted/50 rounded-full px-3 py-1 text-muted-foreground">
                <Zap className="h-3 w-3" />
                {config.orderType === "Market" ? "Market Order" : `Limit −${config.limitOffsetPct}%`}
              </span>
              <span className="inline-flex items-center gap-1 text-xs bg-muted/50 rounded-full px-3 py-1 text-muted-foreground">
                <Activity className="h-3 w-3" /> Max {config.maxPositions} posisi
              </span>
              <span className="inline-flex items-center gap-1 text-xs bg-muted/50 rounded-full px-3 py-1 text-muted-foreground">
                <TrendingUp className="h-3 w-3" /> Score ≥ {config.minConfidence}%
              </span>
              <span className="inline-flex items-center gap-1 text-xs bg-muted/50 rounded-full px-3 py-1 text-muted-foreground">
                <Wallet className="h-3 w-3" /> Maks ${config.maxPositionUSDT}/trade
              </span>
              <span className="inline-flex items-center gap-1 text-xs bg-muted/50 rounded-full px-3 py-1 text-muted-foreground">
                <Clock className="h-3 w-3" /> Scan tiap {Math.round(config.intervalMs / 1000)}s
              </span>
            </div>
          )}

          {/* Power toggle */}
          <div className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
            config.enabled
              ? "border-green-500/40 bg-green-950/10"
              : "border-border bg-muted/20"
          }`}>
            <div className="flex items-center gap-2">
              <Power className={`h-4 w-4 ${config.enabled ? "text-green-400" : "text-muted-foreground"}`} />
              <div>
                <div className={`text-sm font-medium ${config.enabled ? "text-green-400" : ""}`}>
                  {toggling ? "Memperbarui…" : config.enabled ? "Engine Aktif" : "Engine Mati"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {config.mode === "auto"
                    ? config.enabled
                      ? `Otomatis scan & order berjalan`
                      : "Aktifkan untuk mulai auto-trading"
                    : "Semi-auto: konfirmasi tiap order"}
                </div>
              </div>
            </div>
            <Switch
              checked={config.enabled}
              disabled={toggling}
              onCheckedChange={(v) => void updateConfig({ enabled: v })}
            />
          </div>

          {/* Engine real-time status (Full Auto only) */}
          <EngineStatusPanel stat={engineStat} config={config} />

          {/* Settings panel */}
          {settingsOpen && (
            <div className="space-y-5 pt-3 border-t border-border">

              {/* ── Scan Source ───────────────────────────────────────────── */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sumber Scan</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void updateConfig({ scanSource: "universe" })}
                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${
                      config.scanSource === "universe"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                      <Bot className="h-3.5 w-3.5" /> Semua Token Bybit
                    </div>
                    <div className="text-[11px] leading-snug opacity-80">
                      Scan ratusan token, pilih momentum terbaik hari ini
                    </div>
                  </button>
                  <button
                    onClick={() => void updateConfig({ scanSource: "predictions" })}
                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${
                      config.scanSource === "predictions"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                      <TrendingUp className="h-3.5 w-3.5" /> Prediksi AI
                    </div>
                    <div className="text-[11px] leading-snug opacity-80">
                      Hanya koin dari halaman Predictions dengan sinyal BUY
                    </div>
                  </button>
                </div>
              </div>

              {/* ── Order Type ────────────────────────────────────────────── */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Jenis Order</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void updateConfig({ orderType: "Market" })}
                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${
                      config.orderType === "Market"
                        ? "border-green-500/60 bg-green-950/20 text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-green-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                      <Zap className="h-3.5 w-3.5 text-green-400" /> Market Order
                    </div>
                    <div className="text-[11px] leading-snug opacity-80">
                      Beli langsung di harga pasar sekarang — pasti terisi
                    </div>
                  </button>
                  <button
                    onClick={() => void updateConfig({ orderType: "Limit" })}
                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${
                      config.orderType === "Limit"
                        ? "border-blue-500/60 bg-blue-950/20 text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-blue-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                      <Target className="h-3.5 w-3.5 text-blue-400" /> Limit Order
                    </div>
                    <div className="text-[11px] leading-snug opacity-80">
                      Pasang harga target, terisi saat pasar turun ke harga itu
                    </div>
                  </button>
                </div>

                {/* Limit offset slider — only shown when Limit is selected */}
                {config.orderType === "Limit" && (
                  <div className="mt-3 p-3 bg-blue-950/10 border border-blue-500/20 rounded-lg">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-muted-foreground">Beli di bawah harga pasar</span>
                      <span className="font-semibold text-blue-400">−{config.limitOffsetPct}%</span>
                    </div>
                    <Slider
                      min={0.1} max={3} step={0.1}
                      value={[config.limitOffsetPct]}
                      onValueChange={([v]) => void updateConfig({ limitOffsetPct: v! })}
                    />
                    <div className="text-[11px] text-muted-foreground mt-1.5">
                      Contoh: harga pasar $100, limit order dipasang di ${(100 * (1 - config.limitOffsetPct / 100)).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Risk & Position Controls ──────────────────────────────── */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Kontrol Risiko</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-muted-foreground">Min Score / Confidence</span>
                      <span className="font-semibold">{config.minConfidence}%</span>
                    </div>
                    <Slider min={40} max={90} step={5} value={[config.minConfidence]}
                      onValueChange={([v]) => void updateConfig({ minConfidence: v! })} />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-muted-foreground">Max per Trade (USDT)</span>
                      <span className="font-semibold">${config.maxPositionUSDT}</span>
                    </div>
                    <Slider min={10} max={500} step={10} value={[config.maxPositionUSDT]}
                      onValueChange={([v]) => void updateConfig({ maxPositionUSDT: v! })} />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-muted-foreground">Stop Loss</span>
                      <span className="font-semibold text-red-400">{config.stopLossPct}%</span>
                    </div>
                    <Slider min={1} max={10} step={0.5} value={[config.stopLossPct]}
                      onValueChange={([v]) => void updateConfig({ stopLossPct: v! })} />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-muted-foreground">Take Profit</span>
                      <span className="font-semibold text-green-400">{config.takeProfitPct}%</span>
                    </div>
                    <Slider min={1} max={20} step={0.5} value={[config.takeProfitPct]}
                      onValueChange={([v]) => void updateConfig({ takeProfitPct: v! })} />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-muted-foreground">Max Posisi Bersamaan</span>
                      <span className="font-semibold">{config.maxPositions}</span>
                    </div>
                    <Slider min={1} max={10} step={1} value={[config.maxPositions]}
                      onValueChange={([v]) => void updateConfig({ maxPositions: v! })} />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-muted-foreground">Leverage</span>
                      <span className="font-semibold">{config.leverage}x</span>
                    </div>
                    <Slider min={1} max={10} step={1} value={[config.leverage]}
                      onValueChange={([v]) => void updateConfig({ leverage: v! })} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Signals / Positions / Log */}
      <div>
        <div className="flex gap-1 border-b border-border mb-4">
          {(["signals", "positions", "log"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "signals"
                ? `Signals (${signals.length})`
                : tab === "positions"
                ? (
                  <span className={positions.length > 0 ? "text-orange-400" : ""}>
                    Positions ({positions.length})
                    {positions.length > 0 && (
                      <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                    )}
                  </span>
                )
                : `Trade Log (${tradeLogs.length})`}
            </button>
          ))}
        </div>

        {/* Signals */}
        {activeTab === "signals" && (
          <>
            {signals.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Tidak ada sinyal dengan confidence ≥ {config.minConfidence}% saat ini
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {signals.map((sig) => (
                  <SignalCard
                    key={sig.bybitSymbol}
                    sig={sig}
                    config={config}
                    onExecute={executeOrder}
                    executing={executing}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Positions */}
        {activeTab === "positions" && (
          <Card>
            <CardContent className="p-4">
              {positions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <CircleDollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Tidak ada posisi terbuka
                </div>
              ) : (
                positions.map((pos) => (
                  <PositionRow key={pos.symbol + pos.side} pos={pos} onSetTPSL={setTpslPos} />
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Log */}
        {activeTab === "log" && (
          <Card>
            <CardContent className="p-4 space-y-0">
              {tradeLogs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Belum ada riwayat trading
                </div>
              ) : (
                tradeLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0 gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      {log.status === "executed" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                      ) : log.status === "rejected" ? (
                        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{log.symbol}</div>
                        <div className="text-xs text-muted-foreground">
                          {log.side} {log.qty} @ ${formatUSDT(log.price)} · {log.confidence}% confidence
                        </div>
                        {log.reason && (
                          <div className="text-xs text-red-400 truncate">{log.reason}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge
                        variant="outline"
                        className={
                          log.status === "executed"
                            ? "border-green-500/40 text-green-400"
                            : log.status === "rejected"
                            ? "border-red-500/40 text-red-400"
                            : "border-yellow-500/40 text-yellow-400"
                        }
                      >
                        {log.status}
                      </Badge>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {tpslPos && (
        <TPSLDialog
          pos={tpslPos}
          config={config}
          onClose={() => setTpslPos(null)}
          onSave={handleSetTPSL}
        />
      )}
    </div>
  );
}
