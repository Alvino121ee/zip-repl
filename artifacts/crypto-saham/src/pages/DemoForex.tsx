import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  FlaskConical, TrendingUp, TrendingDown, RefreshCw,
  Wallet, BarChart2, Trophy, Zap, XCircle, CheckCircle2,
  AlertTriangle, RotateCcw, Bot, Timer, Activity,
  ChevronDown, ChevronUp, Brain, Target, Shield,
  BookOpen, Star, Terminal, Filter, Tag, Calendar,
  ArrowUpRight, ArrowDownRight, Layers, Award,
  List, Cpu, Radar, Waves, Eye, ArrowRightLeft,
  Lightbulb, Gauge, Globe,
} from "lucide-react";
import { ActivityFeed } from "@/components/shared/ActivityFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Cell, CartesianGrid,
  PieChart as RechartsPie, Pie, Legend,
} from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");
const SALDO_AWAL = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ForexPosition {
  id: string; symbol: string; displayName: string; category: string; emoji: string;
  side: "Buy" | "Sell"; size: number; entryPrice: number;
  markPrice: number; leverage: number; margin: number;
  stopLoss: number | null; takeProfit: number | null;
  unrealisedPnl: number; unrealisedPnlPct: number;
  openedAt: number; source: "auto" | "scalp" | "manual";
  confidence: number; signal: string; openReason?: string; tags?: string[];
  marketCondition?: string;
}

interface ForexTradeLog {
  id: string; timestamp: number; openedAt?: number; closedAt?: number; duration?: number;
  symbol: string; displayName: string; category: string; emoji: string;
  side: "Buy" | "Sell"; qty: number; entryPrice: number;
  closePrice: number | null; realizedPnl: number | null;
  realizedPnlPct: number | null; leverage: number; margin: number;
  confidence: number; signal: string;
  status: "opened" | "closed_tp" | "closed_sl" | "closed_manual" | "rejected";
  reason: string; openReason?: string; source: "auto" | "scalp" | "manual";
  tags?: string[]; marketCondition?: string;
  fee?: number; entryFee?: number; exitFee?: number;
}

interface ForexBalance {
  total: number; available: number; usedMargin: number;
  realizedPnl: number; unrealisedPnl: number;
  winCount: number; lossCount: number; winRate: number;
}

interface ForexConfig {
  autoEnabled: boolean; autoMode: "auto" | "semi";
  minConfidence: number; maxPositionUSDT: number;
  stopLossPct: number; takeProfitPct: number;
  maxPositions: number; leverage: number; intervalMs: number;
}

interface ForexEngineStatus {
  autoRunning: boolean; autoAnalyzing: boolean;
  lastCycleAt: number | null; nextCycleAt: number | null;
  cycleCount: number; lastSignalsFound: number;
  totalScanned: number; lastError: string | null;
}

interface ForexStats {
  totalTrades: number; closedTrades: number;
  wins: number; losses: number; winRate: number;
  profitFactor: number; currentBalance: number; initialBalance: number;
  totalPnl: number; totalPnlPct: number;
  largestWin: number; largestLoss: number;
  avgWin: number; avgLoss: number;
  consecutiveWins: number; consecutiveLosses: number;
  maxConsecutiveWins: number; maxConsecutiveLosses: number;
  maxDrawdown: number; maxDrawdownPct: number;
  equityHistory: { timestamp: number; balance: number }[];
  totalFees: number;
  pairPerformance: { pair: string; wins: number; losses: number; pnl: number; winRate: number; trades: number }[];
}

interface ForexScanResult {
  symbol: string; displayName: string; category: string; emoji: string;
  price: number; change24h: number; confidence: number; side: "Buy" | "Sell" | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPrice(n: number) { return n > 100 ? fmt(n, 2) : fmt(n, 4); }
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
  return `${Math.floor(d / 3600)}j lalu`;
}

function formatHari(ts: number) {
  return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function formatTanggal(ts: number) {
  return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? res.statusText); }
  return res.json() as Promise<T>;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ForexTradeLog["status"] }) {
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

function PanelSaldo({ balance, onReset, stats }: { balance: ForexBalance | null; onReset: () => void; stats: ForexStats | null }) {
  if (!balance) return <Card><CardContent className="p-4 animate-pulse h-24 bg-muted/20" /></Card>;
  const pertumbuhan = balance.total - SALDO_AWAL;
  const pertumbuhanPct = (pertumbuhan / SALDO_AWAL) * 100;
  const totalTrade = balance.winCount + balance.lossCount;
  const pf = stats && stats.avgLoss > 0 ? stats.avgWin * stats.wins / (stats.avgLoss * stats.losses || 1) : 0;

  return (
    <Card className="border-2 border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/20 rounded-lg">
              <Globe className="h-4 w-4 text-amber-400" />
            </div>
            <span className="font-bold text-sm text-amber-400">DEMO FOREX & GOLD</span>
            <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">Modal $50 USDT</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={onReset} className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive">
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
            <p className="text-xs text-muted-foreground">Fee (0.055%)</p>
            <p className="text-lg font-bold tabular-nums text-orange-400">
              -{stats ? fmt(stats.totalFees, 4) : "0.0000"}
            </p>
            <p className="text-xs text-muted-foreground">Per trade</p>
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
            <p className={`text-lg font-bold ${pf >= 1.5 ? "text-green-400" : pf >= 1 ? "text-yellow-400" : "text-red-400"}`}>
              {totalTrade === 0 ? "—" : pf >= 999 ? "∞" : fmt(pf)}
            </p>
            <p className="text-xs text-muted-foreground">Target: ≥ 1.5</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Meter Risiko ─────────────────────────────────────────────────────────────

function MeterRisiko({ balance, stats }: { balance: ForexBalance | null; stats: ForexStats | null }) {
  const konsekutifLoss = stats?.consecutiveLosses ?? 0;
  const drawdown = balance ? ((balance.total - SALDO_AWAL) / SALDO_AWAL) * 100 : 0;
  let levelRisiko: "aman" | "waspada" | "bahaya" | "kritis" = "aman";
  if (konsekutifLoss >= 5 || drawdown <= -30) levelRisiko = "kritis";
  else if (konsekutifLoss >= 3 || drawdown <= -15) levelRisiko = "bahaya";
  else if (konsekutifLoss >= 2 || drawdown <= -7) levelRisiko = "waspada";
  const warna = { aman: "text-green-400 border-green-500/30 bg-green-500/5", waspada: "text-yellow-400 border-yellow-500/30 bg-yellow-500/5", bahaya: "text-orange-400 border-orange-500/30 bg-orange-500/5", kritis: "text-red-400 border-red-500/30 bg-red-500/5" }[levelRisiko];
  const label = { aman: "🟢 Aman", waspada: "🟡 Waspada", bahaya: "🟠 Bahaya", kritis: "🔴 Kritis" }[levelRisiko];
  const pesan = { aman: "Kondisi trading baik. Lanjutkan dengan disiplin.", waspada: `${konsekutifLoss}x loss berturut. Kurangi ukuran posisi 25%.`, bahaya: `${konsekutifLoss}x loss beruntun atau drawdown ${fmt(drawdown)}%. Kurangi posisi 50%!`, kritis: "HENTIKAN TRADING! Evaluasi strategi forex Anda." }[levelRisiko];
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

// ─── Kartu Posisi ─────────────────────────────────────────────────────────────

function KartuPosisi({ pos, onTutup }: { pos: ForexPosition; onTutup: (id: string) => void }) {
  const isLong = pos.side === "Buy";
  const pnlC = pnlColor(pos.unrealisedPnl);
  const durasi = durasiFormat(Date.now() - pos.openedAt);

  return (
    <Card className={`border ${isLong ? "border-green-500/30" : "border-red-500/30"}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{pos.emoji}</span>
            <div>
              <span className="font-bold text-sm">{pos.displayName}</span>
              <span className="text-[10px] text-muted-foreground ml-1.5">{pos.category}</span>
            </div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {isLong ? "↑ LONG" : "↓ SHORT"}
            </span>
            <span className={`text-[10px] font-semibold ${pos.source === "auto" ? "text-blue-400" : "text-muted-foreground"}`}>
              {pos.source === "auto" ? "🤖 AUTO" : "✋ MANUAL"}
            </span>
          </div>
          <button onClick={() => onTutup(pos.id)} className="text-muted-foreground hover:text-destructive transition-colors">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div><p className="text-muted-foreground">Entry</p><p className="font-bold">${fmtPrice(pos.entryPrice)}</p></div>
          <div><p className="text-muted-foreground">Harga Kini</p><p className="font-bold">${fmtPrice(pos.markPrice)}</p></div>
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
                <p className="font-bold text-red-400">${fmtPrice(pos.stopLoss)}</p>
              </div>
            )}
            {pos.takeProfit && (
              <div className="bg-green-500/10 border border-green-500/20 rounded p-1.5">
                <p className="text-green-400 text-[10px]">✅ Take Profit</p>
                <p className="font-bold text-green-400">${fmtPrice(pos.takeProfit)}</p>
              </div>
            )}
          </div>
        )}
        {pos.openReason && (
          <div className="text-[10px] text-muted-foreground bg-muted/20 rounded p-1.5 border border-border">
            <span className="text-amber-400 font-semibold">Alasan AI: </span>{pos.openReason.split(";")[0]}
          </div>
        )}
        {pos.tags && pos.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pos.tags.filter(t => !["Profit", "Loss"].includes(t)).map(tag => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">{tag}</span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Scan Universe Panel ──────────────────────────────────────────────────────

function PanelUniverse({ onBuka }: { onBuka: (symbol: string, side: "Buy" | "Sell", price: number) => void }) {
  const [scan, setScan] = useState<ForexScanResult[]>([]);
  const [loading, setLoading] = useState(false);

  const doScan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ForexScanResult[]>("/api/forex-demo/scan");
      setScan(data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { doScan(); }, []);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-amber-400" /> Universe Forex & Komoditas
          </CardTitle>
          <Button size="sm" variant="outline" onClick={doScan} disabled={loading} className="h-7 text-xs gap-1">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {scan.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {loading ? "Memuat data pair..." : "Klik Refresh untuk memuat data pair"}
          </div>
        ) : (
          <div className="space-y-2">
            {scan.map(s => (
              <div key={s.symbol} className="flex items-center gap-3 p-2 rounded-lg bg-muted/10 border border-border hover:bg-muted/20 transition-colors">
                <span className="text-2xl">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{s.displayName}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{s.category}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs mt-0.5">
                    <span className="font-mono">${fmtPrice(s.price)}</span>
                    <span className={pnlColor(s.change24h)}>{s.change24h >= 0 ? "+" : ""}{fmt(s.change24h, 2)}%</span>
                    <span className="text-muted-foreground">Confidence: <span className="font-bold text-primary">{fmt(s.confidence, 0)}%</span></span>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {s.side === "Buy" && (
                    <Button size="sm" className="h-7 text-xs bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30" onClick={() => onBuka(s.symbol, "Buy", s.price)}>
                      ↑ LONG
                    </Button>
                  )}
                  {s.side === "Sell" && (
                    <Button size="sm" className="h-7 text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30" onClick={() => onBuka(s.symbol, "Sell", s.price)}>
                      ↓ SHORT
                    </Button>
                  )}
                  {!s.side && (
                    <span className="text-[10px] text-muted-foreground px-2 py-1 border border-border rounded">Sideways</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tab Kontrol Engine ───────────────────────────────────────────────────────

function TabKontrol({ config, engineStatus, onConfigChange, onTrigger }: {
  config: ForexConfig | null;
  engineStatus: ForexEngineStatus | null;
  onConfigChange: (patch: Partial<ForexConfig>) => void;
  onTrigger: () => void;
}) {
  if (!config) return <Card><CardContent className="p-4 animate-pulse h-40 bg-muted/20" /></Card>;

  const intervalLabel = config.intervalMs >= 60000
    ? `${config.intervalMs / 60000}m`
    : `${config.intervalMs / 1000}d`;

  return (
    <div className="space-y-4">
      {/* Engine Status */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cpu className="h-4 w-4 text-amber-400" /> Status Engine Forex
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto Trading Forex</p>
              <p className="text-xs text-muted-foreground">AI pindai & buka posisi otomatis</p>
            </div>
            <Switch
              checked={config.autoEnabled}
              onCheckedChange={(v) => onConfigChange({ autoEnabled: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Mode</p>
              <p className="text-xs text-muted-foreground">{config.autoMode === "auto" ? "Auto: buka posisi otomatis" : "Semi: tampilkan sinyal saja"}</p>
            </div>
            <div className="flex gap-1.5">
              {(["semi", "auto"] as const).map(m => (
                <Button key={m} size="sm" variant={config.autoMode === m ? "default" : "outline"} className="h-7 text-xs" onClick={() => onConfigChange({ autoMode: m })}>
                  {m === "auto" ? "Full Auto" : "Semi"}
                </Button>
              ))}
            </div>
          </div>

          {engineStatus && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className={`text-xs font-bold ${engineStatus.autoRunning ? "text-green-400" : "text-muted-foreground"}`}>
                  {engineStatus.autoRunning ? (engineStatus.autoAnalyzing ? "🔄 Menganalisis" : "✅ Aktif") : "⏹ Berhenti"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Siklus</p>
                <p className="text-xs font-bold">{engineStatus.cycleCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Siklus Berikutnya</p>
                <p className="text-xs font-bold">{engineStatus.nextCycleAt ? waktuLalu(engineStatus.nextCycleAt > Date.now() ? Date.now() - (engineStatus.nextCycleAt - Date.now()) : engineStatus.nextCycleAt) : "—"}</p>
              </div>
            </div>
          )}

          {engineStatus?.autoRunning && (
            <Button size="sm" variant="outline" onClick={onTrigger} className="w-full h-7 text-xs gap-1.5">
              <Zap className="h-3 w-3" /> Paksa Siklus Sekarang
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Parameter */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-400" /> Parameter Forex
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Min Confidence</span>
              <span className="font-bold text-primary">{config.minConfidence}%</span>
            </div>
            <Slider min={60} max={95} step={1} value={[config.minConfidence]} onValueChange={([v]) => onConfigChange({ minConfidence: v })} className="h-1.5" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Max Posisi per Trade</span>
              <span className="font-bold text-primary">${config.maxPositionUSDT}</span>
            </div>
            <Slider min={2} max={25} step={1} value={[config.maxPositionUSDT]} onValueChange={([v]) => onConfigChange({ maxPositionUSDT: v })} className="h-1.5" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Stop Loss %</span>
              <span className="font-bold text-red-400">{config.stopLossPct}%</span>
            </div>
            <Slider min={0.5} max={5} step={0.5} value={[config.stopLossPct]} onValueChange={([v]) => onConfigChange({ stopLossPct: v })} className="h-1.5" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Take Profit %</span>
              <span className="font-bold text-green-400">{config.takeProfitPct}%</span>
            </div>
            <Slider min={1} max={10} step={0.5} value={[config.takeProfitPct]} onValueChange={([v]) => onConfigChange({ takeProfitPct: v })} className="h-1.5" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Leverage</span>
                <span className="font-bold text-primary">{config.leverage}x</span>
              </div>
              <Slider min={1} max={10} step={1} value={[config.leverage]} onValueChange={([v]) => onConfigChange({ leverage: v })} className="h-1.5" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Max Posisi</span>
                <span className="font-bold text-primary">{config.maxPositions}</span>
              </div>
              <Slider min={1} max={5} step={1} value={[config.maxPositions]} onValueChange={([v]) => onConfigChange({ maxPositions: v })} className="h-1.5" />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">Interval Pindai</span>
            <div className="flex gap-1">
              {[15000, 30000, 60000, 120000].map(ms => (
                <Button key={ms} size="sm" variant={config.intervalMs === ms ? "default" : "outline"} className="h-6 text-[10px] px-2" onClick={() => onConfigChange({ intervalMs: ms })}>
                  {ms >= 60000 ? `${ms / 60000}m` : `${ms / 1000}d`}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gold Analysis Info */}
      <Card className="border border-yellow-500/30 bg-yellow-500/5">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="text-lg">🥇</span> AI Gold Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2 text-xs text-muted-foreground">
          <p>AI menganalisis <strong className="text-yellow-400">XAUUSDT (Gold)</strong> menggunakan indikator institusional yang disesuaikan:</p>
          <ul className="space-y-1 pl-3">
            <li>• <strong className="text-foreground">Safe Haven Demand</strong> — korelasi dengan DXY & volatilitas pasar</li>
            <li>• <strong className="text-foreground">Multi-Timeframe</strong> — alignment trend 1m, 5m, 15m, 1h untuk gold</li>
            <li>• <strong className="text-foreground">RSI & MACD</strong> — disesuaikan untuk volatilitas gold yang lebih rendah</li>
            <li>• <strong className="text-foreground">Smart Money</strong> — order block & liquidity sweep di chart gold</li>
            <li>• <strong className="text-foreground">Self-Learning</strong> — AI belajar dari setiap trade gold untuk meningkatkan akurasi</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab Riwayat ──────────────────────────────────────────────────────────────

function TabRiwayat({ log }: { log: ForexTradeLog[] }) {
  const [filter, setFilter] = useState<"all" | "closed" | "signal">("all");

  const filtered = useMemo(() => {
    if (filter === "closed") return log.filter(e => ["closed_tp", "closed_sl", "closed_manual"].includes(e.status));
    if (filter === "signal") return log.filter(e => e.status === "rejected");
    return log;
  }, [log, filter]);

  if (log.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Belum ada riwayat trade forex</p>
        <p className="text-xs mt-1">Aktifkan engine dan buka posisi untuk melihat riwayat</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {([["all", "Semua"], ["closed", "Ditutup"], ["signal", "Sinyal"]] as const).map(([v, label]) => (
          <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} className="h-7 text-xs" onClick={() => setFilter(v)}>{label}</Button>
        ))}
        <span className="text-xs text-muted-foreground self-center ml-auto">{filtered.length} entri</span>
      </div>
      <div className="space-y-2">
        {filtered.slice(0, 50).map(entry => {
          const isPos = entry.status === "opened";
          const isSig = entry.status === "rejected";
          const pnl = entry.realizedPnl;
          return (
            <div key={entry.id} className={`rounded-lg border p-3 text-xs ${isPos ? "bg-blue-500/5 border-blue-500/20" : isSig ? "bg-muted/5 border-border" : pnl != null && pnl >= 0 ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base">{entry.emoji}</span>
                  <span className="font-bold">{entry.displayName}</span>
                  <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${entry.side === "Buy" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{entry.side === "Buy" ? "↑ LONG" : "↓ SHORT"}</span>
                  <StatusBadge status={entry.status} />
                  <span className="text-[10px] text-muted-foreground bg-muted/20 px-1.5 py-0.5 rounded">{entry.category}</span>
                </div>
                {pnl != null && (
                  <span className={`font-bold tabular-nums shrink-0 ${pnlColor(pnl)}`}>{pnl >= 0 ? "+" : ""}${fmt(Math.abs(pnl))}</span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                <span>Entry: ${fmtPrice(entry.entryPrice)}</span>
                {entry.closePrice && <span>Exit: ${fmtPrice(entry.closePrice)}</span>}
                {entry.leverage && <span>Lev: {entry.leverage}x</span>}
                {entry.duration && <span>Durasi: {durasiFormat(entry.duration)}</span>}
                <span>{formatTanggal(entry.timestamp)}</span>
                {entry.confidence > 0 && <span>Conf: {entry.confidence}%</span>}
              </div>
              <p className="mt-1 text-muted-foreground">{entry.reason}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab Analitik ─────────────────────────────────────────────────────────────

function TabAnalitik({ stats }: { stats: ForexStats | null }) {
  if (!stats || stats.closedTrades === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <BarChart2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Belum ada data analitik</p>
        <p className="text-xs mt-1">Selesaikan beberapa trade untuk melihat grafik performa</p>
      </div>
    );
  }

  const kurvaEkuitas = stats.equityHistory.map((e, i) => ({
    waktu: i === 0 ? "Awal" : formatHari(e.timestamp),
    saldo: Math.round(e.balance * 100) / 100,
  }));

  const ekuitasWarna = kurvaEkuitas.length > 1 && kurvaEkuitas[kurvaEkuitas.length - 1].saldo >= SALDO_AWAL ? "#22c55e" : "#ef4444";

  const distribusi = [
    { name: "✅ Take Profit", value: 0, fill: "#22c55e" },
    { name: "❌ Stop Loss", value: 0, fill: "#ef4444" },
    { name: "🔒 Manual", value: 0, fill: "#eab308" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Trades", val: stats.totalTrades, color: "text-foreground" },
          { label: "Win Rate", val: `${fmt(stats.winRate, 1)}%`, color: stats.winRate >= 55 ? "text-green-400" : "text-red-400" },
          { label: "Profit Factor", val: stats.profitFactor >= 999 ? "∞" : fmt(stats.profitFactor), color: stats.profitFactor >= 1.5 ? "text-green-400" : "text-yellow-400" },
          { label: "Max Drawdown", val: `${fmt(stats.maxDrawdownPct, 1)}%`, color: "text-red-400" },
          { label: "Total PnL", val: `${stats.totalPnl >= 0 ? "+" : ""}$${fmt(Math.abs(stats.totalPnl))}`, color: pnlColor(stats.totalPnl) },
          { label: "Rata Menang", val: `$${fmt(stats.avgWin)}`, color: "text-green-400" },
          { label: "Rata Kalah", val: `$${fmt(stats.avgLoss)}`, color: "text-red-400" },
          { label: "Total Fee", val: `$${fmt(stats.totalFees, 4)}`, color: "text-orange-400" },
        ].map(({ label, val, color }) => (
          <Card key={label}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Kurva Ekuitas */}
      {kurvaEkuitas.length > 1 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-400" /> Kurva Ekuitas Forex
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={kurvaEkuitas}>
                <defs>
                  <linearGradient id="gradForex" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ekuitasWarna} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={ekuitasWarna} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="waktu" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} domain={["auto", "auto"]} tickFormatter={(v) => `$${fmt(v)}`} width={56} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(val: number) => [`$${fmt(val)}`, "Saldo"]} />
                <Area type="monotone" dataKey="saldo" stroke={ekuitasWarna} strokeWidth={2} fill="url(#gradForex)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Pair Performance */}
      {stats.pairPerformance.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Performa per Pair</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {stats.pairPerformance.map(p => (
                <div key={p.pair} className="flex items-center gap-3 text-xs">
                  <span className="w-28 font-medium truncate">{p.pair}</span>
                  <div className="flex-1 bg-muted h-2 rounded-full overflow-hidden">
                    <div className={`h-2 rounded-full ${p.pnl >= 0 ? "bg-green-400" : "bg-red-400"}`} style={{ width: `${Math.min(100, Math.abs(p.winRate))}%` }} />
                  </div>
                  <span className="w-12 text-right font-bold">{fmt(p.winRate, 0)}%</span>
                  <span className={`w-16 text-right font-bold ${pnlColor(p.pnl)}`}>{p.pnl >= 0 ? "+" : ""}${fmt(Math.abs(p.pnl))}</span>
                  <span className="w-12 text-right text-muted-foreground">{p.trades} trade</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DemoForex() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"posisi" | "kontrol" | "riwayat" | "analitik">("posisi");
  const [balance, setBalance] = useState<ForexBalance | null>(null);
  const [positions, setPositions] = useState<ForexPosition[]>([]);
  const [log, setLog] = useState<ForexTradeLog[]>([]);
  const [config, setConfig] = useState<ForexConfig | null>(null);
  const [engineStatus, setEngineStatus] = useState<ForexEngineStatus | null>(null);
  const [stats, setStats] = useState<ForexStats | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [b, p, l, c, es, st] = await Promise.all([
        apiFetch<ForexBalance>("/api/forex-demo/balance"),
        apiFetch<ForexPosition[]>("/api/forex-demo/positions"),
        apiFetch<ForexTradeLog[]>("/api/forex-demo/log"),
        apiFetch<ForexConfig>("/api/forex-demo/config"),
        apiFetch<ForexEngineStatus>("/api/forex-demo/engine-status"),
        apiFetch<ForexStats>("/api/forex-demo/stats"),
      ]);
      setBalance(b); setPositions(p); setLog(l); setConfig(c); setEngineStatus(es); setStats(st);
    } catch (err) { /* silent */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleConfigChange = useCallback(async (patch: Partial<ForexConfig>) => {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    try {
      await apiFetch<ForexConfig>("/api/forex-demo/config", { method: "PUT", body: JSON.stringify(patch) });
    } catch (err) {
      toast({ title: "Gagal", description: String(err), variant: "destructive" });
    }
  }, [config, toast]);

  const handleTutupPosisi = useCallback(async (id: string) => {
    try {
      await apiFetch(`/api/forex-demo/close/${id}`, { method: "POST", body: JSON.stringify({ reason: "manual" }) });
      toast({ title: "Posisi Ditutup", description: "Posisi forex berhasil ditutup" });
      refresh();
    } catch (err) {
      toast({ title: "Gagal", description: String(err), variant: "destructive" });
    }
  }, [refresh, toast]);

  const handleBukaManual = useCallback(async (symbol: string, side: "Buy" | "Sell", price: number) => {
    if (!config) return;
    try {
      await apiFetch("/api/forex-demo/order", { method: "POST", body: JSON.stringify({ symbol, side, entryPrice: price, positionUSDT: config.maxPositionUSDT, leverage: config.leverage, confidence: 70, signal: "manual" }) });
      toast({ title: "Posisi Dibuka", description: `${side === "Buy" ? "LONG" : "SHORT"} ${symbol} @ $${fmtPrice(price)}` });
      refresh();
    } catch (err) {
      toast({ title: "Gagal", description: String(err), variant: "destructive" });
    }
  }, [config, refresh, toast]);

  const handleReset = useCallback(async () => {
    if (!confirm("Reset Demo Forex? Semua posisi dan riwayat akan dihapus.")) return;
    try {
      await apiFetch("/api/forex-demo/reset", { method: "POST" });
      toast({ title: "Demo Forex Direset", description: "Saldo kembali ke $50 USDT" });
      refresh();
    } catch (err) {
      toast({ title: "Gagal", description: String(err), variant: "destructive" });
    }
  }, [refresh, toast]);

  const handleTrigger = useCallback(async () => {
    try {
      await apiFetch("/api/forex-demo/engine/trigger", { method: "POST" });
      toast({ title: "Siklus Dipaksa", description: "Engine forex sedang menganalisis..." });
    } catch (err) {
      toast({ title: "Gagal", description: String(err), variant: "destructive" });
    }
  }, [toast]);

  const totalUnrealized = positions.reduce((s, p) => s + p.unrealisedPnl, 0);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-xl">
            <Globe className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Demo Forex & Gold
              <Badge className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">USDT Perpetual</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">Simulasi trading forex & komoditas dengan AI institusional — Gold (XAUUSDT), EUR, GBP</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Saldo */}
      <PanelSaldo balance={balance} onReset={handleReset} stats={stats} />

      {/* Meter Risiko */}
      <MeterRisiko balance={balance} stats={stats} />

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border pb-0">
        {([
          ["posisi", "📊 Posisi", positions.length],
          ["kontrol", "⚙ Kontrol", null],
          ["riwayat", "📋 Riwayat", log.filter(l => l.status !== "rejected").length],
          ["analitik", "📈 Analitik", null],
        ] as const).map(([t, label, count]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-amber-400 text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label} {count !== null && count > 0 && <span className="ml-1 text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">{count}</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "posisi" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            {/* Active Positions */}
            {positions.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground">{positions.length} Posisi Aktif</h3>
                  <span className={`text-sm font-bold ${pnlColor(totalUnrealized)}`}>
                    Float: {totalUnrealized >= 0 ? "+" : ""}${fmt(Math.abs(totalUnrealized))}
                  </span>
                </div>
                {positions.map(pos => (
                  <KartuPosisi key={pos.id} pos={pos} onTutup={handleTutupPosisi} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Tidak ada posisi forex aktif</p>
                  <p className="text-xs mt-1">Aktifkan Auto Engine atau buka posisi manual dari Universe di bawah</p>
                </CardContent>
              </Card>
            )}

            {/* Universe Scan */}
            <PanelUniverse onBuka={handleBukaManual} />
          </div>

          {/* Sidebar: Aktivitas */}
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-amber-400" /> Feed Aktivitas AI
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ActivityFeed maxItems={20} />
              </CardContent>
            </Card>

            {stats && stats.closedTrades > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-400" /> Ringkasan Performa
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2 text-xs">
                  {[
                    ["Win Rate", `${fmt(stats.winRate, 1)}%`, stats.winRate >= 55 ? "text-green-400" : "text-red-400"],
                    ["Trades Ditutup", String(stats.closedTrades), "text-foreground"],
                    ["Rata Menang", `$${fmt(stats.avgWin)}`, "text-green-400"],
                    ["Rata Kalah", `$${fmt(stats.avgLoss)}`, "text-red-400"],
                    ["Max Drawdown", `${fmt(stats.maxDrawdownPct, 1)}%`, "text-orange-400"],
                  ].map(([label, val, color]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-bold ${color}`}>{val}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "kontrol" && (
        <div className="max-w-lg">
          <TabKontrol config={config} engineStatus={engineStatus} onConfigChange={handleConfigChange} onTrigger={handleTrigger} />
        </div>
      )}

      {tab === "riwayat" && (
        <TabRiwayat log={log} />
      )}

      {tab === "analitik" && (
        <TabAnalitik stats={stats} />
      )}
    </div>
  );
}
