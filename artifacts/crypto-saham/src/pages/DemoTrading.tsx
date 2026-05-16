import React, { useState, useEffect, useCallback } from "react";
import {
  FlaskConical, TrendingUp, TrendingDown, Power, RefreshCw,
  Wallet, BarChart2, Trophy, Zap, Clock, XCircle, CheckCircle2,
  AlertTriangle, RotateCcw, Bot, Timer, Minus, Target, Activity,
  ChevronDown, ChevronUp, Play, Square,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");
const DEMO_BALANCE_INITIAL = 10_000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DemoPosition {
  id: string;
  symbol: string;
  displayName: string;
  side: "Buy" | "Sell";
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  margin: number;
  stopLoss: number | null;
  takeProfit: number | null;
  unrealisedPnl: number;
  unrealisedPnlPct: number;
  openedAt: number;
  source: "auto" | "scalp" | "manual";
  confidence: number;
  signal: string;
}

interface DemoTradeLog {
  id: string;
  timestamp: number;
  symbol: string;
  side: "Buy" | "Sell";
  qty: number;
  entryPrice: number;
  closePrice: number | null;
  realizedPnl: number | null;
  realizedPnlPct: number | null;
  leverage: number;
  margin: number;
  confidence: number;
  signal: string;
  status: "opened" | "closed_tp" | "closed_sl" | "closed_manual" | "rejected";
  reason: string;
  source: "auto" | "scalp" | "manual";
}

interface DemoBalance {
  total: number;
  available: number;
  usedMargin: number;
  realizedPnl: number;
  unrealisedPnl: number;
  winCount: number;
  lossCount: number;
  winRate: number;
}

interface DemoConfig {
  autoEnabled: boolean;
  autoMode: "auto" | "semi";
  scalpEnabled: boolean;
  scalpMode: "auto" | "semi";
  minConfidence: number;
  maxPositionUSDT: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPositions: number;
  leverage: number;
  intervalMs: number;
  scalpMinConfidence: number;
  scalpMaxPositionUSDT: number;
  scalpStopLossPct: number;
  scalpTakeProfitPct: number;
}

interface Scalp5mSignal {
  symbol: string;
  displayName: string;
  side: "Buy" | "Sell" | null;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  rsi14: number;
  volumeRatio: number;
  trend15m: "bullish" | "bearish" | "sideways";
  crossoverType: "golden" | "death" | "none";
  allChecksPassed: boolean;
  riskLevel: "low" | "medium" | "high" | "extreme";
  reasons: string[];
  warnings: string[];
  analyzedAt: number;
}

interface DemoEngineStatus {
  autoRunning: boolean;
  autoAnalyzing: boolean;
  scalpRunning: boolean;
  scalpAnalyzing: boolean;
  lastCycleAt: number | null;
  cycleCount: number;
  lastSignalsFound: number;
  lastError: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function pnlColor(v: number) { return v >= 0 ? "text-green-400" : "text-red-400"; }
function timeAgo(ts: number | null) {
  if (!ts) return "—";
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5) return "baru saja";
  if (d < 60) return `${d}s lalu`;
  if (d < 3600) return `${Math.floor(d / 60)}m lalu`;
  return `${Math.floor(d / 3600)}j lalu`;
}
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? res.statusText); }
  return res.json() as Promise<T>;
}

// ─── Balance Panel ────────────────────────────────────────────────────────────

function BalancePanel({ balance, onReset }: { balance: DemoBalance | null; onReset: () => void }) {
  if (!balance) return <Card><CardContent className="p-4 animate-pulse h-24 bg-muted/20" /></Card>;
  const growth = balance.total - DEMO_BALANCE_INITIAL;
  const growthPct = (growth / DEMO_BALANCE_INITIAL) * 100;

  return (
    <Card className="border-2 border-green-500/30 bg-green-500/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/20 rounded-lg">
              <FlaskConical className="h-4 w-4 text-green-400" />
            </div>
            <span className="font-bold text-sm text-green-400">DEMO ACCOUNT</span>
            <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">Virtual Money</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={onReset} className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive">
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Total Aset</p>
            <p className="text-xl font-bold tabular-nums">${fmt(balance.total)}</p>
            <p className={`text-xs ${pnlColor(growth)}`}>
              {growth >= 0 ? "+" : ""}${fmt(Math.abs(growth))} ({growthPct >= 0 ? "+" : ""}{fmt(growthPct)}%)
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tersedia</p>
            <p className="text-lg font-bold tabular-nums text-primary">${fmt(balance.available)}</p>
            <p className="text-xs text-muted-foreground">Margin: ${fmt(balance.usedMargin)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Unrealised PnL</p>
            <p className={`text-lg font-bold tabular-nums ${pnlColor(balance.unrealisedPnl)}`}>
              {balance.unrealisedPnl >= 0 ? "+" : ""}${fmt(Math.abs(balance.unrealisedPnl))}
            </p>
            <p className={`text-xs ${pnlColor(balance.realizedPnl)}`}>
              Realized: {balance.realizedPnl >= 0 ? "+" : ""}${fmt(Math.abs(balance.realizedPnl))}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className={`text-lg font-bold ${balance.winRate >= 60 ? "text-green-400" : balance.winRate >= 45 ? "text-yellow-400" : "text-red-400"}`}>
              {fmt(balance.winRate, 1)}%
            </p>
            <p className="text-xs text-muted-foreground">{balance.winCount}W / {balance.lossCount}L</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Position Card ────────────────────────────────────────────────────────────

function PositionCard({ pos, onClose }: { pos: DemoPosition; onClose: (id: string) => void }) {
  const isLong = pos.side === "Buy";
  const pnlC = pnlColor(pos.unrealisedPnl);
  const sourceColor = pos.source === "scalp" ? "text-purple-400" : pos.source === "auto" ? "text-blue-400" : "text-muted-foreground";
  const sourceLbl = pos.source === "scalp" ? "⚡ SCALP" : pos.source === "auto" ? "🤖 AUTO" : "MANUAL";

  return (
    <Card className={`border ${isLong ? "border-green-500/30" : "border-red-500/30"}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{pos.displayName}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {isLong ? "↑ LONG" : "↓ SHORT"}
            </span>
            <span className={`text-[10px] font-semibold ${sourceColor}`}>{sourceLbl}</span>
          </div>
          <button onClick={() => onClose(pos.id)} className="text-muted-foreground hover:text-destructive transition-colors">
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Entry</p>
            <p className="font-bold">${fmt(pos.entryPrice, 4)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Mark</p>
            <p className="font-bold">${fmt(pos.markPrice, 4)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Leverage</p>
            <p className="font-bold text-primary">{pos.leverage}x</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Margin</p>
            <p className="font-bold">${fmt(pos.margin)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">PnL</p>
            <p className={`font-bold ${pnlC}`}>{pos.unrealisedPnl >= 0 ? "+" : ""}${fmt(Math.abs(pos.unrealisedPnl))}</p>
          </div>
          <div>
            <p className="text-muted-foreground">PnL%</p>
            <p className={`font-bold ${pnlC}`}>{pos.unrealisedPnlPct >= 0 ? "+" : ""}{fmt(pos.unrealisedPnlPct)}%</p>
          </div>
        </div>

        {(pos.stopLoss || pos.takeProfit) && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {pos.stopLoss && (
              <div className="bg-red-500/10 border border-red-500/20 rounded p-1.5">
                <p className="text-red-400 text-[10px]">Stop Loss</p>
                <p className="font-bold text-red-400">${fmt(pos.stopLoss, 4)}</p>
              </div>
            )}
            {pos.takeProfit && (
              <div className="bg-green-500/10 border border-green-500/20 rounded p-1.5">
                <p className="text-green-400 text-[10px]">Take Profit</p>
                <p className="font-bold text-green-400">${fmt(pos.takeProfit, 4)}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
          <span>Confidence: {pos.confidence}%</span>
          <span>Dibuka {timeAgo(pos.openedAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Scalp Signal Card ────────────────────────────────────────────────────────

function ScalpSignalCard({ sig, onExecute, executing }: {
  sig: Scalp5mSignal;
  onExecute: (sig: Scalp5mSignal) => void;
  executing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!sig.side) return null;
  const isLong = sig.side === "Buy";
  const confColor = sig.confidence >= 80 ? "text-green-400" : sig.confidence >= 65 ? "text-yellow-400" : "text-red-400";
  const confBg = sig.confidence >= 80 ? "bg-green-500" : sig.confidence >= 65 ? "bg-yellow-500" : "bg-red-500";

  return (
    <Card className={`border ${isLong ? "border-green-500/25" : "border-red-500/25"} ${sig.allChecksPassed ? "" : "opacity-70"}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{sig.displayName}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {isLong ? "↑ LONG" : "↓ SHORT"}
            </span>
            {sig.allChecksPassed && <span className="text-[10px] text-green-400 font-semibold">✓ ALL OK</span>}
          </div>
          <span className={`text-sm font-bold ${confColor}`}>{sig.confidence}%</span>
        </div>

        <div className="w-full bg-muted h-1 rounded-full">
          <div className={`${confBg} h-1 rounded-full`} style={{ width: `${sig.confidence}%` }} />
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Entry</p>
            <p className="font-bold">${fmt(sig.entryPrice, 4)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">SL</p>
            <p className="font-bold text-red-400">${fmt(sig.stopLoss, 4)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">TP</p>
            <p className="font-bold text-green-400">${fmt(sig.takeProfit, 4)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>RSI: {fmt(sig.rsi14, 1)}</span>
          <span>Vol: {fmt(sig.volumeRatio, 2)}x</span>
          <span>R/R: {fmt(sig.riskReward, 2)}x</span>
          <span className={sig.trend15m === "bullish" ? "text-green-400" : sig.trend15m === "bearish" ? "text-red-400" : "text-yellow-400"}>
            {sig.trend15m.toUpperCase()}
          </span>
        </div>

        {expanded && sig.reasons.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-border">
            {sig.reasons.slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs">
                <CheckCircle2 className={`h-3 w-3 shrink-0 mt-0.5 ${isLong ? "text-green-400" : "text-red-400"}`} />
                <span className="text-muted-foreground">{r}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" className={`flex-1 h-7 text-xs gap-1 ${isLong ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`}
            onClick={() => onExecute(sig)} disabled={executing || !sig.side}>
            {executing ? <RefreshCw className="h-3 w-3 animate-spin" /> : isLong ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            Demo {isLong ? "Long" : "Short"}
          </Button>
          <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Trade Log ────────────────────────────────────────────────────────────────

function TradeLogRow({ entry }: { entry: DemoTradeLog }) {
  const isClosed = entry.status !== "opened" && entry.status !== "rejected";
  const pnl = entry.realizedPnl ?? 0;
  const statusColors: Record<string, string> = {
    opened: "text-blue-400",
    closed_tp: "text-green-400",
    closed_sl: "text-red-400",
    closed_manual: "text-yellow-400",
    rejected: "text-muted-foreground",
  };
  const statusLabels: Record<string, string> = {
    opened: "Opened",
    closed_tp: "TP Hit ✓",
    closed_sl: "SL Hit ✗",
    closed_manual: "Closed",
    rejected: "Signal",
  };
  const srcColor = entry.source === "scalp" ? "text-purple-400" : entry.source === "auto" ? "text-blue-400" : "text-muted-foreground";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/50 text-xs">
      <div className="w-20 text-muted-foreground shrink-0">{timeAgo(entry.timestamp)}</div>
      <div className="w-24 font-bold shrink-0">{entry.symbol.replace("USDT", "")}/USDT</div>
      <div className="w-16 shrink-0">
        <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${entry.side === "Buy" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
          {entry.side === "Buy" ? "LONG" : "SHORT"}
        </span>
      </div>
      <div className="w-20 shrink-0">
        <p className="text-muted-foreground text-[10px]">{entry.leverage}x</p>
        <p className="font-bold">${fmt(entry.entryPrice, 4)}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-[10px] ${statusColors[entry.status]}`}>{statusLabels[entry.status]}</p>
        <p className="text-muted-foreground truncate">{entry.reason}</p>
      </div>
      {isClosed && entry.realizedPnl != null && (
        <div className={`w-20 text-right shrink-0 font-bold ${pnlColor(pnl)}`}>
          {pnl >= 0 ? "+" : ""}${fmt(Math.abs(pnl))}
        </div>
      )}
      <div className={`w-12 text-right shrink-0 text-[10px] font-semibold ${srcColor}`}>
        {entry.source.toUpperCase()}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DemoTrading() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"auto" | "scalp" | "log">("auto");
  const [balance, setBalance] = useState<DemoBalance | null>(null);
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  const [log, setLog] = useState<DemoTradeLog[]>([]);
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [engineStatus, setEngineStatus] = useState<DemoEngineStatus | null>(null);
  const [scalpSignals, setScalpSignals] = useState<Scalp5mSignal[]>([]);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [bal, pos, lg, cfg, eng] = await Promise.all([
        apiFetch<DemoBalance>("/api/demo/balance"),
        apiFetch<DemoPosition[]>("/api/demo/positions"),
        apiFetch<DemoTradeLog[]>("/api/demo/log"),
        apiFetch<DemoConfig>("/api/demo/config"),
        apiFetch<DemoEngineStatus>("/api/demo/engine-status"),
      ]);
      setBalance(bal); setPositions(pos); setLog(lg); setConfig(cfg); setEngineStatus(eng);
    } catch (err) {
      console.error("Failed to fetch demo data:", err);
    }
  }, []);

  const fetchScalpSignals = useCallback(async () => {
    setLoadingSignals(true);
    try {
      const sigs = await apiFetch<Scalp5mSignal[]>("/api/demo/scalp5m/signals");
      setScalpSignals(Array.isArray(sigs) ? sigs : []);
    } catch (err) {
      console.error("Failed to fetch scalp signals:", err);
    } finally {
      setLoadingSignals(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 10_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  useEffect(() => {
    if (tab === "scalp") fetchScalpSignals();
  }, [tab]);

  async function updateConfig(update: Partial<DemoConfig>) {
    try {
      const newCfg = await apiFetch<DemoConfig>("/api/demo/config", {
        method: "PUT",
        body: JSON.stringify(update),
      });
      setConfig(newCfg);
    } catch (err: any) {
      toast({ title: "Gagal update config", description: err.message, variant: "destructive" });
    }
  }

  async function handleClosePosition(id: string) {
    try {
      await apiFetch("/api/demo/close/" + id, { method: "POST", body: JSON.stringify({ reason: "manual" }) });
      toast({ title: "Posisi ditutup", description: "Posisi demo berhasil ditutup" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Gagal menutup posisi", description: err.message, variant: "destructive" });
    }
  }

  async function handleExecuteScalp(sig: Scalp5mSignal) {
    if (!sig.side) return;
    setExecutingId(sig.symbol);
    try {
      await apiFetch("/api/demo/order", {
        method: "POST",
        body: JSON.stringify({
          symbol: sig.symbol,
          displayName: sig.displayName,
          side: sig.side,
          entryPrice: sig.entryPrice,
          positionUSDT: config?.scalpMaxPositionUSDT ?? 300,
          leverage: config?.leverage ?? 5,
          stopLoss: sig.stopLoss,
          takeProfit: sig.takeProfit,
          confidence: sig.confidence,
          signal: sig.side === "Buy" ? "scalp_long" : "scalp_short",
          source: "scalp",
        }),
      });
      toast({ title: `Demo ${sig.side === "Buy" ? "LONG" : "SHORT"} dibuka!`, description: `${sig.displayName} @ $${sig.entryPrice.toFixed(4)}` });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Gagal membuka posisi", description: err.message, variant: "destructive" });
    } finally {
      setExecutingId(null);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      await apiFetch("/api/demo/reset", { method: "POST" });
      toast({ title: "Demo direset!", description: "Saldo kembali ke $10,000 USDT" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Gagal reset", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }

  const totalUnrealised = positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  const validScalpSignals = scalpSignals.filter((s) => s.side !== null);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-green-400" />
            Demo Trading
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Paper trading dengan saldo virtual $10,000 — data harga real dari Bybit
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Balance panel */}
      <BalancePanel balance={balance} onReset={handleReset} />

      {/* Active positions summary */}
      {positions.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Posisi Aktif ({positions.length})
              <span className={`ml-auto font-bold ${pnlColor(totalUnrealised)}`}>
                {totalUnrealised >= 0 ? "+" : ""}${fmt(Math.abs(totalUnrealised))} unrealised
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {positions.map((pos) => (
                <PositionCard key={pos.id} pos={pos} onClose={handleClosePosition} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
        {([
          { key: "auto", label: "Auto Trading", icon: Bot },
          { key: "scalp", label: "Scalping 5M", icon: Timer },
          { key: "log", label: `Log (${log.length})`, icon: BarChart2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Auto Trading Tab ──────────────────────────────────────────────── */}
      {tab === "auto" && config && engineStatus && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Engine control */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> Engine Auto Trading Demo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status */}
              <div className={`rounded-xl border p-3 flex items-center justify-between ${
                engineStatus.autoRunning ? "border-green-500/30 bg-green-500/5" : "border-border bg-muted/20"
              }`}>
                <div>
                  <p className={`text-sm font-bold ${engineStatus.autoRunning ? "text-green-400" : "text-muted-foreground"}`}>
                    {engineStatus.autoRunning ? "🟢 Berjalan" : "⚪ Berhenti"}
                    {engineStatus.autoAnalyzing && " · Menganalisis..."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {engineStatus.lastCycleAt ? `Siklus terakhir: ${timeAgo(engineStatus.lastCycleAt)}` : "Belum pernah berjalan"}
                    {engineStatus.cycleCount > 0 && ` · ${engineStatus.cycleCount} siklus`}
                  </p>
                </div>
                <Switch
                  checked={config.autoEnabled}
                  onCheckedChange={(v) => updateConfig({ autoEnabled: v })}
                />
              </div>

              {/* Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Mode</p>
                  <p className="text-xs text-muted-foreground">
                    {config.autoMode === "auto" ? "Auto: Buka posisi otomatis" : "Semi: Catat sinyal saja, tidak buka posisi"}
                  </p>
                </div>
                <div className="flex gap-1 bg-muted rounded-lg p-1">
                  {(["semi", "auto"] as const).map((m) => (
                    <button key={m} onClick={() => updateConfig({ autoMode: m })}
                      className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                        config.autoMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}>
                      {m === "auto" ? "Auto" : "Semi"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Min Confidence */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Min Confidence</span>
                  <span className="font-bold text-primary">{config.minConfidence}%</span>
                </div>
                <Slider min={60} max={95} step={5} value={[config.minConfidence]}
                  onValueChange={([v]) => updateConfig({ minConfidence: v })} />
              </div>

              {/* Max Position */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Posisi Per Trade</span>
                  <span className="font-bold text-primary">${config.maxPositionUSDT}</span>
                </div>
                <Slider min={100} max={2000} step={100} value={[config.maxPositionUSDT]}
                  onValueChange={([v]) => updateConfig({ maxPositionUSDT: v })} />
              </div>

              {/* Leverage */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Leverage</span>
                  <span className="font-bold text-primary">{config.leverage}x</span>
                </div>
                <Slider min={1} max={20} step={1} value={[config.leverage]}
                  onValueChange={([v]) => updateConfig({ leverage: v })} />
              </div>

              {/* SL / TP */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Stop Loss</span><span className="text-red-400 font-bold">{config.stopLossPct}%</span>
                  </div>
                  <Slider min={0.5} max={5} step={0.5} value={[config.stopLossPct]}
                    onValueChange={([v]) => updateConfig({ stopLossPct: v })} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Take Profit</span><span className="text-green-400 font-bold">{config.takeProfitPct}%</span>
                  </div>
                  <Slider min={1} max={10} step={0.5} value={[config.takeProfitPct]}
                    onValueChange={([v]) => updateConfig({ takeProfitPct: v })} />
                </div>
              </div>

              {/* Max Positions */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Max Posisi</span>
                  <span className="font-bold text-primary">{config.maxPositions}</span>
                </div>
                <Slider min={1} max={10} step={1} value={[config.maxPositions]}
                  onValueChange={([v]) => updateConfig({ maxPositions: v })} />
              </div>

              {engineStatus.lastError && (
                <div className="flex items-start gap-2 text-xs bg-red-950/20 border border-red-500/20 rounded-lg p-3">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-red-400">{engineStatus.lastError}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent auto log */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-primary" /> Sinyal Auto Terkini
              </CardTitle>
            </CardHeader>
            <CardContent>
              {log.filter((l) => l.source === "auto").slice(0, 8).length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Belum ada sinyal auto</p>
                  <p className="text-xs mt-1">Aktifkan engine dan tunggu siklus pertama</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {log.filter((l) => l.source === "auto").slice(0, 8).map((entry) => (
                    <div key={entry.id} className={`flex items-center gap-2 p-2 rounded-lg text-xs border ${
                      entry.status === "closed_tp" ? "border-green-500/20 bg-green-500/5"
                      : entry.status === "closed_sl" ? "border-red-500/20 bg-red-500/5"
                      : entry.status === "opened" ? "border-primary/20 bg-primary/5"
                      : "border-border bg-muted/10"
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        entry.status === "closed_tp" ? "bg-green-400"
                        : entry.status === "closed_sl" ? "bg-red-400"
                        : entry.status === "opened" ? "bg-primary"
                        : "bg-muted-foreground"
                      }`} />
                      <span className="font-bold shrink-0">{entry.symbol.replace("USDT", "")}</span>
                      <span className={entry.side === "Buy" ? "text-green-400 shrink-0" : "text-red-400 shrink-0"}>
                        {entry.side === "Buy" ? "LONG" : "SHORT"}
                      </span>
                      <span className="text-muted-foreground flex-1 truncate">{entry.reason}</span>
                      {entry.realizedPnl != null && (
                        <span className={`font-bold shrink-0 ${pnlColor(entry.realizedPnl)}`}>
                          {entry.realizedPnl >= 0 ? "+" : ""}${fmt(Math.abs(entry.realizedPnl))}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Scalping 5M Tab ───────────────────────────────────────────────── */}
      {tab === "scalp" && config && (
        <div className="space-y-4">
          {/* Scalp engine control */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-2 ${engineStatus?.scalpRunning ? "text-green-400" : "text-muted-foreground"}`}>
                    <Timer className="h-4 w-4" />
                    <span className="text-sm font-bold">
                      {engineStatus?.scalpRunning ? "🟢 Scalp Engine Aktif" : "⚪ Scalp Engine Mati"}
                    </span>
                  </div>
                  <div className="flex gap-1 bg-muted rounded-lg p-1">
                    {(["semi", "auto"] as const).map((m) => (
                      <button key={m} onClick={() => updateConfig({ scalpMode: m })}
                        className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                          config.scalpMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}>
                        {m === "auto" ? "Auto" : "Semi"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={fetchScalpSignals} disabled={loadingSignals} className="gap-1.5 h-8">
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingSignals ? "animate-spin" : ""}`} /> Scan
                  </Button>
                  <Switch
                    checked={config.scalpEnabled}
                    onCheckedChange={(v) => updateConfig({ scalpEnabled: v })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Min Confidence</span><span className="font-bold text-primary">{config.scalpMinConfidence}%</span>
                  </div>
                  <Slider min={60} max={95} step={5} value={[config.scalpMinConfidence]}
                    onValueChange={([v]) => updateConfig({ scalpMinConfidence: v })} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Posisi</span><span className="font-bold text-primary">${config.scalpMaxPositionUSDT}</span>
                  </div>
                  <Slider min={100} max={1000} step={100} value={[config.scalpMaxPositionUSDT]}
                    onValueChange={([v]) => updateConfig({ scalpMaxPositionUSDT: v })} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Leverage</span><span className="font-bold text-primary">{config.leverage}x</span>
                  </div>
                  <Slider min={1} max={20} step={1} value={[config.leverage]}
                    onValueChange={([v]) => updateConfig({ leverage: v })} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scalp signals */}
          {loadingSignals ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => <Card key={i}><CardContent className="p-4 h-32 animate-pulse bg-muted/20" /></Card>)}
            </div>
          ) : validScalpSignals.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Timer className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Belum ada sinyal scalping valid</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Klik "Scan" untuk cek sinyal terbaru</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {validScalpSignals.map((sig) => (
                <ScalpSignalCard
                  key={sig.symbol}
                  sig={sig}
                  onExecute={handleExecuteScalp}
                  executing={executingId === sig.symbol}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Log Tab ───────────────────────────────────────────────────────── */}
      {tab === "log" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Riwayat Trade Demo</CardTitle>
          </CardHeader>
          <CardContent>
            {log.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Belum ada riwayat trade</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 pb-2 border-b border-border text-[10px] text-muted-foreground font-semibold uppercase">
                  <div className="w-20">Waktu</div>
                  <div className="w-24">Pair</div>
                  <div className="w-16">Arah</div>
                  <div className="w-20">Harga</div>
                  <div className="flex-1">Keterangan</div>
                  <div className="w-20 text-right">PnL</div>
                  <div className="w-12 text-right">Src</div>
                </div>
                {log.slice(0, 50).map((entry) => (
                  <TradeLogRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
