import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  FlaskConical, TrendingUp, TrendingDown, RefreshCw,
  Wallet, BarChart2, Trophy, Zap, Clock, XCircle, CheckCircle2,
  AlertTriangle, RotateCcw, Bot, Timer, Activity,
  ChevronDown, ChevronUp, Brain, Target, Shield, Flame,
  BookOpen, Star, Terminal, Filter, Tag, Calendar,
  TrendingDown as DrawdownIcon, ArrowUpRight, ArrowDownRight,
  Layers, Award, PieChart, List, Hash, Cpu, Radar, Waves, Eye,
  ArrowRightLeft, Lock, Lightbulb, Gauge,
} from "lucide-react";
import { AILiveStatus } from "@/components/shared/AILiveStatus";
import { ActivityFeed } from "@/components/shared/ActivityFeed";
import { PanelSetupEntry } from "@/components/shared/PanelSetupEntry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Cell, CartesianGrid, PieChart as RechartsPie, Pie, Legend,
} from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");
const SALDO_AWAL = 50;

// ─── Tipe Data ────────────────────────────────────────────────────────────────

interface DemoPosition {
  id: string; symbol: string; displayName: string;
  side: "Buy" | "Sell"; size: number; entryPrice: number;
  markPrice: number; leverage: number; margin: number;
  stopLoss: number | null; takeProfit: number | null;
  unrealisedPnl: number; unrealisedPnlPct: number;
  openedAt: number; source: "auto" | "scalp" | "manual";
  confidence: number; signal: string; openReason?: string; tags?: string[];
  humanInstinct?: {
    lastEvalAt: number;
    momentumScore: number;
    continuationProb: number;
    greedIndex: number;
    decaySignals: string[];
    action: string;
    reason: string;
    evalCount: number;
    urgency: number;
  };
}

interface InstinctStats {
  totalEvals: number;
  earlyExits: number;
  tpHits: number;
  slHits: number;
  manualCloses: number;
  correctEarlyExits: number;
  wrongEarlyExits: number;
  accuracy: number;
  avgHoldMinutes: number;
  momentumThreshold: number;
  greedThreshold: number;
  learningCycles: number;
  topDecaySignals: { signal: string; count: number }[];
  updatedAt: number;
}

interface DemoTradeLog {
  id: string; timestamp: number; openedAt?: number; closedAt?: number; duration?: number;
  symbol: string; side: "Buy" | "Sell"; qty: number; entryPrice: number;
  closePrice: number | null; realizedPnl: number | null;
  realizedPnlPct: number | null; leverage: number; margin: number;
  confidence: number; signal: string;
  status: "opened" | "closed_tp" | "closed_sl" | "closed_manual" | "rejected";
  reason: string; openReason?: string; source: "auto" | "scalp" | "manual";
  tags?: string[]; marketCondition?: string;
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
  lastCycleAt: number | null; nextCycleAt: number | null;
  cycleCount: number; lastSignalsFound: number;
  totalScanned: number; lastError: string | null;
}

interface DemoStats {
  totalTrades: number; closedTrades: number;
  wins: number; losses: number; winRate: number;
  profitFactor: number; currentBalance: number; initialBalance: number;
  totalPnl: number; totalPnlPct: number;
  largestWin: number; largestLoss: number;
  avgWin: number; avgLoss: number;
  consecutiveWins: number; consecutiveLosses: number;
  maxConsecutiveWins: number; maxConsecutiveLosses: number;
  maxDrawdown: number; maxDrawdownPct: number;
  bestPair: string | null; worstPair: string | null;
  equityHistory: { timestamp: number; balance: number }[];
  dailyPnl: { date: string; pnl: number; trades: number }[];
  tagPerformance: { tag: string; wins: number; losses: number; pnl: number; winRate: number }[];
  pairPerformance: { pair: string; wins: number; losses: number; pnl: number; winRate: number; trades: number }[];
  sourcePerformance: { source: string; wins: number; losses: number; pnl: number; winRate: number }[];
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
  minConfidence: number; maxPositionUSDT: number; leverage: number;
  stopLossPct: number; takeProfitPct: number; maxPositions: number;
  scalpMinConfidence: number; scalpMaxPositionUSDT: number;
  reasoning: Record<string, string>;
  riskLevel: "rendah" | "sedang" | "tinggi" | "ekstrем";
  summary: string; generatedAt: number;
}

type AIPhase = "idle" | "scanning" | "filtering" | "analyzing" | "confirming" | "waiting" | "executing" | "monitoring" | "switching" | "protecting" | "exiting";

interface AIActivityStatus {
  phase: AIPhase;
  phaseLabel: string;
  symbol: string | null;
  step: string;
  detail: string;
  progress: number;
  findings: string[];
  warnings: string[];
  marketCondition: string | null;
  marketConditionLabel: string;
  scanStats: { totalScanned: number; qualified: number; skipped: number; lastUpdated: number };
  updatedAt: number;
  cycleId: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function pnlColor(v: number) { return v >= 0 ? "text-green-400" : "text-red-400"; }
function pnlBg(v: number) { return v >= 0 ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"; }

function durasiFormat(ms?: number) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}d`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j ${m % 60}m`;
  return `${Math.floor(h / 24)}h ${h % 24}j`;
}

function waktuLalu(ts: number | null) {
  if (!ts) return "—";
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5) return "baru saja";
  if (d < 60) return `${d}d lalu`;
  if (d < 3600) return `${Math.floor(d / 60)}m lalu`;
  if (d < 86400) return `${Math.floor(d / 3600)}j lalu`;
  return `${Math.floor(d / 86400)}h lalu`;
}

function formatTanggal(ts: number) {
  return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatHari(ts: number) {
  return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? res.statusText); }
  return res.json() as Promise<T>;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DemoTradeLog["status"] }) {
  const config = {
    closed_tp: { icon: "✅", label: "Take Profit", cls: "bg-green-500/20 text-green-400 border-green-500/30" },
    closed_sl: { icon: "❌", label: "Stop Loss", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
    closed_manual: { icon: "🔒", label: "Ditutup Manual", cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    opened: { icon: "🔵", label: "Terbuka", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    rejected: { icon: "📋", label: "Sinyal", cls: "bg-muted/20 text-muted-foreground border-border" },
  }[status] ?? { icon: "⚪", label: status, cls: "bg-muted/20 text-muted-foreground border-border" };

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${config.cls}`}>
      {config.icon} {config.label}
    </span>
  );
}

// ─── Panel Saldo ──────────────────────────────────────────────────────────────

function PanelSaldo({ balance, onReset, stats }: { balance: DemoBalance | null; onReset: () => void; stats: DemoStats | null }) {
  if (!balance) return <Card><CardContent className="p-4 animate-pulse h-24 bg-muted/20" /></Card>;
  const pertumbuhan = balance.total - SALDO_AWAL;
  const pertumbuhanPct = (pertumbuhan / SALDO_AWAL) * 100;
  const totalTrade = balance.winCount + balance.lossCount;
  const totalWinPnl = stats ? stats.avgWin * stats.wins : 0;
  const totalLossPnl = stats ? stats.avgLoss * stats.losses : 0;
  const profitFactor = totalLossPnl > 0 ? totalWinPnl / totalLossPnl : totalWinPnl > 0 ? 999 : 0;

  return (
    <Card className="border-2 border-green-500/30 bg-green-500/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/20 rounded-lg">
              <FlaskConical className="h-4 w-4 text-green-400" />
            </div>
            <span className="font-bold text-sm text-green-400">AKUN DEMO</span>
            <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">Modal $50 USDT</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={onReset} className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive">
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Total Ekuitas</p>
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
            <p className="text-xs text-muted-foreground">Unrealized PnL</p>
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

function MeterRisiko({ balance, stats }: { balance: DemoBalance | null; stats: DemoStats | null }) {
  const konsekutifLoss = stats?.consecutiveLosses ?? 0;
  const drawdown = balance ? ((balance.total - SALDO_AWAL) / SALDO_AWAL) * 100 : 0;

  let levelRisiko: "aman" | "waspada" | "bahaya" | "kritis" = "aman";
  if (konsekutifLoss >= 5 || drawdown <= -30) levelRisiko = "kritis";
  else if (konsekutifLoss >= 3 || drawdown <= -15) levelRisiko = "bahaya";
  else if (konsekutifLoss >= 2 || drawdown <= -7) levelRisiko = "waspada";

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
    bahaya: `${konsekutifLoss}x loss beruntun atau drawdown ${fmt(drawdown)}%. Kurangi posisi 50%!`,
    kritis: "HENTIKAN TRADING! Terlalu banyak kerugian. Istirahat dan evaluasi strategi.",
  }[levelRisiko];

  return (
    <Card className={`border ${warna}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <Shield className="h-5 w-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Meter Risiko: {label}</span>
            {konsekutifLoss > 0 && <span className="text-xs text-muted-foreground">{konsekutifLoss}x loss beruntun</span>}
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

// ─── Kartu Posisi Aktif ────────────────────────────────────────────────────────

function KartuPosisi({ pos, onTutup }: { pos: DemoPosition; onTutup: (id: string) => void }) {
  const isLong = pos.side === "Buy";
  const pnlC = pnlColor(pos.unrealisedPnl);
  const srcColor = pos.source === "scalp" ? "text-purple-400" : pos.source === "auto" ? "text-blue-400" : "text-muted-foreground";
  const srcLbl = pos.source === "scalp" ? "⚡ SCALP" : pos.source === "auto" ? "🤖 AUTO" : "✋ MANUAL";
  const durasi = durasiFormat(Date.now() - pos.openedAt);

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
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div><p className="text-muted-foreground">Entry</p><p className="font-bold">${fmt(pos.entryPrice, 4)}</p></div>
          <div><p className="text-muted-foreground">Harga Kini</p><p className="font-bold">${fmt(pos.markPrice, 4)}</p></div>
          <div><p className="text-muted-foreground">Leverage</p><p className="font-bold text-primary">{pos.leverage}x</p></div>
          <div><p className="text-muted-foreground">Durasi</p><p className="font-bold text-yellow-400">{durasi}</p></div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><p className="text-muted-foreground">Margin</p><p className="font-bold">${fmt(pos.margin)}</p></div>
          <div><p className="text-muted-foreground">Float PnL</p><p className={`font-bold ${pnlC}`}>{pos.unrealisedPnl >= 0 ? "+" : ""}${fmt(Math.abs(pos.unrealisedPnl))}</p></div>
          <div><p className="text-muted-foreground">PnL %</p><p className={`font-bold ${pnlC}`}>{pos.unrealisedPnlPct >= 0 ? "+" : ""}{fmt(pos.unrealisedPnlPct)}%</p></div>
        </div>
        {(pos.stopLoss || pos.takeProfit) && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {pos.stopLoss && (
              <div className="bg-red-500/10 border border-red-500/20 rounded p-1.5">
                <p className="text-red-400 text-[10px]">❌ Stop Loss</p>
                <p className="font-bold text-red-400">${fmt(pos.stopLoss, 4)}</p>
              </div>
            )}
            {pos.takeProfit && (
              <div className="bg-green-500/10 border border-green-500/20 rounded p-1.5">
                <p className="text-green-400 text-[10px]">✅ Take Profit</p>
                <p className="font-bold text-green-400">${fmt(pos.takeProfit, 4)}</p>
              </div>
            )}
          </div>
        )}
        {pos.openReason && (
          <div className="text-[10px] text-muted-foreground bg-muted/20 rounded p-1.5 border border-border">
            <span className="text-primary font-semibold">Alasan AI: </span>{pos.openReason.split(";")[0]}
          </div>
        )}
        {pos.tags && pos.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pos.tags.filter(t => !["Profit", "Loss"].includes(t)).map(tag => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{tag}</span>
            ))}
          </div>
        )}

        {/* Human Instinct Engine Panel (hanya jika sudah dievaluasi) */}
        {pos.humanInstinct && pos.humanInstinct.evalCount > 0 && (
          <div className="bg-violet-500/5 border border-violet-500/20 rounded p-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Brain className="h-3 w-3 text-violet-400" />
                <span className="text-[10px] font-bold text-violet-400">HUMAN INSTINCT</span>
                <span className="text-[9px] text-muted-foreground">#{pos.humanInstinct.evalCount}</span>
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                pos.humanInstinct.action === "hold" ? "bg-green-500/20 text-green-400" :
                pos.humanInstinct.action === "tighten_trail" ? "bg-yellow-500/20 text-yellow-400" :
                pos.humanInstinct.action === "extend_target" ? "bg-blue-500/20 text-blue-400" :
                pos.humanInstinct.action === "exit_now" ? "bg-red-500/20 text-red-400" :
                "bg-muted/20 text-muted-foreground"
              }`}>
                {pos.humanInstinct.action === "hold" ? "✓ TAHAN" :
                 pos.humanInstinct.action === "tighten_trail" ? "🛡 KENCANGKAN" :
                 pos.humanInstinct.action === "extend_target" ? "🚀 PERPANJANG" :
                 pos.humanInstinct.action === "exit_now" ? "⚠ EXIT" : pos.humanInstinct.action.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              <div>
                <p className="text-muted-foreground">Momentum</p>
                <div className="flex items-center gap-1">
                  <div className="flex-1 bg-muted h-1 rounded-full">
                    <div className={`h-1 rounded-full ${pos.humanInstinct.momentumScore >= 60 ? "bg-green-400" : pos.humanInstinct.momentumScore >= 35 ? "bg-yellow-400" : "bg-red-400"}`}
                      style={{ width: `${Math.max(0, Math.min(100, pos.humanInstinct.momentumScore))}%` }} />
                  </div>
                  <span className="font-bold">{pos.humanInstinct.momentumScore}</span>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">Kelanjutan</p>
                <p className={`font-bold ${pos.humanInstinct.continuationProb >= 60 ? "text-green-400" : pos.humanInstinct.continuationProb >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                  {pos.humanInstinct.continuationProb}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Keserakahan</p>
                <p className={`font-bold ${pos.humanInstinct.greedIndex >= 70 ? "text-red-400" : pos.humanInstinct.greedIndex >= 40 ? "text-yellow-400" : "text-green-400"}`}>
                  {pos.humanInstinct.greedIndex}%
                </p>
              </div>
            </div>
            {pos.humanInstinct.decaySignals.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {pos.humanInstinct.decaySignals.slice(0, 3).map((s, i) => (
                  <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">{s}</span>
                ))}
              </div>
            )}
            <p className="text-[9px] text-muted-foreground leading-relaxed">{pos.humanInstinct.reason}</p>
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
          <span>Kepercayaan: {pos.confidence}%</span>
          <span>Dibuka {waktuLalu(pos.openedAt)}</span>
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
          <div><p className="text-muted-foreground">SL ❌</p><p className="font-bold text-red-400">${fmt(sig.stopLoss, 4)}</p></div>
          <div><p className="text-muted-foreground">TP ✅</p><p className="font-bold text-green-400">${fmt(sig.takeProfit, 4)}</p></div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>RSI: {fmt(sig.rsi14, 1)}</span>
          <span>Vol: {fmt(sig.volumeRatio, 2)}x</span>
          <span>R/R: {fmt(sig.riskReward, 2)}x</span>
          <span className={sig.trend15m === "bullish" ? "text-green-400" : sig.trend15m === "bearish" ? "text-red-400" : "text-yellow-400"}>
            {sig.trend15m === "bullish" ? "Naik" : sig.trend15m === "bearish" ? "Turun" : "Sideways"}
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

// ─── Baris Riwayat Trade ──────────────────────────────────────────────────────

function BarisRiwayat({ entry }: { entry: DemoTradeLog }) {
  const [expand, setExpand] = useState(false);
  const isClosed = entry.status !== "opened" && entry.status !== "rejected";
  const pnl = entry.realizedPnl ?? 0;
  const srcColor = entry.source === "scalp" ? "text-purple-400" : entry.source === "auto" ? "text-blue-400" : "text-muted-foreground";
  const srcLbl = entry.source === "scalp" ? "SCALP" : entry.source === "auto" ? "AUTO" : "MANUAL";

  return (
    <div className={`border-b border-border/40 transition-colors ${expand ? "bg-muted/20" : "hover:bg-muted/10"}`}>
      <div
        className="flex items-center gap-2 py-2.5 px-3 text-xs cursor-pointer"
        onClick={() => setExpand(!expand)}
      >
        <div className="w-24 text-muted-foreground shrink-0">{formatHari(entry.timestamp)}</div>
        <div className="w-24 font-bold shrink-0">{entry.symbol.replace("USDT", "")}/USDT</div>
        <div className="w-16 shrink-0">
          <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${entry.side === "Buy" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
            {entry.side === "Buy" ? "↑ LONG" : "↓ SHORT"}
          </span>
        </div>
        <div className="w-16 shrink-0 text-muted-foreground">
          <p className="text-[10px]">{entry.leverage}x lev</p>
          <p className="font-semibold">${fmt(entry.entryPrice, 4)}</p>
        </div>
        <div className="w-28 shrink-0">
          <StatusBadge status={entry.status} />
        </div>
        <div className="flex-1 min-w-0 hidden sm:block">
          <p className="text-muted-foreground truncate">{entry.reason}</p>
        </div>
        {entry.duration && (
          <div className="w-16 text-right shrink-0 text-[10px] text-muted-foreground hidden md:block">
            {durasiFormat(entry.duration)}
          </div>
        )}
        {isClosed && entry.realizedPnl != null && (
          <div className={`w-20 text-right shrink-0 font-bold ${pnlColor(pnl)}`}>
            {pnl >= 0 ? "+" : ""}${fmt(Math.abs(pnl))}
          </div>
        )}
        <div className={`w-14 text-right shrink-0 text-[10px] font-semibold ${srcColor}`}>
          {srcLbl}
        </div>
        <div className="w-4 shrink-0 text-muted-foreground">
          {expand ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </div>
      </div>

      {expand && (
        <div className="px-3 pb-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {entry.closePrice && <div><p className="text-muted-foreground">Harga Tutup</p><p className="font-bold">${fmt(entry.closePrice, 4)}</p></div>}
            <div><p className="text-muted-foreground">Margin</p><p className="font-bold">${fmt(entry.margin)}</p></div>
            {entry.realizedPnlPct != null && (
              <div><p className="text-muted-foreground">PnL %</p><p className={`font-bold ${pnlColor(entry.realizedPnlPct)}`}>{entry.realizedPnlPct >= 0 ? "+" : ""}{fmt(entry.realizedPnlPct)}%</p></div>
            )}
            {entry.duration && <div><p className="text-muted-foreground">Durasi</p><p className="font-bold">{durasiFormat(entry.duration)}</p></div>}
            <div><p className="text-muted-foreground">Kepercayaan</p><p className="font-bold text-primary">{entry.confidence}%</p></div>
          </div>
          {entry.openReason && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded p-2">
              <p className="text-[10px] text-blue-400 font-semibold mb-1">🤖 Alasan AI Masuk:</p>
              <p className="text-xs text-muted-foreground">{entry.openReason}</p>
            </div>
          )}
          {entry.tags && entry.tags.filter(t => !["Profit", "Loss"].includes(t)).length > 0 && (
            <div className="flex flex-wrap gap-1">
              <Tag className="h-3 w-3 text-muted-foreground" />
              {entry.tags.filter(t => !["Profit", "Loss"].includes(t)).map(tag => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab Riwayat ──────────────────────────────────────────────────────────────

function TabRiwayat({ log }: { log: DemoTradeLog[] }) {
  const [filterStatus, setFilterStatus] = useState<string>("semua");
  const [filterSumber, setFilterSumber] = useState<string>("semua");
  const [filterPair, setFilterPair] = useState<string>("");
  const [filterMinConf, setFilterMinConf] = useState(0);
  const [filterSisi, setFilterSisi] = useState<string>("semua");
  const [showFilter, setShowFilter] = useState(false);

  const pairs = useMemo(() => {
    const s = new Set(log.map(e => e.symbol.replace("USDT", "")));
    return [...s].sort();
  }, [log]);

  const filtered = useMemo(() => {
    return log.filter(e => {
      if (filterStatus !== "semua" && e.status !== filterStatus) return false;
      if (filterSumber !== "semua" && e.source !== filterSumber) return false;
      if (filterPair && !e.symbol.toLowerCase().includes(filterPair.toLowerCase())) return false;
      if (filterMinConf > 0 && e.confidence < filterMinConf) return false;
      if (filterSisi !== "semua") {
        if (filterSisi === "long" && e.side !== "Buy") return false;
        if (filterSisi === "short" && e.side !== "Sell") return false;
      }
      return true;
    });
  }, [log, filterStatus, filterSumber, filterPair, filterMinConf, filterSisi]);

  const closedFiltered = filtered.filter(e => e.status === "closed_tp" || e.status === "closed_sl" || e.status === "closed_manual");
  const totalPnl = closedFiltered.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);

  const statusOpts = [
    { val: "semua", label: "Semua" },
    { val: "closed_tp", label: "✅ TP Hit" },
    { val: "closed_sl", label: "❌ SL Hit" },
    { val: "closed_manual", label: "🔒 Manual" },
    { val: "opened", label: "🔵 Terbuka" },
    { val: "rejected", label: "📋 Sinyal" },
  ];

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              Filter Riwayat
            </div>
            <button onClick={() => setShowFilter(!showFilter)} className="text-xs text-primary hover:underline">
              {showFilter ? "Sembunyikan" : "Tampilkan Filter"}
            </button>
          </div>

          {showFilter && (
            <div className="space-y-3 pt-2 border-t border-border">
              {/* Status filter */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Status Penutupan</p>
                <div className="flex flex-wrap gap-1">
                  {statusOpts.map(opt => (
                    <button key={opt.val} onClick={() => setFilterStatus(opt.val)}
                      className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                        filterStatus === opt.val ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                      }`}>{opt.label}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Sumber */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Sumber</p>
                  <div className="flex gap-1">
                    {[["semua", "Semua"], ["auto", "Auto AI"], ["scalp", "Scalp"], ["manual", "Manual"]].map(([v, l]) => (
                      <button key={v} onClick={() => setFilterSumber(v)}
                        className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                          filterSumber === v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                        }`}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* Sisi */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Posisi</p>
                  <div className="flex gap-1">
                    {[["semua", "Semua"], ["long", "↑ Long"], ["short", "↓ Short"]].map(([v, l]) => (
                      <button key={v} onClick={() => setFilterSisi(v)}
                        className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                          filterSisi === v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                        }`}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Pair */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Cari Pair</p>
                  <input
                    value={filterPair}
                    onChange={e => setFilterPair(e.target.value)}
                    placeholder="Contoh: BTC, ETH..."
                    className="w-full text-xs bg-muted/30 border border-border rounded-md px-2 py-1.5 outline-none focus:border-primary"
                  />
                </div>

                {/* Confidence */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Min Kepercayaan: {filterMinConf > 0 ? `${filterMinConf}%` : "Semua"}</p>
                  <Slider min={0} max={90} step={10} value={[filterMinConf]} onValueChange={([v]) => setFilterMinConf(v)} />
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={() => {
                setFilterStatus("semua"); setFilterSumber("semua"); setFilterPair("");
                setFilterMinConf(0); setFilterSisi("semua");
              }} className="h-7 text-xs text-muted-foreground">
                Reset Filter
              </Button>
            </div>
          )}

          {/* Ringkasan hasil filter */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
            <span><span className="font-bold text-foreground">{filtered.length}</span> entri</span>
            <span><span className="font-bold text-green-400">{closedFiltered.filter(t => (t.realizedPnl ?? 0) > 0).length}</span> menang</span>
            <span><span className="font-bold text-red-400">{closedFiltered.filter(t => (t.realizedPnl ?? 0) <= 0).length}</span> kalah</span>
            <span className={`font-bold ml-auto ${pnlColor(totalPnl)}`}>
              {totalPnl >= 0 ? "+" : ""}${fmt(Math.abs(totalPnl))} PnL
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Daftar riwayat */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <List className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Belum ada riwayat trade</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Coba ubah filter atau mulai trading</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-muted-foreground border-b border-border bg-muted/20 font-semibold">
            <div className="w-24">Waktu</div>
            <div className="w-24">Pair</div>
            <div className="w-16">Arah</div>
            <div className="w-16">Harga Masuk</div>
            <div className="w-28">Status</div>
            <div className="flex-1 hidden sm:block">Alasan</div>
            <div className="w-16 text-right hidden md:block">Durasi</div>
            <div className="w-20 text-right">PnL</div>
            <div className="w-14 text-right">Sumber</div>
            <div className="w-4" />
          </div>
          <div>
            {filtered.slice(0, 100).map(entry => (
              <BarisRiwayat key={entry.id} entry={entry} />
            ))}
            {filtered.length > 100 && (
              <p className="text-center text-xs text-muted-foreground py-3">
                Menampilkan 100 dari {filtered.length} entri
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab Statistik ────────────────────────────────────────────────────────────

function TabStatistik({ stats }: { stats: DemoStats | null }) {
  if (!stats) return (
    <div className="py-20 text-center text-muted-foreground">
      <BarChart2 className="h-12 w-12 mx-auto mb-3 opacity-30 animate-pulse" />
      <p>Memuat statistik...</p>
    </div>
  );

  const metrikUtama = [
    { label: "Total Trade", val: stats.closedTrades, sub: `${stats.totalTrades} termasuk terbuka`, icon: Hash, warna: "text-primary" },
    { label: "Total Menang", val: stats.wins, sub: `Winrate: ${fmt(stats.winRate, 1)}%`, icon: Trophy, warna: "text-green-400" },
    { label: "Total Kalah", val: stats.losses, sub: `Avg loss: $${fmt(stats.avgLoss)}`, icon: XCircle, warna: "text-red-400" },
    { label: "Win Rate", val: `${fmt(stats.winRate, 1)}%`, sub: stats.winRate >= 60 ? "Sangat Bagus ✨" : stats.winRate >= 50 ? "Cukup Baik" : "Perlu Perbaikan", icon: Target, warna: stats.winRate >= 60 ? "text-green-400" : stats.winRate >= 50 ? "text-yellow-400" : "text-red-400" },
    { label: "Profit Factor", val: stats.profitFactor === 999 ? "∞" : fmt(stats.profitFactor), sub: "Target ≥ 1.5", icon: Award, warna: stats.profitFactor >= 1.5 ? "text-green-400" : stats.profitFactor >= 1 ? "text-yellow-400" : "text-red-400" },
    { label: "Saldo Saat Ini", val: `$${fmt(stats.currentBalance)}`, sub: `Modal awal: $${fmt(stats.initialBalance)}`, icon: Wallet, warna: stats.currentBalance >= stats.initialBalance ? "text-green-400" : "text-red-400" },
    { label: "Total PnL", val: `${stats.totalPnl >= 0 ? "+" : ""}$${fmt(Math.abs(stats.totalPnl))}`, sub: `${stats.totalPnlPct >= 0 ? "+" : ""}${fmt(stats.totalPnlPct)}% dari modal`, icon: TrendingUp, warna: pnlColor(stats.totalPnl) },
    { label: "Kemenangan Terbesar", val: `+$${fmt(stats.largestWin)}`, sub: "Trade terbaik", icon: ArrowUpRight, warna: "text-green-400" },
    { label: "Kekalahan Terbesar", val: `-$${fmt(Math.abs(stats.largestLoss))}`, sub: "Trade terburuk", icon: ArrowDownRight, warna: "text-red-400" },
    { label: "Max Drawdown", val: `-$${fmt(Math.abs(stats.maxDrawdown))}`, sub: `${fmt(stats.maxDrawdownPct)}%`, icon: DrawdownIcon, warna: "text-red-400" },
    { label: "Streak Menang Kini", val: stats.consecutiveWins, sub: `Max: ${stats.maxConsecutiveWins}x`, icon: Flame, warna: "text-green-400" },
    { label: "Streak Kalah Kini", val: stats.consecutiveLosses, sub: `Max: ${stats.maxConsecutiveLosses}x`, icon: AlertTriangle, warna: "text-red-400" },
  ];

  return (
    <div className="space-y-4">
      {/* Grid metrik utama */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {metrikUtama.map(({ label, val, sub, icon: Icon, warna }) => (
          <Card key={label}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${warna}`} />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <p className={`text-xl font-bold ${warna}`}>{val}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Performa per pair */}
        {stats.pairPerformance.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-400" /> Performa Per Pair
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {stats.pairPerformance.slice(0, 8).map((p) => (
                  <div key={p.pair} className="flex items-center gap-3 text-xs">
                    <span className="w-20 font-bold shrink-0">{p.pair}</span>
                    <span className="text-muted-foreground shrink-0 w-16">{p.wins}M {p.losses}K ({p.trades})</span>
                    <div className="flex-1">
                      <div className="w-full bg-muted h-1.5 rounded-full">
                        <div className={`h-1.5 rounded-full ${p.winRate >= 60 ? "bg-green-500" : p.winRate >= 45 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${p.winRate}%` }} />
                      </div>
                    </div>
                    <span className={`w-12 text-right font-bold shrink-0 ${p.winRate >= 60 ? "text-green-400" : p.winRate >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                      {fmt(p.winRate, 0)}%
                    </span>
                    <span className={`w-16 text-right font-bold shrink-0 ${pnlColor(p.pnl)}`}>
                      {p.pnl >= 0 ? "+" : ""}${fmt(Math.abs(p.pnl))}
                    </span>
                  </div>
                ))}
              </div>
              {stats.bestPair && (
                <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                  🏆 Pair terbaik: <span className="text-green-400 font-bold">{stats.bestPair}</span>
                  {stats.worstPair && <> · ⚠ Terburuk: <span className="text-red-400 font-bold">{stats.worstPair}</span></>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Performa per tag/strategi */}
        {stats.tagPerformance.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" /> Performa Per Strategi
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {stats.tagPerformance.slice(0, 8).map((t) => (
                  <div key={t.tag} className="flex items-center gap-3 text-xs">
                    <span className="w-32 font-medium shrink-0">{t.tag}</span>
                    <span className="text-muted-foreground shrink-0 w-14">{t.wins}M {t.losses}K</span>
                    <div className="flex-1">
                      <div className="w-full bg-muted h-1.5 rounded-full">
                        <div className={`h-1.5 rounded-full ${t.winRate >= 60 ? "bg-green-500" : t.winRate >= 45 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${t.winRate}%` }} />
                      </div>
                    </div>
                    <span className={`w-12 text-right font-bold shrink-0 ${pnlColor(t.pnl)}`}>
                      {t.pnl >= 0 ? "+" : ""}${fmt(Math.abs(t.pnl))}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Performa per sumber */}
        {stats.sourcePerformance.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-400" /> Performa Per Sumber
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-3">
                {stats.sourcePerformance.map((s) => (
                  <div key={s.source} className={`rounded-xl border p-3 ${pnlBg(s.pnl)}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm">{s.source}</span>
                      <span className={`font-bold ${pnlColor(s.pnl)}`}>{s.pnl >= 0 ? "+" : ""}${fmt(Math.abs(s.pnl))}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div><p className="text-muted-foreground">Win Rate</p><p className="font-bold">{fmt(s.winRate, 1)}%</p></div>
                      <div><p className="text-muted-foreground">Menang</p><p className="font-bold text-green-400">{s.wins}</p></div>
                      <div><p className="text-muted-foreground">Kalah</p><p className="font-bold text-red-400">{s.losses}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rata-rata */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" /> Ringkasan Risiko
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {[
              { label: "Rata-rata Win", val: `+$${fmt(stats.avgWin)}`, warna: "text-green-400", bar: stats.avgWin, max: Math.max(stats.avgWin, stats.avgLoss), barColor: "bg-green-500" },
              { label: "Rata-rata Loss", val: `-$${fmt(stats.avgLoss)}`, warna: "text-red-400", bar: stats.avgLoss, max: Math.max(stats.avgWin, stats.avgLoss), barColor: "bg-red-500" },
            ].map(({ label, val, warna, bar, max, barColor }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-bold ${warna}`}>{val}</span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full">
                  <div className={`${barColor} h-2 rounded-full`} style={{ width: `${max > 0 ? (bar / max) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-border text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rasio R/R Rata-rata</span>
                <span className={`font-bold ${stats.avgLoss > 0 && stats.avgWin / stats.avgLoss >= 1.5 ? "text-green-400" : "text-yellow-400"}`}>
                  {stats.avgLoss > 0 ? fmt(stats.avgWin / stats.avgLoss) : "∞"}x
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected Value</span>
                <span className={`font-bold ${pnlColor(stats.winRate / 100 * stats.avgWin - (1 - stats.winRate / 100) * stats.avgLoss)}`}>
                  ${fmt(stats.winRate / 100 * stats.avgWin - (1 - stats.winRate / 100) * stats.avgLoss)} per trade
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab Analitik ──────────────────────────────────────────────────────────────

function TabAnalitik({ log, balance, stats }: { log: DemoTradeLog[]; balance: DemoBalance | null; stats: DemoStats | null }) {
  const closedTrades = log.filter(e => e.status === "closed_tp" || e.status === "closed_sl" || e.status === "closed_manual");

  const kurvaEkuitas = useMemo(() => {
    if (stats?.equityHistory && stats.equityHistory.length > 1) {
      return stats.equityHistory.map((e, i) => ({
        waktu: i === 0 ? "Awal" : formatHari(e.timestamp),
        saldo: Math.round(e.balance * 100) / 100,
      }));
    }
    const sorted = [...closedTrades].sort((a, b) => a.timestamp - b.timestamp);
    let saldo = SALDO_AWAL;
    const points = [{ waktu: "Awal", saldo }];
    for (const trade of sorted) {
      saldo += trade.realizedPnl ?? 0;
      points.push({ waktu: formatHari(trade.timestamp), saldo: Math.round(saldo * 100) / 100 });
    }
    return points;
  }, [stats, closedTrades]);

  const pnlPerTrade = useMemo(() => {
    return [...closedTrades].sort((a, b) => a.timestamp - b.timestamp).slice(-30).map((t, i) => ({
      idx: i + 1,
      pair: t.symbol.replace("USDT", ""),
      pnl: t.realizedPnl ?? 0,
      status: t.status,
    }));
  }, [closedTrades]);

  const distribusi = useMemo(() => {
    const tp = closedTrades.filter(e => e.status === "closed_tp").length;
    const sl = closedTrades.filter(e => e.status === "closed_sl").length;
    const manual = closedTrades.filter(e => e.status === "closed_manual").length;
    return [
      { name: "✅ Take Profit", value: tp, fill: "#22c55e" },
      { name: "❌ Stop Loss", value: sl, fill: "#ef4444" },
      { name: "🔒 Manual", value: manual, fill: "#eab308" },
    ].filter(d => d.value > 0);
  }, [closedTrades]);

  const ekuitasWarna = kurvaEkuitas.length > 1 && kurvaEkuitas[kurvaEkuitas.length - 1].saldo >= SALDO_AWAL
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

  const totalRealized = closedTrades.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Kurva Ekuitas */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Kurva Pertumbuhan Ekuitas
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
                tickFormatter={(v) => `$${fmt(v)}`} width={56} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                formatter={(val: number) => [`$${fmt(val)}`, "Saldo"]}
              />
              <Area type="monotone" dataKey="saldo" stroke={ekuitasWarna} strokeWidth={2}
                fill="url(#gradEkuitas)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>Modal awal: ${fmt(SALDO_AWAL)}</span>
            <span className={pnlColor(totalRealized)}>
              PnL Total: {totalRealized >= 0 ? "+" : ""}${fmt(Math.abs(totalRealized))}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PnL per trade */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">PnL Per Trade (30 Terakhir)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={pnlPerTrade}>
                <XAxis dataKey="idx" tick={{ fontSize: 9, fill: "#888" }} />
                <YAxis tick={{ fontSize: 9, fill: "#888" }} width={44} tickFormatter={(v) => `$${fmt(v, 1)}`} />
                <Tooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                  formatter={(val: number, _: string, props: any) => [
                    `${val >= 0 ? "+" : ""}$${fmt(Math.abs(val))}`,
                    props.payload?.pair ?? "PnL"
                  ]}
                />
                <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                  {pnlPerTrade.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribusi hasil */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Distribusi Penutupan Trade</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {distribusi.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <RechartsPie>
                  <Pie data={distribusi} cx="50%" cy="50%" innerRadius={40} outerRadius={70}
                    dataKey="value" nameKey="name" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={false}>
                    {distribusi.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip formatter={(val) => [val, "Trade"]} />
                  <Legend iconType="circle" iconSize={8} />
                </RechartsPie>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Belum ada data</div>
            )}
          </CardContent>
        </Card>

        {/* PnL Harian */}
        {stats && stats.dailyPnl.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> PnL Harian
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stats.dailyPnl}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} />
                  <YAxis tick={{ fontSize: 9, fill: "#888" }} width={44} tickFormatter={(v) => `$${fmt(v, 1)}`} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                    formatter={(val: number, name: string) => [`${val >= 0 ? "+" : ""}$${fmt(Math.abs(val))}`, name === "pnl" ? "PnL" : name]}
                  />
                  <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                    {stats.dailyPnl.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "#22c55e" : "#ef4444"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Performa pair */}
        {stats && stats.pairPerformance.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">Peringkat Pair Terbaik</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {stats.pairPerformance.slice(0, 6).map((p, i) => (
                  <div key={p.pair} className="flex items-center gap-3 text-xs py-1 border-b border-border/50 last:border-0">
                    <span className="text-muted-foreground w-4 shrink-0">#{i + 1}</span>
                    <span className="w-20 font-bold">{p.pair}</span>
                    <span className="text-muted-foreground w-16 shrink-0">{p.wins}M {p.losses}K</span>
                    <div className="flex-1">
                      <div className="w-full bg-muted h-1.5 rounded-full">
                        <div className={`h-1.5 rounded-full ${p.winRate >= 60 ? "bg-green-500" : p.winRate >= 45 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${p.winRate}%` }} />
                      </div>
                    </div>
                    <span className={`w-16 text-right font-bold ${pnlColor(p.pnl)}`}>
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

// ─── Tab Insting AI (Human Instinct Engine) ───────────────────────────────────

function TabInstinctAI({ instinctStats, positions }: {
  instinctStats: InstinctStats | null;
  positions: DemoPosition[];
}) {
  const activeInstincts = positions.filter(p => p.humanInstinct && p.humanInstinct.evalCount > 0);

  if (!instinctStats) return (
    <div className="py-20 text-center text-muted-foreground">
      <Radar className="h-12 w-12 mx-auto mb-3 opacity-30 animate-pulse" />
      <p>Memuat data Human Instinct Engine...</p>
      <p className="text-xs mt-1">Engine mulai bekerja setelah posisi auto dibuka ≥2 menit</p>
    </div>
  );

  const accuracy = instinctStats.accuracy ?? 0;
  const accuracyColor = accuracy >= 65 ? "text-green-400" : accuracy >= 45 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="space-y-4">
      {/* Header info */}
      <Card className="border-violet-500/30 bg-violet-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <Brain className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-violet-400">Human Instinct & Adaptive Exit Intelligence</h3>
              <p className="text-xs text-muted-foreground">AI berperilaku seperti trader profesional — membaca momentum, mencegah keserakahan, belajar mandiri</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-background/50 rounded-lg p-2 border border-border">
              <p className="text-muted-foreground">Total Evaluasi</p>
              <p className="text-xl font-bold text-violet-400">{instinctStats.totalEvals}</p>
              <p className="text-[10px] text-muted-foreground">Sejak aktif</p>
            </div>
            <div className="bg-background/50 rounded-lg p-2 border border-border">
              <p className="text-muted-foreground">Exit Awal Diambil</p>
              <p className="text-xl font-bold text-orange-400">{instinctStats.earlyExits}</p>
              <p className="text-[10px] text-muted-foreground">Keputusan exit dini</p>
            </div>
            <div className="bg-background/50 rounded-lg p-2 border border-border">
              <p className="text-muted-foreground">Akurasi Instinct</p>
              <p className={`text-xl font-bold ${accuracyColor}`}>{fmt(accuracy, 1)}%</p>
              <p className="text-[10px] text-muted-foreground">{instinctStats.correctEarlyExits}B / {instinctStats.wrongEarlyExits}S</p>
            </div>
            <div className="bg-background/50 rounded-lg p-2 border border-border">
              <p className="text-muted-foreground">Siklus Belajar</p>
              <p className="text-xl font-bold text-blue-400">{instinctStats.learningCycles}</p>
              <p className="text-[10px] text-muted-foreground">Self-learning aktif</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hasil close breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Take Profit", val: instinctStats.tpHits, color: "text-green-400", icon: "✅", bg: "bg-green-500/5 border-green-500/20" },
          { label: "Stop Loss", val: instinctStats.slHits, color: "text-red-400", icon: "❌", bg: "bg-red-500/5 border-red-500/20" },
          { label: "Exit Awal Benar", val: instinctStats.correctEarlyExits, color: "text-emerald-400", icon: "🧠", bg: "bg-emerald-500/5 border-emerald-500/20" },
          { label: "Exit Awal Salah", val: instinctStats.wrongEarlyExits, color: "text-orange-400", icon: "⚠", bg: "bg-orange-500/5 border-orange-500/20" },
        ].map(({ label, val, color, icon, bg }) => (
          <Card key={label} className={`border ${bg}`}>
            <CardContent className="p-3 text-center">
              <p className="text-lg">{icon}</p>
              <p className={`text-2xl font-bold ${color}`}>{val}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Parameter adaptif yang dipelajari */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" /> Parameter Adaptif (Dipelajari Otomatis)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-muted/20 rounded-lg p-3 border border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground">Ambang Momentum</span>
                <span className="font-bold text-primary">{instinctStats.momentumThreshold}</span>
              </div>
              <div className="w-full bg-muted h-1.5 rounded-full">
                <div className="bg-violet-400 h-1.5 rounded-full" style={{ width: `${instinctStats.momentumThreshold}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Skor di bawah ini = sinyal melemah</p>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 border border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground">Ambang Keserakahan</span>
                <span className="font-bold text-orange-400">{instinctStats.greedThreshold}%</span>
              </div>
              <div className="w-full bg-muted h-1.5 rounded-full">
                <div className="bg-orange-400 h-1.5 rounded-full" style={{ width: `${instinctStats.greedThreshold}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Profit % di atas ini = waspada keserakahan</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs bg-blue-500/5 border border-blue-500/20 rounded-lg p-2.5">
            <Lightbulb className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="text-muted-foreground">
              Parameter ini disesuaikan otomatis berdasarkan {instinctStats.learningCycles} siklus pembelajaran.
              Rata-rata durasi hold: <span className="font-bold text-foreground">{fmt(instinctStats.avgHoldMinutes, 0)} menit</span>.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Top sinyal decay yang terdeteksi */}
      {instinctStats.topDecaySignals && instinctStats.topDecaySignals.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Waves className="h-4 w-4 text-orange-400" /> Sinyal Peluruhan Momentum Teratas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {instinctStats.topDecaySignals.slice(0, 6).map(({ signal, count }) => (
                <div key={signal} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs truncate">{signal}</span>
                      <span className="text-xs font-bold text-orange-400 shrink-0 ml-2">{count}x</span>
                    </div>
                    <div className="w-full bg-muted h-1 rounded-full">
                      <div className="bg-orange-400/60 h-1 rounded-full"
                        style={{ width: `${Math.min(100, (count / (instinctStats.topDecaySignals[0]?.count || 1)) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Posisi yang sedang dimonitor instinct */}
      {activeInstincts.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-violet-400 animate-pulse" /> Posisi Aktif Dimonitor Instinct ({activeInstincts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {activeInstincts.map(pos => {
              const inst = pos.humanInstinct!;
              const isLong = pos.side === "Buy";
              return (
                <div key={pos.id} className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{pos.displayName}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {isLong ? "↑ LONG" : "↓ SHORT"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">Eval #{inst.evalCount}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        inst.action === "hold" ? "bg-green-500/20 text-green-400" :
                        inst.action === "tighten_trail" ? "bg-yellow-500/20 text-yellow-400" :
                        inst.action === "extend_target" ? "bg-blue-500/20 text-blue-400" :
                        "bg-red-500/20 text-red-400"
                      }`}>
                        {inst.action === "hold" ? "TAHAN" : inst.action === "tighten_trail" ? "KENCANGKAN" :
                         inst.action === "extend_target" ? "PERPANJANG" : "EXIT"}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <p className="text-muted-foreground">Momentum</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="flex-1 bg-muted h-1 rounded-full">
                          <div className={`h-1 rounded-full ${inst.momentumScore >= 60 ? "bg-green-400" : inst.momentumScore >= 35 ? "bg-yellow-400" : "bg-red-400"}`}
                            style={{ width: `${Math.max(0, Math.min(100, inst.momentumScore))}%` }} />
                        </div>
                        <span className="font-bold shrink-0">{inst.momentumScore}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Kelanjutan</p>
                      <p className={`font-bold ${inst.continuationProb >= 60 ? "text-green-400" : inst.continuationProb >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                        {inst.continuationProb}%
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Keserakahan</p>
                      <p className={`font-bold ${inst.greedIndex >= 70 ? "text-red-400" : inst.greedIndex >= 40 ? "text-yellow-400" : "text-green-400"}`}>
                        {inst.greedIndex}%
                      </p>
                    </div>
                  </div>
                  {inst.decaySignals.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {inst.decaySignals.slice(0, 3).map((s, i) => (
                        <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">{s}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">{inst.reason}</p>
                  <p className="text-[9px] text-muted-foreground/60">Terakhir dievaluasi {waktuLalu(inst.lastEvalAt)}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Belum ada data instinct */}
      {instinctStats.totalEvals === 0 && activeInstincts.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center space-y-2">
            <Radar className="h-12 w-12 mx-auto text-muted-foreground/30" />
            <p className="text-muted-foreground">Belum ada evaluasi instinct</p>
            <p className="text-xs text-muted-foreground/60">
              Engine akan aktif setelah posisi auto/scalp dibuka minimal 2 menit.
              <br/>Evaluasi berjalan setiap 45 detik per posisi.
            </p>
          </CardContent>
        </Card>
      )}
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
    ? (brainStats.totalWins / brainStats.totalPredictions * 100) : 0;

  const kondisiLabel: Record<string, string> = {
    trending_up: "Tren Naik",
    trending_down: "Tren Turun",
    sideways: "Sideways",
    volatile: "Volatil",
    low_liquidity: "Likuiditas Rendah",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Prediksi", val: brainStats.totalPredictions, icon: Target, warna: "text-primary" },
          { label: "Win Rate AI", val: `${fmt(winRate, 1)}%`, icon: Trophy, warna: winRate >= 60 ? "text-green-400" : winRate >= 45 ? "text-yellow-400" : "text-red-400" },
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

      {brainStats.topIndicators.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400" /> Indikator Terbaik
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {brainStats.topIndicators.slice(0, 5).map((ind) => (
              <div key={ind.key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{ind.name}</span>
                  <span className="text-muted-foreground">
                    Akurasi: <span className={`font-bold ${ind.accuracy >= 70 ? "text-green-400" : ind.accuracy >= 55 ? "text-yellow-400" : "text-red-400"}`}>{fmt(ind.accuracy, 1)}%</span>
                    {" "}· Bobot: {fmt(ind.weight, 2)}
                  </span>
                </div>
                <div className="w-full bg-muted h-1.5 rounded-full">
                  <div className={`h-1.5 rounded-full ${ind.accuracy >= 70 ? "bg-green-500" : ind.accuracy >= 55 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${ind.accuracy}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {Object.keys(brainStats.conditionPerformance).length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Performa Per Kondisi Pasar
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(brainStats.conditionPerformance).map(([cond, perf]) => {
                const total = perf.wins + perf.losses + perf.neutrals;
                const wr = total > 0 ? (perf.wins / total) * 100 : 0;
                return (
                  <div key={cond} className="rounded-xl border border-border p-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{kondisiLabel[cond] ?? cond}</span>
                      <span className={`font-bold ${wr >= 60 ? "text-green-400" : wr >= 45 ? "text-yellow-400" : "text-red-400"}`}>{fmt(wr, 1)}%</span>
                    </div>
                    <div className="w-full bg-muted h-1.5 rounded-full">
                      <div className={`h-1.5 rounded-full ${wr >= 60 ? "bg-green-500" : wr >= 45 ? "bg-yellow-500" : "bg-red-500"}`}
                        style={{ width: `${wr}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{perf.wins}M / {perf.losses}K / {perf.neutrals}N</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
                  <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${m.direction === "LONG" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {m.direction}
                  </span>
                  <span className={`font-bold ${m.result === "WIN" ? "text-green-400" : m.result === "LOSS" ? "text-red-400" : "text-yellow-400"}`}>
                    {m.result === "WIN" ? "✅ MENANG" : m.result === "LOSS" ? "❌ KALAH" : "➖ NETRAL"}
                  </span>
                  <span className={pnlColor(m.priceDeltaPct)}>{m.priceDeltaPct >= 0 ? "+" : ""}{fmt(m.priceDeltaPct)}%</span>
                  <span className="ml-auto text-muted-foreground">{formatHari(m.timestamp)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{m.lesson}</p>
                <p className="text-xs text-primary">→ {m.correctedApproach}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onReset} className="gap-1.5 text-destructive hover:text-destructive">
          <RotateCcw className="h-3.5 w-3.5" /> Reset Memori Brain
        </Button>
      </div>
    </div>
  );
}

// ─── Tab: Lab AI Institusional ────────────────────────────────────────────────

const PHASE_META: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  idle:       { color: "text-muted-foreground", bg: "bg-muted/30",         icon: Eye,           label: "Standby" },
  scanning:   { color: "text-blue-400",         bg: "bg-blue-500/10",      icon: Radar,         label: "Memindai Pasar" },
  filtering:  { color: "text-cyan-400",         bg: "bg-cyan-500/10",      icon: Filter,        label: "Menyaring Kandidat" },
  analyzing:  { color: "text-violet-400",       bg: "bg-violet-500/10",    icon: Cpu,           label: "Analisis Institusional" },
  confirming: { color: "text-amber-400",        bg: "bg-amber-500/10",     icon: Lightbulb,     label: "Konfirmasi Setup" },
  waiting:    { color: "text-yellow-400",       bg: "bg-yellow-500/10",    icon: Clock,         label: "Menunggu Kondisi" },
  executing:  { color: "text-green-400",        bg: "bg-green-500/10",     icon: Zap,           label: "Eksekusi Order" },
  monitoring: { color: "text-primary",          bg: "bg-primary/10",       icon: Activity,      label: "Monitoring Posisi" },
  switching:  { color: "text-orange-400",       bg: "bg-orange-500/10",    icon: ArrowRightLeft,label: "Smart Switch" },
  protecting: { color: "text-emerald-400",      bg: "bg-emerald-500/10",   icon: Shield,        label: "Trailing Stop" },
  exiting:    { color: "text-red-400",          bg: "bg-red-500/10",       icon: Lock,          label: "Menutup Posisi" },
};

const CONDITION_EMOJI: Record<string, string> = {
  trending_up: "📈", trending_down: "📉", ranging: "↔️",
  breakout: "🚀", breakdown: "💥", high_volatility: "⚡",
  low_volatility: "😴", accumulation: "🏦", distribution: "📤",
  squeeze: "🔧", default: "❓",
};

function TabLabAI({ aiStatus, engineStatus, stats }: {
  aiStatus: AIActivityStatus | null;
  engineStatus: DemoEngineStatus | null;
  stats: DemoStats | null;
}) {
  const phase = aiStatus?.phase ?? "idle";
  const meta = PHASE_META[phase] ?? PHASE_META.idle;
  const PhaseIcon = meta.icon;
  const isActive = phase !== "idle";
  const timeSinceUpdate = aiStatus ? Math.floor((Date.now() - aiStatus.updatedAt) / 1000) : null;

  return (
    <div className="space-y-4">
      {/* ─── Live Status Banner ─── */}
      <Card className={`border ${meta.bg.replace("/10", "/20")} overflow-hidden`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${meta.bg} shrink-0`}>
              <PhaseIcon className={`h-6 w-6 ${meta.color} ${isActive ? "animate-pulse" : ""}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-bold ${meta.color}`}>{aiStatus?.phaseLabel ?? "⚪ Standby"}</span>
                {aiStatus?.symbol && (
                  <span className="text-xs font-mono bg-background/60 px-2 py-0.5 rounded border border-border">
                    {aiStatus.symbol.replace("USDT", "/USDT")}
                  </span>
                )}
                {aiStatus?.cycleId && (
                  <span className="text-xs text-muted-foreground">#{aiStatus.cycleId}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground shrink-0">
                  {timeSinceUpdate != null ? (timeSinceUpdate < 3 ? "baru saja" : `${timeSinceUpdate}d lalu`) : "—"}
                </span>
              </div>
              <p className="text-sm font-medium mt-0.5">{aiStatus?.step ?? "Tidak ada aktivitas"}</p>
              {aiStatus?.detail && aiStatus.detail !== aiStatus.step && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{aiStatus.detail}</p>
              )}
              {/* Progress Bar */}
              {aiStatus && aiStatus.progress > 0 && aiStatus.progress < 100 && (
                <div className="mt-2">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isActive ? "bg-primary" : "bg-muted-foreground"}`}
                      style={{ width: `${aiStatus.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>{meta.label}</span>
                    <span>{aiStatus.progress}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Kondisi Pasar + Stat Pindai ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-3 text-center">
            <div className="text-2xl mb-1">
              {CONDITION_EMOJI[aiStatus?.marketCondition ?? ""] ?? CONDITION_EMOJI.default}
            </div>
            <div className="text-xs font-bold truncate">{aiStatus?.marketConditionLabel || "Belum terdeteksi"}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Kondisi Pasar</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-blue-400">{aiStatus?.scanStats.totalScanned ?? engineStatus?.totalScanned ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Dipindai</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-amber-400">{aiStatus?.scanStats.qualified ?? engineStatus?.lastSignalsFound ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Kandidat</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-muted-foreground">{aiStatus?.scanStats.skipped ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Dilewati</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* ─── Temuan AI ─── */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-amber-400" /> Temuan AI
              {aiStatus?.findings.length ? (
                <span className="ml-auto text-[10px] text-muted-foreground">{aiStatus.findings.length} temuan</span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!aiStatus?.findings.length ? (
              <div className="py-4 text-center text-muted-foreground text-xs">
                <Cpu className="h-6 w-6 mx-auto mb-1 opacity-20" />
                Belum ada temuan — tunggu siklus AI
              </div>
            ) : (
              <ul className="space-y-1">
                {aiStatus.findings.slice(0, 8).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                    <span className="text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ─── Peringatan AI ─── */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" /> Peringatan & Catatan
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!aiStatus?.warnings.length ? (
              <div className="py-4 text-center text-muted-foreground text-xs">
                <Shield className="h-6 w-6 mx-auto mb-1 opacity-20" />
                Tidak ada peringatan aktif
              </div>
            ) : (
              <ul className="space-y-1">
                {aiStatus.warnings.slice(0, 8).map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-yellow-400 shrink-0 mt-0.5">⚠</span>
                    <span className="text-foreground/80">{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Siklus & Statistik Mesin ─── */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-primary" /> Status Mesin Institusional
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2 rounded-lg bg-muted/30">
              <div className={`text-sm font-bold ${engineStatus?.autoRunning ? "text-green-400" : "text-muted-foreground"}`}>
                {engineStatus?.autoRunning ? "🟢 AKTIF" : "⚫ MATI"}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Auto Engine</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/30">
              <div className="text-sm font-bold text-primary">{engineStatus?.cycleCount ?? 0}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Total Siklus</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/30">
              <div className="text-sm font-bold text-amber-400">{waktuLalu(engineStatus?.lastCycleAt ?? null)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Siklus Terakhir</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/30">
              <div className="text-sm font-bold text-cyan-400">{waktuLalu(engineStatus?.nextCycleAt ?? null)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Siklus Berikut</div>
            </div>
          </div>
          {/* Sharpe Ratio & Risk Metrics */}
          {stats && (
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="p-2 rounded-lg bg-primary/5 border border-primary/10">
                <div className={`text-sm font-bold ${stats.winRate >= 50 ? "text-green-400" : "text-red-400"}`}>
                  {fmt(stats.winRate, 1)}%
                </div>
                <div className="text-[10px] text-muted-foreground">Win Rate</div>
              </div>
              <div className="p-2 rounded-lg bg-primary/5 border border-primary/10">
                <div className={`text-sm font-bold ${stats.profitFactor >= 1 ? "text-green-400" : "text-red-400"}`}>
                  {fmt(stats.profitFactor, 2)}x
                </div>
                <div className="text-[10px] text-muted-foreground">Profit Factor</div>
              </div>
              <div className="p-2 rounded-lg bg-primary/5 border border-primary/10">
                <div className={`text-sm font-bold ${stats.maxDrawdownPct > -10 ? "text-green-400" : "text-red-400"}`}>
                  {fmt(stats.maxDrawdownPct, 1)}%
                </div>
                <div className="text-[10px] text-muted-foreground">Maks Drawdown</div>
              </div>
            </div>
          )}
          {engineStatus?.lastError && (
            <div className="mt-3 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg p-2">
              ⚠ Error: {engineStatus.lastError.slice(0, 120)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Fase Alur AI ─── */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Waves className="h-3.5 w-3.5 text-violet-400" /> Alur 8 Fase Institusional
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-center gap-0 overflow-x-auto pb-1">
            {[
              { id: "scanning",   label: "Pindai",    icon: Radar },
              { id: "analyzing",  label: "Risiko",    icon: Shield },
              { id: "filtering",  label: "Filter",    icon: Filter },
              { id: "analyzing",  label: "Analisis",  icon: Cpu },
              { id: "switching",  label: "Switch",    icon: ArrowRightLeft },
              { id: "confirming", label: "Konfirmasi",icon: Lightbulb },
              { id: "executing",  label: "Eksekusi",  icon: Zap },
              { id: "monitoring", label: "Monitor",   icon: Activity },
            ].map((f, idx) => {
              const m = PHASE_META[f.id] ?? PHASE_META.idle;
              const FIcon = f.icon;
              const isCurrent = phase === f.id;
              return (
                <React.Fragment key={idx}>
                  <div className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg min-w-max transition-all ${isCurrent ? `${m.bg} border border-current/20` : ""}`}>
                    <FIcon className={`h-4 w-4 ${isCurrent ? m.color + " animate-pulse" : "text-muted-foreground/40"}`} />
                    <span className={`text-[9px] font-medium ${isCurrent ? m.color : "text-muted-foreground/40"}`}>{f.label}</span>
                  </div>
                  {idx < 7 && <div className="w-3 h-px bg-border shrink-0" />}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Halaman Utama ────────────────────────────────────────────────────────────

type TabKey = "auto" | "scalp" | "riwayat" | "statistik" | "analitik" | "otak" | "live" | "lab" | "instinct";

export default function DemoTrading() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("auto");
  const [balance, setBalance] = useState<DemoBalance | null>(null);
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  const [log, setLog] = useState<DemoTradeLog[]>([]);
  const [stats, setStats] = useState<DemoStats | null>(null);
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [engineStatus, setEngineStatus] = useState<DemoEngineStatus | null>(null);
  const [scalpSignals, setScalpSignals] = useState<Scalp5mSignal[]>([]);
  const [brainStats, setBrainStats] = useState<BrainStats | null>(null);
  const [aiMode, setAiMode] = useState(() => localStorage.getItem("demo_ai_mode") === "true");
  const [aiRec, setAiRec] = useState<BrainConfigRecommendation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [mereset, setMereset] = useState(false);
  const [triggeringNow, setTriggeringNow] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIActivityStatus | null>(null);
  const [instinctStats, setInstinctStats] = useState<InstinctStats | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [bal, pos, lg, cfg, eng, st] = await Promise.all([
        apiFetch<DemoBalance>("/api/demo/balance"),
        apiFetch<DemoPosition[]>("/api/demo/positions"),
        apiFetch<DemoTradeLog[]>("/api/demo/log"),
        apiFetch<DemoConfig>("/api/demo/config"),
        apiFetch<DemoEngineStatus>("/api/demo/engine-status"),
        apiFetch<DemoStats>("/api/demo/stats"),
      ]);
      setBalance(bal); setPositions(pos); setLog(lg); setConfig(cfg); setEngineStatus(eng); setStats(st);
    } catch (err) {
      console.error("Gagal mengambil data demo:", err);
    }
  }, []);

  const fetchBrain = useCallback(async () => {
    try {
      const st = await apiFetch<BrainStats>("/api/ai/brain/stats");
      setBrainStats(st);
    } catch { }
  }, []);

  const fetchInstinct = useCallback(async () => {
    try {
      const st = await apiFetch<InstinctStats>("/api/demo/instinct/stats");
      setInstinctStats(st);
    } catch { }
  }, []);

  const fetchScalp = useCallback(async () => {
    setLoadingSignals(true);
    try {
      const sigs = await apiFetch<Scalp5mSignal[]>("/api/demo/scalp5m/signals");
      setScalpSignals(Array.isArray(sigs) ? sigs : []);
    } catch { } finally { setLoadingSignals(false); }
  }, []);

  useEffect(() => {
    fetchAll(); fetchBrain(); fetchInstinct();
    const id = setInterval(() => { fetchAll(); fetchBrain(); fetchInstinct(); }, 10_000);
    return () => clearInterval(id);
  }, [fetchAll, fetchBrain, fetchInstinct]);

  useEffect(() => { localStorage.setItem("demo_ai_mode", String(aiMode)); }, [aiMode]);

  useEffect(() => {
    if (aiMode && !aiRec) {
      apiFetch<BrainConfigRecommendation>("/api/ai/brain/recommend-config")
        .then(rec => setAiRec(rec)).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (tab === "scalp") fetchScalp(); }, [tab]);

  // Poll AI status every 2s when on lab tab
  useEffect(() => {
    const fetch = () => apiFetch<AIActivityStatus>("/api/demo/ai-status").then(setAiStatus).catch(() => {});
    fetch();
    const id = setInterval(fetch, 2_000);
    return () => clearInterval(id);
  }, []);

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
      await updateConfig({
        minConfidence: rec.minConfidence,
        maxPositionUSDT: Math.min(rec.maxPositionUSDT, 15),
        leverage: rec.leverage,
        stopLossPct: rec.stopLossPct,
        takeProfitPct: rec.takeProfitPct,
        maxPositions: Math.min(rec.maxPositions, 3),
        scalpMinConfidence: rec.scalpMinConfidence,
        scalpMaxPositionUSDT: Math.min(rec.scalpMaxPositionUSDT, 8),
      });
      toast({ title: "🤖 Mode AI Aktif!", description: `Brain mengatur semua parameter. Level risiko: ${rec.riskLevel.toUpperCase()}` });
    } catch (err: any) {
      toast({ title: "Gagal mengaktifkan Mode AI", description: err.message, variant: "destructive" });
      setAiMode(false);
    } finally { setAiLoading(false); }
  }

  async function segarkanAI() {
    if (!aiMode) return;
    setAiLoading(true);
    try {
      const rec = await apiFetch<BrainConfigRecommendation>("/api/ai/brain/recommend-config");
      setAiRec(rec);
      await updateConfig({
        minConfidence: rec.minConfidence,
        maxPositionUSDT: Math.min(rec.maxPositionUSDT, 15),
        leverage: rec.leverage,
        stopLossPct: rec.stopLossPct,
        takeProfitPct: rec.takeProfitPct,
        maxPositions: Math.min(rec.maxPositions, 3),
        scalpMinConfidence: rec.scalpMinConfidence,
        scalpMaxPositionUSDT: Math.min(rec.scalpMaxPositionUSDT, 8),
      });
      toast({ title: "✅ Konfigurasi AI diperbarui", description: "Brain telah menghitung ulang parameter optimal." });
    } catch (err: any) {
      toast({ title: "Gagal menyegarkan AI", description: err.message, variant: "destructive" });
    } finally { setAiLoading(false); }
  }

  async function tutupPosisi(id: string) {
    try {
      await apiFetch("/api/demo/close/" + id, { method: "POST", body: JSON.stringify({ reason: "manual" }) });
      toast({ title: "🔒 Posisi ditutup", description: "Posisi demo ditutup secara manual" });
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
          entryPrice: sig.entryPrice, positionUSDT: config?.scalpMaxPositionUSDT ?? 5,
          leverage: config?.leverage ?? 5, stopLoss: sig.stopLoss, takeProfit: sig.takeProfit,
          confidence: sig.confidence, signal: sig.side === "Buy" ? "scalp_long" : "scalp_short",
          openReason: sig.reasons.join("; "),
        }),
      });
      toast({ title: `Demo ${sig.side === "Buy" ? "LONG ↑" : "SHORT ↓"} dibuka!`, description: `${sig.displayName} @ $${sig.entryPrice.toFixed(4)}` });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Gagal membuka posisi", description: err.message, variant: "destructive" });
    } finally { setExecutingId(null); }
  }

  async function resetDemo() {
    setMereset(true);
    try {
      await apiFetch("/api/demo/reset", { method: "POST" });
      toast({ title: "Demo direset!", description: "Saldo kembali ke $50 USDT" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Gagal reset", description: err.message, variant: "destructive" });
    } finally { setMereset(false); }
  }

  async function pindaiSekarang() {
    setTriggeringNow(true);
    try {
      await apiFetch("/api/demo/engine/trigger", { method: "POST" });
      toast({ title: "⚡ Pindai dipaksa!", description: "Engine mencari sinyal — cek log dalam 5 detik" });
      setTimeout(() => fetchAll(), 3_000);
    } catch (err: any) {
      toast({ title: "Gagal memaksa pindai", description: err.message, variant: "destructive" });
    } finally { setTriggeringNow(false); }
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

  const tabList: { key: TabKey; label: string; icon: React.ElementType; badge?: number; pulse?: boolean }[] = [
    { key: "auto", label: "Auto", icon: Bot },
    { key: "scalp", label: "Scalping", icon: Timer },
    { key: "riwayat", label: "Riwayat", icon: Clock, badge: log.filter(l => l.status === "closed_tp" || l.status === "closed_sl" || l.status === "closed_manual").length },
    { key: "statistik", label: "Statistik", icon: Trophy },
    { key: "analitik", label: "Analitik", icon: BarChart2 },
    { key: "otak", label: "Otak AI", icon: Brain, badge: brainStats?.mistakeCount },
    { key: "instinct", label: "Insting AI", icon: Radar, pulse: (instinctStats?.totalEvals ?? 0) > 0 },
    { key: "live", label: "Live Feed", icon: Terminal },
    { key: "lab", label: "Lab AI", icon: Cpu, pulse: aiStatus?.phase !== "idle" && aiStatus?.phase != null },
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
            Paper trading virtual $50 USDT · Harga real · AI Brain belajar otomatis · Jurnal trading lengkap
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchAll(); fetchBrain(); }} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Panel Saldo */}
      <PanelSaldo balance={balance} onReset={resetDemo} stats={stats} />

      {/* Meter Risiko */}
      <MeterRisiko balance={balance} stats={stats} />

      {/* Posisi Aktif */}
      {positions.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary animate-pulse" />
              Posisi Aktif ({positions.length})
              <span className={`ml-auto font-bold ${pnlColor(totalUnrealised)}`}>
                {totalUnrealised >= 0 ? "+" : ""}${fmt(Math.abs(totalUnrealised))} unrealized
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
        {tabList.map(({ key, label, icon: Icon, badge, pulse }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 min-w-max flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            <Icon className={`h-3.5 w-3.5 ${pulse ? "text-violet-400 animate-pulse" : ""}`} />
            {label}
            {badge != null && badge > 0 && (
              <span className="bg-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">{badge}</span>
            )}
            {pulse && !badge && (
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Auto Trading ── */}
      {tab === "auto" && config && engineStatus && (
        <div className="space-y-4">
          <PanelSetupEntry
            engineRunning={engineStatus.autoRunning}
            analyzing={engineStatus.autoAnalyzing}
            lastCycleAt={engineStatus.lastCycleAt}
            nextCycleAt={engineStatus.nextCycleAt}
            intervalMs={config.intervalMs}
            cycleCount={engineStatus.cycleCount}
            signalsFound={engineStatus.lastSignalsFound}
            totalScanned={engineStatus.totalScanned}
            minConfidence={config.minConfidence}
            maxPositions={config.maxPositions}
            currentPositions={positions.length}
            mode={config.autoMode}
            enabled={config.autoEnabled}
            lastError={engineStatus.lastError}
            source="demo"
            onForceScan={pindaiSekarang}
            forcingNow={triggeringNow}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" /> Engine Auto Trading
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className={`rounded-xl border p-3 space-y-2 ${engineStatus.autoRunning ? "border-green-500/30 bg-green-500/5" : "border-border bg-muted/20"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-bold ${engineStatus.autoRunning ? "text-green-400" : "text-muted-foreground"}`}>
                        {engineStatus.autoRunning ? "🟢 Berjalan" : "⚪ Berhenti"}
                        {engineStatus.autoAnalyzing && " · Menganalisis..."}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {engineStatus.lastCycleAt ? `Siklus terakhir: ${waktuLalu(engineStatus.lastCycleAt)}` : "Belum pernah berjalan"}
                        {engineStatus.cycleCount > 0 && ` · ${engineStatus.cycleCount} siklus`}
                      </p>
                    </div>
                    <Switch checked={config.autoEnabled} onCheckedChange={v => updateConfig({ autoEnabled: v })} />
                  </div>
                  {engineStatus.autoRunning && (
                    <button onClick={pindaiSekarang} disabled={triggeringNow || engineStatus.autoAnalyzing}
                      className="w-full flex items-center justify-center gap-2 text-xs font-medium py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors">
                      {triggeringNow || engineStatus.autoAnalyzing
                        ? <><RefreshCw className="h-3 w-3 animate-spin" /> Sedang memindai...</>
                        : <><Zap className="h-3 w-3" /> Pindai Sekarang</>}
                    </button>
                  )}
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
                        className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${config.autoMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        {m === "auto" ? "Auto" : "Semi"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode AI */}
                <div className={`rounded-xl border p-3 space-y-3 transition-all ${aiMode ? "border-purple-500/40 bg-purple-500/5" : "border-border bg-muted/10"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Brain className={`h-4 w-4 ${aiMode ? "text-purple-400" : "text-muted-foreground"}`} />
                      <div>
                        <p className={`text-sm font-bold ${aiMode ? "text-purple-400" : "text-foreground"}`}>Mode AI Penuh</p>
                        <p className="text-xs text-muted-foreground">
                          {aiMode ? "Brain mengontrol semua parameter" : "Aktifkan agar Brain atur parameter otomatis"}
                        </p>
                      </div>
                    </div>
                    <Switch checked={aiMode} onCheckedChange={aktifkanModeAI} disabled={aiLoading} />
                  </div>

                  {aiLoading && (
                    <div className="flex items-center gap-2 text-xs text-purple-400">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Brain menghitung konfigurasi optimal...
                    </div>
                  )}

                  {aiMode && aiRec && !aiLoading && (
                    <div className="space-y-2">
                      <div className={`text-xs rounded-lg p-2.5 border ${
                        aiRec.riskLevel === "rendah" ? "border-green-500/30 bg-green-500/10 text-green-400"
                        : aiRec.riskLevel === "tinggi" ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
                        : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                      }`}>{aiRec.summary}</div>
                      {[
                        { label: "Min Kepercayaan", val: `${aiRec.minConfidence}%`, key: "minConfidence" },
                        { label: "Posisi Per Trade", val: `$${Math.min(aiRec.maxPositionUSDT, 15)}`, key: "maxPositionUSDT" },
                        { label: "Leverage", val: `${aiRec.leverage}x`, key: "leverage" },
                        { label: "Stop Loss", val: `${aiRec.stopLossPct}%`, key: "stopLossPct" },
                        { label: "Take Profit", val: `${aiRec.takeProfitPct}%`, key: "takeProfitPct" },
                      ].map(({ label, val, key }) => (
                        <div key={key} className="rounded-lg border border-border bg-background/50 p-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{label}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-primary">{val}</span>
                            <Badge className="text-[9px] px-1 py-0 h-4 bg-purple-500/20 text-purple-400 border-purple-500/30">AI</Badge>
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={segarkanAI} disabled={aiLoading}
                        className="w-full h-7 text-xs gap-1.5 border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                        <RefreshCw className="h-3 w-3" /> Segarkan Rekomendasi AI
                      </Button>
                    </div>
                  )}
                </div>

                {/* Slider manual */}
                {!aiMode && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm"><span>Min Kepercayaan</span><span className="font-bold text-primary">{config.minConfidence}%</span></div>
                      <Slider min={60} max={95} step={5} value={[config.minConfidence]} onValueChange={([v]) => updateConfig({ minConfidence: v })} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm"><span>Posisi Per Trade</span><span className="font-bold text-primary">${config.maxPositionUSDT}</span></div>
                      <Slider min={1} max={20} step={1} value={[config.maxPositionUSDT]} onValueChange={([v]) => updateConfig({ maxPositionUSDT: v })} />
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
                      <div className="flex justify-between text-sm"><span>Maks Posisi</span><span className="font-bold text-primary">{config.maxPositions}</span></div>
                      <Slider min={1} max={5} step={1} value={[config.maxPositions]} onValueChange={([v]) => updateConfig({ maxPositions: v })} />
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
                          : entry.status === "opened" ? "bg-primary" : "bg-muted-foreground"}`} />
                        <span className="font-bold shrink-0">{entry.symbol.replace("USDT", "")}</span>
                        <span className={entry.side === "Buy" ? "text-green-400 shrink-0" : "text-red-400 shrink-0"}>
                          {entry.side === "Buy" ? "↑ LONG" : "↓ SHORT"}
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
        </div>
      )}

      {/* ── Tab: Scalping 5M ── */}
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
                        className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${config.scalpMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        {m === "auto" ? "Auto" : "Semi"}
                      </button>
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
                  <div className="flex justify-between text-xs"><span>Min Kepercayaan</span><span className="font-bold text-primary">{config.scalpMinConfidence}%</span></div>
                  <Slider min={60} max={95} step={5} value={[config.scalpMinConfidence]} onValueChange={([v]) => updateConfig({ scalpMinConfidence: v })} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span>Posisi</span><span className="font-bold text-primary">${config.scalpMaxPositionUSDT}</span></div>
                  <Slider min={1} max={15} step={1} value={[config.scalpMaxPositionUSDT]} onValueChange={([v]) => updateConfig({ scalpMaxPositionUSDT: v })} />
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
                <KartuSinyalScalp key={sig.symbol} sig={sig}
                  onEksekusi={eksekusiScalp}
                  mengeksekusi={executingId === sig.symbol} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Riwayat ── */}
      {tab === "riwayat" && <TabRiwayat log={log} />}

      {/* ── Tab: Statistik ── */}
      {tab === "statistik" && <TabStatistik stats={stats} />}

      {/* ── Tab: Analitik ── */}
      {tab === "analitik" && <TabAnalitik log={log} balance={balance} stats={stats} />}

      {/* ── Tab: Otak AI ── */}
      {tab === "otak" && <TabOtakAI brainStats={brainStats} onReset={resetBrain} />}

      {/* ── Tab: Insting AI (Human Instinct Engine) ── */}
      {tab === "instinct" && <TabInstinctAI instinctStats={instinctStats} positions={positions} />}

      {/* ── Tab: Live Feed ── */}
      {tab === "live" && (
        <div className="space-y-4">
          <AILiveStatus />
          <ActivityFeed source="demo" maxItems={50} />
        </div>
      )}

      {/* ── Tab: Lab AI Institusional ── */}
      {tab === "lab" && (
        <TabLabAI aiStatus={aiStatus} engineStatus={engineStatus} stats={stats} />
      )}
    </div>
  );
}
