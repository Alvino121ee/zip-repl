import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, Brain, TrendingDown, BarChart2, RefreshCw,
  Target, Zap, ChevronDown, ChevronRight, Clock, Shield,
  Activity, AlertCircle, BookOpen, Sparkles, Eye,
  TrendingUp, XCircle, Award, Cpu, Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie, Legend,
} from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

type FailureCause = string;
type Severity = "minor" | "moderate" | "major";

interface SLFailureRecord {
  id: string;
  timestamp: number;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  slPrice: number;
  exitPrice: number;
  pnlPct: number;
  confidence: number;
  strategy: string;
  marketCondition: string;
  holdTimeMs: number;
  primaryCause: FailureCause;
  secondaryCauses: FailureCause[];
  conclusion: string;
  recommendations: string[];
  severity: Severity;
  slTightnessPct: number;
}

interface FailurePattern {
  id: string;
  pattern: string;
  description: string;
  occurrences: number;
  primaryCause: FailureCause;
  associatedStrategies: string[];
  associatedConditions: string[];
  avgPnlPct: number;
  recommendation: string;
  severity: "low" | "medium" | "high" | "critical";
  firstSeen: number;
  lastSeen: number;
}

interface SLStats {
  totalStopLosses: number;
  mostCommonCauses: { cause: string; label: string; count: number; pct: number }[];
  worstStrategies: { strategy: string; slCount: number; avgPnlPct: number }[];
  worstConditions: { condition: string; slCount: number }[];
  patterns: FailurePattern[];
  improvementScore: number;
  recentAnalyses: SLFailureRecord[];
  severityBreakdown: { minor: number; moderate: number; major: number };
  avgHoldTimeMs: number;
  avgConfidenceOnSL: number;
  overconfidenceRate: number;
}

const CAUSE_ICONS: Record<string, string> = {
  wrong_trend: "📉",
  fake_breakout: "🎭",
  weak_momentum: "⚡",
  low_volume: "📊",
  late_entry: "⏰",
  early_entry: "🏃",
  incorrect_sl_placement: "🎯",
  market_manipulation: "🐋",
  liquidity_sweep_trap: "🪤",
  volatility_spike: "💥",
  news_impact: "📰",
  choppy_market: "🌊",
  weak_orderflow: "🔄",
  poor_risk_reward: "⚖️",
  mtf_conflict: "🕐",
  overconfidence: "😤",
  low_quality_setup: "⬇️",
  unknown: "❓",
};

const SEVERITY_COLORS: Record<Severity, string> = {
  minor: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  moderate: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  major: "text-red-400 bg-red-400/10 border-red-400/30",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  minor: "Minor",
  moderate: "Sedang",
  major: "Major",
};

const PATTERN_SEVERITY_COLORS = {
  low: "border-slate-500/30 bg-slate-500/5",
  medium: "border-yellow-500/30 bg-yellow-500/5",
  high: "border-orange-500/30 bg-orange-500/5",
  critical: "border-red-500/30 bg-red-500/10",
};

const CHART_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#3b82f6",
];

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}d`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}j`;
}

// ─── SL Failure Card ──────────────────────────────────────────────────────────

function SLFailureCard({ record }: { record: SLFailureRecord }) {
  const [expanded, setExpanded] = useState(false);
  const icon = CAUSE_ICONS[record.primaryCause] ?? "❓";

  return (
    <div
      className={`rounded-lg border p-3 transition-all cursor-pointer ${SEVERITY_COLORS[record.severity]}`}
      onClick={() => setExpanded(v => !v)}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-bold text-sm">{record.symbol.replace("USDT", "/USDT")}</span>
              <Badge variant="outline" className={`text-xs py-0 px-1.5 ${record.side === "long" ? "border-green-500/40 text-green-400" : "border-red-500/40 text-red-400"}`}>
                {record.side === "long" ? "LONG" : "SHORT"}
              </Badge>
              <Badge variant="outline" className={`text-xs py-0 px-1.5 ${SEVERITY_COLORS[record.severity]}`}>
                {SEVERITY_LABELS[record.severity]}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {new Date(record.timestamp).toLocaleString("id-ID")} · {formatDuration(record.holdTimeMs)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-bold text-red-400">{record.pnlPct.toFixed(2)}%</div>
            <div className="text-xs text-muted-foreground">PnL</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{record.confidence}%</div>
            <div className="text-xs text-muted-foreground">Conf.</div>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-current/20 pt-3">
          {/* Trade params */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Entry:</span>
              <span className="font-mono ml-1">${record.entryPrice.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">SL:</span>
              <span className="font-mono ml-1 text-red-400">${record.slPrice.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">SL Jarak:</span>
              <span className="font-mono ml-1">{record.slTightnessPct.toFixed(2)}%</span>
            </div>
            <div>
              <span className="text-muted-foreground">Kondisi:</span>
              <span className="ml-1 capitalize">{record.marketCondition}</span>
            </div>
          </div>

          {/* Primary cause */}
          <div className="rounded-md p-2.5 bg-black/20">
            <div className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              SEBAB UTAMA
            </div>
            <div className="text-sm font-medium">{icon} {record.primaryCause.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</div>
            {record.secondaryCauses.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {record.secondaryCauses.map(c => (
                  <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-muted-foreground">
                    {CAUSE_ICONS[c]} {c.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* AI Conclusion */}
          <div className="rounded-md p-2.5 bg-blue-500/5 border border-blue-500/20">
            <div className="text-xs font-semibold text-blue-400 mb-1 flex items-center gap-1">
              <Brain className="w-3 h-3" />
              KESIMPULAN AI
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{record.conclusion}</p>
          </div>

          {/* Recommendations */}
          {record.recommendations.length > 0 && (
            <div className="rounded-md p-2.5 bg-green-500/5 border border-green-500/20">
              <div className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                REKOMENDASI PERBAIKAN
              </div>
              <ul className="space-y-1">
                {record.recommendations.map((rec, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                    <ChevronRight className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pattern Alert ────────────────────────────────────────────────────────────

function PatternAlert({ pattern }: { pattern: FailurePattern }) {
  const icon = CAUSE_ICONS[pattern.primaryCause] ?? "❓";
  const severityLabel = { low: "Rendah", medium: "Sedang", high: "Tinggi", critical: "Kritis" };
  const severityBadgeClass = {
    low: "border-slate-500/40 text-slate-400",
    medium: "border-yellow-500/40 text-yellow-400",
    high: "border-orange-500/40 text-orange-400",
    critical: "border-red-500/40 text-red-400",
  };

  return (
    <div className={`rounded-lg border p-3 ${PATTERN_SEVERITY_COLORS[pattern.severity]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold">{pattern.pattern}</span>
              <Badge variant="outline" className={`text-xs py-0 ${severityBadgeClass[pattern.severity]}`}>
                {severityLabel[pattern.severity]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{pattern.description}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-red-400">{pattern.occurrences}×</div>
          <div className="text-xs text-muted-foreground">kejadian</div>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-current/20 flex items-start gap-1.5">
        <ChevronRight className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
        <p className="text-xs text-green-300">{pattern.recommendation}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StopLossAnalysis() {
  const { toast } = useToast();
  const [stats, setStats] = useState<SLStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "records" | "patterns" | "strategi">("overview");
  const [filterSeverity, setFilterSeverity] = useState<Severity | "all">("all");

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/sl-analysis/stats`);
      if (res.ok) setStats(await res.json());
    } catch {
      toast({ title: "Gagal memuat data SL Analysis", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 30_000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  const filteredRecords = (stats?.recentAnalyses ?? []).filter(
    r => filterSeverity === "all" || r.severity === filterSeverity
  );

  const pieData = (stats?.mostCommonCauses ?? []).slice(0, 6).map((c, i) => ({
    name: c.label.length > 18 ? c.label.slice(0, 18) + "…" : c.label,
    fullLabel: c.label,
    value: c.count,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const barData = (stats?.mostCommonCauses ?? []).slice(0, 8).map((c, i) => ({
    name: c.label.split(" ").slice(0, 2).join(" "),
    fullLabel: c.label,
    count: c.count,
    pct: c.pct,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Memuat analisis Stop Loss...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/20">
            <TrendingDown className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Stop Loss Failure Analysis</h1>
            <p className="text-sm text-muted-foreground">AI belajar dari setiap kesalahan untuk trading yang lebih baik</p>
          </div>
        </div>
        <Button onClick={fetchStats} variant="outline" size="sm">
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Total Stop Loss</span>
              <XCircle className="w-3.5 h-3.5 text-red-400" />
            </div>
            <div className="text-2xl font-bold text-red-400">{stats?.totalStopLosses ?? 0}</div>
            <div className="flex gap-1.5 mt-1 text-xs">
              <span className="text-yellow-400">{stats?.severityBreakdown.minor ?? 0} minor</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-orange-400">{stats?.severityBreakdown.moderate ?? 0} sedang</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-red-400">{stats?.severityBreakdown.major ?? 0} major</span>
            </div>
          </CardContent>
        </Card>

        <Card className={`${(stats?.improvementScore ?? 50) >= 70 ? "border-green-500/20 bg-green-500/5" : "border-orange-500/20 bg-orange-500/5"}`}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Improvement Score</span>
              <TrendingUp className={`w-3.5 h-3.5 ${(stats?.improvementScore ?? 50) >= 70 ? "text-green-400" : "text-orange-400"}`} />
            </div>
            <div className={`text-2xl font-bold ${(stats?.improvementScore ?? 50) >= 70 ? "text-green-400" : "text-orange-400"}`}>
              {stats?.improvementScore ?? 0}/100
            </div>
            <Progress
              value={stats?.improvementScore ?? 0}
              className="h-1.5 mt-2"
            />
          </CardContent>
        </Card>

        <Card className="border-slate-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Avg Confidence saat SL</span>
              <Brain className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-blue-400">{stats?.avgConfidenceOnSL ?? 0}%</div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats?.overconfidenceRate ?? 0}% kasus overconfidence
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Avg Hold Time</span>
              <Clock className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="text-2xl font-bold text-violet-400">
              {formatDuration(stats?.avgHoldTimeMs ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">sebelum kena SL</div>
          </CardContent>
        </Card>
      </div>

      {/* Pattern Alerts — show critical/high only */}
      {(stats?.patterns ?? []).filter(p => p.severity === "critical" || p.severity === "high").length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
            <AlertTriangle className="w-4 h-4" />
            Pola Berulang Terdeteksi — Perlu Perhatian Segera
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            {(stats?.patterns ?? [])
              .filter(p => p.severity === "critical" || p.severity === "high")
              .slice(0, 4)
              .map(p => <PatternAlert key={p.id} pattern={p} />)}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(["overview", "records", "patterns", "strategi"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-red-500 text-red-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "overview" ? "Analisis Visual" :
             tab === "records" ? `Riwayat SL (${stats?.totalStopLosses ?? 0})` :
             tab === "patterns" ? `Pola Berulang (${stats?.patterns.length ?? 0})` :
             "Strategi Terburuk"}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {stats?.totalStopLosses === 0 ? (
            <Card className="border-dashed border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <Shield className="w-12 h-12 text-muted-foreground" />
                <div className="text-center">
                  <p className="font-medium">Belum ada data Stop Loss</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Analisis akan otomatis muncul setiap kali demo trading kena SL
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Bar chart — cause frequency */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-red-400" />
                    Frekuensi Penyebab SL
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} width={90} />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                        formatter={(val: number, _: string, props: any) => [
                          `${val}× (${props.payload.pct}%)`,
                          props.payload.fullLabel,
                        ]}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Right side: severity + worst conditions */}
              <div className="space-y-4">
                {/* Severity breakdown */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-400" />
                      Breakdown Severity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { key: "major", label: "Major", color: "bg-red-400", cls: "text-red-400" },
                      { key: "moderate", label: "Sedang", color: "bg-orange-400", cls: "text-orange-400" },
                      { key: "minor", label: "Minor", color: "bg-yellow-400", cls: "text-yellow-400" },
                    ].map(s => {
                      const count = stats?.severityBreakdown[s.key as Severity] ?? 0;
                      const pct = stats?.totalStopLosses ? (count / stats.totalStopLosses) * 100 : 0;
                      return (
                        <div key={s.key} className="space-y-0.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className={s.cls}>{s.label}</span>
                            <span className="font-mono">{count} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                            <div className={`h-full rounded-full ${s.color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Worst conditions */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="w-4 h-4 text-red-400" />
                      Kondisi Pasar Terburuk
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(stats?.worstConditions ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Belum ada data</p>
                    ) : (
                      <div className="space-y-1.5">
                        {(stats?.worstConditions ?? []).slice(0, 5).map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground capitalize">{c.condition}</span>
                            <Badge variant="outline" className="text-xs py-0 border-red-500/30 text-red-400">
                              {c.slCount}× SL
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Records */}
      {activeTab === "records" && (
        <div className="space-y-3">
          {/* Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter severity:</span>
            {(["all", "major", "moderate", "minor"] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterSeverity === s
                    ? "bg-red-600 text-white"
                    : "bg-slate-700 text-muted-foreground hover:bg-slate-600"
                }`}
              >
                {s === "all" ? "Semua" : SEVERITY_LABELS[s]}
              </button>
            ))}
          </div>

          {filteredRecords.length === 0 ? (
            <Card className="border-dashed border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <BookOpen className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {stats?.totalStopLosses === 0
                    ? "Belum ada riwayat Stop Loss. Data akan muncul otomatis dari demo trading."
                    : "Tidak ada riwayat dengan filter ini."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredRecords.map(r => <SLFailureCard key={r.id} record={r} />)}
            </div>
          )}
        </div>
      )}

      {/* Tab: Patterns */}
      {activeTab === "patterns" && (
        <div className="space-y-3">
          {(stats?.patterns ?? []).length === 0 ? (
            <Card className="border-dashed border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Cpu className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Pola berulang akan terdeteksi setelah minimal 3 SL dengan penyebab yang sama dalam 7 hari.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                AI mendeteksi <strong className="text-foreground">{stats?.patterns.length}</strong> pola kegagalan berulang.
                Pola kritis memerlukan penyesuaian strategi segera.
              </p>
              <div className="space-y-2">
                {(stats?.patterns ?? []).map(p => <PatternAlert key={p.id} pattern={p} />)}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Strategi Terburuk */}
      {activeTab === "strategi" && (
        <div className="space-y-4">
          {(stats?.worstStrategies ?? []).length === 0 ? (
            <Card className="border-dashed border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Activity className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Belum ada data strategi.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Strategi yang paling sering menyebabkan Stop Loss. AI akan secara otomatis
                mengurangi bobot strategi dengan performa buruk.
              </p>
              <div className="space-y-2">
                {(stats?.worstStrategies ?? []).map((s, i) => (
                  <Card key={i} className="border-slate-700/50">
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            i === 0 ? "bg-red-500/20 text-red-400" :
                            i === 1 ? "bg-orange-500/20 text-orange-400" : "bg-slate-700 text-muted-foreground"
                          }`}>{i + 1}</div>
                          <div>
                            <div className="text-sm font-medium capitalize">{s.strategy.replace(/_/g, " ")}</div>
                            <div className="text-xs text-muted-foreground">{s.slCount} kali kena SL</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-bold text-red-400">{s.avgPnlPct.toFixed(2)}%</div>
                            <div className="text-xs text-muted-foreground">Avg PnL</div>
                          </div>
                          <Badge
                            variant="outline"
                            className={`${i === 0 ? "border-red-500/40 text-red-400" : "border-orange-500/30 text-orange-400"}`}
                          >
                            {i === 0 ? "Perlu Evaluasi" : i <= 2 ? "Perlu Pantau" : "Oke"}
                          </Badge>
                        </div>
                      </div>
                      {/* SL frequency bar */}
                      <div className="mt-2 h-1 rounded-full bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-400"
                          style={{
                            width: `${Math.min(100, (s.slCount / ((stats?.totalStopLosses || 1))) * 100)}%`,
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* AI Learning Note */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Brain className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-300">Cara AI Belajar dari Stop Loss</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Setiap kali demo trading kena Stop Loss, sistem otomatis menganalisis penyebab kegagalan,
                memperbarui bobot indikator di AI Brain, dan menyimpan pola kesalahan secara permanen.
                Improvement Score naik saat AI berhasil menghindari pola yang sama,
                dan turun saat kesalahan berulang terjadi. Tujuan akhir: AI yang semakin selektif
                dan akurat dalam memilih setup berkualitas tinggi.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
