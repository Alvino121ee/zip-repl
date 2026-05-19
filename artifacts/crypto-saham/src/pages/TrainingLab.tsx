import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Brain, Play, Square, RefreshCw, BarChart2, TrendingUp,
  Target, Shield, Zap, Activity, Clock, Award, CheckCircle2,
  Cpu, BookOpen, ArrowUpRight, Radar, Sparkles, FlaskConical,
  Eye, GraduationCap, Flame, Star, TrendingDown, RotateCcw,
  Lightbulb, Swords, Trophy, Database, AlertTriangle, Layers,
  BarChart, Repeat, BookMarked, BrainCircuit, Gauge,
  ChevronRight, Wifi, WifiOff, Upload, FileText, X, CheckCircle,
  Lock, ShieldCheck,
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

interface AiAdaptiveConfig {
  confidenceThreshold: number;
  tpPct: number;
  slPct: number;
  maxHoldBars: number;
  volMultiplier: number;
  rsiBullMin: number;
  rsiBearMax: number;
  rsiOverbought: number;
  rsiOversold: number;
  cooldownEntry: number;
  cooldownExit: number;
  smcBoost: number;
  macdSensitivity: number;
  description: string;
  skills: Record<string, number>;
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
  const [aiConfig, setAiConfig]   = useState<AiAdaptiveConfig | null>(null);
  const [aiAuto, setAiAuto]       = useState(true);
  const [activeTab, setActiveTab] = useState<"kecerdasan" | "live" | "memori" | "backtest" | "evolusi" | "ajar">("live");
  const [memoryTab, setMemoryTab] = useState<"learnedPatterns" | "bestSetups" | "worstSetups" | "dangerousConditions">("learnedPatterns");
  const [selectedPairs, setSelectedPairs]         = useState<string[]>(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(ALL_STRATEGIES.map(s => s.key));
  const [sortBy, setSortBy] = useState<"winRate" | "sharpe" | "pf">("winRate");
  const [pulse, setPulse] = useState(false);

  // ── Manual Training ──
  const [manualInput,  setManualInput]  = useState("");
  const [manualResult, setManualResult] = useState<{
    xpGained: number;
    conceptsFound: string[];
    categoriesHit: string[];
    skillsImproved: { skill: string; label: string }[];
    memorySaved: boolean;
    iqBefore: number;
    iqAfter: number;
    grade: "S" | "A" | "B" | "C" | "D";
    analysis: string;
    feedback: string;
  } | null>(null);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [manualHistory, setManualHistory] = useState<string[]>([]);

  // ── DNA Inti AI (Prinsip Permanen) ──
  const [coreDna, setCoreDna] = useState<{
    title: string;
    philosophy: string;
    principles: string[];
    forbiddenActions: string[];
    skillBoosts: Record<string, number>;
    xpBonus: number;
    installedAt: number;
    version: number;
  } | null>(null);

  // ── TXT File Upload Training ──
  const [txtLessons, setTxtLessons]         = useState<string[]>([]);
  const [txtFileName, setTxtFileName]       = useState("");
  const [txtProgress, setTxtProgress]       = useState(0);
  const [txtTotal, setTxtTotal]             = useState(0);
  const [txtRunning, setTxtRunning]         = useState(false);
  const [txtDone, setTxtDone]               = useState(false);
  const [txtTotalXp, setTxtTotalXp]         = useState(0);
  const [txtCurrentLesson, setTxtCurrentLesson] = useState("");
  const [txtLessonResults, setTxtLessonResults] = useState<Array<{ text: string; xp: number; grade: string; ok: boolean }>>([]);
  const [txtDragOver, setTxtDragOver]       = useState(false);
  const txtAbortRef = useRef(false);

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
  const fetchAiConfig = useCallback(async () => {
    try { const r = await fetch(`${API}/api/training-lab/ai-config`); if (r.ok) setAiConfig(await r.json()); } catch {}
  }, []);
  const fetchCoreDna = useCallback(async () => {
    try { const r = await fetch(`${API}/api/training-lab/core-dna`); if (r.ok) setCoreDna(await r.json()); } catch {}
  }, []);

  useEffect(() => {
    fetchBrain(); fetchMemory(); fetchLab(); fetchComp(); fetchAiConfig(); fetchCoreDna();
  }, [fetchBrain, fetchMemory, fetchLab, fetchComp, fetchAiConfig, fetchCoreDna]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetchBrain();
      if (activeTab === "memori") fetchMemory();
      if (activeTab === "backtest") {
        fetchLab(); fetchAiConfig();
        if (!labState?.isRunning) fetchComp();
      }
    }, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchBrain, fetchMemory, fetchLab, fetchComp, fetchAiConfig, activeTab, labState?.isRunning]);

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

  // ── TXT Upload: parse file jadi daftar pelajaran ──────────────────────────
  const parseTxtFile = (content: string): string[] => {
    // Coba split by numbered items: "1. ...\n2. ..."
    const numbered = content.match(/^\d+[\.\)]\s+[\s\S]+?(?=\n\d+[\.\)]\s|$)/gm);
    if (numbered && numbered.length >= 2) {
      return numbered.map(s => s.replace(/^\d+[\.\)]\s+/, "").trim()).filter(s => s.length >= 10).slice(0, 100);
    }
    // Split by double newline (paragraf)
    const paragraphs = content.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length >= 10);
    if (paragraphs.length >= 2) {
      const chunks: string[] = [];
      let buf = "";
      for (const p of paragraphs) {
        if ((buf + "\n\n" + p).length > 4800) {
          if (buf.length >= 10) chunks.push(buf.trim());
          buf = p;
        } else {
          buf = buf ? buf + "\n\n" + p : p;
        }
      }
      if (buf.length >= 10) chunks.push(buf.trim());
      return chunks.slice(0, 100);
    }
    // Fallback: split by single newline
    const lines = content.split("\n").map(s => s.trim()).filter(s => s.length >= 10);
    const chunks: string[] = [];
    let buf = "";
    for (const l of lines) {
      if ((buf + " " + l).length > 4800) {
        if (buf.length >= 10) chunks.push(buf.trim());
        buf = l;
      } else {
        buf = buf ? buf + " " + l : l;
      }
    }
    if (buf.length >= 10) chunks.push(buf.trim());
    return chunks.slice(0, 100);
  };

  const handleTxtFile = (file: File) => {
    if (!file.name.endsWith(".txt")) {
      toast({ title: "Format tidak didukung", description: "Harap upload file berekstensi .txt", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lessons = parseTxtFile(content);
      if (lessons.length === 0) {
        toast({ title: "File kosong atau terlalu pendek", description: "Tidak ada pelajaran yang bisa diekstrak dari file ini.", variant: "destructive" });
        return;
      }
      setTxtLessons(lessons);
      setTxtFileName(file.name);
      setTxtProgress(0);
      setTxtTotal(lessons.length);
      setTxtDone(false);
      setTxtTotalXp(0);
      setTxtLessonResults([]);
      setTxtCurrentLesson("");
    };
    reader.readAsText(file, "utf-8");
  };

  const handleStartTxtTraining = async () => {
    if (txtLessons.length === 0) return;
    setTxtRunning(true);
    setTxtDone(false);
    setTxtProgress(0);
    setTxtTotalXp(0);
    setTxtLessonResults([]);
    txtAbortRef.current = false;
    let totalXp = 0;
    const results: Array<{ text: string; xp: number; grade: string; ok: boolean }> = [];
    for (let i = 0; i < txtLessons.length; i++) {
      if (txtAbortRef.current) break;
      const lesson = txtLessons[i];
      setTxtCurrentLesson(lesson.slice(0, 80) + (lesson.length > 80 ? "..." : ""));
      try {
        const res = await fetch(`${API}/api/training-lab/manual-train`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: lesson }),
        });
        const data = await res.json();
        if (res.ok) {
          totalXp += data.xpGained ?? 0;
          setTxtTotalXp(totalXp);
          results.push({ text: lesson.slice(0, 60) + (lesson.length > 60 ? "…" : ""), xp: data.xpGained, grade: data.grade, ok: true });
        } else {
          results.push({ text: lesson.slice(0, 60) + "…", xp: 0, grade: "D", ok: false });
        }
      } catch {
        results.push({ text: lesson.slice(0, 60) + "…", xp: 0, grade: "D", ok: false });
      }
      setTxtProgress(i + 1);
      setTxtLessonResults([...results]);
      await new Promise(r => setTimeout(r, 350));
    }
    setTxtRunning(false);
    setTxtDone(true);
    setTxtCurrentLesson("");
    fetchBrain();
    toast({ title: `✅ File selesai dipelajari!`, description: `${results.length} pelajaran · Total +${totalXp} XP diperoleh AI` });
  };

  const handleManualTrain = async () => {
    const text = manualInput.trim();
    if (text.length < 10) {
      toast({ title: "Teks terlalu pendek", description: "Tuliskan minimal 1 kalimat.", variant: "destructive" });
      return;
    }
    setIsSubmittingManual(true);
    setManualResult(null);
    try {
      const res = await fetch(`${API}/api/training-lab/manual-train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Gagal"); }
      const data = await res.json();
      setManualResult(data);
      setManualHistory(prev => [text, ...prev].slice(0, 10));
      setManualInput("");
      fetchBrain();
      toast({ title: `+${data.xpGained} XP diperoleh!`, description: `Grade ${data.grade} — ${data.categoriesHit.join(", ") || "Input diterima"}` });
    } catch (err: unknown) {
      toast({ title: "Gagal mengirim", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleStartBacktest = async () => {
    if (selectedPairs.length === 0) {
      toast({ title: "Pilih minimal 1 pair", variant: "destructive" }); return;
    }
    if (!aiAuto && selectedStrategies.length === 0) {
      toast({ title: "Pilih minimal 1 strategi atau aktifkan AI Auto", variant: "destructive" }); return;
    }
    const body = aiAuto
      ? { pairs: selectedPairs, aiAuto: true }
      : { pairs: selectedPairs, strategies: selectedStrategies, aiAuto: false };

    const res = await fetch(`${API}/api/training-lab/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      toast({ title: "Backtest dimulai!", description: data.message ?? "" });
      setTimeout(() => { fetchLab(); fetchAiConfig(); }, 500);
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
          { key: "ajar",       label: "✏️ Ajar AI",         },
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
          TAB: AJAR AI (MANUAL TRAINING)
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "ajar" && (
        <div className="space-y-4">
          {/* Header info */}
          <Card className="border-violet-500/30 bg-violet-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-violet-300 mb-0.5">Kamu adalah Gurunya</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ketik apapun yang kamu ketahui tentang trading — strategi, pelajaran, observasi pasar, pola yang kamu temui.
                  AI akan menganalisis teks, mengekstrak konsep berharga, menyimpan ke memori, dan mendapat XP sesuai kualitas input.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── DNA INTI AI (Prinsip Permanen) ─────────────────────────────── */}
          {coreDna && (
            <Card className="border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-300">DNA Inti AI</span>
                    <span className="text-amber-400">— Prinsip Permanen</span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-2 py-0.5 font-medium">
                      🔒 Tidak Bisa Dihapus
                    </span>
                    <span className="text-xs text-amber-400 font-bold">+{coreDna.xpBonus?.toLocaleString()} XP</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Filosofi */}
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />Filosofi Utama
                  </p>
                  <p className="text-sm text-amber-100/80 italic leading-relaxed">"{coreDna.philosophy}"</p>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  {/* Prinsip */}
                  <div>
                    <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />Prinsip Aktif ({coreDna.principles?.length})
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {coreDna.principles?.map((p: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 rounded-lg px-2.5 py-1.5">
                          <span className="text-emerald-400 font-bold shrink-0 mt-px">✓</span>
                          <span className="leading-relaxed">{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Larangan + Skill Boosts */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />Dilarang Keras ({coreDna.forbiddenActions?.length})
                      </p>
                      <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                        {coreDna.forbiddenActions?.map((f: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground bg-red-500/5 rounded-lg px-2.5 py-1">
                            <span className="text-red-400 shrink-0 mt-px">✗</span>
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Skill Boost Permanen */}
                    <div>
                      <p className="text-xs font-semibold text-violet-400 mb-2 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" />Boost Skill Permanen
                      </p>
                      <div className="grid grid-cols-2 gap-1">
                        {coreDna.skillBoosts && Object.entries(coreDna.skillBoosts).map(([key, val]) => {
                          const labels: Record<string, string> = {
                            emotionalDiscipline: "Disiplin", riskManagement: "Risk Mgmt",
                            patience: "Kesabaran", selectivity: "Selektivitas",
                            trendAnalysis: "Trend Analysis", volumeAnalysis: "Volume",
                            candlePsychology: "Candle", patternRecognition: "Pattern",
                            smartMoneyConceptSkill: "Smart Money", momentumReading: "Momentum",
                            adaptiveIntelligence: "Adaptif", orderflowReading: "Order Flow",
                          };
                          return (
                            <div key={key} className="flex items-center justify-between bg-violet-500/5 rounded-lg px-2 py-1 text-xs">
                              <span className="text-muted-foreground truncate">{labels[key] ?? key}</span>
                              <span className="text-violet-400 font-bold ml-1 shrink-0">+{val as number}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Installed at */}
                <p className="text-[11px] text-muted-foreground/50 text-right">
                  Diinstal: {coreDna.installedAt ? new Date(coreDna.installedAt).toLocaleString("id-ID") : "–"} · v{coreDna.version}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-5 gap-4">
            {/* Input Panel */}
            <div className="md:col-span-3 space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-violet-400" />
                    Input Pengetahuan
                    <span className="ml-auto text-xs text-muted-foreground">{manualInput.length}/5000</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <textarea
                    value={manualInput}
                    onChange={e => setManualInput(e.target.value.slice(0, 5000))}
                    placeholder="Contoh: Saat RSI di atas 70 dan harga menyentuh resistance kuat, ada probabilitas tinggi terjadi reversal. Saya selalu pasang stop loss 1.5% di atas resistance dan target profit di support berikutnya dengan RR minimal 1:2..."
                    className="w-full h-48 bg-background border border-border rounded-lg p-3 text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-muted-foreground/50"
                  />
                  {/* Contoh topik */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Ide topik:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "Strategi entry favoritmu",
                        "Pola chart yang sering kamu lihat",
                        "Pelajaran dari loss terbesar",
                        "Aturan manajemen risiko",
                        "Kapan kamu TIDAK masuk trade",
                        "Pengalaman dengan FOMO/revenge trading",
                        "Setup SMC / order block",
                        "Tips psikologi trading",
                      ].map(tip => (
                        <button
                          key={tip}
                          onClick={() => setManualInput(prev => prev ? prev + " " + tip : tip)}
                          className="text-[11px] px-2 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-violet-500/50 transition-colors"
                        >
                          {tip}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    className="w-full bg-violet-600 hover:bg-violet-500 text-white"
                    onClick={handleManualTrain}
                    disabled={isSubmittingManual || manualInput.trim().length < 10}
                  >
                    {isSubmittingManual ? (
                      <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />AI sedang menganalisis...</>
                    ) : (
                      <><Brain className="w-4 h-4 mr-2" />Ajarkan ke AI</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Riwayat input */}
              {manualHistory.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      Riwayat Input Sesi Ini
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {manualHistory.map((h, i) => (
                      <div key={i} className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2 line-clamp-2">
                        {h}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Result Panel */}
            <div className="md:col-span-2 space-y-3">
              {/* IQ saat ini */}
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">IQ Saat Ini</p>
                  <p className="text-4xl font-black text-violet-400">{brain?.iq ?? "–"}</p>
                  <p className="text-xs text-muted-foreground">{brain?.level ?? ""}</p>
                  <div className="mt-2 flex justify-center gap-3 text-xs text-muted-foreground">
                    <span><span className="text-amber-400 font-semibold">{brain?.experiencePoints?.toLocaleString() ?? 0}</span> XP</span>
                    <span>·</span>
                    <span><span className="text-emerald-400 font-semibold">{brain?.learningCycles ?? 0}</span> siklus</span>
                  </div>
                </CardContent>
              </Card>

              {/* Hasil analisis */}
              {manualResult ? (
                <Card className={`border-2 ${
                  manualResult.grade === "S" ? "border-yellow-400/50 bg-yellow-500/5" :
                  manualResult.grade === "A" ? "border-emerald-400/50 bg-emerald-500/5" :
                  manualResult.grade === "B" ? "border-blue-400/50 bg-blue-500/5" :
                  manualResult.grade === "C" ? "border-orange-400/50 bg-orange-500/5" :
                  "border-slate-500/30"
                }`}>
                  <CardContent className="p-4 space-y-3">
                    {/* Grade + XP */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black ${
                          manualResult.grade === "S" ? "bg-yellow-400/20 text-yellow-400" :
                          manualResult.grade === "A" ? "bg-emerald-400/20 text-emerald-400" :
                          manualResult.grade === "B" ? "bg-blue-400/20 text-blue-400" :
                          manualResult.grade === "C" ? "bg-orange-400/20 text-orange-400" :
                          "bg-slate-500/20 text-slate-400"
                        }`}>{manualResult.grade}</div>
                        <div>
                          <p className="text-xs text-muted-foreground">XP Didapat</p>
                          <p className="text-xl font-bold text-amber-400">+{manualResult.xpGained}</p>
                        </div>
                      </div>
                      {manualResult.iqAfter > manualResult.iqBefore && (
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">IQ</p>
                          <p className="text-sm font-bold">
                            <span className="text-slate-400">{manualResult.iqBefore}</span>
                            <span className="text-muted-foreground mx-1">→</span>
                            <span className="text-violet-400">{manualResult.iqAfter}</span>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Feedback */}
                    <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
                      {manualResult.feedback}
                    </p>

                    {/* Kategori */}
                    {manualResult.categoriesHit.length > 0 && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Kategori terdeteksi:</p>
                        <div className="flex flex-wrap gap-1">
                          {manualResult.categoriesHit.map(c => (
                            <span key={c} className="text-[11px] px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded-full">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Konsep */}
                    {manualResult.conceptsFound.length > 0 && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Konsep yang dipelajari:</p>
                        <div className="flex flex-wrap gap-1">
                          {manualResult.conceptsFound.slice(0, 12).map(c => (
                            <span key={c} className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-slate-300 font-mono">{c}</span>
                          ))}
                          {manualResult.conceptsFound.length > 12 && (
                            <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">+{manualResult.conceptsFound.length - 12} lainnya</span>
                          )}
                        </div>
                      </div>
                    )}

                    {manualResult.memorySaved && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 rounded-lg px-2.5 py-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Tersimpan di Memori AI
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="p-6 text-center text-muted-foreground">
                    <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Hasil analisis akan muncul di sini</p>
                    <p className="text-xs mt-1">Setiap konsep yang ditemukan menambah XP & meningkatkan skill AI</p>
                  </CardContent>
                </Card>
              )}

              {/* Tips panduan */}
              <Card className="bg-muted/20">
                <CardContent className="p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tips mendapat grade tinggi</p>
                  {[
                    { icon: "📊", text: "Sebutkan indikator spesifik (RSI, MACD, EMA)" },
                    { icon: "🎯", text: "Jelaskan setup entry dan exit dengan jelas" },
                    { icon: "🛡️", text: "Sertakan aturan stop loss & risk reward" },
                    { icon: "🧠", text: "Ceritakan aspek psikologi trading" },
                    { icon: "📏", text: "Semakin panjang & detail = XP lebih banyak" },
                  ].map(tip => (
                    <div key={tip.text} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <span>{tip.icon}</span>
                      <span>{tip.text}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ── UPLOAD FILE TXT ─────────────────────────────────────── */}
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                Upload File TXT — Ajar AI Massal
                <span className="ml-auto text-xs text-muted-foreground font-normal">Max 100 pelajaran per file</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Info */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                Upload file <code className="bg-muted px-1 rounded">.txt</code> berisi strategi, catatan trading, atau pengetahuan apapun.
                AI akan membaca <strong className="text-emerald-400">pelajaran per pelajaran</strong> secara otomatis dan menyimpan semuanya ke memori.
                Pisahkan tiap pelajaran dengan <strong>baris kosong</strong> atau gunakan format bernomor <code className="bg-muted px-1 rounded">1. ... 2. ...</code>
              </p>

              {/* Drop Zone */}
              {!txtLessons.length ? (
                <label
                  className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all ${
                    txtDragOver ? "border-emerald-400 bg-emerald-500/10" : "border-border hover:border-emerald-500/50 hover:bg-emerald-500/5"
                  }`}
                  onDragOver={e => { e.preventDefault(); setTxtDragOver(true); }}
                  onDragLeave={() => setTxtDragOver(false)}
                  onDrop={e => { e.preventDefault(); setTxtDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleTxtFile(f); }}
                >
                  <input type="file" accept=".txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleTxtFile(f); }} />
                  <Upload className={`w-8 h-8 ${txtDragOver ? "text-emerald-400" : "text-muted-foreground/50"}`} />
                  <p className="text-sm font-medium text-muted-foreground">Klik atau drag & drop file .txt di sini</p>
                  <p className="text-xs text-muted-foreground/60">Format: teks biasa (.txt), encoding UTF-8</p>
                </label>
              ) : (
                <div className="space-y-3">
                  {/* File info + reset */}
                  <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{txtFileName}</span>
                    <span className="text-xs text-emerald-400 font-semibold">{txtLessons.length} pelajaran terdeteksi</span>
                    {!txtRunning && (
                      <button onClick={() => { setTxtLessons([]); setTxtFileName(""); setTxtDone(false); setTxtLessonResults([]); }}
                        className="ml-1 text-muted-foreground hover:text-destructive transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Preview pelajaran */}
                  {!txtRunning && !txtDone && (
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {txtLessons.slice(0, 5).map((l, i) => (
                        <div key={i} className="text-xs bg-muted/30 rounded-lg px-3 py-1.5 text-muted-foreground line-clamp-1">
                          <span className="text-emerald-400 font-semibold mr-2">#{i + 1}</span>{l}
                        </div>
                      ))}
                      {txtLessons.length > 5 && (
                        <p className="text-xs text-muted-foreground pl-2">... dan {txtLessons.length - 5} pelajaran lainnya</p>
                      )}
                    </div>
                  )}

                  {/* Progress bar saat berjalan */}
                  {(txtRunning || txtDone) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {txtRunning ? `Memproses pelajaran ${txtProgress} dari ${txtTotal}...` : `✅ Selesai — ${txtProgress} pelajaran dipelajari`}
                        </span>
                        <span className="text-amber-400 font-bold">+{txtTotalXp} XP</span>
                      </div>
                      <Progress value={(txtProgress / txtTotal) * 100} className="h-2" />
                      {txtRunning && txtCurrentLesson && (
                        <p className="text-xs text-emerald-300 bg-emerald-500/10 rounded-lg px-3 py-1.5 italic line-clamp-1">
                          🧠 AI membaca: "{txtCurrentLesson}"
                        </p>
                      )}
                    </div>
                  )}

                  {/* Hasil per pelajaran */}
                  {txtLessonResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                      {txtLessonResults.map((r, i) => (
                        <div key={i} className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${r.ok ? "bg-muted/30" : "bg-red-500/10"}`}>
                          {r.ok
                            ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            : <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          }
                          <span className={`w-5 font-bold shrink-0 ${
                            r.grade === "S" ? "text-yellow-400" : r.grade === "A" ? "text-emerald-400" :
                            r.grade === "B" ? "text-blue-400" : r.grade === "C" ? "text-orange-400" : "text-muted-foreground"
                          }`}>{r.grade}</span>
                          <span className="text-amber-400 font-semibold shrink-0">+{r.xp}</span>
                          <span className="text-muted-foreground truncate flex-1">{r.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tombol aksi */}
                  <div className="flex gap-2">
                    {!txtRunning && !txtDone && (
                      <Button className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white" onClick={handleStartTxtTraining}>
                        <Brain className="w-4 h-4 mr-2" />Mulai Latih AI ({txtLessons.length} Pelajaran)
                      </Button>
                    )}
                    {txtRunning && (
                      <Button variant="destructive" className="flex-1" onClick={() => { txtAbortRef.current = true; }}>
                        <Square className="w-4 h-4 mr-2" />Hentikan
                      </Button>
                    )}
                    {txtDone && (
                      <>
                        <div className="flex-1 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs text-emerald-300 font-medium">Semua tersimpan di memori AI!</span>
                          <span className="ml-auto text-amber-400 font-bold text-sm">+{txtTotalXp} XP</span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTxtLessons([]); setTxtFileName(""); setTxtDone(false); setTxtLessonResults([]); setTxtProgress(0); setTxtTotalXp(0); }}>
                          <Upload className="w-3.5 h-3.5 mr-1.5" />Upload Baru
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: BACKTEST LAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "backtest" && (
        <div className="space-y-4">

          {/* ── Panel Konfigurasi AI Adaptif ── */}
          {aiConfig && (
            <Card className="border-violet-500/30 bg-violet-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <BrainCircuit className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-bold text-violet-300">Parameter Strategi Adaptif AI</span>
                  <Badge variant="outline" className="ml-auto text-[10px] border-violet-500/40 text-violet-300">
                    IQ {brain?.iq ?? "–"} · {brain?.level ?? ""}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">{aiConfig.description}</p>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {[
                    { label: "Min Confidence", value: `${aiConfig.confidenceThreshold}%`, icon: "🎯", hint: "Skill: Pengenalan Pola" },
                    { label: "Take Profit",    value: `${aiConfig.tpPct}%`,              icon: "💰", hint: "Skill: Manajemen Risiko" },
                    { label: "Stop Loss",      value: `${aiConfig.slPct}%`,              icon: "🛡️", hint: "Skill: Manajemen Risiko" },
                    { label: "Hold Maks",      value: `${aiConfig.maxHoldBars} bar`,     icon: "⏳", hint: "Skill: Kesabaran" },
                    { label: "Filter Volume",  value: `×${aiConfig.volMultiplier}`,      icon: "📊", hint: "Skill: Analisis Volume" },
                    { label: "SMC Boost",      value: `+${aiConfig.smcBoost}`,           icon: "🏦", hint: "Skill: Smart Money" },
                  ].map(p => (
                    <div key={p.label} className="bg-slate-800/60 rounded-lg p-2 text-center" title={p.hint}>
                      <div className="text-base">{p.icon}</div>
                      <div className="text-xs font-bold text-violet-300 mt-0.5">{p.value}</div>
                      <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">{p.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  <span className="bg-slate-800 px-2 py-0.5 rounded">RSI Bull &gt;{aiConfig.rsiBullMin} | Bear &lt;{aiConfig.rsiBearMax}</span>
                  <span className="bg-slate-800 px-2 py-0.5 rounded">Reversal OB≥{aiConfig.rsiOverbought} | OS≤{aiConfig.rsiOversold}</span>
                  <span className="bg-slate-800 px-2 py-0.5 rounded">Cooldown Entry {aiConfig.cooldownEntry} | Exit {aiConfig.cooldownExit} bar</span>
                  <span className="bg-slate-800 px-2 py-0.5 rounded">RR {(aiConfig.tpPct / aiConfig.slPct).toFixed(1)}:1</span>
                </div>

                {/* Toggle AI Auto */}
                <div className="mt-3 flex items-center gap-3 border-t border-violet-500/20 pt-3">
                  <button
                    onClick={() => setAiAuto(v => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${aiAuto ? "bg-violet-600" : "bg-slate-600"}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${aiAuto ? "translate-x-4" : "translate-x-1"}`} />
                  </button>
                  <div>
                    <div className="text-xs font-semibold text-violet-300">
                      {aiAuto ? "🧠 AI Pilih Strategi Otomatis" : "👤 Strategi Dipilih Manual"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {aiAuto
                        ? "AI memilih sendiri strategi yang paling cocok dengan skill-nya sekarang"
                        : "Pilih strategi secara manual di panel di bawah"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
