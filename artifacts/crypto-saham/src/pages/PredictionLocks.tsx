import React, { useState, useEffect } from "react";
import {
  Lock, Trophy, TrendingUp, TrendingDown, Minus,
  Clock, Brain, Target, Zap, RefreshCw, Trash2, CheckCircle,
  BarChart2, Activity, BookOpen, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LockedPrediction {
  id: string;
  assetId: string;
  assetName: string;
  assetType: "crypto" | "stock";
  symbol: string;
  image: string | null;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  lockedAt: number;
  lockDurationMs: number;
  expiresAt: number;
  confidence: number;
  signal: string;
  reasoning: string[];
  strategy: string;
  status: "active" | "validated" | "expired";
  result: "WIN" | "LOSS" | "NEUTRAL" | null;
  finalPrice: number | null;
  priceDeltaPct: number | null;
  virtualPnl: number | null;
  maxDrawdown: number | null;
  marketVolatility: string | null;
  validatedAt: number | null;
  aiLearning: string | null;
}

interface LockStats {
  total: number;
  active: number;
  wins: number;
  losses: number;
  neutrals: number;
  winRate: number;
  totalVirtualPnl: number;
  avgConfidence: number;
  bestStreak: number;
  currentStreak: number;
  avgPnlOnWin: number;
  avgPnlOnLoss: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, "0")}s`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const m = ms / 60000;
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${m / 60}h`;
  return `${m / 1440}d`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

// ─── Countdown component ──────────────────────────────────────────────────────

function Countdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = expiresAt - now;
  if (remaining <= 0) return <span className="text-yellow-400 text-xs font-mono">Menunggu validasi...</span>;
  return <span className="text-primary text-xs font-mono font-bold tabular-nums">{formatCountdown(remaining)}</span>;
}

// ─── Result badge ─────────────────────────────────────────────────────────────

function ResultBadge({ result }: { result: "WIN" | "LOSS" | "NEUTRAL" | null }) {
  if (!result) return <Badge variant="outline" className="text-xs">Active</Badge>;
  if (result === "WIN") return (
    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs gap-1">
      <Trophy className="h-3 w-3" /> WIN
    </Badge>
  );
  if (result === "LOSS") return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs gap-1">
      <TrendingDown className="h-3 w-3" /> LOSS
    </Badge>
  );
  return (
    <Badge className="bg-muted text-muted-foreground text-xs gap-1">
      <Minus className="h-3 w-3" /> NEUTRAL
    </Badge>
  );
}

// ─── Direction badge ──────────────────────────────────────────────────────────

function DirectionBadge({ direction }: { direction: "LONG" | "SHORT" }) {
  return direction === "LONG" ? (
    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs gap-1">
      <TrendingUp className="h-3 w-3" /> LONG
    </Badge>
  ) : (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs gap-1">
      <TrendingDown className="h-3 w-3" /> SHORT
    </Badge>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color = "text-foreground" }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Lock card ────────────────────────────────────────────────────────────────

function LockCard({ lock, onValidate, onDelete }: {
  lock: LockedPrediction;
  onValidate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [validating, setValidating] = useState(false);
  const pnlColor = (lock.virtualPnl ?? 0) >= 0 ? "text-green-400" : "text-red-400";
  const isActive = lock.status === "active";
  const progressPct = isActive
    ? Math.min(100, ((Date.now() - lock.lockedAt) / lock.lockDurationMs) * 100)
    : 100;

  async function handleValidate() {
    setValidating(true);
    onValidate(lock.id);
    setTimeout(() => setValidating(false), 3000);
  }

  return (
    <Card className={`transition-all border ${
      lock.result === "WIN" ? "border-green-500/30" :
      lock.result === "LOSS" ? "border-red-500/30" :
      isActive ? "border-primary/30" : "border-border"
    }`}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {lock.image ? (
              <img src={lock.image} alt={lock.assetName} className="w-8 h-8 rounded-full bg-muted shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                {lock.symbol.replace(".JK", "").slice(0, 3)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{lock.assetName}</p>
              <p className="text-xs text-muted-foreground">{lock.symbol} · {lock.assetType === "crypto" ? "Crypto" : "IDX"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <DirectionBadge direction={lock.direction} />
            <ResultBadge result={lock.result} />
          </div>
        </div>

        {/* Progress bar (active only) */}
        {isActive && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatDuration(lock.lockDurationMs)} lock
              </span>
              <Countdown expiresAt={lock.expiresAt} />
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div className="bg-primary h-1.5 rounded-full transition-all duration-1000" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {/* Prices */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-muted/30 rounded-lg p-2">
            <p className="text-muted-foreground">Entry Price</p>
            <p className="font-bold tabular-nums">
              {formatCurrency(lock.entryPrice, lock.assetType === "stock" ? "IDR" : "USD")}
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg p-2">
            <p className="text-muted-foreground">{lock.finalPrice ? "Final Price" : "Locked"}</p>
            <p className="font-bold tabular-nums">
              {lock.finalPrice
                ? formatCurrency(lock.finalPrice, lock.assetType === "stock" ? "IDR" : "USD")
                : timeAgo(lock.lockedAt)}
            </p>
          </div>
        </div>

        {/* Result row */}
        {lock.result && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <p className="text-muted-foreground">Perubahan</p>
              <p className={`font-bold ${(lock.priceDeltaPct ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {(lock.priceDeltaPct ?? 0) >= 0 ? "+" : ""}{(lock.priceDeltaPct ?? 0).toFixed(2)}%
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <p className="text-muted-foreground">Virtual PnL</p>
              <p className={`font-bold ${pnlColor}`}>
                {(lock.virtualPnl ?? 0) >= 0 ? "+" : ""}{(lock.virtualPnl ?? 0).toFixed(2)}%
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <p className="text-muted-foreground">Volatilitas</p>
              <p className="font-bold capitalize">{lock.marketVolatility ?? "–"}</p>
            </div>
          </div>
        )}

        {/* Confidence bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Confidence</span>
            <span className="font-bold">{lock.confidence}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${lock.confidence >= 70 ? "bg-green-500" : lock.confidence >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
              style={{ width: `${lock.confidence}%` }}
            />
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-xs text-muted-foreground flex items-center justify-center gap-1 hover:text-foreground transition-colors"
        >
          {expanded ? <><ChevronUp className="h-3 w-3" /> Sembunyikan detail</> : <><ChevronDown className="h-3 w-3" /> Lihat reasoning & AI learning</>}
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="space-y-2 border-t border-border pt-2">
            {lock.reasoning.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> Reasoning
                </p>
                <ul className="space-y-1">
                  {lock.reasoning.slice(0, 4).map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-primary shrink-0">•</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lock.aiLearning && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                  <Brain className="h-3 w-3" /> AI Self-Learning
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{lock.aiLearning}</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {(isActive || lock.status === "expired") && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs gap-1"
              onClick={handleValidate}
              disabled={validating}
            >
              {validating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              {validating ? "Memvalidasi..." : "Validasi Sekarang"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
            onClick={() => onDelete(lock.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PredictionLocks() {
  const [locks, setLocks] = useState<LockedPrediction[]>([]);
  const [stats, setStats] = useState<LockStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "validated">("all");
  const [refreshAt, setRefreshAt] = useState(Date.now());

  async function fetchData() {
    try {
      const [locksRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/prediction-locks`),
        fetch(`${API_BASE}/api/prediction-locks/stats`),
      ]);
      if (locksRes.ok) setLocks(await locksRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error("Failed to fetch prediction locks:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [refreshAt]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => setRefreshAt(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleValidate(id: string) {
    try {
      await fetch(`${API_BASE}/api/prediction-locks/${id}/validate`, { method: "POST" });
      setTimeout(() => setRefreshAt(Date.now()), 2000);
    } catch (err) {
      console.error("Validation failed:", err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`${API_BASE}/api/prediction-locks/${id}`, { method: "DELETE" });
      setLocks((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  const filtered = locks.filter((l) => {
    if (filter === "active") return l.status === "active" || l.status === "expired";
    if (filter === "validated") return l.status === "validated";
    return true;
  });

  const activeCount = locks.filter((l) => l.status === "active").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Lock className="h-6 w-6 text-primary" />
            Prediction Lock System
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Lock prediksi, validasi otomatis, dan AI self-learning dari setiap hasil
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshAt(Date.now())} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Prediksi" value={String(stats.total)} icon={Target} />
          <StatCard label="Active" value={String(stats.active)} icon={Clock} color="text-primary" />
          <StatCard
            label="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            sub={`${stats.wins}W / ${stats.losses}L`}
            icon={Trophy}
            color={stats.winRate >= 60 ? "text-green-400" : stats.winRate >= 45 ? "text-yellow-400" : "text-red-400"}
          />
          <StatCard
            label="Virtual PnL"
            value={`${stats.totalVirtualPnl >= 0 ? "+" : ""}${stats.totalVirtualPnl.toFixed(2)}%`}
            icon={BarChart2}
            color={stats.totalVirtualPnl >= 0 ? "text-green-400" : "text-red-400"}
          />
          <StatCard
            label="Avg Confidence"
            value={`${stats.avgConfidence.toFixed(0)}%`}
            icon={Activity}
            color={stats.avgConfidence >= 70 ? "text-green-400" : "text-yellow-400"}
          />
          <StatCard
            label="Best Streak"
            value={String(stats.bestStreak)}
            sub={`Current: ${stats.currentStreak}`}
            icon={Zap}
            color="text-yellow-400"
          />
        </div>
      )}

      {/* Win/Loss breakdown */}
      {stats && stats.total > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Performance Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                <p className="text-2xl font-bold text-green-400">{stats.wins}</p>
                <p className="text-xs text-muted-foreground">Wins</p>
                <p className="text-xs text-green-400 mt-0.5">+{stats.avgPnlOnWin.toFixed(2)}% avg</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-2xl font-bold text-red-400">{stats.losses}</p>
                <p className="text-xs text-muted-foreground">Losses</p>
                <p className="text-xs text-red-400 mt-0.5">{stats.avgPnlOnLoss.toFixed(2)}% avg</p>
              </div>
              <div className="bg-muted/30 border border-border rounded-lg p-3">
                <p className="text-2xl font-bold text-muted-foreground">{stats.neutrals}</p>
                <p className="text-xs text-muted-foreground">Neutrals</p>
                <p className="text-xs text-muted-foreground mt-0.5">&lt;0.3% movement</p>
              </div>
            </div>
            {/* Win rate bar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-green-400">Win {stats.winRate.toFixed(1)}%</span>
                <span className="text-red-400">Loss {stats.losses > 0 ? ((stats.losses / (stats.wins + stats.losses + stats.neutrals)) * 100).toFixed(1) : 0}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden flex">
                <div className="bg-green-500 h-full" style={{ width: `${stats.winRate}%` }} />
                <div className="bg-muted-foreground/20 h-full" style={{ width: `${stats.neutrals / Math.max(1, stats.total) * 100}%` }} />
                <div className="bg-red-500 h-full flex-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "active", "validated"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? `Semua (${locks.length})` : f === "active" ? `Active (${activeCount})` : `History (${locks.filter(l => l.status === "validated").length})`}
          </button>
        ))}
      </div>

      {/* Lock cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-4 h-48 animate-pulse bg-muted/20" /></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <Lock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">Belum ada prediksi terkunci</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Buka halaman Predictions dan klik tombol "Lock" pada prediction card
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((lock) => (
            <LockCard
              key={lock.id}
              lock={lock}
              onValidate={handleValidate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
