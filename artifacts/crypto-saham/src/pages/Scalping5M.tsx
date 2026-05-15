import React, { useState, useEffect, useCallback } from "react";
import {
  Activity, AlertTriangle, BarChart2, CheckCircle2, Clock,
  Loader2, RefreshCw, TrendingDown, TrendingUp, XCircle,
  Zap, Shield, Timer, Target, BookOpen, RotateCcw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

interface Checklist {
  emaCrossover: boolean;
  rsiInZone: boolean;
  volumeAboveAvg: boolean;
  tf15mAligned: boolean;
  rrMet: boolean;
  notOverboughtOversold: boolean;
  inTradingSession: boolean;
}

interface TradingSession {
  name: string;
  active: boolean;
  quality: "best" | "good" | "avoid" | "neutral";
  wibTime: string;
  nextSession: string;
}

interface Scalp5mSignal {
  symbol: string;
  displayName: string;
  side: "Buy" | "Sell" | null;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  ema9: number;
  ema21: number;
  rsi14: number;
  volumeRatio: number;
  trend15m: "bullish" | "bearish" | "sideways";
  crossoverType: "golden" | "death" | "none";
  crossoverBars: number;
  nearestSupport: number;
  nearestResistance: number;
  checklist: Checklist;
  allChecksPassed: boolean;
  optimalEntry: number;
  entryQuality: "at_zone" | "near_zone" | "wait_pullback" | "chase";
  riskLevel: "low" | "medium" | "high" | "extreme";
  isHighRisk: boolean;
  riskReason: string | null;
  session: TradingSession;
  analyzedAt: number;
  reasons: string[];
  warnings: string[];
}

interface SessionStats {
  tradesCount: number;
  dailyPnl: number;
  dailyLossLimit: number;
  sessionStopped: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error((e as { error: string }).error ?? res.statusText); }
  return res.json() as Promise<T>;
}

function fmt(n: number | string, dec = 2) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function timeAgo(ts: number) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5) return "baru saja";
  if (d < 60) return `${d}s lalu`;
  return `${Math.floor(d / 60)}m lalu`;
}

// ─── Session Banner ───────────────────────────────────────────────────────────

function SessionBanner({ session }: { session: TradingSession }) {
  const colors = {
    best: "bg-green-950/40 border-green-500/40 text-green-300",
    good: "bg-blue-950/40 border-blue-500/30 text-blue-300",
    avoid: "bg-red-950/40 border-red-500/40 text-red-300",
    neutral: "bg-muted/30 border-border text-muted-foreground",
  };
  const icons = { best: "🟢", good: "🔵", avoid: "🔴", neutral: "⚪" };

  return (
    <div className={`rounded-xl border p-3 flex items-center justify-between ${colors[session.quality]}`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{icons[session.quality]}</span>
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            {session.wibTime} — <span className="uppercase tracking-wide">{session.name}</span>
            {session.quality === "best" && <span className="text-[10px] font-bold bg-green-500/20 border border-green-500/40 px-1.5 py-0.5 rounded-full">⚡ TERBAIK</span>}
            {session.quality === "avoid" && <span className="text-[10px] font-bold bg-red-500/20 border border-red-500/40 px-1.5 py-0.5 rounded-full">⛔ HINDARI</span>}
          </div>
          <div className="text-xs opacity-75 mt-0.5">Sesi berikutnya: {session.nextSession}</div>
        </div>
      </div>
      {session.quality === "avoid" && (
        <div className="text-xs text-right opacity-80 ml-3">Volume rendah<br />sinyal sering palsu</div>
      )}
    </div>
  );
}

// ─── Checklist Item ───────────────────────────────────────────────────────────

function CheckItem({ label, passed, note }: { label: string; passed: boolean; note?: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 border text-xs ${passed ? "bg-green-950/20 border-green-500/20 text-green-300" : "bg-red-950/15 border-red-500/20 text-muted-foreground"}`}>
      {passed
        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
        : <XCircle className="h-3.5 w-3.5 text-red-400/60 shrink-0 mt-0.5" />}
      <div>
        <span className="font-medium">{label}</span>
        {note && <div className="text-[10px] opacity-70 mt-0.5">{note}</div>}
      </div>
    </div>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

function SignalCard({ sig, onRefresh, refreshing }: { sig: Scalp5mSignal; onRefresh: (sym: string) => void; refreshing: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = sig.side === "Buy";
  const isShort = sig.side === "Sell";

  const confColor = sig.confidence >= 80 ? "text-green-400" : sig.confidence >= 60 ? "text-yellow-400" : "text-red-400";
  const confBg = sig.confidence >= 80 ? "bg-green-500" : sig.confidence >= 60 ? "bg-yellow-500" : "bg-red-500";

  const sideLabel = isLong ? "LONG" : isShort ? "SHORT" : "WAIT";
  const sideBg = isLong ? "bg-green-500/20 text-green-400 border-green-500/40"
    : isShort ? "bg-red-500/20 text-red-400 border-red-500/40"
    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";

  const cardBorder = sig.allChecksPassed
    ? (isLong ? "border-green-500/40" : "border-red-500/40")
    : "border-border";

  const crossoverLabel = sig.crossoverType === "golden" ? "⚡ Golden Cross"
    : sig.crossoverType === "death" ? "💀 Death Cross"
    : sig.ema9 > sig.ema21 ? "EMA9 > EMA21" : "EMA9 < EMA21";

  const passedCount = Object.values(sig.checklist).filter(Boolean).length;

  return (
    <Card className={`border ${cardBorder} transition-all`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-bold text-base">{sig.displayName}</div>
            <div className="text-xs text-muted-foreground">{sig.symbol} · {timeAgo(sig.analyzedAt)}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${sideBg}`}>
              {sideLabel}
            </span>
            {sig.crossoverType !== "none" && (
              <span className={`text-[10px] px-1.5 rounded ${sig.crossoverType === "golden" ? "text-green-400" : "text-red-400"}`}>
                {crossoverLabel}
              </span>
            )}
          </div>
        </div>

        {/* Confidence */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Confidence</span>
            <span className={`font-semibold ${confColor}`}>{sig.confidence}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${confBg}`} style={{ width: `${sig.confidence}%` }} />
          </div>
        </div>

        {/* Checklist progress */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex gap-0.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={`w-2.5 h-2.5 rounded-sm ${i < passedCount ? (sig.allChecksPassed ? "bg-green-500" : "bg-yellow-500") : "bg-muted"}`} />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{passedCount}/7 checklist</span>
          {sig.allChecksPassed && <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/30 px-1.5 rounded-full">✓ SIAP ENTRY</span>}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-1.5 text-xs mb-3">
          <div className="bg-muted/30 rounded p-2">
            <div className="text-muted-foreground">EMA9/21</div>
            <div className={`font-medium ${sig.ema9 > sig.ema21 ? "text-green-400" : "text-red-400"}`}>
              {sig.ema9 > sig.ema21 ? "↑ Bullish" : "↓ Bearish"}
            </div>
          </div>
          <div className="bg-muted/30 rounded p-2">
            <div className="text-muted-foreground">RSI 14</div>
            <div className={`font-medium ${sig.rsi14 > 70 ? "text-orange-400" : sig.rsi14 < 30 ? "text-blue-400" : "text-foreground"}`}>
              {sig.rsi14.toFixed(1)}
            </div>
          </div>
          <div className="bg-muted/30 rounded p-2">
            <div className="text-muted-foreground">Volume</div>
            <div className={`font-medium ${sig.volumeRatio >= 1 ? "text-green-400" : "text-muted-foreground"}`}>
              {(sig.volumeRatio * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Optimal entry zone */}
        {sig.side && (
          <div className={`rounded-lg p-2.5 mb-2 border text-xs flex items-center gap-2 ${
            sig.entryQuality === "at_zone" ? "bg-green-950/25 border-green-500/30 text-green-300" :
            sig.entryQuality === "near_zone" ? "bg-blue-950/20 border-blue-500/30 text-blue-300" :
            sig.entryQuality === "wait_pullback" ? "bg-yellow-950/20 border-yellow-500/30 text-yellow-300" :
            "bg-red-950/20 border-red-500/30 text-red-300"}`}>
            <span className="text-base shrink-0">
              {sig.entryQuality === "at_zone" ? "🎯" : sig.entryQuality === "near_zone" ? "📍" : sig.entryQuality === "wait_pullback" ? "⏳" : "🚫"}
            </span>
            <div>
              <div className="font-semibold">
                {sig.entryQuality === "at_zone" ? "Entry Optimal — Zona EMA/Support" :
                 sig.entryQuality === "near_zone" ? `Entry Bagus — Tunggu ke $${fmt(sig.optimalEntry, 4)}` :
                 sig.entryQuality === "wait_pullback" ? `Tunggu Pullback ke $${fmt(sig.optimalEntry, 4)}` :
                 `Chasing — Entry Berbahaya`}
              </div>
              {sig.optimalEntry !== sig.entryPrice && (
                <div className="opacity-75">Market: ${fmt(sig.entryPrice, 4)} · Optimal: ${fmt(sig.optimalEntry, 4)}</div>
              )}
            </div>
          </div>
        )}

        {/* Price targets */}
        {sig.side && (
          <div className="grid grid-cols-3 gap-1.5 text-xs mb-3">
            <div className="bg-muted/30 rounded p-2">
              <div className="text-muted-foreground">Entry</div>
              <div className="font-semibold">${fmt(sig.entryPrice, 4)}</div>
            </div>
            <div className={`rounded p-2 border ${isShort ? "bg-green-950/20 border-green-500/20" : "bg-red-950/20 border-red-500/20"}`}>
              <div className="text-muted-foreground">Stop Loss</div>
              <div className={`font-semibold ${isShort ? "text-green-400" : "text-red-400"}`}>${fmt(sig.stopLoss, 4)}</div>
            </div>
            <div className={`rounded p-2 border ${isShort ? "bg-red-950/20 border-red-500/20" : "bg-green-950/20 border-green-500/20"}`}>
              <div className="text-muted-foreground">Take Profit</div>
              <div className={`font-semibold ${isShort ? "text-red-400" : "text-green-400"}`}>${fmt(sig.takeProfit, 4)}</div>
            </div>
          </div>
        )}

        {sig.side && (
          <div className="flex items-center justify-between text-xs mb-3 px-1">
            <span className="text-muted-foreground">RR Ratio</span>
            <span className={`font-bold ${sig.riskReward >= 1.5 ? "text-green-400" : "text-red-400"}`}>
              1 : {sig.riskReward.toFixed(2)} {sig.riskReward < 1.5 && "⚠ < 1.5x"}
            </span>
            <span className="text-muted-foreground">TF 15M</span>
            <span className={`font-medium ${sig.trend15m === "bullish" ? "text-green-400" : sig.trend15m === "bearish" ? "text-red-400" : "text-yellow-400"}`}>
              {sig.trend15m}
            </span>
          </div>
        )}

        {/* Expand toggle */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setExpanded(!expanded)}>
            <BookOpen className="h-3 w-3 mr-1" />{expanded ? "Tutup Detail" : "Detail & Checklist"}
          </Button>
          <Button variant="outline" size="sm" className="text-xs border-primary/40 text-primary" disabled={refreshing} onClick={() => onRefresh(sig.symbol)}>
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-4 space-y-3">
            <div className="border-t border-border pt-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Checklist Wajib Sebelum Entry
              </div>
              <div className="space-y-1.5">
                <CheckItem label="EMA9/21 Crossover di TF 5M" passed={sig.checklist.emaCrossover}
                  note={sig.crossoverType !== "none" ? `${sig.crossoverType === "golden" ? "Golden" : "Death"} cross ${sig.crossoverBars >= 0 ? `${sig.crossoverBars === 0 ? "baru saja" : `${sig.crossoverBars} candle lalu`}` : "terdeteksi"}` : "Belum ada crossover segar"} />
                <CheckItem label="RSI di zona ideal" passed={sig.checklist.rsiInZone}
                  note={`RSI ${sig.rsi14.toFixed(1)} — ideal BUY: 50–65, SHORT: 35–50`} />
                <CheckItem label="Volume di atas rata-rata" passed={sig.checklist.volumeAboveAvg}
                  note={`${(sig.volumeRatio * 100).toFixed(0)}% vs rata-rata`} />
                <CheckItem label="TF 15M searah dengan sinyal" passed={sig.checklist.tf15mAligned}
                  note={`15M: ${sig.trend15m}`} />
                <CheckItem label="Tidak overbought/oversold" passed={sig.checklist.notOverboughtOversold}
                  note="RSI tidak melampaui 70 (OB) atau 30 (OS)" />
                <CheckItem label="RR Ratio ≥ 1:1.5" passed={sig.checklist.rrMet}
                  note={`RR saat ini: 1:${sig.riskReward.toFixed(2)}`} />
                <CheckItem label="Sesi trading optimal" passed={sig.checklist.inTradingSession}
                  note={`${sig.session.name} (${sig.session.wibTime})`} />
              </div>
            </div>

            {/* S&R */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-green-950/15 rounded-lg p-2.5 border border-green-500/20">
                <div className="text-green-400 font-semibold mb-1">Support (15M)</div>
                <div className="font-bold">${fmt(sig.nearestSupport, 4)}</div>
                <div className="text-muted-foreground text-[10px]">acuan SL LONG</div>
              </div>
              <div className="bg-red-950/15 rounded-lg p-2.5 border border-red-500/20">
                <div className="text-red-400 font-semibold mb-1">Resistance (15M)</div>
                <div className="font-bold">${fmt(sig.nearestResistance, 4)}</div>
                <div className="text-muted-foreground text-[10px]">acuan SL SHORT</div>
              </div>
            </div>

            {/* Reasons */}
            {sig.reasons.length > 0 && (
              <div className="space-y-1">
                <div className={`text-xs font-semibold uppercase tracking-wide ${sig.side === "Buy" ? "text-green-400" : sig.side === "Sell" ? "text-red-400" : "text-muted-foreground"}`}>
                  Konfirmasi ({sig.reasons.length})
                </div>
                {sig.reasons.map((r, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs rounded px-2.5 py-1.5 ${sig.side === "Buy" ? "bg-green-950/15 border border-green-500/15" : "bg-red-950/15 border border-red-500/15"}`}>
                    <CheckCircle2 className={`h-3 w-3 shrink-0 mt-0.5 ${sig.side === "Buy" ? "text-green-400" : "text-red-400"}`} />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {sig.warnings.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">Peringatan</div>
                {sig.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-yellow-950/15 border border-yellow-500/15 rounded px-2.5 py-1.5">
                    <AlertTriangle className="h-3 w-3 text-yellow-400 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Strategy Guide Panel ─────────────────────────────────────────────────────

function StrategyGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-muted/10">
      <button className="w-full flex items-center justify-between p-4 text-sm font-semibold" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" />Panduan Strategi Scalping 5 Menit</div>
        <span className="text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 text-xs">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-green-950/15 rounded-xl p-3 border border-green-500/20">
              <div className="font-semibold text-green-400 mb-2">Setup LONG (BUY)</div>
              <ol className="space-y-1 list-decimal list-inside text-muted-foreground">
                <li>EMA9 cross ke atas EMA21 di TF 5M</li>
                <li>RSI di rentang 50–65 (bukan overbought)</li>
                <li>Harga bounce dari support / breakout resistance dengan volume tinggi</li>
                <li>Tren TF 15M bullish</li>
              </ol>
              <div className="mt-2 text-green-300 text-[11px]">Entry: Pembukaan candle berikutnya</div>
            </div>
            <div className="bg-red-950/15 rounded-xl p-3 border border-red-500/20">
              <div className="font-semibold text-red-400 mb-2">Setup SHORT (SELL)</div>
              <ol className="space-y-1 list-decimal list-inside text-muted-foreground">
                <li>EMA9 cross ke bawah EMA21 di TF 5M</li>
                <li>RSI di rentang 35–50 (bukan oversold)</li>
                <li>Harga rejection dari resistance / breakdown support dengan volume meningkat</li>
                <li>Tren TF 15M bearish</li>
              </ol>
              <div className="mt-2 text-red-300 text-[11px]">Entry: Pembukaan candle berikutnya</div>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="bg-muted/20 rounded-xl p-3 border border-border">
              <div className="font-semibold mb-2 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-primary" />Manajemen Risiko</div>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Risiko per trade: <span className="text-foreground">1–2% modal</span></li>
                <li>• Min RR: <span className="text-foreground">1:1.5</span></li>
                <li>• Max trade/sesi: <span className="text-foreground">3–5 kali</span></li>
                <li>• Daily loss limit: <span className="text-red-400">-3% stop!</span></li>
                <li>• Leverage maks: <span className="text-foreground">5x (pemula), 10x (expert)</span></li>
              </ul>
            </div>
            <div className="bg-muted/20 rounded-xl p-3 border border-border">
              <div className="font-semibold mb-2 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" />Sesi Terbaik (WIB)</div>
              <ul className="space-y-1 text-muted-foreground">
                <li>🟢 <span className="text-green-400">NY Open:</span> 20:00–23:00</li>
                <li>🟢 <span className="text-green-400">London:</span> 14:00–17:00</li>
                <li>🔵 Pre-NY: 17:00–20:00</li>
                <li>⚪ Asian: 07:00–14:00</li>
                <li>🔴 <span className="text-red-400">Dead Zone:</span> 01:00–07:00</li>
              </ul>
            </div>
            <div className="bg-muted/20 rounded-xl p-3 border border-border">
              <div className="font-semibold mb-2 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />Hal yang Dihindari</div>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Listing token baru</li>
                <li>• FUD/FOMO besar</li>
                <li>• Averaging down</li>
                <li>• Pindah SL menjauhi harga</li>
                <li>• Overtrading (bosan)</li>
                <li>• Weekend volume rendah</li>
              </ul>
            </div>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
            <div className="font-semibold text-primary mb-2">Target Realistis</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["Rp 5 juta", "Rp 25–50rb/hari"], ["Rp 10 juta", "Rp 50–100rb/hari"], ["Rp 50 juta", "Rp 250–500rb/hari"]].map(([modal, target]) => (
                <div key={modal} className="bg-background/50 rounded-lg p-2">
                  <div className="text-muted-foreground">{modal}</div>
                  <div className="font-semibold text-primary">{target}</div>
                  <div className="text-[10px] text-muted-foreground">0.5–1%/hari</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Scalping5M() {
  const { toast } = useToast();
  const [signals, setSignals] = useState<Scalp5mSignal[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingSymbol, setRefreshingSymbol] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const loadSignals = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [sigs, stats] = await Promise.all([
        apiFetch<Scalp5mSignal[]>("/api/trading/scalp5m/signals"),
        apiFetch<SessionStats>("/api/trading/scalp5m/session"),
      ]);
      setSignals(sigs);
      setSessionStats(stats);
      setLastUpdated(Date.now());
    } catch (err) {
      toast({ title: "Gagal memuat sinyal", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [toast]);

  const refreshSymbol = async (symbol: string) => {
    setRefreshingSymbol(symbol);
    try {
      const pair = signals.find((s) => s.symbol === symbol);
      const updated = await apiFetch<Scalp5mSignal>(`/api/trading/scalp5m/analyze/${symbol}`);
      setSignals((prev) => prev.map((s) => s.symbol === symbol ? updated : s));
    } catch (err) {
      toast({ title: "Refresh gagal", description: String(err), variant: "destructive" });
    } finally {
      setRefreshingSymbol(null);
    }
  };

  const resetSession = async () => {
    await apiFetch("/api/trading/scalp5m/session/reset", { method: "POST" });
    const stats = await apiFetch<SessionStats>("/api/trading/scalp5m/session");
    setSessionStats(stats);
    toast({ title: "Sesi direset", description: "Trade count dan daily PnL telah direset." });
  };

  useEffect(() => { void loadSignals(); }, [loadSignals]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const id = setInterval(() => void loadSignals(true), 120_000);
    return () => clearInterval(id);
  }, [loadSignals]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">Menganalisis BTC, ETH, SOL, BNB di TF 5M…</div>
      </div>
    );
  }

  const anySession = signals[0]?.session;
  const validSignals = signals.filter((s) => !s.isHighRisk);
  const skippedSignals = signals.filter((s) => s.isHighRisk);
  const readySignals = validSignals.filter((s) => s.allChecksPassed);
  const longSignals = validSignals.filter((s) => s.side === "Buy");
  const shortSignals = validSignals.filter((s) => s.side === "Sell");
  const tradesFull = (sessionStats?.tradesCount ?? 0) >= 5;
  const sessionStopped = sessionStats?.sessionStopped ?? false;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Timer className="h-6 w-6 text-blue-400" />Scalping 5 Menit
          </h1>
          <p className="text-sm text-muted-foreground">EMA 9/21 · RSI 14 · Volume · S&R 15M · BTC ETH SOL BNB</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{lastUpdated ? timeAgo(lastUpdated) : "—"}</span>
          <Button variant="outline" size="sm" onClick={() => void loadSignals(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Session Banner — always shown if data loaded */}
      {anySession && <SessionBanner session={anySession} />}

      {/* Session stopped warning */}
      {sessionStopped && (
        <div className="rounded-xl bg-red-950/40 border border-red-500/50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-red-400">⛔ Sesi Dihentikan — Daily Loss Limit Tercapai</div>
            <div className="text-sm text-muted-foreground mt-1">
              Daily PnL: <span className="text-red-400 font-semibold">{sessionStats?.dailyPnl.toFixed(2)}%</span> · 
              Batas: {sessionStats?.dailyLossLimit}% · Jangan trading lagi hari ini. Lindungi modal!
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Activity className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Siap Entry</span></div>
          <div className={`font-bold text-xl ${readySignals.length > 0 ? "text-green-400" : "text-muted-foreground"}`}>{readySignals.length}</div>
          <div className="text-xs text-muted-foreground">dari {validSignals.length} valid</div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><BarChart2 className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Sinyal Valid</span></div>
          <div className="font-bold flex items-center gap-2">
            <span className="text-green-400">{longSignals.length}↑</span>
            <span className="text-red-400">{shortSignals.length}↓</span>
          </div>
          <div className="text-xs text-muted-foreground">LONG / SHORT</div>
        </CardContent></Card>

        <Card className={tradesFull || sessionStopped ? "border-red-500/30" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Target className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Trade Hari Ini</span></div>
            <div className={`font-bold text-xl ${tradesFull ? "text-red-400" : "text-foreground"}`}>
              {sessionStats?.tradesCount ?? 0} <span className="text-sm text-muted-foreground">/ 5</span>
            </div>
            <div className={`text-xs ${tradesFull ? "text-red-400" : "text-muted-foreground"}`}>
              {tradesFull ? "Batas tercapai!" : "Max 3–5 trade/hari"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Daily PnL</span></div>
              <button onClick={resetSession} className="text-muted-foreground hover:text-foreground p-0.5 rounded">
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>
            <div className={`font-bold text-xl ${(sessionStats?.dailyPnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
              {(sessionStats?.dailyPnl ?? 0) >= 0 ? "+" : ""}{(sessionStats?.dailyPnl ?? 0).toFixed(2)}%
            </div>
            <div className={`text-xs ${sessionStopped ? "text-red-400" : "text-muted-foreground"}`}>
              {sessionStopped ? "⛔ Limit -3% tercapai" : `Limit: ${sessionStats?.dailyLossLimit ?? -3}%`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert if trades full */}
      {tradesFull && !sessionStopped && (
        <div className="rounded-xl bg-orange-950/30 border border-orange-500/40 p-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
          <span className="text-orange-300">Sudah 5 trade hari ini — <strong>berhenti trading</strong> untuk menghindari overtrading. Istirahat dan mulai besok.</span>
        </div>
      )}

      {/* Signal Grid — Valid only */}
      <div>
        {validSignals.length === 0 && skippedSignals.length > 0 && (
          <div className="rounded-xl bg-orange-950/20 border border-orange-500/30 p-4 flex items-start gap-3 text-sm mb-4">
            <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-orange-300 mb-1">Tidak ada entry aman saat ini</div>
              <div className="text-muted-foreground text-xs">Semua pair sedang dalam kondisi berisiko tinggi. Tunggu setup yang lebih baik — jangan memaksakan entry.</div>
            </div>
          </div>
        )}
        {readySignals.length > 0 && (
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-400">
            <CheckCircle2 className="h-4 w-4" />Setup Valid — Semua Checklist Terpenuhi ({readySignals.length})
          </div>
        )}
        {validSignals.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 mb-4">
            {validSignals.map((sig) => (
              <SignalCard
                key={sig.symbol}
                sig={sig}
                onRefresh={refreshSymbol}
                refreshing={refreshingSymbol === sig.symbol}
              />
            ))}
          </div>
        )}

        {/* Skipped high-risk signals */}
        {skippedSignals.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/10 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground border-b border-border">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <span className="font-semibold">Dilewati karena Risiko Tinggi ({skippedSignals.length})</span>
              <span className="text-xs ml-auto opacity-60">Entry tidak direkomendasikan</span>
            </div>
            <div className="divide-y divide-border">
              {skippedSignals.map((sig) => (
                <div key={sig.symbol} className="px-4 py-3 flex items-center gap-3 text-sm">
                  <span className="font-bold text-foreground w-16">{sig.displayName}</span>
                  <span className="text-muted-foreground text-xs flex-1">{sig.riskReason ?? "Kondisi pasar tidak mendukung"}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    sig.riskLevel === "extreme" ? "bg-red-950/40 text-red-400 border border-red-500/30" :
                    "bg-orange-950/40 text-orange-400 border border-orange-500/30"}`}>
                    {sig.riskLevel === "extreme" ? "EXTREME" : "HIGH"} RISK
                  </span>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => void refreshSymbol(sig.symbol)}
                    disabled={refreshingSymbol === sig.symbol}
                  >
                    {refreshingSymbol === sig.symbol ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Strategy Guide */}
      <StrategyGuide />

      {/* Disclaimer */}
      <div className="rounded-xl bg-muted/20 border border-border p-3 text-xs text-muted-foreground">
        <strong>Disclaimer:</strong> Trading crypto mengandung risiko tinggi. Strategi ini bukan jaminan profit. 
        Selalu gunakan akun demo terlebih dahulu. Jangan trading dengan uang yang tidak sanggup hilang.
      </div>
    </div>
  );
}
