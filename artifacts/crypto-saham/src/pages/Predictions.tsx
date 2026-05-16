import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Activity, Filter, Lock, RefreshCw, Unlock,
  TrendingUp, TrendingDown, X, Trophy, Minus,
  Clock, ShieldCheck, ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PriceChange } from "@/components/shared/PriceChange";
import { SignalBadge } from "@/components/shared/SignalBadge";
import { useGetPredictions, GetPredictionsType } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";

const PREDICTION_LOCK_MS = 5 * 60 * 1000;
const LOCK_OPTIONS_SECS = [60, 2 * 60, 5 * 60, 10 * 60, 15 * 60] as const;
const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const LOCK_DURATIONS: { label: string; minutes: 15 | 60 | 180 | 360 | 720 | 1440 }[] = [
  { label: "15 Menit", minutes: 15 },
  { label: "1 Jam",    minutes: 60 },
  { label: "3 Jam",   minutes: 180 },
  { label: "6 Jam",   minutes: 360 },
  { label: "12 Jam",  minutes: 720 },
  { label: "24 Jam",  minutes: 1440 },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface LockedPrediction {
  id: string;
  assetName: string;
  symbol: string;
  image: string | null;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  expiresAt: number;
  lockedAt: number;
  lockDurationMs: number;
  assetType: "crypto" | "stock";
  confidence: number;
  status: "active" | "validated" | "expired";
  result: "WIN" | "LOSS" | "NEUTRAL" | null;
  finalPrice: number | null;
  priceDeltaPct: number | null;
  virtualPnl: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function LiveCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const rem = expiresAt - now;
  if (rem <= 0) return <span className="text-yellow-400 font-mono text-[10px]">Menunggu validasi</span>;
  const h = Math.floor(rem / 3600000);
  const m = Math.floor((rem % 3600000) / 60000);
  const s = Math.floor((rem % 60000) / 1000);
  const str = h > 0 ? `${h}j ${m}m` : `${m}:${String(s).padStart(2, "0")}`;
  return <span className="text-primary font-mono text-[10px] font-bold">{str}</span>;
}

// ─── PredictionLockBanner (refresh timer) ─────────────────────────────────────

function PredictionLockBanner({
  dataUpdatedAt, lockMs, onChangeLock,
}: { dataUpdatedAt: number; lockMs: number; onChangeLock: (ms: number) => void }) {
  const [now, setNow] = useState(Date.now());
  const [unlocking, setUnlocking] = useState(false);
  const prevUpdatedAt = useRef(dataUpdatedAt);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (dataUpdatedAt !== prevUpdatedAt.current && prevUpdatedAt.current !== 0) {
      setUnlocking(true);
      timer = setTimeout(() => setUnlocking(false), 2000);
    }
    prevUpdatedAt.current = dataUpdatedAt;
    return () => { if (timer) clearTimeout(timer); };
  }, [dataUpdatedAt]);

  const lockedUntil = dataUpdatedAt + lockMs;
  const remaining = lockedUntil - now;
  const elapsed = lockMs - Math.max(0, remaining);
  const progress = Math.min(100, (elapsed / lockMs) * 100);
  const isExpired = remaining <= 0;

  return (
    <div className={`rounded-xl border p-3.5 flex flex-col gap-2.5 transition-all duration-500 ${
      unlocking ? "border-green-500/60 bg-green-500/10"
      : isExpired ? "border-yellow-500/40 bg-yellow-500/5"
      : "border-primary/20 bg-muted/30"
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          {unlocking ? <Unlock className="h-4 w-4 text-green-400 animate-bounce" />
            : isExpired ? <RefreshCw className="h-4 w-4 text-yellow-400 animate-spin" />
            : <Lock className="h-4 w-4 text-primary" />}
          <div>
            <p className="text-sm font-semibold leading-none">
              {unlocking ? "Prediksi Diperbarui!" : isExpired ? "Memuat prediksi baru…" : "Prediksi Terkunci"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {unlocking ? "Sinyal AI terbaru sudah tersedia"
                : isExpired ? "Menunggu data baru dari server"
                : `Sinyal tidak berubah selama ${Math.round(lockMs / 60_000)} menit`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {LOCK_OPTIONS_SECS.map((secs) => {
              const ms = secs * 1000;
              const label = secs < 60 ? `${secs}d` : `${secs / 60}m`;
              return (
                <button key={secs} onClick={() => onChangeLock(ms)}
                  className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors ${
                    lockMs === ms ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >{label}</button>
              );
            })}
          </div>
          {!isExpired && !unlocking && (
            <div className="text-right min-w-[48px]">
              <p className="text-lg font-bold tabular-nums leading-none text-primary">{formatCountdown(remaining)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">tersisa</p>
            </div>
          )}
        </div>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${
          unlocking ? "bg-green-500" : isExpired ? "bg-yellow-500 animate-pulse" : "bg-primary"
        }`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

// ─── Mini helpers ─────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 70 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${value}%` }} />
    </div>
  );
}

function SentimentDot({ score }: { score: number }) {
  const color = score > 0.1 ? "bg-green-500" : score < -0.1 ? "bg-red-500" : "bg-yellow-500";
  const label = score > 0.1 ? "Positif" : score < -0.1 ? "Negatif" : "Netral";
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color} shrink-0`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Riwayat Lock Mini Panel ──────────────────────────────────────────────────

function RiwayatLockPanel() {
  const [locks, setLocks] = useState<LockedPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/prediction-locks`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLocks(data.slice(0, 5)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (locks.length === 0) return null;

  const wins = locks.filter((l) => l.result === "WIN").length;
  const losses = locks.filter((l) => l.result === "LOSS").length;
  const active = locks.filter((l) => l.status === "active").length;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Riwayat Prediction Lock</span>
          <div className="flex items-center gap-1.5 ml-1">
            {active > 0 && (
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0 gap-1">
                <Clock className="h-2.5 w-2.5" /> {active} active
              </Badge>
            )}
            {wins > 0 && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0 gap-1">
                <Trophy className="h-2.5 w-2.5" /> {wins} WIN
              </Badge>
            )}
            {losses > 0 && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] px-1.5 py-0">
                {losses} LOSS
              </Badge>
            )}
          </div>
        </div>
        <Link href="/prediction-locks">
          <button className="text-xs text-primary hover:underline flex items-center gap-1">
            Lihat semua <ExternalLink className="h-3 w-3" />
          </button>
        </Link>
      </div>

      {/* Lock rows */}
      <div className="space-y-2">
        {locks.map((lock) => {
          const isActive = lock.status === "active";
          const resultColor = lock.result === "WIN" ? "text-green-400"
            : lock.result === "LOSS" ? "text-red-400" : "text-muted-foreground";
          const resultIcon = lock.result === "WIN" ? <Trophy className="h-3 w-3 text-green-400" />
            : lock.result === "LOSS" ? <TrendingDown className="h-3 w-3 text-red-400" />
            : lock.result === "NEUTRAL" ? <Minus className="h-3 w-3 text-muted-foreground" />
            : null;

          return (
            <div key={lock.id}
              className={`flex items-center gap-3 p-2.5 rounded-lg border text-xs ${
                lock.result === "WIN" ? "border-green-500/20 bg-green-500/5"
                : lock.result === "LOSS" ? "border-red-500/20 bg-red-500/5"
                : isActive ? "border-primary/20 bg-primary/5"
                : "border-border bg-muted/10"
              }`}
            >
              {/* Image */}
              {lock.image ? (
                <img src={lock.image} alt={lock.assetName} className="w-7 h-7 rounded-full shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                  {lock.symbol.slice(0, 3)}
                </div>
              )}

              {/* Asset */}
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{lock.assetName}</p>
                <p className="text-muted-foreground">{lock.symbol}</p>
              </div>

              {/* Direction */}
              <div className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                lock.direction === "LONG" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
              }`}>
                {lock.direction}
              </div>

              {/* Entry price */}
              <div className="text-right">
                <p className="text-muted-foreground text-[10px]">Entry</p>
                <p className="font-bold tabular-nums">
                  {formatCurrency(lock.entryPrice, lock.assetType === "stock" ? "IDR" : "USD")}
                </p>
              </div>

              {/* Status / result */}
              <div className="text-right min-w-[70px]">
                {isActive ? (
                  <>
                    <p className="text-muted-foreground text-[10px]">Sisa</p>
                    <LiveCountdown expiresAt={lock.expiresAt} />
                  </>
                ) : lock.result ? (
                  <div className="flex items-center gap-1 justify-end">
                    {resultIcon}
                    <span className={`font-bold text-[11px] ${resultColor}`}>{lock.result}</span>
                    {lock.virtualPnl != null && (
                      <span className={`text-[10px] ${resultColor}`}>
                        {lock.virtualPnl >= 0 ? "+" : ""}{lock.virtualPnl.toFixed(1)}%
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-[10px]">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Lock Modal ───────────────────────────────────────────────────────────────

interface LockTarget {
  assetId: string;
  assetName: string;
  assetType: string;
  symbol: string;
  image?: string | null;
  currentPrice: number | null;
  confidence: number;
  signal: string;
  reasons: string[];
}

function LockModal({ prediction, onClose, onLocked }: {
  prediction: LockTarget | null;
  onClose: () => void;
  onLocked: () => void;
}) {
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [durationMinutes, setDurationMinutes] = useState<15 | 60 | 180 | 360 | 720 | 1440>(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!prediction) return;
    if (prediction.signal?.includes("buy") || prediction.signal === "strong_buy") setDirection("LONG");
    else if (prediction.signal?.includes("sell") || prediction.signal === "strong_sell") setDirection("SHORT");
  }, [prediction?.signal]);

  if (!prediction) return null;

  async function handleSubmit() {
    if (!prediction!.currentPrice) { setError("Harga entry tidak tersedia."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/prediction-locks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: prediction!.assetId,
          assetName: prediction!.assetName,
          assetType: prediction!.assetType,
          symbol: prediction!.symbol,
          image: prediction!.image ?? null,
          direction,
          entryPrice: prediction!.currentPrice,
          lockDurationMinutes: durationMinutes,
          confidence: prediction!.confidence,
          signal: prediction!.signal,
          reasoning: prediction!.reasons,
          strategy: "rule-based-35-indicator",
        }),
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? "Gagal"); }
      setDone(true);
      onLocked();
      setTimeout(() => { setDone(false); onClose(); }, 1200);
    } catch (err: any) {
      setError(err.message ?? "Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base">Kunci Prediksi</h2>
              <p className="text-xs text-muted-foreground">{prediction.assetName} · {prediction.symbol}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Entry price */}
          <div className="bg-muted/30 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Harga Entry (dikunci permanen)</p>
              <p className="text-xl font-bold tabular-nums text-primary mt-0.5">
                {prediction.currentPrice != null
                  ? formatCurrency(prediction.currentPrice, prediction.assetType === "stock" ? "IDR" : "USD")
                  : "Tidak tersedia"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Confidence</p>
              <p className={`text-lg font-bold ${prediction.confidence >= 70 ? "text-green-400" : prediction.confidence >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                {prediction.confidence}%
              </p>
            </div>
          </div>

          {/* Direction */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Arah Prediksi</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDirection("LONG")}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-semibold text-sm transition-all ${
                  direction === "LONG" ? "border-green-500 bg-green-500/15 text-green-400" : "border-border bg-muted/20 text-muted-foreground hover:border-green-500/40"
                }`}>
                <TrendingUp className="h-4 w-4" /> LONG (Naik)
              </button>
              <button onClick={() => setDirection("SHORT")}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-semibold text-sm transition-all ${
                  direction === "SHORT" ? "border-red-500 bg-red-500/15 text-red-400" : "border-border bg-muted/20 text-muted-foreground hover:border-red-500/40"
                }`}>
                <TrendingDown className="h-4 w-4" /> SHORT (Turun)
              </button>
            </div>
          </div>

          {/* Duration */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Durasi Lock</p>
            <div className="grid grid-cols-3 gap-2">
              {LOCK_DURATIONS.map((d) => (
                <button key={d.minutes} onClick={() => setDurationMinutes(d.minutes)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    durationMinutes === d.minutes ? "border-primary bg-primary/15 text-primary" : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40"
                  }`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reasoning */}
          {prediction.reasons.length > 0 && (
            <div className="bg-muted/20 rounded-lg p-3 space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reasoning AI</p>
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{prediction.reasons[0]}</p>
            </div>
          )}

          {/* Warning */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-xs text-yellow-400 leading-relaxed">
            ⚠ Setelah dikunci, harga entry tidak bisa diubah. Divalidasi otomatis setelah durasi berakhir.
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Submit */}
          <Button className="w-full h-11 gap-2 font-semibold" onClick={handleSubmit}
            disabled={submitting || !prediction.currentPrice}>
            {done ? (
              <><ShieldCheck className="h-4 w-4" /> Berhasil dikunci!</>
            ) : submitting ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Mengunci...</>
            ) : (
              <><Lock className="h-4 w-4" /> Kunci {direction} — {LOCK_DURATIONS.find((d) => d.minutes === durationMinutes)?.label}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Predictions() {
  const [type, setType] = useState<"all" | "crypto" | "stock">("crypto");
  const [lockMs, setLockMs] = useState(PREDICTION_LOCK_MS);
  const [lockTarget, setLockTarget] = useState<LockTarget | null>(null);
  const [refreshLocks, setRefreshLocks] = useState(0);

  const { data: predictions, isLoading, error, dataUpdatedAt } = useGetPredictions(
    { limit: 20, type: type as typeof GetPredictionsType[keyof typeof GetPredictionsType] },
    { query: { refetchInterval: lockMs } as any },
  );

  const predArray = Array.isArray(predictions) ? predictions : [];
  const grouped = {
    strong_buy: predArray.filter((p) => p.signal === "strong_buy"),
    buy: predArray.filter((p) => p.signal === "buy"),
    neutral: predArray.filter((p) => p.signal === "neutral"),
    sell: predArray.filter((p) => p.signal === "sell"),
    strong_sell: predArray.filter((p) => p.signal === "strong_sell"),
  };

  function openLockModal(p: typeof predArray[0], e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLockTarget({
      assetId: p.assetId,
      assetName: p.assetName,
      assetType: p.assetType,
      symbol: p.symbol,
      image: p.image,
      currentPrice: p.currentPrice ?? null,
      confidence: p.confidence,
      signal: p.signal,
      reasons: Array.isArray(p.reasons) ? p.reasons : [],
    });
  }

  return (
    <div className="space-y-5">
      {lockTarget && (
        <LockModal
          prediction={lockTarget}
          onClose={() => setLockTarget(null)}
          onLocked={() => setRefreshLocks((n) => n + 1)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            AI Predictions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Analisis sentimen + teknikal untuk prediksi harga</p>
        </div>
        <Tabs value={type} onValueChange={(v) => setType(v as "all" | "crypto" | "stock")}>
          <TabsList>
            <TabsTrigger value="crypto">Crypto</TabsTrigger>
            <TabsTrigger value="stock">Saham</TabsTrigger>
            <TabsTrigger value="all">Semua</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Riwayat Lock panel — always shown */}
      <RiwayatLockPanel key={refreshLocks} />

      {/* Refresh lock banner */}
      {!isLoading && (
        <PredictionLockBanner dataUpdatedAt={dataUpdatedAt} lockMs={lockMs} onChangeLock={setLockMs} />
      )}

      {/* Signal distribution */}
      {!isLoading && predArray.length > 0 && (
        <div className="flex flex-wrap gap-3 p-3 bg-muted/30 rounded-lg border border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="h-3 w-3" /> Distribusi Sinyal:
          </span>
          {Object.entries(grouped).map(([signal, items]) => items.length > 0 && (
            <div key={signal} className="flex items-center gap-1.5">
              <SignalBadge signal={signal} />
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Terkunci {Math.round(lockMs / 60_000)} menit</span>
          </div>
        </div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-44 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : error ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Gagal memuat prediksi.</CardContent></Card>
      ) : predArray.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">Tidak ada prediksi tersedia.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {predArray.map((p) => (
            <Card key={`${p.assetType}-${p.assetId}`} className="hover:border-primary/40 transition-colors h-full flex flex-col">
              <Link href={`/predictions/${p.assetType}/${p.assetId}`} className="flex-1">
                <CardContent className="p-4 flex flex-col gap-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {p.image ? (
                        <img src={p.image} alt={p.assetName} className="w-9 h-9 rounded-full bg-muted shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                          {p.symbol.replace(".JK", "").slice(0, 4)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{p.assetName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-muted-foreground uppercase">{p.symbol.replace(".JK", "")}</p>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                            {p.assetType === "crypto" ? "Crypto" : "IDX"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <SignalBadge signal={p.signal} className="shrink-0" />
                  </div>

                  {/* Price */}
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold tabular-nums">
                      {p.currentPrice != null ? formatCurrency(p.currentPrice, p.assetType === "stock" ? "IDR" : "USD") : "–"}
                    </span>
                    <PriceChange value={p.priceChange24h} />
                  </div>

                  {/* Confidence */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Keyakinan AI</span>
                      <span className="text-xs font-bold">{p.confidence}%</span>
                    </div>
                    <ConfidenceBar value={p.confidence} />
                  </div>

                  {/* Sentiment + 7d */}
                  <div className="flex items-center justify-between">
                    <SentimentDot score={p.sentimentScore} />
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">7d</p>
                      <PriceChange value={p.priceChange7d ?? undefined} className="text-xs justify-end" />
                    </div>
                  </div>

                  {/* Top reason */}
                  {p.reasons?.length > 0 && (
                    <p className="text-xs text-muted-foreground border-t border-border pt-2.5 leading-relaxed line-clamp-2">
                      {p.reasons[0]}
                    </p>
                  )}
                </CardContent>
              </Link>

              {/* Lock button — always visible at bottom of card */}
              <div className="px-4 pb-4 pt-0">
                <button
                  onClick={(e) => openLockModal(p, e)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-primary/30 bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 hover:border-primary/50 transition-all"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Kunci Prediksi Ini
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
