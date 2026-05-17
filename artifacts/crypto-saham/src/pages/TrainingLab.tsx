import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Brain, Play, Square, RefreshCw, BarChart2, TrendingUp,
  Target, Shield, Zap, Activity, Clock, Award, CheckCircle2,
  Cpu, BookOpen, ArrowUpRight, Radar, Sparkles, FlaskConical,
  Eye, GraduationCap, Flame, Star, TrendingDown, RotateCcw,
  Lightbulb, Swords, Trophy, Database, AlertTriangle, Layers,
  BarChart, Repeat, BookMarked, BrainCircuit, Gauge,
  ChevronRight, Wifi, WifiOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis,
  Radar as RechartsRadar, LineChart, Line, Legend,
  BarChart as RechartsBar, Bar, Cell,
} from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ──────────────────────────────────────────────────────────────────────

type AiLevel = "Pemula" | "Intermediate" | "Mahir" | "Expert" | "Institusional";

interface LiveActivity {
  id: string;
  timestamp: number;
  message: string;
  symbol: string | null;
  type: "analysis" | "pattern" | "breakout" | "reversal" | "liquidity" | "warning" | "success" | "replay" | "info";
  xpGained: number;
}

interface MemoryEntry {
  id: string;
  timestamp: number;
  symbol: string;
  interval: string;
  type: "best_setup" | "worst_setup" | "dangerous" | "pattern" | "manipulation" | "replay";
  title: string;
  description: string;
  tags: string[];
  xpValue: number;
}

interface AiBrainStats {
  iq: number;
  level: AiLevel;
  experiencePoints: number;
  learningCycles: number;
  chartsAnalyzed: number;
  marketHoursStudied: number;
  patternsRecognized: number;
  predictionsValidated: number;
  mistakesCorrected: number;
  successfulAnalyses: number;
  totalTradesLearned: number;
  liquiditySweepsDetected: number;
  breakoutsStudied: number;
  fakeBreakoutsDetected: number;
  reversalsStudied: number;
  replaySessionsCompleted: number;
  smartMoneyPatternsFound: number;
  marketReading: number;
  patternRecognition: number;
  adaptiveIntelligence: number;
  emotionalDiscipline: number;
  riskManagement: number;
  trendAnalysis: number;
  volumeAnalysis: number;
  momentumReading: number;
  candlePsychology: number;
  orderflowReading: number;
  smartMoneyConceptSkill: number;
  replayTrainingScore: number;
  patience: number;
  selectivity: number;
  confidenceAccuracy: number;
  predictionAccuracy: number;
  isLearning: boolean;
  currentActivity: string;
  currentSymbol: string | null;
  lastLearningAt: number | null;
  activityLog: string[];
  liveActivities: LiveActivity[];
  evolutionHistory: Array<{
    timestamp: number; iq: number; level: AiLevel;
    marketReading: number; patternRecognition: number;
    predictionAccuracy: number; chartsAnalyzed: number; winRateEstimate: number;
  }>;
  lastSnapshotAt: number | null;
}

interface MemoryBank {
  bestSetups: MemoryEntry[];
  worstSetups: MemoryEntry[];
  dangerousConditions: MemoryEntry[];
  learnedPatterns: MemoryEntry[];
}

interface LabState {
  isRunning: boolean; progress: number; phase: string;
  currentSymbol: string | null; currentStrategy: string | null;
  results: StrategyResult[]; allTrades: BacktestTrade[];
  lastRun: number | null; totalBarsAnalyzed: number; log: string[];
  bestStrategy: { name: string; label: string; winRate: number; sharpe: number; pf: number } | null;
  summary: { totalBacktested: number; bestWinRate: number; bestSharpe: number; bestProfitFactor: number; totalTrades: number };
}

interface StrategyResult {
  strategy: string; strategyLabel: string; symbol: string; interval: string;
  totalTrades: number; wins: number; losses: number; winRate: number;
  profitFactor: number; sharpeRatio: number; maxDrawdown: number;
  totalReturnPct: number; avgHoldBars: number; bestTrade: number;
  worstTrade: number; avgConfidence: number; backtestAt: number;
}

interface BacktestTrade {
  strategy: string; symbol: string; side: "long" | "short";
  pnlPct: number; result: "win" | "loss"; exitReason: "tp" | "sl" | "timeout"; confidence: number;
}

// ─── Konstanta ─────────────────────────────────────────────────────────────────

const ALL_PAIRS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","LINKUSDT","DOTUSDT"];
const ALL_STRATEGIES = [
  { key: "scalp_5m", label: "Scalping 5M (EMA Cross)" },
  { key: "bos_choch", label: "Break of Structure / CHOCH" },
  { key: "order_block", label: "Order Block Bounce" },
  { key: "momentum", label: "Momentum (RSI + MACD)" },
  { key: "reversal", label: "Reversal di Level Ekstrem" },
  { key: "ema_crossover", label: "EMA 9/21 Crossover" },
  { key: "vwap_bounce", label: "VWAP Bounce" },
];

const LEVEL_CONFIG: Record<AiLevel, { color: string; bg: string; border: string; icon: string; xpNext: number; gradient: string }> = {
  Pemula:        { color: "text-slate-300",   bg: "bg-slate-500/15",   border: "border-slate-500/30",   icon: "🌱", xpNext: 500,   gradient: "from-slate-500/20" },
  Intermediate:  { color: "text-blue-400",    bg: "bg-blue-500/15",    border: "border-blue-500/30",    icon: "📈", xpNext: 2000,  gradient: "from-blue-500/20" },
  Mahir:         { color: "text-violet-400",  bg: "bg-violet-500/15",  border: "border-violet-500/30",  icon: "🎯", xpNext: 6000,  gradient: "from-violet-500/20" },
  Expert:        { color: "text-yellow-400",  bg: "bg-yellow-500/15",  border: "border-yellow-500/30",  icon: "🏆", xpNext: 15000, gradient: "from-yellow-500/20" },
  Institusional: { color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30", icon: "⚡", xpNext: 99999, gradient: "from-emerald-500/20" },
};

const ACTIVITY_STYLE: Record<LiveActivity["type"], { icon: string; color: string; bg: string }> = {
  analysis:  { icon: "📊", color: "text-blue-400",    bg: "bg-blue-500/10" },
  pattern:   { icon: "🔍", color: "text-violet-400",  bg: "bg-violet-500/10" },
  breakout:  { icon: "🚀", color: "text-orange-400",  bg: "bg-orange-500/10" },
  reversal:  { icon: "🔄", color: "text-cyan-400",    bg: "bg-cyan-500/10" },
  liquidity: { icon: "🎯", color: "text-pink-400",    bg: "bg-pink-500/10" },
  warning:   { icon: "⚠️", color: "text-yellow-400",  bg: "bg-yellow-500/10" },
  success:   { icon: "✅", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  replay:    { icon: "🔁", color: "text-indigo-400",  bg: "bg-indigo-500/10" },
  info:      { icon: "💡", color: "text-slate-400",   bg: "bg-slate-500/10" },
};

const MEMORY_STYLE: Record<MemoryEntry["type"], { icon: string; color: string; label: string }> = {
  best_setup:   { icon: "⭐", color: "text-yellow-400",  label: "Setup Terbaik" },
  worst_setup:  { icon: "📚", color: "text-orange-400",  label: "Pelajaran" },
  dangerous:    { icon: "⚠️", color: "text-red-400",     label: "Berbahaya" },
  pattern:      { icon: "🔍", color: "text-violet-400",  label: "Pola" },
  manipulation: { icon: "🎭", color: "text-pink-400",    label: "Manipulasi" },
  replay:       { icon: "🔁", color: "text-blue-400",    label: "Replay" },
};

function skillColor(v: number) {
  if (v >= 80) return "text-emerald-400";
  if (v >= 65) return "text-green-400";
  if (v >= 50) return "text-yellow-400";
  if (v >= 35) return "text-orange-400";
  return "text-red-400";
}
function skillBar(v: number) {
  if (v >= 80) return "bg-emerald-400";
  if (v >= 65) return "bg-green-400";
  if (v >= 50) return "bg-yellow-400";
  if (v >= 35) return "bg-orange-400";
  return "bg-red-500";
}

// ─── Sub-Components ────────────────────────────────────────────────────────────

function SkillBar({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 ${skillColor(value)}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <span className={`text-xs font-bold font-mono ${skillColor(value)}`}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${skillBar(value)}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color = "text-white", border = "" }: {
  label: string; value: string | number; sub?: string; color?: string; border?: string;
}) {
  return (
    <div className={`rounded-xl p-3 bg-slate-800/60 border ${border || "border-slate-700/50"}`}>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-xl font-black ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function TrainingLab() {
  const { toast } = useToast();

  const [brain, setBrain]         = useState<AiBrainStats | null>(null);
  const [memory, setMemory]       = useState<MemoryBank | null>(null);
  const [labState, setLabState]   = useState<LabState | null>(null);
  const [comparison, setComparison] = useState<Record<string, { winRate: number; sharpe: number; pf: number; trades: number }>>({});
  const [activeTab, setActiveTab] = useState<"kecerdasan" | "live" | "memori" | "backtest" | "evolusi">("live");
  const [memoryTab, setMemoryTab] = useState<"learnedPatterns" | "bestSetups" | "worstSetups" | "dangerousConditions">("learnedPatterns");
  const [selectedPairs, setSelectedPairs]         = useState<string[]>(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(ALL_STRATEGIES.map(s => s.key));
  const [sortBy, setSortBy] = useState<"winRate" | "sharpe" | "pf">("winRate");
  const [pulse, setPulse] = useState(false);

  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedRef  = useRef<HTMLDivElement>(null);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchBrain  = useCallback(async () => {
    try { const r = await fetch(`${API}/api/training-lab/ai-brain`); if (r.ok) setBrain(await r.json()); } catch {}
  }, []);
  const fetchMemory = useCallback(async () => {
    try { const r = await fetch(`${API}/api/training-lab/memory`); if (r.ok) setMemory(await r.json()); } catch {}
  }, []);
  const fetchLab    = useCallback(async () => {
    try { const r = await fetch(`${API}/api/training-lab/state`); if (r.ok) setLabState(await r.json()); } catch {}
  }, []);
  const fetchComp   = useCallback(async () => {
    try { const r = await fetch(`${API}/api/training-lab/comparison`); if (r.ok) setComparison(await r.json()); } catch {}
  }, []);

  useEffect(() => {
    fetchBrain(); fetchMemory(); fetchLab(); fetchComp();
  }, [fetchBrain, fetchMemory, fetchLab, fetchComp]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetchBrain();
      if (activeTab === "memori") fetchMemory();
      if (activeTab === "backtest") { fetchLab(); if (!labState?.isRunning) fetchComp(); }
    }, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchBrain, fetchMemory, fetchLab, fetchComp, activeTab, labState?.isRunning]);

  // Pulse animation saat belajar
  useEffect(() => {
    if (!brain?.isLearning) return;
    const t = setInterval(() => setPulse(p => !p), 1000);
    return () => clearInterval(t);
  }, [brain?.isLearning]);

  // ─── Aksi ────────────────────────────────────────────────────────────────────

  const handleToggleLearning = async () => {
    if (brain?.isLearning) {
      await fetch(`${API}/api/training-lab/continuous/stop`, { method: "POST" });
      toast({ title: "Pembelajaran dihentikan", description: "Progres tersimpan otomatis" });
    } else {
      await fetch(`${API}/api/training-lab/continuous/start`, { method: "POST" });
      toast({ title: "🧠 Pembelajaran dimulai!", description: "AI mulai belajar dari data pasar live" });
    }
    setTimeout(fetchBrain, 600);
  };

  const handleReset = async () => {
    if (!confirm("Reset semua progres AI? Tindakan ini tidak bisa dibatalkan.")) return;
    await fetch(`${API}/api/training-lab/ai-brain/reset`, { method: "POST" });
    toast({ title: "AI Brain direset", description: "AI memulai perjalanan belajar dari awal" });
    setTimeout(() => { fetchBrain(); fetchMemory(); }, 600);
  };

  const handleStartBacktest = async () => {
    if (selectedPairs.length === 0 || selectedStrategies.length === 0) {
      toast({ title: "Pilih minimal 1 pair dan 1 strategi", variant: "destructive" }); return;
    }
    const res = await fetch(`${API}/api/training-lab/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairs: selectedPairs, strategies: selectedStrategies }),
    });
    if (res.ok) {
      toast({ title: "Backtest dimulai!", description: `${selectedPairs.length} pair × ${selectedStrategies.length} strategi` });
      setTimeout(fetchLab, 500);
    } else {
      const err = await res.json();
      toast({ title: err.error ?? "Gagal memulai", variant: "destructive" });
    }
  };

  // ─── Data Turunan ──────────────────────────────────────────────────────────

  const lvl    = brain?.level ?? "Pemula";
  const lcfg   = LEVEL_CONFIG[lvl];
  const xpNext = lcfg.xpNext;
  const xpPct  = brain ? Math.min(100, (brain.experiencePoints / xpNext) * 100) : 0;
  const winRate = Math.min(85, 40 + (brain?.predictionAccuracy ?? 41) * 0.45);

  const radarSkillData = [
    { subject: "Baca Pasar",   A: brain?.marketReading ?? 0 },
    { subject: "Pola",         A: brain?.patternRecognition ?? 0 },
    { subject: "Adaptif",      A: brain?.adaptiveIntelligence ?? 0 },
    { subject: "Momentum",     A: brain?.momentumReading ?? 0 },
    { subject: "Candle",       A: brain?.candlePsychology ?? 0 },
    { subject: "Orderflow",    A: brain?.orderflowReading ?? 0 },
    { subject: "Smart Money",  A: brain?.smartMoneyConceptSkill ?? 0 },
    { subject: "Volume",       A: brain?.volumeAnalysis ?? 0 },
  ];

  const evoData = (brain?.evolutionHistory ?? []).map((s, i) => ({
    n: i + 1,
    IQ: s.iq,
    Akurasi: parseFloat(s.predictionAccuracy.toFixed(1)),
    "Baca Pasar": parseFloat(s.marketReading.toFixed(1)),
    "Win Rate": parseFloat(s.winRateEstimate.toFixed(1)),
  }));

  const aggregated = Object.entries(comparison)
    .map(([key, v]) => ({ key, label: ALL_STRATEGIES.find(s => s.key === key)?.label ?? key, ...v }))
    .sort((a, b) => sortBy === "winRate" ? b.winRate - a.winRate : sortBy === "sharpe" ? b.sharpe - a.sharpe : b.pf - a.pf);

  const detailedResults = (labState?.results ?? [])
    .filter(r => r.totalTrades >= 2)
    .sort((a, b) => sortBy === "winRate" ? b.winRate - a.winRate : sortBy === "sharpe" ? b.sharpeRatio - a.sharpeRatio : b.profitFactor - a.profitFactor);

  const currentMemoryList = memory?.[memoryTab] ?? [];

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ════════════════ HEADER ════════════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${lcfg.bg} border ${lcfg.border} relative`}>
            <Brain className={`w-6 h-6 ${lcfg.color}`} />
            {brain?.isLearning && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Training Center</h1>
            <p className="text-xs text-muted-foreground">
              Sistem pembelajaran otonom berkelanjutan — AI belajar 24 jam tanpa henti menggunakan data pasar live
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {brain?.isLearning ? (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 transition-opacity ${pulse ? "opacity-100" : "opacity-80"}`}>
              <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Sedang Belajar</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-700/50 border border-slate-600">
              <WifiOff className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-muted-foreground">Berhenti</span>
            </div>
          )}
          <Button onClick={handleToggleLearning} size="sm"
            className={brain?.isLearning ? "bg-red-600/80 hover:bg-red-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}>
            {brain?.isLearning ? <><Square className="w-3.5 h-3.5 mr-1.5" />Hentikan</> : <><Play className="w-3.5 h-3.5 mr-1.5" />Mulai Belajar</>}
          </Button>
          <Button onClick={() => { fetchBrain(); fetchMemory(); fetchLab(); fetchComp(); }} variant="outline" size="sm">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button onClick={handleReset} variant="outline" size="sm" className="text-red-400 hover:text-red-300 border-red-500/20">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ════════════════ STATS ROW ════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Card className={`col-span-2 md:col-span-1 border ${lcfg.border} bg-gradient-to-br ${lcfg.gradient} to-transparent`}>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-muted-foreground">AI IQ</span>
              <BrainCircuit className={`w-3.5 h-3.5 ${lcfg.color}`} />
            </div>
            <div className={`text-3xl font-black ${lcfg.color}`}>{brain?.iq ?? 87}</div>
            <div className={`text-xs font-medium ${lcfg.color}`}>{lcfg.icon} {lvl}</div>
          </CardContent>
        </Card>

        <Card className="border-yellow-500/20 bg-gradient-to-br from-yellow-500/8 to-transparent">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-muted-foreground">XP</span>
              <Star className="w-3.5 h-3.5 text-yellow-400" />
            </div>
            <div className="text-2xl font-black text-yellow-300">{(brain?.experiencePoints ?? 0).toLocaleString()}</div>
            <div className="mt-1 h-1 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-yellow-400 rounded-full transition-all duration-1000" style={{ width: `${xpPct}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/8 to-transparent">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-muted-foreground">Chart Dipelajari</span>
              <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-blue-300">{(brain?.chartsAnalyzed ?? 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{(brain?.marketHoursStudied ?? 0).toFixed(0)} jam pasar</div>
          </CardContent>
        </Card>

        <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/8 to-transparent">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-muted-foreground">Pola Dikenali</span>
              <Layers className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="text-2xl font-black text-violet-300">{(brain?.patternsRecognized ?? 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{(brain?.smartMoneyPatternsFound ?? 0)} SMC</div>
          </CardContent>
        </Card>

        <Card className="border-pink-500/20 bg-gradient-to-br from-pink-500/8 to-transparent">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-muted-foreground">Replay Selesai</span>
              <Repeat className="w-3.5 h-3.5 text-pink-400" />
            </div>
            <div className="text-2xl font-black text-pink-300">{(brain?.replaySessionsCompleted ?? 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{(brain?.fakeBreakoutsDetected ?? 0)} fake BT</div>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/8 to-transparent">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-muted-foreground">Siklus Belajar</span>
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-300">{(brain?.learningCycles ?? 0).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Win Rate ~{winRate.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* ════════════════ CURRENT ACTIVITY TICKER ════════════════ */}
      {brain?.isLearning && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-800/80 border border-violet-500/20 overflow-hidden">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Live</span>
          </div>
          {brain.currentSymbol && (
            <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400 shrink-0">
              {brain.currentSymbol}
            </Badge>
          )}
          <p className="text-xs text-slate-300 truncate">{brain.currentActivity}</p>
        </div>
      )}

      {/* ════════════════ TABS ════════════════ */}
      <div className="flex gap-0.5 border-b border-border overflow-x-auto">
        {([
          { key: "live",       label: "⚡ Live Training",   },
          { key: "kecerdasan", label: "🧠 Kecerdasan AI",   },
          { key: "memori",     label: "💾 Memori AI",       },
          { key: "backtest",   label: "🔬 Backtest Lab",    },
          { key: "evolusi",    label: "📈 Evolusi",         },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-violet-500 text-violet-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab.label}
            {tab.key === "memori" && ((memory?.learnedPatterns.length ?? 0) + (memory?.bestSetups.length ?? 0)) > 0 && (
              <span className="ml-1.5 text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full">
                {(memory?.learnedPatterns.length ?? 0) + (memory?.bestSetups.length ?? 0) + (memory?.worstSetups.length ?? 0) + (memory?.dangerousConditions.length ?? 0)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
          TAB: LIVE TRAINING
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "live" && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">

            {/* Feed Aktivitas Live */}
            <div className="md:col-span-2">
              <Card className="h-[520px] flex flex-col">
                <CardHeader className="pb-2 shrink-0">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Feed Aktivitas Live
                    {brain?.isLearning && <span className="ml-auto text-xs text-emerald-400 animate-pulse">● Aktif</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-2 space-y-1" ref={feedRef}>
                  {(brain?.liveActivities ?? []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                      <Activity className="w-10 h-10 opacity-20" />
                      <p className="text-sm">Belum ada aktivitas — mulai belajar untuk melihat feed live</p>
                    </div>
                  ) : (
                    (brain?.liveActivities ?? []).map((act) => {
                      const style = ACTIVITY_STYLE[act.type];
                      return (
                        <div key={act.id}
                          className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg ${style.bg} border border-transparent hover:border-slate-700/50 transition-colors`}>
                          <span className="text-sm shrink-0 mt-0.5">{style.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs ${style.color} leading-relaxed`}>{act.message}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(act.timestamp).toLocaleTimeString("id-ID", { hour12: false })}
                              </span>
                              {act.symbol && (
                                <span className="text-[10px] text-slate-500 font-mono">{act.symbol}</span>
                              )}
                              {act.xpGained > 0 && (
                                <span className="text-[10px] text-yellow-500 font-bold">+{act.xpGained} XP</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Panel Status & Statistik */}
            <div className="space-y-3">
              {/* Status Belajar */}
              <Card className={brain?.isLearning ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-700"}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${brain?.isLearning ? "bg-emerald-500/20" : "bg-slate-700"}`}>
                      {brain?.isLearning
                        ? <Brain className="w-5 h-5 text-emerald-400 animate-pulse" />
                        : <Brain className="w-5 h-5 text-slate-500" />}
                    </div>
                    <div>
                      <div className={`text-sm font-bold ${brain?.isLearning ? "text-emerald-400" : "text-slate-400"}`}>
                        {brain?.isLearning ? "Sedang Belajar" : "Berhenti"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {brain?.isLearning ? "Siklus setiap ~22 detik" : "Klik Mulai Belajar"}
                      </div>
                    </div>
                  </div>
                  {brain?.isLearning && brain.currentSymbol && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800">
                      <Eye className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-xs text-muted-foreground">Sedang menganalisis:</span>
                      <span className="text-xs font-bold text-violet-400">{brain.currentSymbol}</span>
                    </div>
                  )}
                  {brain?.lastLearningAt && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      Belajar terakhir: {new Date(brain.lastLearningAt).toLocaleTimeString("id-ID")}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Statistik Sesi */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Statistik Sesi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {[
                    { label: "Breakout Dipelajari",   value: brain?.breakoutsStudied ?? 0,       color: "text-orange-400" },
                    { label: "Fake Breakout",          value: brain?.fakeBreakoutsDetected ?? 0,  color: "text-red-400" },
                    { label: "Reversal Terdeteksi",    value: brain?.reversalsStudied ?? 0,        color: "text-cyan-400" },
                    { label: "Liquidity Sweep",        value: brain?.liquiditySweepsDetected ?? 0, color: "text-pink-400" },
                    { label: "Smart Money Patterns",   value: brain?.smartMoneyPatternsFound ?? 0, color: "text-violet-400" },
                    { label: "Prediksi Berhasil",      value: brain?.successfulAnalyses ?? 0,      color: "text-emerald-400" },
                    { label: "Kesalahan Diperbaiki",   value: brain?.mistakesCorrected ?? 0,       color: "text-yellow-400" },
                  ].map(stat => (
                    <div key={stat.label} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                      <span className={`text-xs font-bold ${stat.color}`}>{stat.value.toLocaleString()}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Sumber Data */}
              <Card className="border-slate-700/50">
                <CardContent className="pt-3 pb-3">
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Sumber Data Live</div>
                  <div className="space-y-1.5">
                    {[
                      { name: "Bybit (Primary)", status: true },
                      { name: "Binance (Backup)", status: true },
                      { name: "15 Crypto Pairs", status: true },
                      { name: "Interval: 5M/15M/1H/4H", status: true },
                    ].map(s => (
                      <div key={s.name} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${s.status ? "bg-emerald-400" : "bg-slate-600"}`} />
                        <span className="text-xs text-muted-foreground">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Log Teks */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-400" />
                Log Aktivitas (500 terakhir)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-40 overflow-y-auto px-3 py-2 font-mono text-xs text-slate-400 space-y-0.5">
                {(brain?.activityLog ?? []).slice(0, 100).map((line, i) => (
                  <div key={i} className="leading-relaxed hover:text-slate-300 transition-colors">{line}</div>
                ))}
                {(brain?.activityLog ?? []).length === 0 && (
                  <div className="text-muted-foreground italic">Log kosong — mulai pembelajaran untuk melihat aktivitas</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: KECERDASAN AI
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "kecerdasan" && (
        <div className="space-y-4">

          {/* IQ Hero Card */}
          <Card className={`border ${lcfg.border} bg-gradient-to-br ${lcfg.gradient} to-transparent`}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <div className={`text-7xl font-black ${lcfg.color} tabular-nums leading-none`}>{brain?.iq ?? 87}</div>
                    <div className="absolute -bottom-1 left-0 text-xs text-muted-foreground">IQ</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{lcfg.icon}</span>
                      <span className={`text-xl font-bold ${lcfg.color}`}>{lvl}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">AI Intelligence Quotient</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Flame className="w-3 h-3 text-orange-400" />
                      <span className="text-xs text-muted-foreground">{brain?.learningCycles ?? 0} siklus selesai</span>
                      <span className="text-slate-600">•</span>
                      <Repeat className="w-3 h-3 text-blue-400" />
                      <span className="text-xs text-muted-foreground">{brain?.replaySessionsCompleted ?? 0} replay</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center px-4 py-2 rounded-xl bg-slate-800/60">
                    <div className={`text-2xl font-black ${skillColor(brain?.predictionAccuracy ?? 41)}`}>
                      {(brain?.predictionAccuracy ?? 41).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">Akurasi Prediksi</div>
                  </div>
                  <div className="text-center px-4 py-2 rounded-xl bg-slate-800/60">
                    <div className="text-2xl font-black text-emerald-400">{winRate.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">Win Rate Est.</div>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-4 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Progres ke Level Berikutnya</span>
                  <span className={lcfg.color}>{xpPct.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${lcfg.bg.replace("/15","")}`}
                    style={{ width: `${xpPct}%` }} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className={lcfg.color}>{(brain?.experiencePoints ?? 0).toLocaleString()} XP</span>
                  <span className="text-muted-foreground">Target: {xpNext.toLocaleString()} XP</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Skills Grid + Radar */}
          <div className="grid md:grid-cols-2 gap-4">

            {/* Radar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Radar className="w-4 h-4 text-violet-400" />
                  Radar Kecerdasan AI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={270}>
                  <RadarChart data={radarSkillData}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <RechartsRadar name="Skill" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`${v.toFixed(1)}%`, "Level"]} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Skill Bars */}
            <div className="space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-400" />
                    Skill Analisis Pasar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <SkillBar label="Baca Pasar"         value={brain?.marketReading ?? 42}          icon={Eye} />
                  <SkillBar label="Kenali Pola"         value={brain?.patternRecognition ?? 38}     icon={Radar} />
                  <SkillBar label="Analisis Tren"       value={brain?.trendAnalysis ?? 40}          icon={TrendingUp} />
                  <SkillBar label="Analisis Volume"     value={brain?.volumeAnalysis ?? 35}         icon={BarChart2} />
                  <SkillBar label="Baca Momentum"       value={brain?.momentumReading ?? 38}        icon={Activity} />
                  <SkillBar label="Psikologi Candle"    value={brain?.candlePsychology ?? 32}       icon={Layers} />
                  <SkillBar label="Smart Money Concepts" value={brain?.smartMoneyConceptSkill ?? 22} icon={Swords} />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Skill Trading & Kepribadian */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Skill Trading
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <SkillBar label="Kecerdasan Adaptif"   value={brain?.adaptiveIntelligence ?? 45} icon={BrainCircuit} />
                <SkillBar label="Manajemen Risiko"      value={brain?.riskManagement ?? 50}       icon={Shield} />
                <SkillBar label="Disiplin Emosional"    value={brain?.emotionalDiscipline ?? 55}  icon={Gauge} />
                <SkillBar label="Akurasi Kepercayaan"   value={brain?.confidenceAccuracy ?? 44}   icon={Target} />
                <SkillBar label="Orderflow Reading"     value={brain?.orderflowReading ?? 28}     icon={Zap} />
                <SkillBar label="Skor Replay Training"  value={brain?.replayTrainingScore ?? 18}  icon={Repeat} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-yellow-400" />
                  Kepribadian & Karakter AI
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <SkillBar label="Kesabaran"     value={brain?.patience ?? 52}    icon={Clock} />
                <SkillBar label="Selektivitas"  value={brain?.selectivity ?? 48} icon={Filter} />
                <SkillBar label="Akurasi Prediksi" value={brain?.predictionAccuracy ?? 41} icon={CheckCircle2} />

                <div className="pt-2 grid grid-cols-2 gap-2">
                  <StatCard label="Breakout Pelajari" value={(brain?.breakoutsStudied ?? 0).toLocaleString()} color="text-orange-400" />
                  <StatCard label="Fake BT Deteksi"   value={(brain?.fakeBreakoutsDetected ?? 0).toLocaleString()} color="text-red-400" />
                  <StatCard label="Reversal Studi"    value={(brain?.reversalsStudied ?? 0).toLocaleString()} color="text-cyan-400" />
                  <StatCard label="Liquidity Sweep"   value={(brain?.liquiditySweepsDetected ?? 0).toLocaleString()} color="text-pink-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Level Roadmap */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                Jalur Evolusi AI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-0 overflow-x-auto pb-2">
                {(Object.entries(LEVEL_CONFIG) as [AiLevel, typeof LEVEL_CONFIG[AiLevel]][]).map(([lvlName, cfg], i, arr) => {
                  const isActive = lvlName === lvl;
                  const isDone   = (brain?.experiencePoints ?? 0) >= cfg.xpNext;
                  return (
                    <React.Fragment key={lvlName}>
                      <div className={`flex flex-col items-center gap-1 shrink-0 px-2 ${isActive ? "opacity-100" : isDone ? "opacity-70" : "opacity-40"}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 ${isActive ? cfg.border + " " + cfg.bg : "border-slate-700 bg-slate-800"}`}>
                          {cfg.icon}
                        </div>
                        <span className={`text-xs font-medium ${isActive ? cfg.color : "text-muted-foreground"}`}>{lvlName}</span>
                        <span className="text-[10px] text-slate-500">{cfg.xpNext < 99999 ? cfg.xpNext.toLocaleString() + " XP" : "MAX"}</span>
                      </div>
                      {i < arr.length - 1 && (
                        <div className="h-0.5 flex-1 min-w-4 bg-slate-700 mx-1" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: MEMORI AI
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "memori" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-semibold">Bank Memori AI</span>
              <span className="text-xs text-muted-foreground">— AI menyimpan semua pembelajaran secara permanen</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Total: {Object.values(memory ?? {}).reduce((a, b) => a + b.length, 0)} memori tersimpan
            </div>
          </div>

          {/* Memory Sub-tabs */}
          <div className="flex gap-1 flex-wrap">
            {([
              { key: "learnedPatterns",     label: "🔍 Pola Dipelajari",  count: memory?.learnedPatterns.length ?? 0 },
              { key: "bestSetups",          label: "⭐ Setup Terbaik",    count: memory?.bestSetups.length ?? 0 },
              { key: "dangerousConditions", label: "⚠️ Kondisi Berbahaya", count: memory?.dangerousConditions.length ?? 0 },
              { key: "worstSetups",         label: "📚 Kesalahan",        count: memory?.worstSetups.length ?? 0 },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setMemoryTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  memoryTab === t.key
                    ? "bg-violet-600/20 text-violet-300 border border-violet-500/40"
                    : "bg-slate-800 text-muted-foreground border border-slate-700 hover:text-slate-300"
                }`}>
                {t.label}
                {t.count > 0 && (
                  <span className="bg-slate-700 text-slate-400 text-[10px] px-1.5 py-0.5 rounded-full">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {currentMemoryList.length === 0 ? (
            <Card className="border-dashed border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Database className="w-10 h-10 opacity-20" />
                <p className="text-sm font-medium">Memori kosong</p>
                <p className="text-xs text-center max-w-xs">
                  AI akan menyimpan memori saat belajar dari pasar. Aktifkan pembelajaran dan biarkan berjalan.
                </p>
                {!brain?.isLearning && (
                  <Button size="sm" onClick={handleToggleLearning} className="bg-emerald-600 hover:bg-emerald-700 mt-1">
                    <Play className="w-3.5 h-3.5 mr-1.5" />Mulai Belajar
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {currentMemoryList.map(entry => {
                const style = MEMORY_STYLE[entry.type];
                return (
                  <Card key={entry.id} className="border-slate-700/60 hover:border-slate-600 transition-colors">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start gap-2.5">
                        <span className="text-xl shrink-0">{style.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className={`text-sm font-semibold ${style.color} truncate`}>{entry.title}</span>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${style.color} border-current/30`}>
                              {style.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{entry.description}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {entry.tags.map(tag => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                                {tag}
                              </span>
                            ))}
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {new Date(entry.timestamp).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono text-slate-500">{entry.symbol} · {entry.interval}M</span>
                            <span className="text-[10px] text-yellow-500 font-bold ml-auto">+{entry.xpValue} XP</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: BACKTEST LAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "backtest" && (
        <div className="space-y-4">
          {/* Progress */}
          {labState?.isRunning && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                    <span className="text-sm font-medium text-blue-400">Backtest Berjalan</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{labState.progress.toFixed(0)}%</span>
                </div>
                <Progress value={labState.progress} className="h-2 mb-2" />
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{labState.phase}</span>
                  {labState.currentSymbol && <><span>·</span><Badge variant="outline" className="text-xs">{labState.currentSymbol}</Badge></>}
                  {labState.currentStrategy && <><span>·</span><span className="text-blue-400">{labState.currentStrategy}</span></>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Best Strategy */}
          {labState?.bestStrategy && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-bold text-yellow-400">Strategi Terbaik</span>
                </div>
                <div className="text-lg font-bold">{labState.bestStrategy.label}</div>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Win Rate <span className="text-emerald-400 font-bold">{labState.bestStrategy.winRate.toFixed(1)}%</span></span>
                  <span>Sharpe <span className="text-blue-400 font-bold">{labState.bestStrategy.sharpe.toFixed(2)}</span></span>
                  <span>PF <span className="text-violet-400 font-bold">{labState.bestStrategy.pf.toFixed(2)}</span></span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Control */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Urutkan:</span>
              {(["winRate","sharpe","pf"] as const).map(k => (
                <button key={k} onClick={() => setSortBy(k)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    sortBy === k ? "bg-violet-600/20 text-violet-300 border border-violet-500/30" : "bg-slate-800 text-muted-foreground border border-slate-700"
                  }`}>
                  {k === "winRate" ? "Win Rate" : k === "sharpe" ? "Sharpe" : "Profit Factor"}
                </button>
              ))}
            </div>
            <div className="ml-auto flex gap-2">
              {labState?.isRunning
                ? <Button size="sm" onClick={async () => { await fetch(`${API}/api/training-lab/stop`, { method: "POST" }); setTimeout(fetchLab, 500); }}
                    className="bg-red-600/80 hover:bg-red-700 text-white">
                    <Square className="w-3.5 h-3.5 mr-1.5" />Hentikan
                  </Button>
                : <Button size="sm" onClick={handleStartBacktest} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Play className="w-3.5 h-3.5 mr-1.5" />Jalankan Backtest
                  </Button>
              }
            </div>
          </div>

          {/* Hasil */}
          {detailedResults.length > 0 && (
            <div className="grid md:grid-cols-2 gap-3">
              {detailedResults.slice(0, 10).map((r, i) => (
                <Card key={i} className="border-slate-700/60">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold">{r.strategyLabel}</span>
                      <Badge variant="outline" className="text-[10px]">{r.symbol}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><div className={`text-base font-black ${skillColor(r.winRate)}`}>{r.winRate.toFixed(1)}%</div><div className="text-[10px] text-muted-foreground">Win Rate</div></div>
                      <div><div className={`text-base font-black ${r.sharpeRatio > 1 ? "text-emerald-400" : r.sharpeRatio > 0 ? "text-yellow-400" : "text-red-400"}`}>{r.sharpeRatio.toFixed(2)}</div><div className="text-[10px] text-muted-foreground">Sharpe</div></div>
                      <div><div className={`text-base font-black ${r.profitFactor > 1.5 ? "text-emerald-400" : r.profitFactor > 1 ? "text-yellow-400" : "text-red-400"}`}>{r.profitFactor.toFixed(2)}</div><div className="text-[10px] text-muted-foreground">PF</div></div>
                    </div>
                    <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                      <span>{r.totalTrades} trades</span>
                      <span className="text-emerald-400">{r.wins}W</span>
                      <span className="text-red-400">{r.losses}L</span>
                      <span className="ml-auto">DD: {r.maxDrawdown.toFixed(1)}%</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pilih Pair & Strategi */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart className="w-4 h-4 text-blue-400" />
                  Pilih Pair ({selectedPairs.length} dipilih)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_PAIRS.map(p => (
                    <button key={p} onClick={() => setSelectedPairs(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                      disabled={labState?.isRunning}
                      className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                        selectedPairs.includes(p)
                          ? "bg-blue-600/20 text-blue-300 border border-blue-500/30"
                          : "bg-slate-800 text-muted-foreground border border-slate-700 hover:bg-slate-700"
                      }`}>
                      <div className="flex items-center justify-between">
                        <span>{p.replace("USDT", "/USDT")}</span>
                        {selectedPairs.includes(p) && <CheckCircle2 className="w-3 h-3" />}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => setSelectedPairs(ALL_PAIRS)} disabled={labState?.isRunning}>Semua</Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => setSelectedPairs([])} disabled={labState?.isRunning}>Hapus</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-violet-400" />
                  Pilih Strategi ({selectedStrategies.length} dipilih)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {ALL_STRATEGIES.map(s => (
                    <button key={s.key} onClick={() => setSelectedStrategies(prev => prev.includes(s.key) ? prev.filter(x => x !== s.key) : [...prev, s.key])}
                      disabled={labState?.isRunning}
                      className={`w-full px-3 py-2 rounded text-xs font-medium transition-colors text-left ${
                        selectedStrategies.includes(s.key)
                          ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                          : "bg-slate-800 text-muted-foreground border border-slate-700 hover:bg-slate-700"
                      }`}>
                      <div className="flex items-center justify-between">
                        <span>{s.label}</span>
                        {selectedStrategies.includes(s.key) && <CheckCircle2 className="w-3 h-3" />}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => setSelectedStrategies(ALL_STRATEGIES.map(s => s.key))} disabled={labState?.isRunning}>Semua</Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => setSelectedStrategies([])} disabled={labState?.isRunning}>Hapus</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: EVOLUSI
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "evolusi" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "IQ Saat Ini",       value: brain?.iq ?? 87,                                                     suffix: "",  color: "text-violet-400" },
              { label: "Akurasi Prediksi",   value: parseFloat((brain?.predictionAccuracy ?? 41).toFixed(1)),            suffix: "%", color: skillColor(brain?.predictionAccuracy ?? 41) },
              { label: "Baca Pasar",         value: parseFloat((brain?.marketReading ?? 42).toFixed(1)),                 suffix: "%", color: skillColor(brain?.marketReading ?? 42) },
              { label: "Win Rate Est.",      value: parseFloat(winRate.toFixed(1)),                                       suffix: "%", color: "text-emerald-400" },
            ].map(s => (
              <Card key={s.label} className="border-slate-700/50">
                <CardContent className="pt-3 pb-3">
                  <div className="text-xs text-muted-foreground mb-0.5">{s.label}</div>
                  <div className={`text-2xl font-black ${s.color}`}>{s.value}{s.suffix}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {evoData.length === 0 ? (
            <Card className="border-dashed border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <TrendingUp className="w-10 h-10 opacity-20" />
                <p className="text-sm font-medium">Belum ada data evolusi</p>
                <p className="text-xs text-center max-w-xs">
                  Snapshot diambil setiap 20 siklus. Aktifkan pembelajaran dan biarkan AI berjalan.
                </p>
                {!brain?.isLearning && (
                  <Button size="sm" onClick={handleToggleLearning} className="bg-emerald-600 hover:bg-emerald-700 mt-1">
                    <Play className="w-3.5 h-3.5 mr-1.5" />Mulai Belajar
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-violet-400" />
                    Progres IQ dari Waktu ke Waktu
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={evoData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="iqG" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="n" tick={{ fontSize: 10, fill: "#94a3b8" }} label={{ value: "Snapshot ke-", position: "insideBottom", offset: -2, fontSize: 10, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
                      <Area type="monotone" dataKey="IQ" stroke="#8b5cf6" strokeWidth={2} fill="url(#iqG)" dot={{ r: 3, fill: "#8b5cf6" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Evolusi Skill AI
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={evoData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="n" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Akurasi" stroke="#22c55e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Baca Pasar" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Win Rate" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-400" />
                    Riwayat Snapshot Evolusi
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700 bg-slate-800/50">
                          {["Waktu","Level","IQ","Akurasi","Baca Pasar","Win Rate","Chart"].map(h => (
                            <th key={h} className={`px-3 py-2 text-xs text-muted-foreground font-medium ${h === "Waktu" ? "text-left" : "text-right"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...(brain?.evolutionHistory ?? [])].reverse().slice(0, 20).map((s, i) => {
                          const cfg = LEVEL_CONFIG[s.level];
                          return (
                            <tr key={i} className="border-b border-slate-700/40 hover:bg-slate-800/30">
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {new Date(s.timestamp).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </td>
                              <td className="px-3 py-2 text-right"><span className={`text-xs font-medium ${cfg.color}`}>{cfg.icon} {s.level}</span></td>
                              <td className="px-3 py-2 text-right"><span className="text-xs font-bold text-violet-400">{s.iq}</span></td>
                              <td className="px-3 py-2 text-right"><span className={`text-xs font-bold ${skillColor(s.predictionAccuracy)}`}>{s.predictionAccuracy.toFixed(1)}%</span></td>
                              <td className="px-3 py-2 text-right"><span className={`text-xs font-bold ${skillColor(s.marketReading)}`}>{s.marketReading.toFixed(1)}%</span></td>
                              <td className="px-3 py-2 text-right"><span className="text-xs font-bold text-emerald-400">{Math.min(85, 40 + s.predictionAccuracy * 0.45).toFixed(1)}%</span></td>
                              <td className="px-3 py-2 text-right"><span className="text-xs text-slate-300">{s.chartsAnalyzed.toLocaleString()}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
