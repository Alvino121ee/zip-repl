import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  FlaskConical, TrendingUp, TrendingDown, RefreshCw,
  Wallet, BarChart2, Trophy, Zap, Clock, XCircle, CheckCircle2,
  AlertTriangle, RotateCcw, Bot, Timer, Activity,
  ChevronDown, ChevronUp, Brain, Target, Shield, Flame,
  TrendingDown as DrawdownIcon, BookOpen, Cpu, Star, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Cell, CartesianGrid,
} from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");
const DEMO_BALANCE_INITIAL = 10_000;

// ─── Tipe Data ────────────────────────────────────────────────────────────────

interface DemoPosition {
  id: string; symbol: string; displayName: string;
  side: "Buy" | "Sell"; size: number; entryPrice: number;
  markPrice: number; leverage: number; margin: number;
  stopLoss: number | null; takeProfit: number | null;
  unrealisedPnl: number; unrealisedPnlPct: number;
  openedAt: number; source: "auto" | "scalp" | "manual";
  confidence: number; signal: string;
}

interface DemoTradeLog {
  id: string; timestamp: number; symbol: string;
  side: "Buy" | "Sell"; qty: number; entryPrice: number;
  closePrice: number | null; realizedPnl: number | null;
  realizedPnlPct: number | null; leverage: number; margin: number;
  confidence: number; signal: string;
  status: "opened" | "closed_tp" | "closed_sl" | "closed_manual" | "rejected";
  reason: string; source: "auto" | "scalp" | "manual";
}

interface DemoBalance {
  total: number; available: number; usedMargin: number;
  realizedPnl: number; unrealisedPnl: number;
  winCount: number; lossCount: number; winRate: number;
}

interface DemoConfig {
  autoEnabled: boolean; autoMode: "auto" | "semi";
  scalpEnabled: boolean; scalpMode: "auto" | "semi";
  minConfidence: number; maxPositionUSDT: number;
  stopLossPct: number; takeProfitPct: number;
  maxPositions: number; leverage: number; intervalMs: number;
  scalpMinConfidence: number; scalpMaxPositionUSDT: number;
  scalpStopLossPct: number; scalpTakeProfitPct: number;
}

interface Scalp5mSignal {
  symbol: string; displayName: string; side: "Buy" | "Sell" | null;
  confidence: number; entryPrice: number; stopLoss: number;
  takeProfit: number; riskReward: number; rsi14: number;
  volumeRatio: number; trend15m: "bullish" | "bearish" | "sideways";
  crossoverType: "golden" | "death" | "none"; allChecksPassed: boolean;
  riskLevel: "low" | "medium" | "high" | "extreme";
  reasons: string[]; warnings: string[]; analyzedAt: number;
}

interface DemoEngineStatus {
  autoRunning: boolean; autoAnalyzing: boolean;
  scalpRunning: boolean; scalpAnalyzing: boolean;
  lastCycleAt: number | null; cycleCount: number;
  lastSignalsFound: number; lastError: string | null;
}

interface BrainStats {
  totalPredictions: number; totalWins: number; totalLosses: number;
  winRate: number; learningCycles: number; mistakeCount: number;
  successPatternCount: number; consecutiveLosses: number;
  maxDrawdownSeen: number; bestWinStreak: number; currentWinStreak: number;
  lastUpdated: number;
  topIndicators: { key: string; name: string; accuracy: number; weight: number; total: number }[];
  topSymbols: { symbol: string; wins: number; losses: number; neutrals: number; totalPnl: number; avgConfidence: number }[];
  strategyRanking: { name: string; weight: number; wins: number; losses: number }[];
  conditionPerformance: Record<string, { wins: number; losses: number; neutrals: number }>;
  recentMistakes: {
    id: string; timestamp: number; symbol: string; direction: "LONG" | "SHORT";
    confidence: number; result: string; priceDeltaPct: number;
    lesson: string; correctedApproach: string; condition: string;
  }[];
  recentSuccessPatterns: {
    id: string; timestamp: number; symbol: string; direction: "LONG" | "SHORT";
    confidence: number; priceDeltaPct: number; condition: string;
  }[];
}

interface BrainConfigRecommendation {
  minConfidence: number;
  maxPositionUSDT: number;
  leverage: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPositions: number;
  scalpMinConfidence: number;
  scalpMaxPositionUSDT: number;
  reasoning: Record<string, string>;
  riskLevel: "rendah" | "sedang" | "tinggi" | "ekstrем";
  summary: string;
  generatedAt: number;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function pnlColor(v: number) { return v >= 0 ? "text-green-400" : "text-red-400"; }
function pnlBg(v: number) { return v >= 0 ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"; }
function timeAgo(ts: number | null) {
  if (!ts) return "—";
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5) return "baru saja";
  if (d < 60) return `${d}d lalu`;
  if (d < 3600) return `${Math.floor(d / 60)}m lalu`;
  return `${Math.floor(d / 3600)}j lalu`;
}
function formatTgl(ts: number) {
  return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? res.statusText); }
  return res.json() as Promise<T>;
}

// ─── Panel Saldo ──────────────────────────────────────────────────────────────

function PanelSaldo({ balance, onReset }: { balance: DemoBalance | null; onReset: () => void }) {
  if (!balance) return <Card><CardContent className="p-4 animate-pulse h-24 bg-muted/20" /></Card>;
  const pertumbuhan = balance.total - DEMO_BALANCE_INITIAL;
  const pertumbuhanPct = (pertumbuhan / DEMO_BALANCE_INITIAL) * 100;
  const totalTrade = balance.winCount + balance.lossCount;
  const profitFactor = balance.lossCount > 0
    ? Math.abs(balance.realizedPnl > 0 ? balance.realizedPnl : 0) / Math.abs(balance.realizedPnl < 0 ? balance.realizedPnl : 1)
    : balance.winCount > 0 ? 999 : 0;

  return (
    <Card className="border-2 border-green-500/30 bg-green-500/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/20 rounded-lg">
              <FlaskConical className="h-4 w-4 text-green-400" />
            </div>
            <span className="font-bold text-sm text-green-400">AKUN DEMO</span>
            <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">Uang Virtual</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={onReset} className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive">
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Total Aset</p>
            <p className="text-xl font-bold tabular-nums">${fmt(balance.total)}</p>
            <p className={`text-xs ${pnlColor(pertumbuhan)}`}>
              {pertumbuhan >= 0 ? "+" : ""}${fmt(Math.abs(pertumbuhan))} ({pertumbuhanPct >= 0 ? "+" : ""}{fmt(pertumbuhanPct)}%)
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
            <p className="text-xs text-muted-foreground">{balance.winCount}M / {balance.lossCount}K ({totalTrade} trade)</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Profit Factor</p>
            <p className={`text-lg font-bold ${profitFactor >= 1.5 ? "text-green-400" : profitFactor >= 1 ? "text-yellow-400" : "text-red-400"}`}>
              {totalTrade === 0 ? "—" : profitFactor === 999 ? "∞" : fmt(profitFactor)}
            </p>
            <p className="text-xs text-muted-foreground">Target: ≥ 1.5</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Meter Risiko ─────────────────────────────────────────────────────────────

function MeterRisiko({ balance, brainStats }: { balance: DemoBalance | null; brainStats: BrainStats | null }) {
  const konsekutifLoss = brainStats?.consecutiveLosses ?? 0;
  const drawdown = balance ? ((balance.total - DEMO_BALANCE_INITIAL) / DEMO_BALANCE_INITIAL) * 100 : 0;

  let levelRisiko: "aman" | "waspada" | "bahaya" | "kritis" = "aman";
  if (konsekutifLoss >= 5 || drawdown <= -15) levelRisiko = "kritis";
  else if (konsekutifLoss >= 3 || drawdown <= -8) levelRisiko = "bahaya";
  else if (konsekutifLoss >= 2 || drawdown <= -4) levelRisiko = "waspada";

  const warna = {
    aman: "text-green-400 border-green-500/30 bg-green-500/5",
    waspada: "text-yellow-400 border-yellow-500/30 bg-yellow-500/5",
    bahaya: "text-orange-400 border-orange-500/30 bg-orange-500/5",
    kritis: "text-red-400 border-red-500/30 bg-red-500/5",
  }[levelRisiko];

  const label = { aman: "🟢 Aman", waspada: "🟡 Waspada", bahaya: "🟠 Bahaya", kritis: "🔴 Kritis" }[levelRisiko];

  const pesan = {
    aman: "Kondisi trading baik. Lanjutkan dengan disiplin.",
    waspada: `${konsekutifLoss}x loss berturut. Kurangi ukuran posisi 25%.`,
    bahaya: `${konsekutifLoss}x loss atau drawdown ${fmt(drawdown)}%. Kurangi posisi 50%!`,
    kritis: "STOP TRADING! Terlalu banyak kerugian. Istirahat dan evaluasi strategi.",
  }[levelRisiko];

  return (
    <Card className={`border ${warna}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <Shield className="h-5 w-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Meter Risiko: {label}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{pesan}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Drawdown</p>
          <p className={`text-sm font-bold ${pnlColor(drawdown)}`}>{drawdown >= 0 ? "+" : ""}{fmt(drawdown)}%</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Kartu Posisi ─────────────────────────────────────────────────────────────

function KartuPosisi({ pos, onTutup }: { pos: DemoPosition; onTutup: (id: string) => void }) {
  const isLong = pos.side === "Buy";
  const pnlC = pnlColor(pos.unrealisedPnl);
  const srcColor = pos.source === "scalp" ? "text-purple-400" : pos.source === "auto" ? "text-blue-400" : "text-muted-foreground";
  const srcLbl = pos.source === "scalp" ? "⚡ SCALP" : pos.source === "auto" ? "🤖 AUTO" : "MANUAL";

  return (
    <Card className={`border ${isLong ? "border-green-500/30" : "border-red-500/30"}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{pos.displayName}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {isLong ? "↑ LONG" : "↓ SHORT"}
            </span>
            <span className={`text-[10px] font-semibold ${srcColor}`}>{srcLbl}</span>
          </div>
          <button onClick={() => onTutup(pos.id)} className="text-muted-foreground hover:text-destructive transition-colors">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><p className="text-muted-foreground">Entry</p><p className="font-bold">${fmt(pos.entryPrice, 4)}</p></div>
          <div><p className="text-muted-foreground">Mark</p><p className="font-bold">${fmt(pos.markPrice, 4)}</p></div>
          <div><p className="text-muted-foreground">Leverage</p><p className="font-bold text-primary">{pos.leverage}x</p></div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><p className="text-muted-foreground">Margin</p><p className="font-bold">${fmt(pos.margin)}</p></div>
          <div><p className="text-muted-foreground">PnL</p><p className={`font-bold ${pnlC}`}>{pos.unrealisedPnl >= 0 ? "+" : ""}${fmt(Math.abs(pos.unrealisedPnl))}</p></div>
          <div><p className="text-muted-foreground">PnL%</p><p className={`font-bold ${pnlC}`}>{pos.unrealisedPnlPct >= 0 ? "+" : ""}{fmt(pos.unrealisedPnlPct)}%</p></div>
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

// ─── Kartu Sinyal Scalp ───────────────────────────────────────────────────────

function KartuSinyalScalp({ sig, onEksekusi, mengeksekusi }: {
  sig: Scalp5mSignal; onEksekusi: (sig: Scalp5mSignal) => void; mengeksekusi: boolean;
}) {
  const [dibuka, setDibuka] = useState(false);
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
            {sig.allChecksPassed && <span className="text-[10px] text-green-400 font-semibold">✓ VALID</span>}
          </div>
          <span className={`text-sm font-bold ${confColor}`}>{sig.confidence}%</span>
        </div>
        <div className="w-full bg-muted h-1 rounded-full">
          <div className={`${confBg} h-1 rounded-full`} style={{ width: `${sig.confidence}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><p className="text-muted-foreground">Entry</p><p className="font-bold">${fmt(sig.entryPrice, 4)}</p></div>
          <div><p className="text-muted-foreground">SL</p><p className="font-bold text-red-400">${fmt(sig.stopLoss, 4)}</p></div>
          <div><p className="text-muted-foreground">TP</p><p className="font-bold text-green-400">${fmt(sig.takeProfit, 4)}</p></div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>RSI: {fmt(sig.rsi14, 1)}</span>
          <span>Vol: {fmt(sig.volumeRatio, 2)}x</span>
          <span>R/R: {fmt(sig.riskReward, 2)}x</span>
          <span className={sig.trend15m === "bullish" ? "text-green-400" : sig.trend15m === "bearish" ? "text-red-400" : "text-yellow-400"}>
            {sig.trend15m.toUpperCase()}
          </span>
        </div>
        {dibuka && sig.reasons.length > 0 && (
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
            onClick={() => onEksekusi(sig)} disabled={mengeksekusi || !sig.side}>
            {mengeksekusi ? <RefreshCw className="h-3 w-3 animate-spin" /> : isLong ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            Demo {isLong ? "Long" : "Short"}
          </Button>
          <button onClick={() => setDibuka(!dibuka)} className="text-muted-foreground hover:text-foreground">
            {dibuka ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Baris Log Trade ──────────────────────────────────────────────────────────

function BarisCatatan({ entry }: { entry: DemoTradeLog }) {
  const isClosed = entry.status !== "opened" && entry.status !== "rejected";
  const pnl = entry.realizedPnl ?? 0;
  const statusWarna: Record<string, string> = {
    opened: "text-blue-400", closed_tp: "text-green-400",
    closed_sl: "text-red-400", closed_manual: "text-yellow-400", rejected: "text-muted-foreground",
  };
  const statusLabel: Record<string, string> = {
    opened: "Dibuka", closed_tp: "TP ✓", closed_sl: "SL ✗", closed_manual: "Ditutup", rejected: "Sinyal",
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
        <p className={`font-semibold text-[10px] ${statusWarna[entry.status]}`}>{statusLabel[entry.status]}</p>
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

// ─── Tab Otak AI ──────────────────────────────────────────────────────────────

function TabOtakAI({ brainStats, onReset }: { brainStats: BrainStats | null; onReset: () => void }) {
  if (!brainStats) return (
    <div className="py-20 text-center text-muted-foreground">
      <Brain className="h-12 w-12 mx-auto mb-3 opacity-30 animate-pulse" />
      <p>Memuat data otak AI...</p>
    </div>
  );

  const winRate = brainStats.totalPredictions > 0
    ? (brainStats.totalWins / brainStats.totalPredictions * 100)
    : 0;

  const kondisiLabel: Record<string, string> = {
    trending_up: "Tren Naik",
    trending_down: "Tren Turun",
    sideways: "Sideways",
    volatile: "Volatil",
    low_liquidity: "Likuiditas Rendah",
  };

  return (
    <div className="space-y-4">
      {/* Statistik Utama Brain */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Prediksi", val: brainStats.totalPredictions, icon: Target, warna: "text-primary" },
          { label: "Win Rate", val: `${fmt(winRate, 1)}%`, icon: Trophy, warna: winRate >= 60 ? "text-green-400" : winRate >= 45 ? "text-yellow-400" : "text-red-400" },
          { label: "Siklus Belajar", val: brainStats.learningCycles, icon: Brain, warna: "text-purple-400" },
          { label: "Kesalahan Dicatat", val: brainStats.mistakeCount, icon: BookOpen, warna: "text-orange-400" },
        ].map(({ label, val, icon: Icon, warna }) => (
          <Card key={label}>
            <CardContent className="p-3 flex items-center gap-3">
              <Icon className={`h-5 w-5 shrink-0 ${warna}`} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-lg font-bold ${warna}`}>{val}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Streak */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-400" /> Status Streak
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className={`rounded-xl p-3 border ${brainStats.consecutiveLosses >= 3 ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/10"}`}>
                <p className="text-xs text-muted-foreground">Loss Berturut</p>
                <p className={`text-2xl font-bold ${brainStats.consecutiveLosses >= 3 ? "text-red-400" : "text-foreground"}`}>
                  {brainStats.consecutiveLosses}
                </p>
              </div>
              <div className="rounded-xl p-3 border border-green-500/20 bg-green-500/5">
                <p className="text-xs text-muted-foreground">Win Streak Terbaik</p>
                <p className="text-2xl font-bold text-green-400">{brainStats.bestWinStreak}</p>
              </div>
              <div className="rounded-xl p-3 border border-border bg-muted/10">
                <p className="text-xs text-muted-foreground">Pola Sukses</p>
                <p className="text-2xl font-bold text-primary">{brainStats.successPatternCount}</p>
              </div>
            </div>
            {brainStats.consecutiveLosses >= 3 && (
              <div className="flex items-start gap-2 text-xs bg-red-950/30 border border-red-500/20 rounded-lg p-3">
                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                <span className="text-red-400">
                  Peringatan! {brainStats.consecutiveLosses}x loss berturut. Brain merekomendasikan kurangi ukuran posisi atau istirahat sejenak.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performa Per Kondisi Pasar */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Akurasi Per Kondisi Pasar
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {Object.entries(brainStats.conditionPerformance).map(([kondisi, stat]) => {
              const total = stat.wins + stat.losses;
              if (total === 0) return null;
              const wr = (stat.wins / total) * 100;
              return (
                <div key={kondisi} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{kondisiLabel[kondisi] ?? kondisi}</span>
                    <span className={`font-bold ${wr >= 60 ? "text-green-400" : wr >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                      {fmt(wr, 1)}% ({total} trade)
                    </span>
                  </div>
                  <div className="w-full bg-muted h-1.5 rounded-full">
                    <div className={`h-1.5 rounded-full ${wr >= 60 ? "bg-green-500" : wr >= 45 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${wr}%` }} />
                  </div>
                </div>
              );
            })}
            {Object.values(brainStats.conditionPerformance).every(s => s.wins + s.losses === 0) && (
              <p className="text-xs text-muted-foreground text-center py-4">Belum ada data kondisi pasar. Gunakan Prediction Lock untuk melatih brain.</p>
            )}
          </CardContent>
        </Card>

        {/* Bobot Indikator */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4 text-purple-400" /> Bobot Indikator (Adaptif)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {brainStats.topIndicators.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Belum ada data indikator. Brain membutuhkan prediksi yang divalidasi.</p>
            ) : (
              brainStats.topIndicators.map((ind) => (
                <div key={ind.key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{ind.name}</span>
                    <span className={`font-bold ${ind.weight >= 1.3 ? "text-green-400" : ind.weight >= 0.9 ? "text-yellow-400" : "text-red-400"}`}>
                      {fmt(ind.accuracy, 1)}% akurat ({ind.total}x)
                    </span>
                  </div>
                  <div className="w-full bg-muted h-1.5 rounded-full">
                    <div className={`h-1.5 rounded-full transition-all ${ind.weight >= 1.3 ? "bg-green-500" : ind.weight >= 0.9 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(100, ind.accuracy)}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Ranking Strategi */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400" /> Ranking Strategi
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {brainStats.strategyRanking.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Belum ada data strategi.</p>
            ) : (
              <div className="space-y-2">
                {brainStats.strategyRanking.map((strat, i) => {
                  const total = strat.wins + strat.losses;
                  const wr = total > 0 ? (strat.wins / total * 100) : 0;
                  return (
                    <div key={strat.name} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/50 last:border-0">
                      <span className={`w-5 text-center font-bold ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-400" : i === 2 ? "text-orange-400" : "text-muted-foreground"}`}>
                        #{i + 1}
                      </span>
                      <span className="flex-1 font-medium">{strat.name}</span>
                      <span className="text-muted-foreground">{strat.wins}M/{strat.losses}K</span>
                      <span className={`font-bold w-14 text-right ${wr >= 60 ? "text-green-400" : wr >= 45 ? "text-yellow-400" : total === 0 ? "text-muted-foreground" : "text-red-400"}`}>
                        {total === 0 ? "—" : `${fmt(wr, 1)}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Kesalahan Terkini */}
      {brainStats.recentMistakes.length > 0 && (
        <Card className="border-orange-500/20">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-orange-400" /> Kesalahan & Pelajaran Terkini
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {brainStats.recentMistakes.slice(0, 5).map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-muted/10 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold">{m.symbol}</span>
                  <span className={`px-1.5 py-0.5 rounded font-bold ${m.direction === "LONG" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {m.direction}
                  </span>
                  <span className={`font-bold ${m.result === "WIN" ? "text-green-400" : m.result === "LOSS" ? "text-red-400" : "text-yellow-400"}`}>
                    {m.result === "WIN" ? "✅ WIN" : m.result === "LOSS" ? "❌ LOSS" : "➖ NETRAL"}
                  </span>
                  <span className={pnlColor(m.priceDeltaPct)}>{m.priceDeltaPct >= 0 ? "+" : ""}{fmt(m.priceDeltaPct)}%</span>
                  <span className="ml-auto text-muted-foreground">{formatTgl(m.timestamp)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{m.lesson}</p>
                <p className="text-xs text-primary">→ {m.correctedApproach}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tombol Reset Brain */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onReset} className="gap-1.5 text-destructive hover:text-destructive">
          <RotateCcw className="h-3.5 w-3.5" /> Reset Memori Brain
        </Button>
      </div>
    </div>
  );
}

// ─── Tab Analitik ─────────────────────────────────────────────────────────────

function TabAnalitik({ log, balance }: { log: DemoTradeLog[]; balance: DemoBalance | null }) {
  // Hitung kurva ekuitas dari log
  const kurvaEkuitas = useMemo(() => {
    const closedTrades = [...log]
      .filter(e => e.status === "closed_tp" || e.status === "closed_sl" || e.status === "closed_manual")
      .sort((a, b) => a.timestamp - b.timestamp);

    let saldo = DEMO_BALANCE_INITIAL;
    const points = [{ waktu: "Awal", saldo, pnl: 0 }];

    for (const trade of closedTrades) {
      saldo += trade.realizedPnl ?? 0;
      points.push({
        waktu: formatTgl(trade.timestamp),
        saldo: Math.round(saldo * 100) / 100,
        pnl: trade.realizedPnl ?? 0,
      });
    }
    return points;
  }, [log]);

  // Distribusi hasil trade
  const distribusi = useMemo(() => {
    const tp = log.filter(e => e.status === "closed_tp").length;
    const sl = log.filter(e => e.status === "closed_sl").length;
    const manual = log.filter(e => e.status === "closed_manual").length;
    return [
      { label: "Take Profit", jumlah: tp, warna: "#22c55e" },
      { label: "Stop Loss", jumlah: sl, warna: "#ef4444" },
      { label: "Ditutup Manual", jumlah: manual, warna: "#eab308" },
    ];
  }, [log]);

  // Performa per pair
  const performaPair = useMemo(() => {
    const map: Record<string, { wins: number; losses: number; pnl: number }> = {};
    for (const t of log) {
      if (t.status !== "closed_tp" && t.status !== "closed_sl" && t.status !== "closed_manual") continue;
      const sym = t.symbol.replace("USDT", "");
      if (!map[sym]) map[sym] = { wins: 0, losses: 0, pnl: 0 };
      if (t.status === "closed_tp") map[sym].wins++;
      else if (t.status === "closed_sl") map[sym].losses++;
      map[sym].pnl += t.realizedPnl ?? 0;
    }
    return Object.entries(map)
      .map(([sym, stat]) => ({ sym, ...stat, wr: stat.wins + stat.losses > 0 ? stat.wins / (stat.wins + stat.losses) * 100 : 0 }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 8);
  }, [log]);

  // Metrik ringkasan
  const closedTrades = log.filter(e => e.status === "closed_tp" || e.status === "closed_sl" || e.status === "closed_manual");
  const totalRealized = closedTrades.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const maxDrawdown = useMemo(() => {
    let peak = DEMO_BALANCE_INITIAL;
    let saldo = DEMO_BALANCE_INITIAL;
    let maxDD = 0;
    for (const t of [...closedTrades].sort((a, b) => a.timestamp - b.timestamp)) {
      saldo += t.realizedPnl ?? 0;
      peak = Math.max(peak, saldo);
      maxDD = Math.min(maxDD, saldo - peak);
    }
    return maxDD;
  }, [closedTrades]);

  const avgWin = closedTrades.filter(t => (t.realizedPnl ?? 0) > 0).reduce((s, t, _, arr) => s + (t.realizedPnl ?? 0) / arr.length, 0);
  const avgLoss = closedTrades.filter(t => (t.realizedPnl ?? 0) < 0).reduce((s, t, _, arr) => s + Math.abs(t.realizedPnl ?? 0) / arr.length, 0);
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 999 : 0;

  const ekuitasWarna = kurvaEkuitas.length > 1 && kurvaEkuitas[kurvaEkuitas.length - 1].saldo >= DEMO_BALANCE_INITIAL
    ? "#22c55e" : "#ef4444";

  if (closedTrades.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <BarChart2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Belum ada data analitik</p>
        <p className="text-xs mt-1">Selesaikan beberapa trade untuk melihat grafik performa</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metrik Kunci */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Trade", val: closedTrades.length, sub: `${balance?.winCount ?? 0}M ${balance?.lossCount ?? 0}K` },
          { label: "Profit Factor", val: profitFactor === 999 ? "∞" : fmt(profitFactor), sub: "Target ≥ 1.5", warna: profitFactor >= 1.5 ? "text-green-400" : profitFactor >= 1 ? "text-yellow-400" : "text-red-400" },
          { label: "Max Drawdown", val: `$${fmt(Math.abs(maxDrawdown))}`, sub: `${fmt((maxDrawdown / DEMO_BALANCE_INITIAL) * 100)}%`, warna: "text-red-400" },
          { label: "Avg Win / Loss", val: `$${fmt(avgWin, 1)}`, sub: `Avg Loss: $${fmt(avgLoss, 1)}`, warna: "text-green-400" },
        ].map(({ label, val, sub, warna }) => (
          <Card key={label}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-xl font-bold ${warna ?? ""}`}>{val}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Kurva Ekuitas */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Kurva Ekuitas
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={kurvaEkuitas}>
              <defs>
                <linearGradient id="gradEkuitas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={ekuitasWarna} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={ekuitasWarna} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="waktu" tick={{ fontSize: 10, fill: "#888" }} />
              <YAxis tick={{ fontSize: 10, fill: "#888" }} domain={["auto", "auto"]}
                tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} width={48} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                formatter={(val: number) => [`$${fmt(val)}`, "Saldo"]}
              />
              <Area type="monotone" dataKey="saldo" stroke={ekuitasWarna} strokeWidth={2}
                fill="url(#gradEkuitas)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>Modal awal: ${fmt(DEMO_BALANCE_INITIAL)}</span>
            <span className={pnlColor(totalRealized)}>
              PnL Total: {totalRealized >= 0 ? "+" : ""}${fmt(Math.abs(totalRealized))}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PnL Per Trade */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">PnL Per Trade</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={kurvaEkuitas.slice(1).slice(-20)}>
                <XAxis dataKey="waktu" tick={{ fontSize: 9, fill: "#888" }} />
                <YAxis tick={{ fontSize: 9, fill: "#888" }} width={40} />
                <Tooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                  formatter={(val: number) => [`${val >= 0 ? "+" : ""}$${fmt(Math.abs(val))}`, "PnL"]}
                />
                <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                  {kurvaEkuitas.slice(1).slice(-20).map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribusi Hasil */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Distribusi Hasil Trade</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {distribusi.map((d) => {
              const total = distribusi.reduce((s, x) => s + x.jumlah, 0);
              const pct = total > 0 ? (d.jumlah / total) * 100 : 0;
              return (
                <div key={d.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="font-bold">{d.jumlah} ({fmt(pct, 1)}%)</span>
                  </div>
                  <div className="w-full bg-muted h-2 rounded-full">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: d.warna }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Performa Per Pair */}
        {performaPair.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">Performa Per Pair</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {performaPair.map((p) => (
                  <div key={p.sym} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/50 last:border-0">
                    <span className="w-16 font-bold">{p.sym}/USDT</span>
                    <span className="w-14 text-muted-foreground">{p.wins}M {p.losses}K</span>
                    <div className="flex-1">
                      <div className="w-full bg-muted h-1.5 rounded-full">
                        <div className={`h-1.5 rounded-full ${p.wr >= 60 ? "bg-green-500" : p.wr >= 45 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${p.wr}%` }} />
                      </div>
                    </div>
                    <span className={`w-14 text-right font-bold ${p.wr >= 60 ? "text-green-400" : p.wr >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                      {fmt(p.wr, 1)}%
                    </span>
                    <span className={`w-20 text-right font-bold ${pnlColor(p.pnl)}`}>
                      {p.pnl >= 0 ? "+" : ""}${fmt(Math.abs(p.pnl))}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Halaman Utama ────────────────────────────────────────────────────────────

type TabKey = "auto" | "scalp" | "otak" | "analitik" | "log";

export default function DemoTrading() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("auto");
  const [balance, setBalance] = useState<DemoBalance | null>(null);
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  const [log, setLog] = useState<DemoTradeLog[]>([]);
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [engineStatus, setEngineStatus] = useState<DemoEngineStatus | null>(null);
  const [scalpSignals, setScalpSignals] = useState<Scalp5mSignal[]>([]);
  const [brainStats, setBrainStats] = useState<BrainStats | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const [aiRec, setAiRec] = useState<BrainConfigRecommendation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [mereset, setMereset] = useState(false);

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
      console.error("Gagal mengambil data demo:", err);
    }
  }, []);

  const fetchBrain = useCallback(async () => {
    try {
      const stats = await apiFetch<BrainStats>("/api/ai/brain/stats");
      setBrainStats(stats);
    } catch (err) {
      console.error("Gagal mengambil data brain:", err);
    }
  }, []);

  const fetchScalp = useCallback(async () => {
    setLoadingSignals(true);
    try {
      const sigs = await apiFetch<Scalp5mSignal[]>("/api/demo/scalp5m/signals");
      setScalpSignals(Array.isArray(sigs) ? sigs : []);
    } catch (err) {
      console.error("Gagal mengambil sinyal scalp:", err);
    } finally {
      setLoadingSignals(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchBrain();
    const id = setInterval(() => { fetchAll(); fetchBrain(); }, 10_000);
    return () => clearInterval(id);
  }, [fetchAll, fetchBrain]);

  useEffect(() => {
    if (tab === "scalp") fetchScalp();
  }, [tab]);

  async function updateConfig(update: Partial<DemoConfig>) {
    try {
      const newCfg = await apiFetch<DemoConfig>("/api/demo/config", { method: "PUT", body: JSON.stringify(update) });
      setConfig(newCfg);
    } catch (err: any) {
      toast({ title: "Gagal update konfigurasi", description: err.message, variant: "destructive" });
    }
  }

  async function aktifkanModeAI(aktif: boolean) {
    setAiMode(aktif);
    if (!aktif) return;
    setAiLoading(true);
    try {
      const rec = await apiFetch<BrainConfigRecommendation>("/api/ai/brain/recommend-config");
      setAiRec(rec);
      // Terapkan langsung ke konfigurasi
      await updateConfig({
        minConfidence: rec.minConfidence,
        maxPositionUSDT: rec.maxPositionUSDT,
        leverage: rec.leverage,
        stopLossPct: rec.stopLossPct,
        takeProfitPct: rec.takeProfitPct,
        maxPositions: rec.maxPositions,
        scalpMinConfidence: rec.scalpMinConfidence,
        scalpMaxPositionUSDT: rec.scalpMaxPositionUSDT,
      });
      toast({
        title: "🤖 Mode AI Aktif!",
        description: `Brain mengatur semua parameter. Level risiko: ${rec.riskLevel.toUpperCase()}`,
      });
    } catch (err: any) {
      toast({ title: "Gagal mengaktifkan Mode AI", description: err.message, variant: "destructive" });
      setAiMode(false);
    } finally {
      setAiLoading(false);
    }
  }

  async function segarkanAI() {
    if (!aiMode) return;
    setAiLoading(true);
    try {
      const rec = await apiFetch<BrainConfigRecommendation>("/api/ai/brain/recommend-config");
      setAiRec(rec);
      await updateConfig({
        minConfidence: rec.minConfidence,
        maxPositionUSDT: rec.maxPositionUSDT,
        leverage: rec.leverage,
        stopLossPct: rec.stopLossPct,
        takeProfitPct: rec.takeProfitPct,
        maxPositions: rec.maxPositions,
        scalpMinConfidence: rec.scalpMinConfidence,
        scalpMaxPositionUSDT: rec.scalpMaxPositionUSDT,
      });
      toast({ title: "✅ Konfigurasi AI diperbarui", description: "Brain telah menghitung ulang parameter optimal." });
    } catch (err: any) {
      toast({ title: "Gagal menyegarkan AI", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  async function tutupPosisi(id: string) {
    try {
      await apiFetch("/api/demo/close/" + id, { method: "POST", body: JSON.stringify({ reason: "manual" }) });
      toast({ title: "Posisi ditutup", description: "Posisi demo berhasil ditutup secara manual" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Gagal menutup posisi", description: err.message, variant: "destructive" });
    }
  }

  async function eksekusiScalp(sig: Scalp5mSignal) {
    if (!sig.side) return;
    setExecutingId(sig.symbol);
    try {
      await apiFetch("/api/demo/order", {
        method: "POST",
        body: JSON.stringify({
          symbol: sig.symbol, displayName: sig.displayName, side: sig.side,
          entryPrice: sig.entryPrice, positionUSDT: config?.scalpMaxPositionUSDT ?? 300,
          leverage: config?.leverage ?? 5, stopLoss: sig.stopLoss, takeProfit: sig.takeProfit,
          confidence: sig.confidence, signal: sig.side === "Buy" ? "scalp_long" : "scalp_short",
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

  async function resetDemo() {
    setMereset(true);
    try {
      await apiFetch("/api/demo/reset", { method: "POST" });
      toast({ title: "Demo direset!", description: "Saldo kembali ke $10,000 USDT" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Gagal reset", description: err.message, variant: "destructive" });
    } finally {
      setMereset(false);
    }
  }

  async function resetBrain() {
    try {
      await apiFetch("/api/ai/brain/reset", { method: "POST" });
      toast({ title: "Memori Brain direset!", description: "AI Brain mulai belajar dari awal" });
      fetchBrain();
    } catch (err: any) {
      toast({ title: "Gagal reset brain", description: err.message, variant: "destructive" });
    }
  }

  const totalUnrealised = positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  const validScalpSignals = scalpSignals.filter(s => s.side !== null);

  const tabList: { key: TabKey; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: "auto", label: "Auto Trading", icon: Bot },
    { key: "scalp", label: "Scalping 5M", icon: Timer },
    { key: "otak", label: "Otak AI", icon: Brain, badge: brainStats?.mistakeCount },
    { key: "analitik", label: "Analitik", icon: BarChart2 },
    { key: "log", label: "Log", icon: Clock, badge: log.length },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-green-400" />
            Lab Trading Demo
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Paper trading virtual $10,000 · Data harga real · AI Brain belajar otomatis
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchAll(); fetchBrain(); }} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Panel Saldo */}
      <PanelSaldo balance={balance} onReset={resetDemo} />

      {/* Meter Risiko */}
      <MeterRisiko balance={balance} brainStats={brainStats} />

      {/* Posisi Aktif */}
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
              {positions.map(pos => <KartuPosisi key={pos.id} pos={pos} onTutup={tutupPosisi} />)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab Nav */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 overflow-x-auto">
        {tabList.map(({ key, label, icon: Icon, badge }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 min-w-max flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            <Icon className="h-3.5 w-3.5" />
            {label}
            {badge != null && badge > 0 && (
              <span className="bg-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Auto Trading ────────────────────────────────────────────── */}
      {tab === "auto" && config && engineStatus && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> Engine Auto Trading
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <Switch checked={config.autoEnabled} onCheckedChange={v => updateConfig({ autoEnabled: v })} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Mode</p>
                  <p className="text-xs text-muted-foreground">
                    {config.autoMode === "auto" ? "Auto: Buka posisi otomatis" : "Semi: Catat sinyal saja"}
                  </p>
                </div>
                <div className="flex gap-1 bg-muted rounded-lg p-1">
                  {(["semi", "auto"] as const).map(m => (
                    <button key={m} onClick={() => updateConfig({ autoMode: m })}
                      className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                        config.autoMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}>{m === "auto" ? "Auto" : "Semi"}</button>
                  ))}
                </div>
              </div>

              {/* ── Mode AI Penuh ─────────────────────────────────────── */}
              <div className={`rounded-xl border p-3 space-y-3 transition-all ${
                aiMode ? "border-purple-500/40 bg-purple-500/5" : "border-border bg-muted/10"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className={`h-4 w-4 ${aiMode ? "text-purple-400" : "text-muted-foreground"}`} />
                    <div>
                      <p className={`text-sm font-bold ${aiMode ? "text-purple-400" : "text-foreground"}`}>
                        Mode AI Penuh
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {aiMode ? "Brain mengontrol semua parameter secara otomatis" : "Aktifkan agar Brain atur semua parameter sendiri"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={aiMode}
                    onCheckedChange={aktifkanModeAI}
                    disabled={aiLoading}
                  />
                </div>

                {aiLoading && (
                  <div className="flex items-center gap-2 text-xs text-purple-400">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Brain sedang menghitung konfigurasi optimal...
                  </div>
                )}

                {aiMode && aiRec && !aiLoading && (
                  <div className="space-y-2">
                    {/* Summary Brain */}
                    <div className={`text-xs rounded-lg p-2.5 border ${
                      aiRec.riskLevel === "rendah" ? "border-green-500/30 bg-green-500/10 text-green-400"
                      : aiRec.riskLevel === "tinggi" ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
                      : aiRec.riskLevel === "ekstrем" ? "border-red-500/30 bg-red-500/10 text-red-400"
                      : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                    }`}>
                      {aiRec.summary}
                    </div>

                    {/* Nilai-nilai yang dipilih AI */}
                    {[
                      { label: "Min Confidence", val: `${aiRec.minConfidence}%`, key: "minConfidence", warna: "text-primary" },
                      { label: "Posisi Per Trade", val: `$${aiRec.maxPositionUSDT}`, key: "maxPositionUSDT", warna: "text-green-400" },
                      { label: "Leverage", val: `${aiRec.leverage}x`, key: "leverage", warna: "text-yellow-400" },
                      { label: "Stop Loss", val: `${aiRec.stopLossPct}%`, key: "stopLossPct", warna: "text-red-400" },
                      { label: "Take Profit", val: `${aiRec.takeProfitPct}%`, key: "takeProfitPct", warna: "text-green-400" },
                      { label: "Max Posisi", val: `${aiRec.maxPositions}`, key: "maxPositions", warna: "text-primary" },
                    ].map(({ label, val, key, warna }) => (
                      <div key={key} className="rounded-lg border border-border bg-background/50 p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground font-medium">{label}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-bold ${warna}`}>{val}</span>
                            <Badge className="text-[9px] px-1 py-0 h-4 bg-purple-500/20 text-purple-400 border-purple-500/30">AI</Badge>
                          </div>
                        </div>
                        {aiRec.reasoning[key] && (
                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                            {aiRec.reasoning[key]}
                          </p>
                        )}
                      </div>
                    ))}

                    <Button variant="outline" size="sm" onClick={segarkanAI} disabled={aiLoading}
                      className="w-full h-7 text-xs gap-1.5 border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                      <RefreshCw className="h-3 w-3" /> Segarkan Rekomendasi AI
                    </Button>
                  </div>
                )}
              </div>

              {/* Slider Manual (hanya tampil jika Mode AI nonaktif) */}
              {!aiMode && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span>Min Confidence</span><span className="font-bold text-primary">{config.minConfidence}%</span></div>
                    <Slider min={60} max={95} step={5} value={[config.minConfidence]} onValueChange={([v]) => updateConfig({ minConfidence: v })} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span>Posisi Per Trade</span><span className="font-bold text-primary">${config.maxPositionUSDT}</span></div>
                    <Slider min={100} max={2000} step={100} value={[config.maxPositionUSDT]} onValueChange={([v]) => updateConfig({ maxPositionUSDT: v })} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span>Leverage</span><span className="font-bold text-primary">{config.leverage}x</span></div>
                    <Slider min={1} max={20} step={1} value={[config.leverage]} onValueChange={([v]) => updateConfig({ leverage: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs"><span>Stop Loss</span><span className="text-red-400 font-bold">{config.stopLossPct}%</span></div>
                      <Slider min={0.5} max={5} step={0.5} value={[config.stopLossPct]} onValueChange={([v]) => updateConfig({ stopLossPct: v })} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs"><span>Take Profit</span><span className="text-green-400 font-bold">{config.takeProfitPct}%</span></div>
                      <Slider min={1} max={10} step={0.5} value={[config.takeProfitPct]} onValueChange={([v]) => updateConfig({ takeProfitPct: v })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span>Max Posisi</span><span className="font-bold text-primary">{config.maxPositions}</span></div>
                    <Slider min={1} max={10} step={1} value={[config.maxPositions]} onValueChange={([v]) => updateConfig({ maxPositions: v })} />
                  </div>
                </div>
              )}

              {engineStatus.lastError && (
                <div className="flex items-start gap-2 text-xs bg-red-950/20 border border-red-500/20 rounded-lg p-3">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-red-400">{engineStatus.lastError}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-primary" /> Sinyal Auto Terkini
              </CardTitle>
            </CardHeader>
            <CardContent>
              {log.filter(l => l.source === "auto").slice(0, 8).length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Belum ada sinyal auto</p>
                  <p className="text-xs mt-1">Aktifkan engine dan tunggu siklus pertama</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {log.filter(l => l.source === "auto").slice(0, 8).map(entry => (
                    <div key={entry.id} className={`flex items-center gap-2 p-2 rounded-lg text-xs border ${
                      entry.status === "closed_tp" ? "border-green-500/20 bg-green-500/5"
                      : entry.status === "closed_sl" ? "border-red-500/20 bg-red-500/5"
                      : entry.status === "opened" ? "border-primary/20 bg-primary/5"
                      : "border-border bg-muted/10"
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        entry.status === "closed_tp" ? "bg-green-400" : entry.status === "closed_sl" ? "bg-red-400"
                        : entry.status === "opened" ? "bg-primary" : "bg-muted-foreground"
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

      {/* ── Tab: Scalping 5M ─────────────────────────────────────────────── */}
      {tab === "scalp" && config && (
        <div className="space-y-4">
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
                    {(["semi", "auto"] as const).map(m => (
                      <button key={m} onClick={() => updateConfig({ scalpMode: m })}
                        className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                          config.scalpMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}>{m === "auto" ? "Auto" : "Semi"}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={fetchScalp} disabled={loadingSignals} className="gap-1.5 h-8">
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingSignals ? "animate-spin" : ""}`} /> Scan
                  </Button>
                  <Switch checked={config.scalpEnabled} onCheckedChange={v => updateConfig({ scalpEnabled: v })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span>Min Confidence</span><span className="font-bold text-primary">{config.scalpMinConfidence}%</span></div>
                  <Slider min={60} max={95} step={5} value={[config.scalpMinConfidence]} onValueChange={([v]) => updateConfig({ scalpMinConfidence: v })} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span>Posisi</span><span className="font-bold text-primary">${config.scalpMaxPositionUSDT}</span></div>
                  <Slider min={100} max={1000} step={100} value={[config.scalpMaxPositionUSDT]} onValueChange={([v]) => updateConfig({ scalpMaxPositionUSDT: v })} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span>Leverage</span><span className="font-bold text-primary">{config.leverage}x</span></div>
                  <Slider min={1} max={20} step={1} value={[config.leverage]} onValueChange={([v]) => updateConfig({ leverage: v })} />
                </div>
              </div>
            </CardContent>
          </Card>

          {loadingSignals ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => <Card key={i}><CardContent className="p-4 h-32 animate-pulse bg-muted/20" /></Card>)}
            </div>
          ) : validScalpSignals.length === 0 ? (
            <Card><CardContent className="py-16 text-center">
              <Timer className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Belum ada sinyal scalping valid</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Klik "Scan" untuk cek sinyal terbaru</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {validScalpSignals.map(sig => (
                <KartuSinyalScalp key={sig.symbol} sig={sig} onEksekusi={eksekusiScalp} mengeksekusi={executingId === sig.symbol} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Otak AI ─────────────────────────────────────────────────── */}
      {tab === "otak" && <TabOtakAI brainStats={brainStats} onReset={resetBrain} />}

      {/* ── Tab: Analitik ────────────────────────────────────────────────── */}
      {tab === "analitik" && <TabAnalitik log={log} balance={balance} />}

      {/* ── Tab: Log ─────────────────────────────────────────────────────── */}
      {tab === "log" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Riwayat Trade Demo ({log.length})</CardTitle>
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
                  <div className="w-12 text-right">Sumber</div>
                </div>
                {log.slice(0, 50).map(entry => <BarisCatatan key={entry.id} entry={entry} />)}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
