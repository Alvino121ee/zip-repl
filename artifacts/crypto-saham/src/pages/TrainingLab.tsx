import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Brain, Play, Square, RefreshCw, BarChart2, TrendingUp,
  Target, Shield, Zap, Activity, ChevronRight, Clock,
  Award, AlertTriangle, CheckCircle2, Cpu, Layers,
  BarChart, BookOpen, Filter, ArrowUpRight, ArrowDownRight,
  Radar, Sparkles, Bot, FlaskConical, Eye, Gauge,
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
} from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Tipe Data ────────────────────────────────────────────────────────────────

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

// Pesan AI Live sesuai fase training
const AI_PHASE_MESSAGES: Record<string, string[]> = {
  start:     ["Mempersiapkan AI Training Lab...", "Memuat data historis pasar...", "Menginisialisasi engine backtest..."],
  scan:      ["Memindai pair...", "Mengumpulkan kline historis...", "Mengambil data OHLCV dari Bybit..."],
  analyze:   ["Menganalisis tren multi-timeframe...", "Memeriksa volume & orderflow...", "Mendeteksi struktur pasar..."],
  signal:    ["Sinyal ditemukan! Mensimulasi trade...", "Mengkonfirmasi setup...", "Mengevaluasi RR ratio..."],
  monitor:   ["Memantau simulasi trade...", "Mengamankan profit virtual...", "Menghitung PnL..."],
  complete:  ["Training selesai!", "Menyimpan hasil analisis...", "Mengevaluasi strategi terbaik..."],
  idle:      ["AI Training Lab siap", "Pilih pair & strategi lalu mulai", "Engine standby"],
};

// ─── Komponen Utama ────────────────────────────────────────────────────────────

export default function TrainingLab() {
  const { toast } = useToast();

  const [labState, setLabState] = useState<LabState | null>(null);
  const [comparison, setComparison] = useState<Record<string, ComparisonEntry>>({});
  const [selectedPairs, setSelectedPairs] = useState<string[]>(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(ALL_STRATEGIES.map(s => s.key));
  const [activeTab, setActiveTab] = useState<"overview" | "strategi" | "hasil" | "konfigurasi">("overview");
  const [sortBy, setSortBy] = useState<"winRate" | "sharpe" | "pf">("winRate");
  const [aiMessageIdx, setAiMessageIdx] = useState(0);
  const [aiPhaseKey, setAiPhaseKey] = useState("idle");
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async () => {
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
    fetchState();
    fetchComparison();
  }, [fetchState, fetchComparison]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetchState();
      if (!labState?.isRunning) fetchComparison();
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchState, fetchComparison, labState?.isRunning]);

  // Animasi pesan AI
  useEffect(() => {
    const phase = labState?.isRunning
      ? labState.phase.includes("Memulai") || labState.phase.includes("Training dimulai") ? "start"
        : labState.phase.includes("Backtesting") ? "scan"
        : labState.phase.includes("selesai") ? "complete"
        : "analyze"
      : "idle";
    setAiPhaseKey(phase);
    const msgs = AI_PHASE_MESSAGES[phase] ?? AI_PHASE_MESSAGES.idle;
    const interval = setInterval(() => {
      setAiMessageIdx(i => (i + 1) % msgs.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [labState?.isRunning, labState?.phase]);

  const handleStart = async () => {
    if (selectedPairs.length === 0 || selectedStrategies.length === 0) {
      toast({ title: "Pilih minimal 1 pair dan 1 strategi", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`${API}/api/training-lab/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: selectedPairs, strategies: selectedStrategies }),
      });
      if (res.ok) {
        toast({ title: "Training dimulai!", description: `${selectedPairs.length} pair × ${selectedStrategies.length} strategi` });
        setTimeout(fetchState, 500);
      } else {
        const err = await res.json();
        toast({ title: err.error ?? "Gagal memulai training", variant: "destructive" });
      }
    } catch {
      toast({ title: "Tidak bisa terhubung ke server", variant: "destructive" });
    }
  };

  const handleStop = async () => {
    await fetch(`${API}/api/training-lab/stop`, { method: "POST" });
    toast({ title: "Training dihentikan" });
    setTimeout(fetchState, 500);
  };

  const togglePair = (p: string) =>
    setSelectedPairs(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const toggleStrategy = (s: string) =>
    setSelectedStrategies(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const isRunning = labState?.isRunning ?? false;
  const aiMessages = AI_PHASE_MESSAGES[aiPhaseKey] ?? AI_PHASE_MESSAGES.idle;
  const currentAiMessage = aiMessages[aiMessageIdx % aiMessages.length];

  // Aggregate results per strategy
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

  // Detailed results sorted
  const detailedResults = (labState?.results ?? [])
    .filter(r => r.totalTrades >= 2)
    .sort((a, b) => {
      if (sortBy === "winRate") return b.winRate - a.winRate;
      if (sortBy === "sharpe") return b.sharpeRatio - a.sharpeRatio;
      return b.profitFactor - a.profitFactor;
    });

  // Bar chart data
  const barData = aggregated.map(a => ({
    name: a.label.split(" ")[0],
    fullLabel: a.label,
    winRate: a.winRate,
    sharpe: Math.max(0, a.sharpe),
    pf: Math.min(a.pf, 5),
  }));

  const radarData = aggregated.slice(0, 5).map(a => ({
    strategy: a.label.split(" ")[0],
    "Win Rate": a.winRate,
    "Sharpe×10": Math.max(0, a.sharpe * 10),
    "Prof.Factor×20": Math.min(a.pf * 20, 100),
    "Trades/10": Math.min(a.trades / 10, 100),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/20">
            <FlaskConical className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Training Lab</h1>
            <p className="text-sm text-muted-foreground">Backtesting & optimasi strategi institusional secara real-time</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {labState?.lastRun && (
            <span className="text-xs text-muted-foreground">
              Terakhir: {new Date(labState.lastRun).toLocaleTimeString("id-ID")}
            </span>
          )}
          <Button
            onClick={() => { fetchState(); fetchComparison(); }}
            variant="outline" size="sm"
            disabled={isRunning}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
          {isRunning ? (
            <Button onClick={handleStop} variant="destructive" size="sm">
              <Square className="w-3.5 h-3.5 mr-1" />
              Stop Training
            </Button>
          ) : (
            <Button onClick={handleStart} size="sm" className="bg-violet-600 hover:bg-violet-700">
              <Play className="w-3.5 h-3.5 mr-1" />
              Mulai Training
            </Button>
          )}
        </div>
      </div>

      {/* Progress Bar (saat running) */}
      {isRunning && (
        <Card className="border-violet-500/30 bg-violet-500/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="text-sm font-medium text-violet-300">Training berjalan...</span>
              </div>
              <span className="text-sm font-mono text-violet-400">{labState?.progress ?? 0}%</span>
            </div>
            <Progress value={labState?.progress ?? 0} className="h-2 mb-2" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Cpu className="w-3.5 h-3.5 text-violet-400" />
              <span>{labState?.phase}</span>
              {labState?.currentSymbol && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <Badge variant="outline" className="text-xs py-0 border-violet-500/30 text-violet-300">
                    {labState.currentSymbol}
                  </Badge>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live AI Activity + Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Live AI Activity */}
        <Card className="md:col-span-2 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="w-4 h-4 text-violet-400" />
              Live AI Activity
              <div className={`ml-auto w-2 h-2 rounded-full ${isRunning ? "bg-green-400 animate-pulse" : "bg-slate-500"}`} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Current AI message */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <Sparkles className="w-4 h-4 text-violet-400 shrink-0 animate-pulse" />
              <span className="text-sm text-violet-300 font-medium">{currentAiMessage}</span>
            </div>
            {/* Activity log */}
            <div className="h-40 overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: "thin" }}>
              {(labState?.log ?? []).length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">
                  Log aktivitas akan muncul saat training dimulai
                </div>
              ) : (
                (labState?.log ?? []).map((msg, i) => (
                  <div key={i} className={`text-xs px-2 py-1 rounded flex items-start gap-1.5 ${
                    i === 0 ? "bg-slate-700/50 text-slate-200" : "text-muted-foreground"
                  }`}>
                    <span className="text-violet-400 shrink-0">›</span>
                    {msg}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </CardContent>
        </Card>

        {/* Ringkasan */}
        <div className="space-y-3">
          <Card className="border-slate-700/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Win Rate Terbaik</span>
                <Award className="w-3.5 h-3.5 text-yellow-400" />
              </div>
              <div className="text-2xl font-bold text-yellow-400">
                {labState?.summary.bestWinRate ? `${labState.summary.bestWinRate}%` : "—"}
              </div>
              {labState?.bestStrategy && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{labState.bestStrategy.label}</p>
              )}
            </CardContent>
          </Card>
          <Card className="border-slate-700/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Sharpe Ratio Terbaik</span>
                <Gauge className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-2xl font-bold text-blue-400">
                {labState?.summary.bestSharpe ? labState.summary.bestSharpe.toFixed(2) : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Risk-adjusted return</p>
            </CardContent>
          </Card>
          <Card className="border-slate-700/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Total Trade Simulasi</span>
                <Activity className="w-3.5 h-3.5 text-green-400" />
              </div>
              <div className="text-2xl font-bold text-green-400">
                {labState?.summary.totalTrades?.toLocaleString() ?? "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {labState?.summary.totalBacktested ?? 0} backtest selesai
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["overview", "strategi", "hasil", "konfigurasi"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-violet-500 text-violet-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "overview" ? "Overview" : tab === "strategi" ? "Perbandingan Strategi" : tab === "hasil" ? "Hasil Detail" : "Konfigurasi"}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {aggregated.length === 0 ? (
            <Card className="border-dashed border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <FlaskConical className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">Belum ada data training. Klik "Mulai Training" untuk memulai.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Win Rate Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart className="w-4 h-4 text-violet-400" />
                    Win Rate per Strategi
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <RechartsBar data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} domain={[0, 100]} unit="%" />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                        formatter={(val: number, name: string) => {
                          if (name === "winRate") return [`${val}%`, "Win Rate"];
                          return [val, name];
                        }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ""}
                      />
                      <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                        {barData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.winRate >= 65 ? "#22c55e" : entry.winRate >= 55 ? "#f59e0b" : "#ef4444"}
                          />
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
                      Perbandingan Multi-Dimensi (Top 5)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#334155" />
                        <PolarAngleAxis dataKey="strategy" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                        <RechartsRadar name="Win Rate" dataKey="Win Rate" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} />
                        <RechartsRadar name="Sharpe×10" dataKey="Sharpe×10" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
                        <RechartsRadar name="PF×20" dataKey="Prof.Factor×20" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Perbandingan Strategi */}
      {activeTab === "strategi" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Urutkan:</span>
            {(["winRate","sharpe","pf"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  sortBy === s ? "bg-violet-600 text-white" : "bg-slate-700 text-muted-foreground hover:bg-slate-600"
                }`}
              >
                {s === "winRate" ? "Win Rate" : s === "sharpe" ? "Sharpe Ratio" : "Profit Factor"}
              </button>
            ))}
          </div>

          {aggregated.length === 0 ? (
            <Card className="border-dashed border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Brain className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Belum ada data perbandingan. Jalankan training terlebih dahulu.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {aggregated.map((s, i) => (
                <Card key={s.key} className={`border-slate-700/50 ${i === 0 ? "ring-1 ring-violet-500/40" : ""}`}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {i === 0 && <Award className="w-4 h-4 text-yellow-400 shrink-0" />}
                        <div>
                          <div className="text-sm font-semibold flex items-center gap-1">
                            #{i + 1} {s.label}
                          </div>
                          <div className="text-xs text-muted-foreground">{s.trades} total trade diuji</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="text-center">
                          <div className={`text-lg font-bold ${s.winRate >= 65 ? "text-green-400" : s.winRate >= 55 ? "text-yellow-400" : "text-red-400"}`}>
                            {s.winRate}%
                          </div>
                          <div className="text-xs text-muted-foreground">Win Rate</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-lg font-bold ${s.sharpe >= 1.5 ? "text-green-400" : s.sharpe >= 0.5 ? "text-yellow-400" : "text-slate-400"}`}>
                            {s.sharpe.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">Sharpe</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-lg font-bold ${s.pf >= 2 ? "text-green-400" : s.pf >= 1.2 ? "text-yellow-400" : "text-red-400"}`}>
                            {s.pf.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">Prof. Factor</div>
                        </div>
                      </div>
                    </div>
                    {/* Win rate bar */}
                    <div className="mt-2 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${s.winRate >= 65 ? "bg-green-400" : s.winRate >= 55 ? "bg-yellow-400" : "bg-red-400"}`}
                        style={{ width: `${s.winRate}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Hasil Detail */}
      {activeTab === "hasil" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Urutkan:</span>
            {(["winRate","sharpe","pf"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  sortBy === s ? "bg-violet-600 text-white" : "bg-slate-700 text-muted-foreground hover:bg-slate-600"
                }`}
              >
                {s === "winRate" ? "Win Rate" : s === "sharpe" ? "Sharpe" : "Profit Factor"}
              </button>
            ))}
          </div>

          {detailedResults.length === 0 ? (
            <Card className="border-dashed border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <BookOpen className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Belum ada hasil detail. Jalankan training terlebih dahulu.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-700">
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
                    <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">MaxDD</th>
                  </tr>
                </thead>
                <tbody>
                  {detailedResults.map((r, i) => (
                    <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-2 font-mono font-semibold text-xs">{r.symbol.replace("USDT", "/USDT")}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate">{r.strategyLabel}</td>
                      <td className="px-3 py-2 text-right text-xs">{r.totalTrades}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-xs font-bold ${r.winRate >= 65 ? "text-green-400" : r.winRate >= 55 ? "text-yellow-400" : "text-red-400"}`}>
                          {r.winRate}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-xs font-bold ${r.sharpeRatio >= 1 ? "text-blue-400" : r.sharpeRatio >= 0 ? "text-slate-300" : "text-red-400"}`}>
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
                      <td className="px-3 py-2 text-right">
                        <span className="text-xs text-red-400">-{Math.abs(r.maxDrawdown).toFixed(1)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Konfigurasi */}
      {activeTab === "konfigurasi" && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pair Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="w-4 h-4 text-violet-400" />
                Pilih Pair ({selectedPairs.length} dipilih)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {ALL_PAIRS.map(p => (
                  <button
                    key={p}
                    onClick={() => togglePair(p)}
                    disabled={isRunning}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                      selectedPairs.includes(p)
                        ? "bg-violet-600/30 text-violet-300 border border-violet-500/40"
                        : "bg-slate-800 text-muted-foreground border border-slate-700 hover:bg-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{p.replace("USDT", "/USDT")}</span>
                      {selectedPairs.includes(p) && <CheckCircle2 className="w-3 h-3" />}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => setSelectedPairs(ALL_PAIRS)} disabled={isRunning}>
                  Pilih Semua
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => setSelectedPairs([])} disabled={isRunning}>
                  Hapus Semua
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Strategy Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4 text-violet-400" />
                Pilih Strategi ({selectedStrategies.length} dipilih)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {ALL_STRATEGIES.map(s => (
                  <button
                    key={s.key}
                    onClick={() => toggleStrategy(s.key)}
                    disabled={isRunning}
                    className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                      selectedStrategies.includes(s.key)
                        ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                        : "bg-slate-800 text-muted-foreground border border-slate-700 hover:bg-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{s.label}</span>
                      {selectedStrategies.includes(s.key) && <CheckCircle2 className="w-3 h-3" />}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => setSelectedStrategies(ALL_STRATEGIES.map(s => s.key))} disabled={isRunning}>
                  Pilih Semua
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => setSelectedStrategies([])} disabled={isRunning}>
                  Hapus Semua
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="md:col-span-2 border-slate-700/50 bg-slate-800/30">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><strong className="text-foreground">Cara kerja:</strong> AI mengambil 300 kline historis (5m) dari Bybit untuk setiap pair yang dipilih, kemudian mensimulasikan strategi trading yang berbeda pada data tersebut.</p>
                  <p><strong className="text-foreground">Metrik:</strong> Setiap backtest menggunakan TP +1.5% / SL -0.75% (RR 2:1). Sharpe ratio diannualisasi menggunakan faktor sqrt(4320).</p>
                  <p><strong className="text-foreground">Estimasi waktu:</strong> ~{Math.ceil((selectedPairs.length * selectedStrategies.length * 0.3) / 60 * 10) / 10} menit untuk konfigurasi saat ini ({selectedPairs.length} pair × {selectedStrategies.length} strategi).</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
