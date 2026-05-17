import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Brain, Play, Square, RefreshCw, BarChart2, TrendingUp,
  Target, Shield, Zap, Activity, ChevronRight, Clock,
  Award, AlertTriangle, CheckCircle2, Cpu, Layers,
  BarChart, BookOpen, Filter, ArrowUpRight, ArrowDownRight,
  Radar, Sparkles, Bot, FlaskConical, Eye, Gauge,
  GraduationCap, Flame, Star, BookMarked, TrendingDown,
  RotateCcw, Lightbulb, HeartPulse, Swords, Trophy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart as RechartsBar, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, RadarChart, PolarGrid,
  PolarAngleAxis, Radar as RechartsRadar, Legend,
  LineChart, Line, Area, AreaChart,
} from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Tipe Data ─────────────────────────────────────────────────────────────────

type AiLevel = "Pemula" | "Intermediate" | "Mahir" | "Expert" | "Institusional";

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
  reversalsStudied: number;
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
  patience: number;
  selectivity: number;
  confidenceAccuracy: number;
  predictionAccuracy: number;
  isLearning: boolean;
  currentActivity: string;
  currentSymbol: string | null;
  lastLearningAt: number | null;
  activityLog: string[];
  evolutionHistory: EvolutionSnapshot[];
  lastSnapshotAt: number | null;
}

interface EvolutionSnapshot {
  timestamp: number;
  iq: number;
  level: AiLevel;
  marketReading: number;
  patternRecognition: number;
  predictionAccuracy: number;
  chartsAnalyzed: number;
  winRateEstimate: number;
}

interface LabState {
  isRunning: boolean;
  progress: number;
  phase: string;
  currentSymbol: string | null;
  currentStrategy: string | null;
  results: StrategyResult[];
  allTrades: BacktestTrade[];
  lastRun: number | null;
  totalBarsAnalyzed: number;
  log: string[];
  bestStrategy: { name: string; label: string; winRate: number; sharpe: number; pf: number } | null;
  summary: { totalBacktested: number; bestWinRate: number; bestSharpe: number; bestProfitFactor: number; totalTrades: number };
}

interface StrategyResult {
  strategy: string;
  strategyLabel: string;
  symbol: string;
  interval: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalReturnPct: number;
  avgHoldBars: number;
  bestTrade: number;
  worstTrade: number;
  avgConfidence: number;
  backtestAt: number;
}

interface BacktestTrade {
  strategy: string;
  symbol: string;
  side: "long" | "short";
  pnlPct: number;
  result: "win" | "loss";
  exitReason: "tp" | "sl" | "timeout";
  confidence: number;
}

interface ComparisonEntry {
  winRate: number;
  sharpe: number;
  pf: number;
  trades: number;
}

// ─── Konstanta ─────────────────────────────────────────────────────────────────

const ALL_PAIRS = [
  "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT",
  "ADAUSDT","DOGEUSDT","AVAXUSDT","LINKUSDT","DOTUSDT",
];

const ALL_STRATEGIES = [
  { key: "scalp_5m",      label: "Scalping 5M (EMA Cross)" },
  { key: "bos_choch",     label: "Break of Structure / CHOCH" },
  { key: "order_block",   label: "Order Block Bounce" },
  { key: "momentum",      label: "Momentum (RSI + MACD)" },
  { key: "reversal",      label: "Reversal di Level Ekstrem" },
  { key: "ema_crossover", label: "EMA 9/21 Crossover" },
  { key: "vwap_bounce",   label: "VWAP Bounce" },
];

const LEVEL_CONFIG: Record<AiLevel, { color: string; bg: string; icon: string; xpNext: number }> = {
  Pemula:       { color: "text-slate-400",   bg: "bg-slate-500/20",   icon: "🌱", xpNext: 500 },
  Intermediate: { color: "text-blue-400",    bg: "bg-blue-500/20",    icon: "📈", xpNext: 2000 },
  Mahir:        { color: "text-violet-400",  bg: "bg-violet-500/20",  icon: "🎯", xpNext: 6000 },
  Expert:       { color: "text-yellow-400",  bg: "bg-yellow-500/20",  icon: "🏆", xpNext: 15000 },
  Institusional:{ color: "text-emerald-400", bg: "bg-emerald-500/20", icon: "⚡", xpNext: 99999 },
};

// ─── Helper: Warna nilai skill ─────────────────────────────────────────────────

function skillColor(v: number) {
  if (v >= 80) return "text-emerald-400";
  if (v >= 65) return "text-green-400";
  if (v >= 50) return "text-yellow-400";
  if (v >= 35) return "text-orange-400";
  return "text-red-400";
}

function skillBarColor(v: number) {
  if (v >= 80) return "bg-emerald-400";
  if (v >= 65) return "bg-green-400";
  if (v >= 50) return "bg-yellow-400";
  if (v >= 35) return "bg-orange-400";
  return "bg-red-400";
}

// ─── Komponen: Skill Bar ───────────────────────────────────────────────────────

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
        <div
          className={`h-full rounded-full transition-all duration-1000 ${skillBarColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ─── Komponen Utama ────────────────────────────────────────────────────────────

export default function TrainingLab() {
  const { toast } = useToast();

  // AI Brain
  const [brain, setBrain] = useState<AiBrainStats | null>(null);

  // Backtest Lab
  const [labState, setLabState]       = useState<LabState | null>(null);
  const [comparison, setComparison]   = useState<Record<string, ComparisonEntry>>({});
  const [selectedPairs, setSelectedPairs]         = useState<string[]>(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(ALL_STRATEGIES.map(s => s.key));
  const [sortBy, setSortBy]           = useState<"winRate" | "sharpe" | "pf">("winRate");

  // Tab aktif
  const [activeTab, setActiveTab] = useState<"kecerdasan" | "live" | "backtest" | "evolusi">("kecerdasan");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchBrain = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/training-lab/ai-brain`);
      if (res.ok) setBrain(await res.json());
    } catch {}
  }, []);

  const fetchLabState = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/training-lab/state`);
      if (res.ok) setLabState(await res.json());
    } catch {}
  }, []);

  const fetchComparison = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/training-lab/comparison`);
      if (res.ok) setComparison(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchBrain();
    fetchLabState();
    fetchComparison();
  }, [fetchBrain, fetchLabState, fetchComparison]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetchBrain();
      fetchLabState();
      if (!labState?.isRunning) fetchComparison();
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchBrain, fetchLabState, fetchComparison, labState?.isRunning]);

  // ─── Aksi ────────────────────────────────────────────────────────────────────

  const handleToggleLearning = async () => {
    if (brain?.isLearning) {
      await fetch(`${API}/api/training-lab/continuous/stop`, { method: "POST" });
      toast({ title: "Pembelajaran dihentikan" });
    } else {
      await fetch(`${API}/api/training-lab/continuous/start`, { method: "POST" });
      toast({ title: "Pembelajaran berkelanjutan dimulai!", description: "AI mulai mempelajari pasar secara otomatis" });
    }
    setTimeout(fetchBrain, 600);
  };

  const handleReset = async () => {
    if (!confirm("Reset AI Brain? Semua progres pembelajaran akan dihapus.")) return;
    await fetch(`${API}/api/training-lab/ai-brain/reset`, { method: "POST" });
    toast({ title: "AI Brain direset", description: "AI dimulai dari awal" });
    setTimeout(fetchBrain, 600);
  };

  const handleStartBacktest = async () => {
    if (selectedPairs.length === 0 || selectedStrategies.length === 0) {
      toast({ title: "Pilih minimal 1 pair dan 1 strategi", variant: "destructive" });
      return;
    }
    const res = await fetch(`${API}/api/training-lab/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairs: selectedPairs, strategies: selectedStrategies }),
    });
    if (res.ok) {
      toast({ title: "Backtest dimulai!", description: `${selectedPairs.length} pair × ${selectedStrategies.length} strategi` });
      setTimeout(fetchLabState, 500);
    } else {
      const err = await res.json();
      toast({ title: err.error ?? "Gagal memulai", variant: "destructive" });
    }
  };

  const handleStopBacktest = async () => {
    await fetch(`${API}/api/training-lab/stop`, { method: "POST" });
    toast({ title: "Backtest dihentikan" });
    setTimeout(fetchLabState, 500);
  };

  const togglePair     = (p: string) => setSelectedPairs(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const toggleStrategy = (s: string) => setSelectedStrategies(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  // ─── Data Turunan ─────────────────────────────────────────────────────────────

  const levelCfg = LEVEL_CONFIG[brain?.level ?? "Pemula"];
  const xpToNext = levelCfg.xpNext;
  const xpProgress = brain ? Math.min(100, (brain.experiencePoints / xpToNext) * 100) : 0;

  const aggregated = Object.entries(comparison)
    .map(([key, v]) => ({
      key,
      label: ALL_STRATEGIES.find(s => s.key === key)?.label ?? key,
      ...v,
    }))
    .sort((a, b) => {
      if (sortBy === "winRate") return b.winRate - a.winRate;
      if (sortBy === "sharpe") return b.sharpe - a.sharpe;
      return b.pf - a.pf;
    });

  const detailedResults = (labState?.results ?? [])
    .filter(r => r.totalTrades >= 2)
    .sort((a, b) => {
      if (sortBy === "winRate") return b.winRate - a.winRate;
      if (sortBy === "sharpe") return b.sharpeRatio - a.sharpeRatio;
      return b.profitFactor - a.profitFactor;
    });

  const barData = aggregated.map(a => ({
    name: a.label.split(" ")[0],
    fullLabel: a.label,
    winRate: a.winRate,
  }));

  const radarData = aggregated.slice(0, 5).map(a => ({
    strategy: a.label.split(" ")[0],
    "Win Rate": a.winRate,
    "Sharpe×10": Math.max(0, a.sharpe * 10),
    "PF×20": Math.min(a.pf * 20, 100),
  }));

  const evoChartData = (brain?.evolutionHistory ?? []).map((s, i) => ({
    siklus: i + 1,
    IQ: s.iq,
    "Akurasi (%)": parseFloat(s.predictionAccuracy.toFixed(1)),
    "Baca Pasar (%)": parseFloat(s.marketReading.toFixed(1)),
    "Win Rate (%)": parseFloat(s.winRateEstimate.toFixed(1)),
  }));

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-500/20 border border-violet-500/30">
            <Brain className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Training Center</h1>
            <p className="text-sm text-muted-foreground">Sistem pembelajaran otonom berkelanjutan — AI belajar 24 jam tanpa henti</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status pembelajaran */}
          {brain?.isLearning ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Sedang Belajar</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-700/50 border border-slate-600">
              <div className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-xs text-muted-foreground">Pembelajaran Berhenti</span>
            </div>
          )}

          <Button
            onClick={handleToggleLearning}
            size="sm"
            className={brain?.isLearning
              ? "bg-red-600/80 hover:bg-red-700 text-white"
              : "bg-emerald-600 hover:bg-emerald-700 text-white"}
          >
            {brain?.isLearning
              ? <><Square className="w-3.5 h-3.5 mr-1.5" />Hentikan</>
              : <><Play className="w-3.5 h-3.5 mr-1.5" />Mulai Belajar</>}
          </Button>

          <Button onClick={() => { fetchBrain(); fetchLabState(); fetchComparison(); }}
            variant="outline" size="sm">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Kartu Ringkasan Atas ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* IQ */}
        <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-transparent">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">AI IQ</span>
              <Cpu className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="text-3xl font-black text-violet-300">{brain?.iq ?? 87}</div>
            <div className={`text-xs font-medium mt-0.5 ${levelCfg.color}`}>
              {levelCfg.icon} {brain?.level ?? "Pemula"}
            </div>
          </CardContent>
        </Card>

        {/* XP */}
        <Card className="border-yellow-500/20 bg-gradient-to-br from-yellow-500/8 to-transparent">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Pengalaman (XP)</span>
              <Star className="w-3.5 h-3.5 text-yellow-400" />
            </div>
            <div className="text-3xl font-black text-yellow-300">{(brain?.experiencePoints ?? 0).toLocaleString()}</div>
            <div className="mt-1.5 h-1 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-yellow-400 rounded-full transition-all duration-1000" style={{ width: `${xpProgress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">XP ke level berikutnya: {xpToNext.toLocaleString()}</p>
          </CardContent>
        </Card>

        {/* Chart Dipelajari */}
        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/8 to-transparent">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Chart Dipelajari</span>
              <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-3xl font-black text-blue-300">{(brain?.chartsAnalyzed ?? 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(brain?.marketHoursStudied ?? 0).toFixed(0)} jam pasar dipelajari
            </p>
          </CardContent>
        </Card>

        {/* Siklus Belajar */}
        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/8 to-transparent">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Siklus Belajar</span>
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-3xl font-black text-emerald-300">{(brain?.learningCycles ?? 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(brain?.patternsRecognized ?? 0).toLocaleString()} pola dikenali
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {([
          { key: "kecerdasan", label: "🧠 Kecerdasan AI",    icon: Brain },
          { key: "live",       label: "⚡ Live Training",    icon: Activity },
          { key: "backtest",   label: "🔬 Backtest Lab",     icon: FlaskConical },
          { key: "evolusi",    label: "📈 Evolusi",          icon: TrendingUp },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-violet-500 text-violet-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TAB: KECERDASAN AI
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "kecerdasan" && (
        <div className="space-y-5">

          {/* Level & Progress */}
          <Card className={`border ${levelCfg.bg.replace("bg-", "border-").replace("/20", "/30")}`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div className={`text-5xl font-black ${levelCfg.color} tabular-nums`}>{brain?.iq ?? 87}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{levelCfg.icon}</span>
                      <span className={`text-lg font-bold ${levelCfg.color}`}>{brain?.level ?? "Pemula"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">AI Intelligence Quotient</p>
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Flame className="w-3 h-3 text-orange-400" />
                      <span>{brain?.learningCycles ?? 0} siklus belajar selesai</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Akurasi Prediksi</div>
                  <div className={`text-2xl font-bold ${skillColor(brain?.predictionAccuracy ?? 41)}`}>
                    {(brain?.predictionAccuracy ?? 41).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Win Rate Est. {Math.min(85, 40 + (brain?.predictionAccuracy ?? 41) * 0.45).toFixed(1)}%
                  </div>
                </div>
              </div>
              {/* Progress ke level berikutnya */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Progres ke Level Berikutnya</span>
                  <span>{xpProgress.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${levelCfg.bg.replace("/20", "").replace("bg-", "bg-")}`}
                    style={{ width: `${xpProgress}%` }} />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className={levelCfg.color}>{brain?.experiencePoints?.toLocaleString() ?? 0} XP</span>
                  <span className="text-muted-foreground">Target: {xpToNext.toLocaleString()} XP</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grid Skill */}
          <div className="grid md:grid-cols-2 gap-4">

            {/* Skill Analisis */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-400" />
                  Skill Analisis Pasar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkillBar label="Baca Pasar"          value={brain?.marketReading       ?? 42} icon={Eye} />
                <SkillBar label="Kenali Pola"          value={brain?.patternRecognition  ?? 38} icon={Radar} />
                <SkillBar label="Analisis Tren"        value={brain?.trendAnalysis       ?? 40} icon={TrendingUp} />
                <SkillBar label="Analisis Volume"      value={brain?.volumeAnalysis      ?? 35} icon={BarChart2} />
                <SkillBar label="Baca Momentum"        value={brain?.momentumReading     ?? 38} icon={Zap} />
                <SkillBar label="Psikologi Candle"     value={brain?.candlePsychology    ?? 32} icon={BookMarked} />
                <SkillBar label="Baca Order Flow"      value={brain?.orderflowReading    ?? 28} icon={Layers} />
              </CardContent>
            </Card>

            {/* Skill Trading + Kepribadian */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-violet-400" />
                    Skill Trading
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SkillBar label="Kecerdasan Adaptif"    value={brain?.adaptiveIntelligence ?? 45} icon={Brain} />
                  <SkillBar label="Manajemen Risiko"       value={brain?.riskManagement       ?? 50} icon={Shield} />
                  <SkillBar label="Disiplin Emosional"     value={brain?.emotionalDiscipline  ?? 55} icon={HeartPulse} />
                  <SkillBar label="Akurasi Kepercayaan"    value={brain?.confidenceAccuracy   ?? 44} icon={Target} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-yellow-400" />
                    Kepribadian AI
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SkillBar label="Kesabaran"   value={brain?.patience    ?? 52} icon={Clock} />
                  <SkillBar label="Selektivitas" value={brain?.selectivity ?? 48} icon={Filter} />
                  <SkillBar label="Akurasi Prediksi" value={brain?.predictionAccuracy ?? 41} icon={Trophy} />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Statistik Pengalaman */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-emerald-400" />
                Bank Pengalaman AI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Chart Dipelajari",      value: brain?.chartsAnalyzed ?? 0,           color: "text-blue-400",    icon: BarChart2 },
                  { label: "Pola Dikenali",          value: brain?.patternsRecognized ?? 0,       color: "text-violet-400",  icon: Radar },
                  { label: "Breakout Dipelajari",    value: brain?.breakoutsStudied ?? 0,         color: "text-yellow-400",  icon: ArrowUpRight },
                  { label: "Reversal Dipelajari",    value: brain?.reversalsStudied ?? 0,         color: "text-orange-400",  icon: RotateCcw },
                  { label: "Sweep Likuiditas",       value: brain?.liquiditySweepsDetected ?? 0,  color: "text-red-400",     icon: Swords },
                  { label: "Analisis Berhasil",      value: brain?.successfulAnalyses ?? 0,       color: "text-emerald-400", icon: CheckCircle2 },
                  { label: "Kesalahan Diperbaiki",   value: brain?.mistakesCorrected ?? 0,        color: "text-amber-400",   icon: Lightbulb },
                  { label: "Jam Pasar Dipelajari",   value: parseFloat((brain?.marketHoursStudied ?? 0).toFixed(0)), color: "text-sky-400", icon: Clock },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/40">
                    <item.icon className={`w-4 h-4 ${item.color} shrink-0`} />
                    <div>
                      <div className={`text-lg font-bold ${item.color}`}>{item.value.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground leading-tight">{item.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tombol Reset */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleReset}
              className="text-red-400 border-red-500/30 hover:bg-red-500/10 text-xs">
              <RotateCcw className="w-3 h-3 mr-1.5" />
              Reset AI Brain
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB: LIVE TRAINING
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "live" && (
        <div className="space-y-4">

          {/* Status belajar + aktivitas saat ini */}
          <Card className={`border-2 ${brain?.isLearning ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-700"}`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${brain?.isLearning ? "bg-emerald-500/20" : "bg-slate-700/50"} shrink-0`}>
                  <Bot className={`w-5 h-5 ${brain?.isLearning ? "text-emerald-400" : "text-slate-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">
                      {brain?.isLearning ? "AI sedang belajar..." : "AI tidak aktif belajar"}
                    </span>
                    {brain?.isLearning && (
                      <div className="flex gap-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    )}
                  </div>
                  <p className={`text-sm ${brain?.isLearning ? "text-emerald-300" : "text-muted-foreground"}`}>
                    {brain?.currentActivity ?? "Menunggu perintah..."}
                  </p>
                  {brain?.currentSymbol && (
                    <Badge variant="outline" className="mt-1.5 text-xs border-emerald-500/30 text-emerald-400">
                      {brain.currentSymbol}
                    </Badge>
                  )}
                </div>
                {brain?.lastLearningAt && (
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">Terakhir belajar</div>
                    <div className="text-xs text-slate-300">
                      {new Date(brain.lastLearningAt).toLocaleTimeString("id-ID")}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Statistik mini sesi belajar */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-slate-700/50">
              <CardContent className="pt-3 pb-3 text-center">
                <div className="text-xl font-bold text-violet-400">{brain?.learningCycles ?? 0}</div>
                <div className="text-xs text-muted-foreground">Siklus Belajar</div>
              </CardContent>
            </Card>
            <Card className="border-slate-700/50">
              <CardContent className="pt-3 pb-3 text-center">
                <div className="text-xl font-bold text-blue-400">{brain?.patternsRecognized ?? 0}</div>
                <div className="text-xs text-muted-foreground">Pola Dikenali</div>
              </CardContent>
            </Card>
            <Card className="border-slate-700/50">
              <CardContent className="pt-3 pb-3 text-center">
                <div className="text-xl font-bold text-emerald-400">+{brain?.experiencePoints ?? 0}</div>
                <div className="text-xs text-muted-foreground">Total XP</div>
              </CardContent>
            </Card>
          </div>

          {/* Log aktivitas real-time */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-400" />
                Log Aktivitas Live
                <div className={`ml-auto w-2 h-2 rounded-full ${brain?.isLearning ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96 overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: "thin" }}>
                {(brain?.activityLog ?? []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                    <Bot className="w-10 h-10 opacity-30" />
                    <p className="text-sm">Belum ada aktivitas. Klik "Mulai Belajar" untuk memulai.</p>
                  </div>
                ) : (
                  (brain?.activityLog ?? []).map((msg, i) => (
                    <div key={i} className={`text-xs px-3 py-1.5 rounded-lg flex items-start gap-2 transition-colors ${
                      i === 0
                        ? "bg-violet-500/15 border border-violet-500/20 text-slate-200"
                        : i < 5
                        ? "bg-slate-800/60 text-slate-300"
                        : "text-muted-foreground hover:text-slate-300"
                    }`}>
                      <span className={`shrink-0 mt-0.5 ${i === 0 ? "text-violet-400" : "text-slate-600"}`}>›</span>
                      <span className="break-all">{msg}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Apa yang AI sedang pelajari */}
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-yellow-400" />
                Modul Pembelajaran Aktif
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { label: "Perilaku EMA",         active: true },
                  { label: "Perilaku VWAP",         active: true },
                  { label: "Analisis RSI",          active: true },
                  { label: "Analisis MACD",         active: true },
                  { label: "Analisis Volume",       active: true },
                  { label: "Smart Money Concepts",  active: brain ? brain.level !== "Pemula" : false },
                  { label: "Liquidity Sweep",       active: brain ? brain.level !== "Pemula" : false },
                  { label: "Struktur Pasar",        active: true },
                  { label: "Psikologi Candle",      active: true },
                  { label: "Perilaku Institusional", active: brain ? ["Expert","Institusional","Mahir"].includes(brain.level) : false },
                  { label: "Manajemen Risiko",      active: true },
                  { label: "Timing Trade",          active: true },
                ].map(mod => (
                  <div key={mod.label} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                    mod.active
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                      : "bg-slate-800/50 border border-slate-700 text-slate-500"
                  }`}>
                    {mod.active
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      : <Clock className="w-3 h-3 text-slate-600 shrink-0" />}
                    {mod.label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB: BACKTEST LAB
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "backtest" && (
        <div className="space-y-4">

          {/* Header kontrol backtest */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-violet-400" />
              <span className="font-semibold text-sm">Mesin Backtest Institusional</span>
              {labState?.isRunning && (
                <Badge variant="outline" className="border-violet-500/40 text-violet-300 text-xs animate-pulse">
                  Berjalan...
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              {labState?.isRunning ? (
                <Button onClick={handleStopBacktest} variant="destructive" size="sm">
                  <Square className="w-3.5 h-3.5 mr-1" />Hentikan
                </Button>
              ) : (
                <Button onClick={handleStartBacktest} size="sm" className="bg-violet-600 hover:bg-violet-700">
                  <Play className="w-3.5 h-3.5 mr-1" />Mulai Backtest
                </Button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {labState?.isRunning && (
            <Card className="border-violet-500/30 bg-violet-500/5">
              <CardContent className="py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-violet-300 font-medium">{labState.phase}</span>
                  <span className="text-xs font-mono text-violet-400">{labState.progress ?? 0}%</span>
                </div>
                <Progress value={labState.progress ?? 0} className="h-1.5" />
                {labState.currentSymbol && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                    <ChevronRight className="w-3 h-3" />
                    <span>{labState.currentSymbol}</span>
                    {labState.currentStrategy && <><span>—</span><span>{labState.currentStrategy}</span></>}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Ringkasan backtest */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-slate-700/50">
              <CardContent className="pt-3 pb-3">
                <div className="text-xs text-muted-foreground mb-0.5">Win Rate Terbaik</div>
                <div className="text-xl font-bold text-yellow-400">
                  {labState?.summary.bestWinRate ? `${labState.summary.bestWinRate}%` : "—"}
                </div>
                <div className="text-xs text-muted-foreground truncate">{labState?.bestStrategy?.label ?? "—"}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-700/50">
              <CardContent className="pt-3 pb-3">
                <div className="text-xs text-muted-foreground mb-0.5">Sharpe Terbaik</div>
                <div className="text-xl font-bold text-blue-400">
                  {labState?.summary.bestSharpe ? labState.summary.bestSharpe.toFixed(2) : "—"}
                </div>
                <div className="text-xs text-muted-foreground">Risk-adjusted return</div>
              </CardContent>
            </Card>
            <Card className="border-slate-700/50">
              <CardContent className="pt-3 pb-3">
                <div className="text-xs text-muted-foreground mb-0.5">Total Trade Simulasi</div>
                <div className="text-xl font-bold text-emerald-400">
                  {labState?.summary.totalTrades?.toLocaleString() ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground">{labState?.summary.totalBacktested ?? 0} backtest selesai</div>
              </CardContent>
            </Card>
          </div>

          {/* Sub-tab backtest */}
          {aggregated.length > 0 && (
            <div className="space-y-4">
              {/* Sort control */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Urutkan:</span>
                {(["winRate","sharpe","pf"] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      sortBy === s ? "bg-violet-600 text-white" : "bg-slate-700 text-muted-foreground hover:bg-slate-600"
                    }`}>
                    {s === "winRate" ? "Win Rate" : s === "sharpe" ? "Sharpe Ratio" : "Profit Factor"}
                  </button>
                ))}
              </div>

              {/* Win Rate Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart className="w-4 h-4 text-violet-400" />
                    Win Rate per Strategi
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <RechartsBar data={barData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={[0, 100]} unit="%" />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                        formatter={(val: number) => [`${val}%`, "Win Rate"]}
                        labelFormatter={(_, p) => p?.[0]?.payload?.fullLabel ?? ""}
                      />
                      <Bar dataKey="winRate" radius={[4,4,0,0]}>
                        {barData.map((entry, i) => (
                          <Cell key={i} fill={entry.winRate >= 65 ? "#22c55e" : entry.winRate >= 55 ? "#f59e0b" : "#ef4444"} />
                        ))}
                      </Bar>
                    </RechartsBar>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Radar Chart */}
              {radarData.length >= 3 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Radar className="w-4 h-4 text-blue-400" />
                      Perbandingan Multi-Dimensi
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#334155" />
                        <PolarAngleAxis dataKey="strategy" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                        <RechartsRadar name="Win Rate" dataKey="Win Rate" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} />
                        <RechartsRadar name="Sharpe×10" dataKey="Sharpe×10" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
                        <RechartsRadar name="PF×20" dataKey="PF×20" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Tabel hasil detail */}
              {detailedResults.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Hasil Detail Backtest</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700 bg-slate-800/50">
                            <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Pair</th>
                            <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Strategi</th>
                            <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Trade</th>
                            <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Win Rate</th>
                            <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Sharpe</th>
                            <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">PF</th>
                            <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Return</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailedResults.slice(0, 30).map((r, i) => (
                            <tr key={i} className="border-b border-slate-700/40 hover:bg-slate-800/30 transition-colors">
                              <td className="px-3 py-2 font-mono text-xs font-semibold">{r.symbol.replace("USDT", "/USDT")}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground max-w-[150px] truncate">{r.strategyLabel}</td>
                              <td className="px-3 py-2 text-right text-xs">{r.totalTrades}</td>
                              <td className="px-3 py-2 text-right">
                                <span className={`text-xs font-bold ${r.winRate >= 65 ? "text-green-400" : r.winRate >= 55 ? "text-yellow-400" : "text-red-400"}`}>
                                  {r.winRate}%
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`text-xs font-bold ${r.sharpeRatio >= 1 ? "text-blue-400" : "text-slate-400"}`}>
                                  {r.sharpeRatio.toFixed(2)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`text-xs font-bold ${r.profitFactor >= 1.5 ? "text-green-400" : r.profitFactor >= 1 ? "text-yellow-400" : "text-red-400"}`}>
                                  {r.profitFactor.toFixed(2)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`text-xs font-bold ${r.totalReturnPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  {r.totalReturnPct >= 0 ? "+" : ""}{r.totalReturnPct.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Konfigurasi backtest */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Filter className="w-4 h-4 text-violet-400" />
                  Pilih Pair ({selectedPairs.length} dipilih)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_PAIRS.map(p => (
                    <button key={p} onClick={() => togglePair(p)} disabled={labState?.isRunning}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                        selectedPairs.includes(p)
                          ? "bg-violet-600/30 text-violet-300 border border-violet-500/40"
                          : "bg-slate-800 text-muted-foreground border border-slate-700 hover:bg-slate-700"
                      }`}>
                      <div className="flex items-center justify-between">
                        <span>{p.replace("USDT", "/USDT")}</span>
                        {selectedPairs.includes(p) && <CheckCircle2 className="w-3 h-3" />}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
                    onClick={() => setSelectedPairs(ALL_PAIRS)} disabled={labState?.isRunning}>Semua</Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
                    onClick={() => setSelectedPairs([])} disabled={labState?.isRunning}>Hapus</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-violet-400" />
                  Pilih Strategi ({selectedStrategies.length} dipilih)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {ALL_STRATEGIES.map(s => (
                    <button key={s.key} onClick={() => toggleStrategy(s.key)} disabled={labState?.isRunning}
                      className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
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
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
                    onClick={() => setSelectedStrategies(ALL_STRATEGIES.map(s => s.key))} disabled={labState?.isRunning}>Semua</Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
                    onClick={() => setSelectedStrategies([])} disabled={labState?.isRunning}>Hapus</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB: EVOLUSI
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "evolusi" && (
        <div className="space-y-5">

          {/* Kartu status evolusi */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: "IQ Saat Ini",
                value: brain?.iq ?? 87,
                suffix: "",
                color: "text-violet-400",
                sub: `Level: ${brain?.level ?? "Pemula"}`,
              },
              {
                label: "Akurasi Prediksi",
                value: parseFloat((brain?.predictionAccuracy ?? 41).toFixed(1)),
                suffix: "%",
                color: skillColor(brain?.predictionAccuracy ?? 41),
                sub: "Estimasi akurasi sinyal",
              },
              {
                label: "Baca Pasar",
                value: parseFloat((brain?.marketReading ?? 42).toFixed(1)),
                suffix: "%",
                color: skillColor(brain?.marketReading ?? 42),
                sub: "Pemahaman pergerakan harga",
              },
              {
                label: "Win Rate Est.",
                value: parseFloat(Math.min(85, 40 + (brain?.predictionAccuracy ?? 41) * 0.45).toFixed(1)),
                suffix: "%",
                color: "text-emerald-400",
                sub: "Estimasi berdasarkan akurasi",
              },
            ].map(stat => (
              <Card key={stat.label} className="border-slate-700/50">
                <CardContent className="pt-3 pb-3">
                  <div className="text-xs text-muted-foreground mb-0.5">{stat.label}</div>
                  <div className={`text-2xl font-black ${stat.color}`}>{stat.value}{stat.suffix}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{stat.sub}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {evoChartData.length === 0 ? (
            <Card className="border-dashed border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <TrendingUp className="w-10 h-10 opacity-30" />
                <p className="text-sm font-medium">Belum ada data evolusi</p>
                <p className="text-xs text-center max-w-xs">
                  Snapshot evolusi diambil setiap 30 siklus belajar.
                  Aktifkan pembelajaran dan biarkan AI berjalan untuk melihat grafik progres.
                </p>
                <Button size="sm" onClick={handleToggleLearning}
                  className="bg-emerald-600 hover:bg-emerald-700 mt-2">
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  Mulai Belajar Sekarang
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Grafik IQ */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-violet-400" />
                    Progres IQ dari Waktu ke Waktu
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={evoChartData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="iqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="siklus" tick={{ fontSize: 10, fill: "#94a3b8" }} label={{ value: "Snapshot ke-", position: "insideBottom", offset: -2, fontSize: 10, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                      <Area type="monotone" dataKey="IQ" stroke="#8b5cf6" strokeWidth={2} fill="url(#iqGrad)" dot={{ r: 3, fill: "#8b5cf6" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Grafik Skill */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Evolusi Skill AI
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={evoChartData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="siklus" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Akurasi (%)"   stroke="#22c55e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Baca Pasar (%)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Win Rate (%)"   stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Tabel snapshot */}
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
                          <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Waktu</th>
                          <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">Level</th>
                          <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">IQ</th>
                          <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Akurasi</th>
                          <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Baca Pasar</th>
                          <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Chart</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...(brain?.evolutionHistory ?? [])].reverse().slice(0, 20).map((s, i) => {
                          const cfg = LEVEL_CONFIG[s.level];
                          return (
                            <tr key={i} className="border-b border-slate-700/40 hover:bg-slate-800/30 transition-colors">
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {new Date(s.timestamp).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`text-xs font-medium ${cfg.color}`}>{cfg.icon} {s.level}</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className="text-xs font-bold text-violet-400">{s.iq}</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`text-xs font-bold ${skillColor(s.predictionAccuracy)}`}>
                                  {s.predictionAccuracy.toFixed(1)}%
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`text-xs font-bold ${skillColor(s.marketReading)}`}>
                                  {s.marketReading.toFixed(1)}%
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className="text-xs text-slate-300">{s.chartsAnalyzed.toLocaleString()}</span>
                              </td>
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
