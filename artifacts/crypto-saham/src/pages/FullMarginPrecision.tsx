import React, { useState, useEffect, useCallback } from "react";
import {
  Target, Zap, ShieldCheck, Brain, Activity, Power, RefreshCw,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle,
  Clock, BarChart2, Award, Loader2, ChevronDown, ChevronUp,
  Crosshair, FlameKindling, BookOpen, Gauge, Lock, Radar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { ActivityFeed } from "@/components/shared/ActivityFeed";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

interface FMPConfig {
  enabled: boolean;
  minConfidence: number;
  marginPct: number;
  maxLeverage: number;
  minRR: number;
  stopLossPct: number;
  takeProfitPct: number;
  cooldownMinutes: number;
  dailyLossLimitPct: number;
  consecutiveLossLimit: number;
  volatilityThreshold: number;
  scanIntervalMs: number;
  positionMonitorMs: number;
}

interface FMPBestSetup {
  symbol: string;
  side: "Buy" | "Sell";
  confidence: number;
  rr: number;
  score: number;
  grade: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  reasons: string[];
  warnings: string[];
  trendStrength: number;
  volumeRatio: number;
  momentum: string;
  marketStructure: string;
  multiTfAlignment: number;
  detectedAt: number;
}

interface FMPActivePosition {
  symbol: string;
  side: "Buy" | "Sell";
  entryPrice: number;
  size: number;
  allocatedUSDT: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  openedAt: number;
  peakPnl: number;
  currentPnl: number;
  lastMonitorAt: number;
  trailActive: boolean;
  trailPeak: number;
}

interface FMPStatus {
  running: boolean;
  analyzing: boolean;
  statusMessage: string;
  statusPhase: "idle" | "scanning" | "analyzing" | "waiting" | "entering" | "monitoring" | "exiting" | "cooldown" | "danger" | "disabled";
  activePosition: FMPActivePosition | null;
  bestSetup: FMPBestSetup | null;
  cooldown: boolean;
  cooldownUntil: number | null;
  consecutiveLosses: number;
  dailyLoss: number;
  dailyTrades: number;
  dailyDate: string;
  totalScanned: number;
  lastScanAt: number | null;
  lastCycleAt: number | null;
  nextCycleAt: number | null;
  cycleCount: number;
  totalWins: number;
  totalLosses: number;
  lastError: string | null;
  dangerMode: boolean;
  dangerReason: string | null;
}

interface FMPTradeLog {
  id: string;
  symbol: string;
  side: "Buy" | "Sell";
  entryPrice: number;
  exitPrice: number;
  size: number;
  allocatedUSDT: number;
  leverage: number;
  pnl: number;
  pnlPct: number;
  confidence: number;
  rr: number;
  openedAt: number;
  closedAt: number;
  closeReason: string;
  grade: string;
  learningNote: string;
  outcome: "win" | "loss" | "breakeven";
}

interface FMPLearning {
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  bestTrade: FMPTradeLog | null;
  worstTrade: FMPTradeLog | null;
  avgConfidenceOnWins: number;
  avgConfidenceOnLosses: number;
  avgRROnWins: number;
  gradeAccuracy: { A: number; B: number; C: number };
  lessons: string[];
  lastUpdated: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}d`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}d`;
  const h = Math.floor(m / 60);
  return `${h}j ${m % 60}m`;
}

const PHASE_COLORS: Record<FMPStatus["statusPhase"], string> = {
  idle: "text-muted-foreground",
  scanning: "text-blue-400",
  analyzing: "text-yellow-400",
  waiting: "text-orange-400",
  entering: "text-green-400",
  monitoring: "text-cyan-400",
  exiting: "text-violet-400",
  cooldown: "text-red-400",
  danger: "text-red-500",
  disabled: "text-muted-foreground",
};

const PHASE_ICONS: Record<FMPStatus["statusPhase"], React.ReactNode> = {
  idle: <Clock className="h-4 w-4" />,
  scanning: <Radar className="h-4 w-4 animate-pulse" />,
  analyzing: <Brain className="h-4 w-4 animate-pulse" />,
  waiting: <Clock className="h-4 w-4 animate-pulse" />,
  entering: <Zap className="h-4 w-4 animate-bounce" />,
  monitoring: <Activity className="h-4 w-4 animate-pulse" />,
  exiting: <Lock className="h-4 w-4 animate-pulse" />,
  cooldown: <AlertTriangle className="h-4 w-4" />,
  danger: <AlertTriangle className="h-4 w-4 animate-pulse" />,
  disabled: <Power className="h-4 w-4" />,
};

function closeReasonLabel(r: string): string {
  const map: Record<string, string> = {
    take_profit: "Take Profit",
    stop_loss: "Stop Loss",
    trailing_stop: "Trailing Stop",
    smart_exit_momentum: "Keluar Cerdas",
    manual_close: "Tutup Manual",
  };
  return map[r] ?? r;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FullMarginPrecision() {
  const { toast } = useToast();

  const [status, setStatus] = useState<FMPStatus | null>(null);
  const [config, setConfig] = useState<FMPConfig | null>(null);
  const [log, setLog] = useState<FMPTradeLog[]>([]);
  const [learning, setLearning] = useState<FMPLearning | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showLog, setShowLog] = useState(true);
  const [showLearning, setShowLearning] = useState(true);
  const [localConfig, setLocalConfig] = useState<Partial<FMPConfig>>({});

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, cRes, lRes, lnRes] = await Promise.all([
        fetch(`${API}/api/fmp/status`),
        fetch(`${API}/api/fmp/config`),
        fetch(`${API}/api/fmp/log`),
        fetch(`${API}/api/fmp/learning`),
      ]);
      if (sRes.ok) setStatus(await sRes.json());
      if (cRes.ok) {
        const c = await cRes.json();
        setConfig(c);
        setLocalConfig(c);
      }
      if (lRes.ok) setLog(await lRes.json());
      if (lnRes.ok) setLearning(await lnRes.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  async function toggleEngine() {
    if (!status) return;
    setSaving(true);
    try {
      const endpoint = status.running ? "/api/fmp/stop" : "/api/fmp/start";
      const res = await fetch(`${API}${endpoint}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        toast({ title: status.running ? "FMP dihentikan" : "FMP diaktifkan" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/fmp/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localConfig),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setStatus(data.status);
        toast({ title: "Konfigurasi disimpan" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function closePosition() {
    setClosing(true);
    try {
      const res = await fetch(`${API}/api/fmp/close`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        toast({ title: "Posisi ditutup secara manual" });
        await fetchAll();
      } else {
        const err = await res.json();
        toast({ title: "Gagal menutup posisi", description: err.error, variant: "destructive" });
      }
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pos = status?.activePosition ?? null;
  const setup = status?.bestSetup ?? null;
  const totalTrades = (status?.totalWins ?? 0) + (status?.totalLosses ?? 0);
  const winRate = totalTrades > 0 ? ((status!.totalWins / totalTrades) * 100).toFixed(1) : "0.0";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/20 border border-violet-500/30">
            <Crosshair className="h-6 w-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Full Margin Precision Mode</h1>
            <p className="text-sm text-muted-foreground">Sniper AI — 1 posisi, margin penuh, probabilitas maksimum</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            variant={status?.running ? "destructive" : "default"}
            size="sm"
            onClick={toggleEngine}
            disabled={saving}
            className={!status?.running ? "bg-violet-600 hover:bg-violet-700" : ""}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Power className="h-3.5 w-3.5 mr-1.5" />}
            {status?.running ? "Hentikan FMP" : "Aktifkan FMP"}
          </Button>
        </div>
      </div>

      {/* ── Status Banner ── */}
      <Card className={`border ${status?.dangerMode ? "border-red-500/60 bg-red-500/5" : status?.cooldown ? "border-orange-500/40 bg-orange-500/5" : status?.running ? "border-violet-500/40 bg-violet-500/5" : "border-border"}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 ${status ? PHASE_COLORS[status.statusPhase] : "text-muted-foreground"}`}>
              {status ? PHASE_ICONS[status.statusPhase] : <Clock className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${status ? PHASE_COLORS[status.statusPhase] : "text-muted-foreground"}`}>
                {status?.statusMessage ?? "Memuat..."}
              </p>
              {status?.lastError && (
                <p className="text-xs text-red-400 mt-1">Error: {status.lastError}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {status?.running && (
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  AKTIF
                </span>
              )}
              {status?.dangerMode && (
                <Badge variant="destructive" className="text-xs">BAHAYA</Badge>
              )}
              {status?.cooldown && (
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">COOLDOWN</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: "Win Rate", value: `${winRate}%`, icon: Award, color: "text-green-400" },
          { label: "Total Win", value: status?.totalWins ?? 0, icon: CheckCircle2, color: "text-green-400" },
          { label: "Total Loss", value: status?.totalLosses ?? 0, icon: XCircle, color: "text-red-400" },
          { label: "Loss Hari Ini", value: `$${(status?.dailyLoss ?? 0).toFixed(2)}`, icon: AlertTriangle, color: "text-orange-400" },
          { label: "Scan Total", value: status?.totalScanned ?? 0, icon: Radar, color: "text-blue-400" },
          { label: "Siklus", value: status?.cycleCount ?? 0, icon: RefreshCw, color: "text-muted-foreground" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Posisi Aktif ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Active Position Card */}
          <Card className={`border ${pos ? "border-cyan-500/40 bg-cyan-500/5" : "border-border"}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-cyan-400" />
                Posisi Aktif
                {pos && (
                  <Badge className={`ml-auto text-xs ${pos.side === "Buy" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                    {pos.side === "Buy" ? "LONG" : "SHORT"}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!pos ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Crosshair className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>Tidak ada posisi aktif</p>
                  <p className="text-xs mt-1">Sniper AI sedang mencari setup terbaik...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Symbol & PnL */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-2xl font-bold text-foreground">{pos.symbol}</p>
                      <p className="text-sm text-muted-foreground">Entry: ${pos.entryPrice.toFixed(4)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${pos.currentPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {pos.currentPnl >= 0 ? "+" : ""}${pos.currentPnl.toFixed(3)}
                      </p>
                      <p className="text-xs text-muted-foreground">PnL Saat Ini</p>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Margin", value: `$${pos.allocatedUSDT.toFixed(2)}` },
                      { label: "Leverage", value: `${pos.leverage}x` },
                      { label: "Confidence", value: `${pos.confidence}%` },
                      { label: "Stop Loss", value: `$${pos.stopLoss.toFixed(4)}`, color: "text-red-400" },
                      { label: "Take Profit", value: `$${pos.takeProfit.toFixed(4)}`, color: "text-green-400" },
                      { label: "Durasi", value: fmtDuration(Date.now() - pos.openedAt) },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-muted/20 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={`text-sm font-semibold ${color ?? "text-foreground"}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Trailing Stop Indicator */}
                  {pos.trailActive && (
                    <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-lg p-2.5">
                      <Lock className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                      <span className="text-xs text-violet-300">Trailing stop aktif — profit dikunci otomatis</span>
                    </div>
                  )}

                  {/* Peak PnL bar */}
                  {pos.peakPnl > 0 && (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Peak PnL</span>
                        <span className="text-green-400">+${pos.peakPnl.toFixed(3)}</span>
                      </div>
                      <div className="h-1.5 bg-muted/30 rounded-full">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (pos.currentPnl / pos.peakPnl) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={closePosition}
                    disabled={closing}
                  >
                    {closing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5 mr-1.5" />}
                    Tutup Posisi Manual
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Best Setup Card */}
          {setup && !pos && (
            <Card className="border border-yellow-500/40 bg-yellow-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FlameKindling className="h-4 w-4 text-yellow-400" />
                  Setup Terbaik Terdeteksi
                  <Badge className="ml-auto bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                    Grade {setup.grade}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xl font-bold">{setup.symbol}</p>
                    <Badge className={`mt-1 text-xs ${setup.side === "Buy" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                      {setup.side === "Buy" ? "LONG" : "SHORT"}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-yellow-400">{setup.confidence}%</p>
                    <p className="text-xs text-muted-foreground">Confidence</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-muted/20 rounded p-2">
                    <p className="text-muted-foreground">RR Ratio</p>
                    <p className="font-semibold text-green-400">{setup.rr.toFixed(1)}x</p>
                  </div>
                  <div className="bg-muted/20 rounded p-2">
                    <p className="text-muted-foreground">Multi-TF</p>
                    <p className="font-semibold text-blue-400">{setup.multiTfAlignment.toFixed(0)}%</p>
                  </div>
                  <div className="bg-muted/20 rounded p-2">
                    <p className="text-muted-foreground">Volume</p>
                    <p className="font-semibold">{setup.volumeRatio.toFixed(1)}x</p>
                  </div>
                  <div className="bg-muted/20 rounded p-2">
                    <p className="text-muted-foreground">Momentum</p>
                    <p className="font-semibold capitalize">{setup.momentum}</p>
                  </div>
                  <div className="bg-muted/20 rounded p-2">
                    <p className="text-muted-foreground">Struktur</p>
                    <p className="font-semibold capitalize">{setup.marketStructure}</p>
                  </div>
                  <div className="bg-muted/20 rounded p-2">
                    <p className="text-muted-foreground">Trend</p>
                    <p className="font-semibold">{((setup.trendStrength ?? 1) * 100).toFixed(0)}%</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Alasan Masuk:</p>
                  <ul className="space-y-1">
                    {setup.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                        <CheckCircle2 className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
                {setup.warnings.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Peringatan:</p>
                    {setup.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-orange-300">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        {w}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Terdeteksi: {fmtTime(setup.detectedAt)}</p>
              </CardContent>
            </Card>
          )}

          {/* Trade History */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <button
                className="flex items-center justify-between w-full text-left"
                onClick={() => setShowLog((v) => !v)}
              >
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-primary" />
                  Riwayat Trade ({log.length})
                </CardTitle>
                {showLog ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CardHeader>
            {showLog && (
              <CardContent>
                {log.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Belum ada riwayat trade</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {log.map((t) => (
                      <div
                        key={t.id}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs ${
                          t.outcome === "win" ? "bg-green-500/5 border-green-500/20" :
                          t.outcome === "loss" ? "bg-red-500/5 border-red-500/20" :
                          "bg-muted/10 border-border"
                        }`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {t.outcome === "win" ? <CheckCircle2 className="h-4 w-4 text-green-400" /> :
                           t.outcome === "loss" ? <XCircle className="h-4 w-4 text-red-400" /> :
                           <Activity className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold text-foreground">{t.symbol}</span>
                            <Badge className={`text-[10px] py-0 ${t.side === "Buy" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                              {t.side === "Buy" ? "LONG" : "SHORT"}
                            </Badge>
                            <Badge className="text-[10px] py-0 bg-muted/30 text-muted-foreground">Grade {t.grade}</Badge>
                          </div>
                          <p className="text-muted-foreground">
                            Entry ${t.entryPrice.toFixed(4)} → Exit ${t.exitPrice.toFixed(4)} | {closeReasonLabel(t.closeReason)}
                          </p>
                          {t.learningNote && (
                            <p className="text-muted-foreground/70 italic mt-0.5">{t.learningNote}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-bold ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(3)}
                          </p>
                          <p className="text-muted-foreground">{t.confidence}% conf</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* ── Sidebar Kanan ── */}
        <div className="space-y-4">

          {/* Self-Learning Insights */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <button
                className="flex items-center justify-between w-full text-left"
                onClick={() => setShowLearning((v) => !v)}
              >
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Brain className="h-4 w-4 text-violet-400" />
                  Wawasan AI
                </CardTitle>
                {showLearning ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CardHeader>
            {showLearning && learning && (
              <CardContent className="space-y-3">
                {/* Win rate gauge */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Win Rate</span>
                    <span className={`font-semibold ${learning.winRate >= 60 ? "text-green-400" : learning.winRate >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                      {learning.winRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted/30 rounded-full">
                    <div
                      className={`h-full rounded-full transition-all ${learning.winRate >= 60 ? "bg-green-500" : learning.winRate >= 45 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(100, learning.winRate)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted/20 rounded p-2">
                    <p className="text-muted-foreground">Avg Win</p>
                    <p className="font-semibold text-green-400">+{learning.avgWinPct.toFixed(2)}%</p>
                  </div>
                  <div className="bg-muted/20 rounded p-2">
                    <p className="text-muted-foreground">Avg Loss</p>
                    <p className="font-semibold text-red-400">{learning.avgLossPct.toFixed(2)}%</p>
                  </div>
                  <div className="bg-muted/20 rounded p-2">
                    <p className="text-muted-foreground">Conf Win</p>
                    <p className="font-semibold">{learning.avgConfidenceOnWins.toFixed(1)}%</p>
                  </div>
                  <div className="bg-muted/20 rounded p-2">
                    <p className="text-muted-foreground">RR avg Win</p>
                    <p className="font-semibold">{learning.avgRROnWins.toFixed(2)}x</p>
                  </div>
                </div>

                {/* Grade accuracy */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Akurasi per Grade:</p>
                  {(["A", "B", "C"] as const).map((g) => (
                    <div key={g} className="flex items-center gap-2 mb-1">
                      <span className="text-xs w-10 font-semibold">Grade {g}</span>
                      <div className="flex-1 h-1.5 bg-muted/30 rounded-full">
                        <div
                          className="h-full bg-violet-500 rounded-full"
                          style={{ width: `${Math.min(100, learning.gradeAccuracy[g])}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right">{learning.gradeAccuracy[g].toFixed(0)}%</span>
                    </div>
                  ))}
                </div>

                {/* Lessons */}
                {learning.lessons.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                      <BookOpen className="h-3 w-3" /> Pelajaran AI:
                    </p>
                    {learning.lessons.map((l, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-foreground/70 mb-1">
                        <span className="text-violet-400 shrink-0">•</span>
                        {l}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Activity Feed */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Log Aktivitas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ActivityFeed source="auto" maxItems={20} compact />
            </CardContent>
          </Card>

          {/* Config Panel */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <button
                className="flex items-center justify-between w-full text-left"
                onClick={() => setShowConfig((v) => !v)}
              >
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" />
                  Konfigurasi
                </CardTitle>
                {showConfig ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CardHeader>
            {showConfig && config && (
              <CardContent className="space-y-4">

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">FMP Aktif</p>
                    <p className="text-xs text-muted-foreground">Aktifkan / matikan mode</p>
                  </div>
                  <Switch
                    checked={localConfig.enabled ?? false}
                    onCheckedChange={(v) => setLocalConfig((c) => ({ ...c, enabled: v }))}
                  />
                </div>

                {/* Min Confidence */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Confidence Minimum</span>
                    <span className="font-semibold text-primary">{localConfig.minConfidence ?? config.minConfidence}%</span>
                  </div>
                  <Slider
                    min={85} max={99} step={1}
                    value={[localConfig.minConfidence ?? config.minConfidence]}
                    onValueChange={([v]) => setLocalConfig((c) => ({ ...c, minConfidence: v }))}
                  />
                </div>

                {/* Margin Pct */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Alokasi Margin</span>
                    <span className="font-semibold text-primary">{localConfig.marginPct ?? config.marginPct}%</span>
                  </div>
                  <Slider
                    min={50} max={100} step={5}
                    value={[localConfig.marginPct ?? config.marginPct]}
                    onValueChange={([v]) => setLocalConfig((c) => ({ ...c, marginPct: v }))}
                  />
                </div>

                {/* Max Leverage */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Max Leverage</span>
                    <span className="font-semibold text-primary">{localConfig.maxLeverage ?? config.maxLeverage}x</span>
                  </div>
                  <Slider
                    min={1} max={20} step={1}
                    value={[localConfig.maxLeverage ?? config.maxLeverage]}
                    onValueChange={([v]) => setLocalConfig((c) => ({ ...c, maxLeverage: v }))}
                  />
                </div>

                {/* Min RR */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">RR Minimum</span>
                    <span className="font-semibold text-primary">{(localConfig.minRR ?? config.minRR).toFixed(1)}x</span>
                  </div>
                  <Slider
                    min={1.5} max={5} step={0.5}
                    value={[localConfig.minRR ?? config.minRR]}
                    onValueChange={([v]) => setLocalConfig((c) => ({ ...c, minRR: v }))}
                  />
                </div>

                {/* Stop Loss */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Stop Loss %</span>
                    <span className="font-semibold text-red-400">{(localConfig.stopLossPct ?? config.stopLossPct).toFixed(1)}%</span>
                  </div>
                  <Slider
                    min={0.5} max={5} step={0.5}
                    value={[localConfig.stopLossPct ?? config.stopLossPct]}
                    onValueChange={([v]) => setLocalConfig((c) => ({ ...c, stopLossPct: v }))}
                  />
                </div>

                {/* Take Profit */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Take Profit %</span>
                    <span className="font-semibold text-green-400">{(localConfig.takeProfitPct ?? config.takeProfitPct).toFixed(1)}%</span>
                  </div>
                  <Slider
                    min={1} max={10} step={0.5}
                    value={[localConfig.takeProfitPct ?? config.takeProfitPct]}
                    onValueChange={([v]) => setLocalConfig((c) => ({ ...c, takeProfitPct: v }))}
                  />
                </div>

                {/* Cooldown */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Cooldown (menit)</span>
                    <span className="font-semibold">{localConfig.cooldownMinutes ?? config.cooldownMinutes}m</span>
                  </div>
                  <Slider
                    min={5} max={120} step={5}
                    value={[localConfig.cooldownMinutes ?? config.cooldownMinutes]}
                    onValueChange={([v]) => setLocalConfig((c) => ({ ...c, cooldownMinutes: v }))}
                  />
                </div>

                {/* Daily Loss Limit */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Batas Loss Harian</span>
                    <span className="font-semibold text-orange-400">{(localConfig.dailyLossLimitPct ?? config.dailyLossLimitPct).toFixed(1)}%</span>
                  </div>
                  <Slider
                    min={1} max={20} step={1}
                    value={[localConfig.dailyLossLimitPct ?? config.dailyLossLimitPct]}
                    onValueChange={([v]) => setLocalConfig((c) => ({ ...c, dailyLossLimitPct: v }))}
                  />
                </div>

                {/* Consecutive Loss Limit */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Max Loss Berturut</span>
                    <span className="font-semibold">{localConfig.consecutiveLossLimit ?? config.consecutiveLossLimit}x</span>
                  </div>
                  <Slider
                    min={1} max={5} step={1}
                    value={[localConfig.consecutiveLossLimit ?? config.consecutiveLossLimit]}
                    onValueChange={([v]) => setLocalConfig((c) => ({ ...c, consecutiveLossLimit: v }))}
                  />
                </div>

                <Button
                  className="w-full"
                  size="sm"
                  onClick={saveConfig}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />}
                  Simpan Konfigurasi
                </Button>

                {/* Safety Rules Summary */}
                <div className="mt-2 space-y-1.5">
                  <p className="text-xs text-muted-foreground font-semibold">Aturan Keamanan Aktif:</p>
                  {[
                    `Max 1 posisi aktif sekaligus`,
                    `Confidence minimum ${localConfig.minConfidence ?? config.minConfidence}%`,
                    `RR minimum ${(localConfig.minRR ?? config.minRR).toFixed(1)}x`,
                    `Cooldown ${localConfig.cooldownMinutes ?? config.cooldownMinutes}m setelah loss`,
                    `Perlindungan fake breakout aktif`,
                    `Deteksi bahaya volatilitas aktif`,
                    `Trailing stop otomatis aktif`,
                  ].map((rule) => (
                    <div key={rule} className="flex items-start gap-1.5 text-xs text-foreground/70">
                      <ShieldCheck className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />
                      {rule}
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
