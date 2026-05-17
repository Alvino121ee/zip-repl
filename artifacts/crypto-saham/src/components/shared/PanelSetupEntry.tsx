import React, { useState, useEffect } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Cpu,
  TrendingUp, TrendingDown, Zap, Target, Shield, BarChart2, Timer,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PanelSetupEntryProps {
  engineRunning: boolean;
  analyzing: boolean;
  lastCycleAt: number | null;
  nextCycleAt: number | null;
  intervalMs: number;
  cycleCount: number;
  signalsFound: number;
  totalScanned: number;
  minConfidence: number;
  maxPositions: number;
  currentPositions: number;
  mode: string;
  enabled: boolean;
  lastError?: string | null;
  source: "trading" | "demo";
  onForceScan?: () => void;
  forcingNow?: boolean;
}

// ─── Countdown Hook ───────────────────────────────────────────────────────────

function useCountdown(nextCycleAt: number | null, intervalMs: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  if (!nextCycleAt) return { secondsLeft: 0, pct: 0, label: "—" };
  const msLeft = Math.max(0, nextCycleAt - Date.now());
  const secondsLeft = Math.ceil(msLeft / 1000);
  const pct = Math.min(100, Math.max(0, ((intervalMs - msLeft) / intervalMs) * 100));
  const label = secondsLeft <= 0 ? "segera…" : secondsLeft < 60 ? `${secondsLeft}d` : `${Math.floor(secondsLeft / 60)}m ${secondsLeft % 60}d`;
  return { secondsLeft, pct, label };
}

function timeAgo(ts: number | null) {
  if (!ts) return "—";
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5) return "baru saja";
  if (d < 60) return `${d}d lalu`;
  if (d < 3600) return `${Math.floor(d / 60)}m lalu`;
  return `${Math.floor(d / 3600)}j lalu`;
}

// ─── Komponen ─────────────────────────────────────────────────────────────────

export function PanelSetupEntry({
  engineRunning,
  analyzing,
  lastCycleAt,
  nextCycleAt,
  intervalMs,
  cycleCount,
  signalsFound,
  totalScanned,
  minConfidence,
  maxPositions,
  currentPositions,
  mode,
  enabled,
  lastError,
  source,
  onForceScan,
  forcingNow,
}: PanelSetupEntryProps) {
  const { secondsLeft, pct, label } = useCountdown(nextCycleAt, intervalMs);

  const posisiPenuh = currentPositions >= maxPositions;
  const sisiOk = !posisiPenuh;

  const kriteria: { label: string; ok: boolean; nilai: string; required: string }[] = [
    {
      label: "Min Confidence",
      ok: true,
      nilai: `${minConfidence}%`,
      required: "threshold AI",
    },
    {
      label: "Slot Posisi",
      ok: sisiOk,
      nilai: `${currentPositions} / ${maxPositions}`,
      required: `< ${maxPositions}`,
    },
    {
      label: "Engine",
      ok: engineRunning,
      nilai: engineRunning ? "Aktif" : "Mati",
      required: "harus aktif",
    },
    {
      label: "Mode",
      ok: true,
      nilai: mode === "auto" ? "Auto" : "Semi",
      required: mode === "auto" ? "buka otomatis" : "catat sinyal",
    },
  ];

  const allOk = kriteria.every((k) => k.ok);

  const ringBorder = analyzing
    ? "border-yellow-500/40"
    : engineRunning && allOk
    ? "border-green-500/30"
    : engineRunning
    ? "border-orange-500/30"
    : "border-border";

  const ringBg = analyzing
    ? "bg-yellow-500/5"
    : engineRunning && allOk
    ? "bg-green-500/5"
    : engineRunning
    ? "bg-orange-500/5"
    : "bg-muted/10";

  return (
    <Card className={`border ${ringBorder} ${ringBg} transition-all`}>
      <CardContent className="p-4 space-y-3">
        {/* ── Baris atas: status + countdown ─────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          {/* Status dot + label */}
          <div className="flex items-center gap-2.5">
            {analyzing ? (
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500" />
              </span>
            ) : engineRunning ? (
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
            ) : (
              <span className="h-3 w-3 rounded-full bg-muted-foreground/40" />
            )}
            <div>
              <p className={`text-sm font-bold leading-tight ${
                analyzing ? "text-yellow-400"
                : engineRunning ? "text-green-400"
                : "text-muted-foreground"
              }`}>
                {analyzing ? "⚡ Sedang Menganalisis…"
                  : engineRunning ? "🟢 Engine Berjalan"
                  : "⚪ Engine Mati"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {source === "demo" ? "Demo Lab" : "Bybit Futures"} · {mode === "auto" ? "Full-Auto" : "Semi-Auto"}
                {cycleCount > 0 && ` · Siklus ke-${cycleCount}`}
              </p>
            </div>
          </div>

          {/* Countdown */}
          {engineRunning && (
            <div className="text-right shrink-0">
              <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-end gap-1">
                <Timer className="h-3 w-3" />
                {analyzing ? "Menganalisis…" : "Scan berikutnya"}
              </p>
              <p className={`text-xl font-bold tabular-nums font-mono ${
                secondsLeft <= 5 && !analyzing ? "text-yellow-400 animate-pulse" : "text-foreground"
              }`}>
                {analyzing ? "…" : label}
              </p>
            </div>
          )}
        </div>

        {/* ── Progress bar countdown ─────────────────────────────────────── */}
        {engineRunning && (
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  analyzing ? "bg-yellow-500 animate-pulse w-full"
                  : secondsLeft <= 5 ? "bg-yellow-400"
                  : "bg-green-500"
                }`}
                style={{ width: analyzing ? "100%" : `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Scan terakhir: {timeAgo(lastCycleAt)}</span>
              <span>Interval: {Math.round(intervalMs / 1000)}d</span>
            </div>
          </div>
        )}

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="border-t border-border/60" />

        {/* ── Grid: Kriteria Entry ──────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Kriteria Entry AI
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {kriteria.map((k) => (
              <div key={k.label} className={`rounded-lg border p-2.5 transition-colors ${
                k.ok
                  ? "bg-green-950/20 border-green-500/25"
                  : "bg-red-950/20 border-red-500/25"
              }`}>
                <div className="flex items-center gap-1 mb-1">
                  {k.ok
                    ? <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                    : <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />}
                  <span className="text-[10px] text-muted-foreground truncate">{k.label}</span>
                </div>
                <p className={`text-xs font-bold ${k.ok ? "text-green-400" : "text-red-400"}`}>
                  {k.nilai}
                </p>
                <p className="text-[10px] text-muted-foreground">{k.required}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Statistik Scan ────────────────────────────────────────────── */}
        {cycleCount > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/20 border border-border px-3 py-2 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                <BarChart2 className="h-3 w-3" />Dipindai
              </p>
              <p className="text-sm font-bold tabular-nums">{totalScanned > 0 ? totalScanned : "—"}</p>
              <p className="text-[10px] text-muted-foreground">pasang</p>
            </div>
            <div className={`rounded-lg border px-3 py-2 text-center ${
              signalsFound > 0 ? "bg-green-950/20 border-green-500/20" : "bg-muted/20 border-border"
            }`}>
              <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                <Target className="h-3 w-3" />Kandidat
              </p>
              <p className={`text-sm font-bold tabular-nums ${signalsFound > 0 ? "text-green-400" : ""}`}>
                {signalsFound}
              </p>
              <p className="text-[10px] text-muted-foreground">≥{minConfidence}% conf</p>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border px-3 py-2 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                <Activity className="h-3 w-3" />Posisi
              </p>
              <p className={`text-sm font-bold tabular-nums ${posisiPenuh ? "text-orange-400" : ""}`}>
                {currentPositions}/{maxPositions}
              </p>
              <p className="text-[10px] text-muted-foreground">{posisiPenuh ? "penuh!" : "tersedia"}</p>
            </div>
          </div>
        )}

        {/* ── Status Kondisi Entry ──────────────────────────────────────── */}
        <div className={`rounded-lg border px-3 py-2.5 flex items-start gap-2.5 ${
          !enabled ? "border-border bg-muted/10"
          : !engineRunning ? "border-orange-500/30 bg-orange-500/5"
          : posisiPenuh ? "border-orange-500/30 bg-orange-500/5"
          : analyzing ? "border-yellow-500/30 bg-yellow-500/5"
          : allOk ? "border-green-500/30 bg-green-500/5"
          : "border-red-500/30 bg-red-500/5"
        }`}>
          <span className="text-base shrink-0 mt-0.5">
            {!enabled ? "💤"
              : !engineRunning ? "⏸️"
              : posisiPenuh ? "🔒"
              : analyzing ? "🔍"
              : allOk ? "✅"
              : "⚠️"}
          </span>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${
              !enabled ? "text-muted-foreground"
              : !engineRunning ? "text-orange-400"
              : posisiPenuh ? "text-orange-400"
              : analyzing ? "text-yellow-400"
              : allOk ? "text-green-400"
              : "text-red-400"
            }`}>
              {!enabled ? "Engine Nonaktif"
                : !engineRunning ? "Engine Tidak Berjalan"
                : posisiPenuh ? `Slot Penuh (${currentPositions}/${maxPositions})`
                : analyzing ? "AI Sedang Memindai Pasar…"
                : allOk ? "Siap Entry — Semua Kondisi Terpenuhi"
                : "Kondisi Belum Lengkap"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {!enabled ? "Aktifkan engine untuk memulai trading otomatis"
                : !engineRunning ? "Engine diaktifkan tapi belum berjalan"
                : posisiPenuh ? `Tunggu salah satu posisi tertutup sebelum entry baru dibuka`
                : analyzing ? `Mencari peluang dari ${totalScanned > 0 ? totalScanned : "..."} pasang — hasil dalam beberapa detik`
                : allOk ? `Saat confidence ≥${minConfidence}% ditemukan, AI akan ${mode === "auto" ? "langsung membuka posisi" : "mencatat sinyal untuk ditinjau"}`
                : "Periksa konfigurasi — beberapa kondisi belum terpenuhi"}
            </p>
          </div>
          {onForceScan && engineRunning && !analyzing && (
            <button
              onClick={onForceScan}
              disabled={forcingNow}
              className="shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
            >
              <Zap className="h-3 w-3" />
              {forcingNow ? "…" : "Pindai"}
            </button>
          )}
        </div>

        {/* ── Arah Trading ──────────────────────────────────────────────── */}
        {engineRunning && (
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-1.5 rounded-lg bg-green-950/20 border border-green-500/20 px-3 py-2">
              <TrendingUp className="h-3.5 w-3.5 text-green-400 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-green-400">LONG</p>
                <p className="text-[10px] text-muted-foreground">Tren naik kuat</p>
              </div>
            </div>
            <div className="flex-1 flex items-center gap-1.5 rounded-lg bg-red-950/20 border border-red-500/20 px-3 py-2">
              <TrendingDown className="h-3.5 w-3.5 text-red-400 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-red-400">SHORT</p>
                <p className="text-[10px] text-muted-foreground">Tren turun kuat</p>
              </div>
            </div>
            <div className="flex-1 flex items-center gap-1.5 rounded-lg bg-muted/20 border border-border px-3 py-2">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground">SKIP</p>
                <p className="text-[10px] text-muted-foreground">Sideways</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {lastError && (
          <div className="flex items-start gap-2 rounded-lg bg-red-950/20 border border-red-500/20 px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-red-400 leading-relaxed">{lastError}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
