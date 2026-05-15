import React, { useState } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, Activity, BookOpen,
  Target, ShieldAlert, ArrowUpCircle, ArrowDownCircle, Zap, Info,
  BarChart2, Layers, TrendingUp, TrendingDown, Minus,
  Volume2, ArrowUp, ArrowDown, AlertTriangle, Brain, Flame, Eye,
  CandlestickChart, GitBranch,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PriceChange } from "@/components/shared/PriceChange";
import { SignalBadge } from "@/components/shared/SignalBadge";
import {
  useGetPredictionDetail,
  useGetCryptoHistory,
  getGetCryptoHistoryQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ═══════════════════════════ TYPE DEFINITIONS ══════════════════════════════ */

type Signal = "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";

/* ═══════════════════════════ TRADE SETUP ═══════════════════════════════════ */

interface TradeSetup {
  direction: "LONG" | "SHORT" | null;
  entryLow: number; entryHigh: number;
  stopLoss: number; slPct: number;
  tp1: number; tp1Pct: number; tp1RR: number;
  tp2: number; tp2Pct: number; tp2RR: number;
  tp3: number; tp3Pct: number; tp3RR: number;
  leverage: number; maxLeverage: number;
}

function buildTradeSetup(
  signal: Signal, price: number, confidence: number,
  change24h: number, support?: number | null, resistance?: number | null,
): TradeSetup | null {
  if (signal === "neutral" || price <= 0) return null;
  const isLong = signal === "buy" || signal === "strong_buy";
  const entryLow  = price * (isLong ? 0.997 : 1.003);
  const entryHigh = price * (isLong ? 1.003 : 1.007);
  const vol = Math.min(Math.abs(change24h), 20);
  const slPct = Math.max(3, Math.min(12, vol * 0.6 + 3));
  let stopLoss: number;
  if (isLong) {
    const s = (support && support > 0 && support < price) ? support : price * (1 - slPct / 100);
    stopLoss = Math.min(s, price * (1 - slPct / 100));
  } else {
    const r = (resistance && resistance > 0 && resistance > price) ? resistance : price * (1 + slPct / 100);
    stopLoss = Math.max(r, price * (1 + slPct / 100));
  }
  const actualSlPct = Math.abs((stopLoss - price) / price) * 100;
  const tp = (rr: number) => isLong ? price * (1 + (actualSlPct * rr) / 100) : price * (1 - (actualSlPct * rr) / 100);
  const tpPct = (rr: number) => parseFloat((actualSlPct * rr).toFixed(2));
  const baseLev = signal === "strong_buy" || signal === "strong_sell" ? 5 : 3;
  const confBonus = confidence >= 75 ? 5 : confidence >= 60 ? 3 : 1;
  const leverage = Math.min(baseLev + confBonus, 20);
  return {
    direction: isLong ? "LONG" : "SHORT",
    entryLow, entryHigh, stopLoss,
    slPct: parseFloat(actualSlPct.toFixed(2)),
    tp1: tp(1.5), tp1Pct: tpPct(1.5), tp1RR: 1.5,
    tp2: tp(2.5), tp2Pct: tpPct(2.5), tp2RR: 2.5,
    tp3: tp(4.0), tp3Pct: tpPct(4.0), tp3RR: 4.0,
    leverage, maxLeverage: Math.min(leverage + 5, 25),
  };
}

/* ═══════════════════════════ MARKET ANALYSIS ═══════════════════════════════ */

interface SRLevel {
  label: string; price: number;
  type: "support" | "resistance";
  strength: "strong" | "moderate" | "weak";
  note: string;
}

interface MarketAnalysis {
  srLevels: SRLevel[];
  positionInRange: number;   // 0-100
  srComment: string;
  orderFlowScore: number;    // -100 to +100
  orderFlowLabel: string;
  delta: "bullish" | "bearish" | "neutral";
  buyPressurePct: number;    // 0-100
  volumeStatus: "high" | "normal" | "low";
  volumeTrend: string;
  volumeConfirm: boolean;
  volumeComment: string;
  ema7: number | null;
  ema25: number | null;
  vwap: number;
  priceVsEma7: "above" | "below" | "at";
  priceVsVwap: "above" | "below" | "at";
  emaCross: "golden" | "death" | "neutral";
  maComment: string;
}

function buildMarketAnalysis(
  price: number,
  support: number,
  resistance: number,
  change24h: number,
  change7d: number | null,
  volumeTrend: string,
  ema7input: number | null,
  signal: string,
  backendVwap?: number | null,
  backendEma25?: number | null,
): MarketAnalysis {
  const ema7 = ema7input;
  const srRange = resistance - support;

  // ── Support & Resistance levels ──────────────────────────────────────────
  const srLevels: SRLevel[] = [
    { label: "S3", price: support * 0.90, type: "support", strength: "weak",     note: "Support psikologis jauh (-10%)" },
    { label: "S2", price: support * 0.95, type: "support", strength: "moderate", note: "Support menengah (-5%)" },
    { label: "S1", price: support,        type: "support", strength: "strong",   note: "Support kuat — low 24 jam" },
    { label: "R1", price: resistance,     type: "resistance", strength: "strong",   note: "Resistance kuat — high 24 jam" },
    { label: "R2", price: resistance * 1.05, type: "resistance", strength: "moderate", note: "Resistance menengah (+5%)" },
    { label: "R3", price: resistance * 1.10, type: "resistance", strength: "weak",     note: "Resistance psikologis jauh (+10%)" },
  ];

  const positionInRange = srRange > 0
    ? Math.max(0, Math.min(100, ((price - support) / srRange) * 100))
    : 50;

  const srComment =
    positionInRange >= 85 ? "Harga mendekati resistance — waspadai pembalikan atau breakout" :
    positionInRange <= 15 ? "Harga mendekati support — potensi bounce atau breakdown" :
    positionInRange >= 60 ? "Harga di area upper range — momentum bullish" :
    positionInRange <= 40 ? "Harga di area lower range — tekanan jual dominan" :
    "Harga di tengah range — tunggu breakout arah";

  // ── Order Flow ────────────────────────────────────────────────────────────
  // Buyer/seller ratio dari posisi harga dalam range
  // >60 = buyers in control, <40 = sellers, 40-60 = contested
  const orderFlowScore = Math.round((positionInRange - 50) * 2); // -100 to +100
  const buyPressurePct = positionInRange;
  const delta: MarketAnalysis["delta"] =
    orderFlowScore >  25 ? "bullish" :
    orderFlowScore < -25 ? "bearish" : "neutral";

  const orderFlowLabel =
    orderFlowScore >= 50  ? "Tekanan Beli Sangat Kuat" :
    orderFlowScore >= 25  ? "Tekanan Beli Dominan" :
    orderFlowScore >= 10  ? "Sedikit Tekanan Beli" :
    orderFlowScore <= -50 ? "Tekanan Jual Sangat Kuat" :
    orderFlowScore <= -25 ? "Tekanan Jual Dominan" :
    orderFlowScore <= -10 ? "Sedikit Tekanan Jual" :
    "Order Flow Seimbang";

  // ── Volume ────────────────────────────────────────────────────────────────
  const volumeStatus: MarketAnalysis["volumeStatus"] =
    volumeTrend === "increasing" ? "high" :
    volumeTrend === "decreasing" ? "low" : "normal";

  const isBull = signal === "buy" || signal === "strong_buy";
  const isBear = signal === "sell" || signal === "strong_sell";
  const volumeConfirm =
    (volumeStatus === "high"   && isBull && change24h > 0) ||
    (volumeStatus === "high"   && isBear && change24h < 0) ||
    (volumeStatus === "normal" && Math.abs(change24h) < 3);

  const volumeComment =
    volumeStatus === "high" && volumeConfirm
      ? "Volume tinggi mengkonfirmasi momentum — sinyal kuat"
      : volumeStatus === "high" && !volumeConfirm
      ? "Volume tinggi tapi berlawanan arah — waspada divergensi"
      : volumeStatus === "low" && (isBull || isBear)
      ? "Volume rendah — sinyal lemah, tunggu konfirmasi volume"
      : "Volume normal — tidak ada konfirmasi khusus dari volume";

  // ── EMA & VWAP ───────────────────────────────────────────────────────────
  // Prefer backend-computed values, fall back to approximations
  const vwap = (backendVwap && backendVwap > 0) ? backendVwap : (support + resistance + price) / 3;

  const ema25 = (backendEma25 && backendEma25 > 0) ? backendEma25
    : change7d !== null ? price / (1 + (change7d * 3.57 / 100))
    : null;

  const threshold = 0.002; // 0.2% tolerance for "at" status
  const priceVsEma7: MarketAnalysis["priceVsEma7"] =
    !ema7 ? "at" :
    price > ema7 * (1 + threshold) ? "above" :
    price < ema7 * (1 - threshold) ? "below" : "at";

  const priceVsVwap: MarketAnalysis["priceVsVwap"] =
    price > vwap * (1 + threshold) ? "above" :
    price < vwap * (1 - threshold) ? "below" : "at";

  const emaCross: MarketAnalysis["emaCross"] =
    ema7 && ema25
      ? ema7 > ema25 * 1.001 ? "golden"
      : ema7 < ema25 * 0.999 ? "death"
      : "neutral"
    : "neutral";

  const maComment =
    priceVsEma7 === "above" && priceVsVwap === "above"
      ? "Harga di atas EMA7 & VWAP — tren bullish dikonfirmasi"
    : priceVsEma7 === "below" && priceVsVwap === "below"
      ? "Harga di bawah EMA7 & VWAP — tren bearish dikonfirmasi"
    : priceVsEma7 === "above" && priceVsVwap === "below"
      ? "Harga di atas EMA7 tapi di bawah VWAP — sinyal campur"
    : priceVsEma7 === "below" && priceVsVwap === "above"
      ? "Harga di bawah EMA7 tapi di atas VWAP — waspadai pembalikan"
    : "Harga sekitar level EMA/VWAP — zona konsolidasi";

  return {
    srLevels, positionInRange, srComment,
    orderFlowScore, orderFlowLabel, delta, buyPressurePct,
    volumeStatus, volumeTrend, volumeConfirm, volumeComment,
    ema7, ema25, vwap,
    priceVsEma7, priceVsVwap, emaCross, maComment,
  };
}

/* ═══════════════════════════ MARKET ANALYSIS PANEL ════════════════════════ */

function SRLadder({ levels, currentPrice, fmt }: {
  levels: SRLevel[]; currentPrice: number; fmt: (v: number) => string;
}) {
  const allPrices = [...levels.map(l => l.price), currentPrice];
  const min = Math.min(...allPrices) * 0.98;
  const max = Math.max(...allPrices) * 1.02;
  const range = max - min;
  const pct = (p: number) => `${Math.max(0, Math.min(100, ((p - min) / range) * 100)).toFixed(1)}%`;
  const currentPct = parseFloat(pct(currentPrice));

  return (
    <div className="relative mt-2">
      {/* Vertical track */}
      <div className="relative ml-16 mr-3 h-64 rounded-lg bg-muted/20 border border-border overflow-visible">
        {/* Current price marker */}
        <div
          className="absolute left-0 right-0 flex items-center gap-2 z-10"
          style={{ bottom: `${currentPct}%`, transform: "translateY(50%)" }}
        >
          <div className="w-full h-0.5 bg-white/60" />
          <div className="absolute -left-16 w-14 text-right">
            <p className="text-[10px] font-bold text-white bg-primary/80 rounded px-1 py-0.5 whitespace-nowrap">
              {fmt(currentPrice)}
            </p>
          </div>
          <span className="absolute right-1 text-[9px] font-bold text-white/80">NOW</span>
        </div>

        {/* S/R level lines */}
        {levels.map((lvl) => {
          const pos = parseFloat(pct(lvl.price));
          const isSupport = lvl.type === "support";
          const baseColor = isSupport ? "border-green" : "border-red";
          const opacity = lvl.strength === "strong" ? "opacity-100" : lvl.strength === "moderate" ? "opacity-60" : "opacity-30";
          const lineColor = isSupport ? "#22c55e" : "#ef4444";
          const textColor = isSupport ? "text-green-400" : "text-red-400";
          const bgColor = isSupport ? "bg-green-500/10" : "bg-red-500/10";

          return (
            <div
              key={lvl.label}
              className={`absolute left-0 right-0 flex items-center ${opacity}`}
              style={{ bottom: `${pos}%`, transform: "translateY(50%)" }}
            >
              <div className="w-full border-t border-dashed" style={{ borderColor: lineColor }} />
              <div className={`absolute -left-16 w-14 text-right`}>
                <span className={`text-[9px] font-bold ${textColor} ${bgColor} rounded px-1 py-0.5`}>
                  {lvl.label}
                </span>
              </div>
              <div className="absolute right-1 text-right">
                <p className={`text-[9px] font-medium ${textColor}`}>{fmt(lvl.price)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderFlowGauge({ score, label, buyPressurePct }: {
  score: number; label: string; buyPressurePct: number;
}) {
  const clampedPct = Math.max(5, Math.min(95, buyPressurePct));
  const gaugeColor =
    buyPressurePct >= 65 ? "#22c55e" :
    buyPressurePct >= 50 ? "#86efac" :
    buyPressurePct <= 35 ? "#ef4444" :
    buyPressurePct <= 50 ? "#f97316" : "#eab308";

  return (
    <div className="space-y-3">
      {/* Gauge bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-red-400 font-semibold">Sell</span>
          <span className="text-xs text-green-400 font-semibold">Buy</span>
        </div>
        <div className="relative w-full h-5 rounded-full overflow-hidden bg-gradient-to-r from-red-500/30 via-yellow-500/20 to-green-500/30">
          {/* Needle indicator */}
          <div
            className="absolute top-0 bottom-0 w-1 rounded-full shadow-lg transition-all duration-700"
            style={{ left: `${clampedPct}%`, backgroundColor: gaugeColor, transform: "translateX(-50%)" }}
          />
          {/* Fill */}
          <div className="absolute inset-0 flex">
            <div className="h-full opacity-20 bg-red-500" style={{ width: `${100 - clampedPct}%` }} />
            <div className="h-full opacity-20 bg-green-500" style={{ width: `${clampedPct}%` }} />
          </div>
        </div>
        <div className="flex justify-center mt-1.5">
          <span className="text-xs font-bold" style={{ color: gaugeColor }}>{label}</span>
        </div>
      </div>

      {/* Delta grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
          <p className="text-[10px] text-muted-foreground">Buy Pressure</p>
          <p className="text-sm font-bold text-green-400">{Math.round(buyPressurePct)}%</p>
        </div>
        <div className="rounded-lg bg-muted/30 border border-border p-2">
          <p className="text-[10px] text-muted-foreground">Delta</p>
          <p className={`text-sm font-bold ${score > 0 ? "text-green-400" : score < 0 ? "text-red-400" : "text-muted-foreground"}`}>
            {score > 0 ? "+" : ""}{score}
          </p>
        </div>
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
          <p className="text-[10px] text-muted-foreground">Sell Pressure</p>
          <p className="text-sm font-bold text-red-400">{Math.round(100 - buyPressurePct)}%</p>
        </div>
      </div>

      {/* Explanation */}
      <div className="bg-muted/20 rounded-lg p-2.5 space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cara Membaca Order Flow</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Order flow mengukur posisi harga dalam range 24 jam. Harga mendekati <span className="text-green-400">high</span> = pembeli dominan (bullish delta). Harga mendekati <span className="text-red-400">low</span> = penjual dominan (bearish delta).
        </p>
      </div>
    </div>
  );
}

function VolumePanel({ status, trend, confirm, comment }: {
  status: "high" | "normal" | "low"; trend: string; confirm: boolean; comment: string;
}) {
  const statusConfig = {
    high:   { label: "Volume Tinggi",  color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", bars: [1,1,1,1,1] },
    normal: { label: "Volume Normal",  color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", bars: [1,1,1,0,0] },
    low:    { label: "Volume Rendah",  color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", bars: [1,0,0,0,0] },
  }[status];

  const trendIcon = trend === "increasing" ? ArrowUp : trend === "decreasing" ? ArrowDown : Minus;
  const TrendIcon = trendIcon;

  return (
    <div className="space-y-3">
      {/* Volume Status */}
      <div className={`rounded-xl border p-3.5 ${statusConfig.bg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className={`h-4 w-4 ${statusConfig.color}`} />
            <div>
              <p className={`text-sm font-bold ${statusConfig.color}`}>{statusConfig.label}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <TrendIcon className="h-3 w-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground capitalize">{trend}</p>
              </div>
            </div>
          </div>
          {/* Volume bars visualization */}
          <div className="flex items-end gap-0.5 h-8">
            {[20, 35, 60, 80, 100].map((h, i) => (
              <div
                key={i}
                className={`w-2.5 rounded-sm transition-all ${statusConfig.bars[i] ? statusConfig.color.replace("text-", "bg-") : "bg-muted"}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Volume Confirmation */}
      <div className={`rounded-xl border p-3 flex items-start gap-2.5 ${confirm ? "border-green-500/30 bg-green-500/5" : "border-border bg-muted/20"}`}>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${confirm ? "bg-green-500/20" : "bg-muted"}`}>
          {confirm
            ? <span className="text-green-400 text-xs font-bold">✓</span>
            : <span className="text-muted-foreground text-xs font-bold">?</span>}
        </div>
        <div>
          <p className={`text-xs font-semibold ${confirm ? "text-green-400" : "text-muted-foreground"}`}>
            {confirm ? "Volume Mengkonfirmasi Sinyal" : "Volume Tidak Mengkonfirmasi"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{comment}</p>
        </div>
      </div>

      {/* Education */}
      <div className="bg-muted/20 rounded-lg p-2.5 space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Aturan Volume Trading</p>
        <ul className="space-y-1">
          {[
            "Volume naik + harga naik = tren bullish kuat",
            "Volume naik + harga turun = tren bearish kuat",
            "Volume rendah + harga naik = gerakan lemah, hati-hati",
            "Volume rendah + harga turun = konsolidasi, tunggu konfirmasi",
          ].map((r, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary/60 shrink-0">•</span> {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EmaVwapPanel({
  price, ema7, ema25, vwap, priceVsEma7, priceVsVwap, emaCross, maComment, fmt,
}: {
  price: number; ema7: number | null; ema25: number | null; vwap: number;
  priceVsEma7: string; priceVsVwap: string;
  emaCross: "golden" | "death" | "neutral"; maComment: string;
  fmt: (v: number) => string;
}) {
  type Dir = "above" | "below" | "at";
  const vsIcon = (pos: string) =>
    pos === "above" ? <ArrowUp className="h-3 w-3 text-green-400" /> :
    pos === "below" ? <ArrowDown className="h-3 w-3 text-red-400" /> :
    <Minus className="h-3 w-3 text-yellow-400" />;

  const vsColor = (pos: string) =>
    pos === "above" ? "text-green-400" : pos === "below" ? "text-red-400" : "text-yellow-400";

  const vsLabel = (pos: string) =>
    pos === "above" ? "Di Atas" : pos === "below" ? "Di Bawah" : "Sekitar";

  const rows: { label: string; value: number | null; position: string; explanation: string }[] = [
    {
      label: "EMA 7",
      value: ema7,
      position: priceVsEma7,
      explanation: "Exponential MA 7 hari — sinyal tren jangka pendek. Harga di atas EMA7 = momentum bullish.",
    },
    {
      label: "EMA 25",
      value: ema25,
      position: ema25 ? (price > ema25 ? "above" : price < ema25 ? "below" : "at") : "at",
      explanation: "EMA 25 hari — tren jangka menengah. Crossing EMA7 di atas EMA25 = Golden Cross (bullish).",
    },
    {
      label: "VWAP",
      value: vwap,
      position: priceVsVwap,
      explanation: "Volume-Weighted Average Price = (High+Low+Close)/3. Level kunci bagi trader institusional.",
    },
  ];

  return (
    <div className="space-y-3">
      {/* Indicator Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-3 bg-muted/40 px-3 py-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Indikator</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Nilai</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase text-right">Posisi Harga</p>
        </div>
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-3 items-center px-3 py-2.5 border-t border-border/50">
            <p className="text-sm font-semibold">{r.label}</p>
            <p className="text-sm font-mono text-center tabular-nums">
              {r.value != null ? fmt(r.value) : "–"}
            </p>
            <div className="flex items-center justify-end gap-1">
              {vsIcon(r.position)}
              <span className={`text-xs font-semibold ${vsColor(r.position)}`}>{vsLabel(r.position)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* EMA Cross signal */}
      {emaCross !== "neutral" && (
        <div className={`rounded-xl border p-3 flex items-center gap-2.5 ${
          emaCross === "golden" ? "border-yellow-400/30 bg-yellow-400/5" : "border-blue-400/30 bg-blue-400/5"
        }`}>
          <div className={`text-lg ${emaCross === "golden" ? "text-yellow-400" : "text-blue-400"}`}>
            {emaCross === "golden" ? "✨" : "💧"}
          </div>
          <div>
            <p className={`text-sm font-bold ${emaCross === "golden" ? "text-yellow-400" : "text-blue-400"}`}>
              {emaCross === "golden" ? "Golden Cross" : "Death Cross"}
            </p>
            <p className="text-xs text-muted-foreground">
              {emaCross === "golden"
                ? "EMA7 memotong ke atas EMA25 — sinyal beli jangka menengah"
                : "EMA7 memotong ke bawah EMA25 — sinyal jual jangka menengah"}
            </p>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-muted/20 rounded-lg p-2.5">
        <p className="text-xs text-muted-foreground leading-relaxed">{maComment}</p>
      </div>

      {/* Education */}
      <div className="bg-muted/20 rounded-lg p-2.5 space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cara Membaca EMA & VWAP</p>
        <ul className="space-y-1">
          {[
            "EMA7 > EMA25 (Golden Cross) → momentum bullish jangka menengah",
            "EMA7 < EMA25 (Death Cross) → momentum bearish jangka menengah",
            "Harga di atas VWAP → institusi (smart money) bullish",
            "Harga di bawah VWAP → distribusi aset, institusi jual",
            "Entry ideal: harga retest EMA7/VWAP dari atas (untuk long)",
          ].map((r, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary/60 shrink-0">•</span> {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ═══════════════════════════ MARKET STRUCTURE PANEL ════════════════════════ */

interface BackendIndicators {
  marketStructure?: string;
  higherHighs?: boolean;
  higherLows?: boolean;
  lowerHighs?: boolean;
  lowerLows?: boolean;
  breakOfStructure?: boolean;
  bosDirection?: string;
  changeOfCharacter?: boolean;
  cochDirection?: string;
  candlePattern?: string;
  rejectionCandle?: boolean;
  momentumCandle?: boolean;
  fomoAlert?: boolean;
  stopHuntRisk?: string;
  liquidationRisk?: string;
  leverageWarning?: boolean;
  riskRewardRatio?: number;
  macd?: { value: number; signal: number; histogram: number; bullish: boolean };
  bollingerBands?: { upper: number; middle: number; lower: number; position: number };
  orderBlocks?: { bullish: number | null; bearish: number | null };
  fairValueGap?: { exists: boolean; upper: number | null; lower: number | null; direction: string };
  supplyZone?: number;
  demandZone?: number;
  multiTimeframeAlignment?: string;
  ema7?: number;
  ema25?: number;
  ema99?: number;
}

function StructurePanel({ ind, fmt }: { ind: BackendIndicators; fmt: (v: number) => string }) {
  const structure = ind.marketStructure ?? "ranging";
  const structureColor = structure === "uptrend" ? "text-green-400" : structure === "downtrend" ? "text-red-400" : "text-yellow-400";
  const structureBg = structure === "uptrend" ? "bg-green-500/10 border-green-500/30" : structure === "downtrend" ? "bg-red-500/10 border-red-500/30" : "bg-yellow-500/10 border-yellow-500/30";
  const structureLabel = structure === "uptrend" ? "Uptrend" : structure === "downtrend" ? "Downtrend" : "Ranging / Sideways";

  const mtfColor = ind.multiTimeframeAlignment === "aligned_bull" ? "text-green-400" : ind.multiTimeframeAlignment === "aligned_bear" ? "text-red-400" : "text-yellow-400";
  const mtfLabel = ind.multiTimeframeAlignment === "aligned_bull" ? "Bullish (Semua Timeframe Searah)" : ind.multiTimeframeAlignment === "aligned_bear" ? "Bearish (Semua Timeframe Searah)" : "Mixed (Timeframe Bertentangan)";

  return (
    <div className="space-y-3">
      {/* Market Structure Badge */}
      <div className={`rounded-xl border p-3.5 ${structureBg}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Market Structure</p>
            <p className={`text-lg font-bold mt-0.5 ${structureColor}`}>{structureLabel}</p>
          </div>
          <GitBranch className={`h-6 w-6 ${structureColor}`} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {[
            { label: "Higher Highs", val: ind.higherHighs, bull: true },
            { label: "Higher Lows",  val: ind.higherLows,  bull: true },
            { label: "Lower Highs",  val: ind.lowerHighs,  bull: false },
            { label: "Lower Lows",   val: ind.lowerLows,   bull: false },
          ].map((item) => (
            <div key={item.label} className={`rounded-lg border px-2.5 py-1.5 flex items-center justify-between ${item.val ? (item.bull ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5") : "border-border bg-muted/10"}`}>
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className={`text-xs font-bold ${item.val ? (item.bull ? "text-green-400" : "text-red-400") : "text-muted-foreground"}`}>
                {item.val ? "✓" : "–"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* BOS */}
      {ind.breakOfStructure && (
        <div className={`rounded-xl border p-3 flex items-start gap-2.5 ${ind.bosDirection === "bullish" ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"}`}>
          <div className={`text-xl shrink-0`}>{ind.bosDirection === "bullish" ? "⬆️" : "⬇️"}</div>
          <div>
            <p className={`text-sm font-bold ${ind.bosDirection === "bullish" ? "text-green-400" : "text-red-400"}`}>
              Break of Structure ({ind.bosDirection === "bullish" ? "Bullish" : "Bearish"}) Terkonfirmasi
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {ind.bosDirection === "bullish"
                ? "Harga berhasil breakout di atas swing high sebelumnya — konfirmasi kelanjutan uptrend"
                : "Harga breakdown di bawah swing low sebelumnya — konfirmasi kelanjutan downtrend"}
            </p>
          </div>
        </div>
      )}

      {/* CHOCH */}
      {ind.changeOfCharacter && (
        <div className={`rounded-xl border p-3 flex items-start gap-2.5 ${ind.cochDirection === "bullish" ? "border-blue-500/40 bg-blue-500/5" : "border-orange-500/40 bg-orange-500/5"}`}>
          <div className="text-xl shrink-0">🔄</div>
          <div>
            <p className={`text-sm font-bold ${ind.cochDirection === "bullish" ? "text-blue-400" : "text-orange-400"}`}>
              Change of Character (CHOCH) — {ind.cochDirection === "bullish" ? "Potensi Reversal Bullish" : "Potensi Reversal Bearish"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {ind.cochDirection === "bullish"
                ? "Karakter pergerakan berubah dari bearish ke bullish — indikasi awal pembalikan tren"
                : "Karakter pergerakan berubah dari bullish ke bearish — waspadai pembalikan tren"}
            </p>
          </div>
        </div>
      )}

      {/* Candle Pattern */}
      {ind.candlePattern && ind.candlePattern !== "none" && (
        <div className="rounded-xl border border-border p-3 space-y-1">
          <div className="flex items-center gap-2">
            <CandlestickChart className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pola Candlestick</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold capitalize">{ind.candlePattern.replace(/_/g, " ")}</p>
            <div className="flex gap-1.5">
              {ind.rejectionCandle && <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">Rejection</Badge>}
              {ind.momentumCandle && <Badge className="text-[10px] bg-orange-500/20 text-orange-400 border-orange-500/30">Momentum</Badge>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {ind.candlePattern === "hammer" ? "Hammer: Rejection bullish dari level support — potential reversal" :
             ind.candlePattern === "shooting_star" ? "Shooting Star: Rejection bearish dari resistance — potential reversal" :
             ind.candlePattern === "bullish_engulfing" ? "Bullish Engulfing: Momentum candle beli kuat mengalahkan candle sebelumnya" :
             ind.candlePattern === "bearish_engulfing" ? "Bearish Engulfing: Momentum candle jual kuat — sinyal bearish" :
             ind.candlePattern === "doji" ? "Doji: Indecision candle — pasar tidak punya arah jelas, tunggu konfirmasi" :
             ind.candlePattern === "momentum_bull" ? "Momentum Candle Bullish: Candle besar dengan close mendekati high — kekuatan beli dominan" :
             ind.candlePattern === "momentum_bear" ? "Momentum Candle Bearish: Candle besar merah dengan close mendekati low — kekuatan jual dominan" :
             "Pola candlestick standar"}
          </p>
        </div>
      )}

      {/* MTF Alignment */}
      <div className={`rounded-xl border p-3 ${ind.multiTimeframeAlignment === "aligned_bull" ? "border-green-500/30 bg-green-500/5" : ind.multiTimeframeAlignment === "aligned_bear" ? "border-red-500/30 bg-red-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Multi-Timeframe Alignment</p>
        <p className={`text-sm font-bold ${mtfColor}`}>{mtfLabel}</p>
        <p className="text-xs text-muted-foreground mt-1">Analisis keselarasan sinyal dari timeframe 24 jam dan 7 hari</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════ SMC PANEL ══════════════════════════════════════ */

function SMCPanel({ ind, fmt }: { ind: BackendIndicators; fmt: (v: number) => string }) {
  const ob = ind.orderBlocks;
  const fvg = ind.fairValueGap;

  return (
    <div className="space-y-3">
      {/* Explainer */}
      <div className="bg-muted/30 rounded-xl border border-border p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Smart Money Concepts (SMC)</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          SMC mengidentifikasi area di mana institusi (smart money) telah menempatkan order besar. Order Block dan Fair Value Gap adalah zona kunci untuk entry & exit.
        </p>
      </div>

      {/* Order Blocks */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="bg-muted/40 px-3 py-1.5 flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Order Blocks (Zona Institusi)</p>
        </div>
        <div className="p-3 space-y-2">
          {ob?.bullish ? (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-2.5">
              <p className="text-[10px] text-green-400 font-semibold uppercase">Bullish Order Block</p>
              <p className="text-sm font-bold tabular-nums">{fmt(ob.bullish)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Zona demand institusional — area beli yang kuat</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Tidak ada Bullish OB aktif saat ini</p>
          )}
          {ob?.bearish ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2.5">
              <p className="text-[10px] text-red-400 font-semibold uppercase">Bearish Order Block</p>
              <p className="text-sm font-bold tabular-nums">{fmt(ob.bearish)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Zona supply institusional — area jual yang kuat</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Tidak ada Bearish OB aktif saat ini</p>
          )}
        </div>
      </div>

      {/* Fair Value Gap */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="bg-muted/40 px-3 py-1.5 flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fair Value Gap (Imbalance)</p>
        </div>
        <div className="p-3">
          {fvg?.exists ? (
            <div className={`rounded-lg border p-2.5 ${fvg.direction === "bullish" ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <div className="flex items-center justify-between mb-1">
                <p className={`text-[10px] font-semibold uppercase ${fvg.direction === "bullish" ? "text-green-400" : "text-red-400"}`}>
                  FVG {fvg.direction === "bullish" ? "Bullish" : "Bearish"} Terdeteksi
                </p>
                <Badge className={`text-[10px] ${fvg.direction === "bullish" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                  Imbalance
                </Badge>
              </div>
              {fvg.upper && fvg.lower && (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div><p className="text-[10px] text-muted-foreground">Upper</p><p className="text-xs font-mono">{fmt(fvg.upper)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Lower</p><p className="text-xs font-mono">{fmt(fvg.lower)}</p></div>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {fvg.direction === "bullish"
                  ? "Terdapat gap harga ke atas — harga cenderung kembali mengisi gap ini sebelum melanjutkan naik"
                  : "Terdapat gap harga ke bawah — area ini kemungkinan akan menjadi resistance saat harga retest"}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Tidak ada Fair Value Gap signifikan saat ini</p>
          )}
        </div>
      </div>

      {/* Supply & Demand Zones */}
      {(ind.supplyZone || ind.demandZone) && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/40 px-3 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supply & Demand Zones</p>
          </div>
          <div className="p-3 space-y-2">
            {ind.supplyZone && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                <div>
                  <p className="text-[10px] text-red-400 font-semibold uppercase">Supply Zone</p>
                  <p className="text-xs text-muted-foreground">Area tekanan jual institusional</p>
                </div>
                <p className="text-sm font-bold text-red-400 tabular-nums">{fmt(ind.supplyZone)}</p>
              </div>
            )}
            {ind.demandZone && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-green-500/5 border border-green-500/20">
                <div>
                  <p className="text-[10px] text-green-400 font-semibold uppercase">Demand Zone</p>
                  <p className="text-xs text-muted-foreground">Area tekanan beli institusional</p>
                </div>
                <p className="text-sm font-bold text-green-400 tabular-nums">{fmt(ind.demandZone)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Education */}
      <div className="bg-muted/20 rounded-lg p-2.5 space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cara Trading dengan SMC</p>
        <ul className="space-y-1">
          {[
            "Tunggu harga kembali ke Order Block sebelum entry",
            "FVG sering menjadi magnet harga — harga cenderung mengisinya",
            "Supply Zone = area resistance institusional (waspadai rejection)",
            "Demand Zone = area support institusional (potensi bounce kuat)",
            "Kombinasikan OB + FVG + BOS untuk konfirmasi sinyal kuat",
          ].map((r, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary/60 shrink-0">•</span> {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ═══════════════════════════ MACD + BOLLINGER PANEL ════════════════════════ */

function MACDPanel({ ind, price, fmt }: { ind: BackendIndicators; price: number; fmt: (v: number) => string }) {
  const macd = ind.macd;
  const bb = ind.bollingerBands;

  return (
    <div className="space-y-3">
      {/* MACD */}
      {macd && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/40 px-3 py-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MACD (12, 26, 9)</p>
            <Badge className={`text-[10px] ${macd.bullish ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
              {macd.bullish ? "Bullish" : "Bearish"}
            </Badge>
          </div>
          <div className="p-3 space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/30 p-2">
                <p className="text-[10px] text-muted-foreground">MACD Line</p>
                <p className={`text-sm font-bold ${macd.value > 0 ? "text-green-400" : "text-red-400"}`}>
                  {macd.value > 0 ? "+" : ""}{macd.value.toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 p-2">
                <p className="text-[10px] text-muted-foreground">Signal</p>
                <p className="text-sm font-bold">{macd.signal.toFixed(2)}</p>
              </div>
              <div className={`rounded-lg p-2 ${macd.histogram > 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                <p className="text-[10px] text-muted-foreground">Histogram</p>
                <p className={`text-sm font-bold ${macd.histogram > 0 ? "text-green-400" : "text-red-400"}`}>
                  {macd.histogram > 0 ? "+" : ""}{macd.histogram.toFixed(2)}
                </p>
              </div>
            </div>
            {/* MACD bar visual */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Histogram</p>
              <div className="flex items-center gap-1 h-6">
                <div className="flex-1 bg-red-500/20 h-full rounded-l flex items-center justify-end pr-1">
                  {!macd.bullish && <div className="bg-red-500 h-3/4 rounded" style={{ width: `${Math.min(100, Math.abs(macd.histogram / price) * 20000)}%` }} />}
                </div>
                <div className="w-px h-full bg-border" />
                <div className="flex-1 bg-green-500/20 h-full rounded-r flex items-center pl-1">
                  {macd.bullish && <div className="bg-green-500 h-3/4 rounded" style={{ width: `${Math.min(100, Math.abs(macd.histogram / price) * 20000)}%` }} />}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {macd.bullish && macd.value > 0 ? "MACD bullish di atas zero line — sinyal beli kuat, momentum positif terkonfirmasi" :
               macd.bullish && macd.value < 0 ? "Histogram berbalik positif — potensi reversal, perhatikan zero-line cross" :
               !macd.bullish && macd.value < 0 ? "MACD bearish di bawah zero line — tekanan jual berlanjut" :
               "Histogram berbalik negatif — momentum melemah, waspadai koreksi"}
            </p>
          </div>
        </div>
      )}

      {/* Bollinger Bands */}
      {bb && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/40 px-3 py-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bollinger Bands (20, 2σ)</p>
            <Badge className={`text-[10px] ${bb.position > 0.8 ? "bg-red-500/20 text-red-400 border-red-500/30" : bb.position < 0.2 ? "bg-green-500/20 text-green-400 border-green-500/30" : "border-border"}`}>
              {bb.position > 0.8 ? "Overbought" : bb.position < 0.2 ? "Oversold" : `Pos: ${(bb.position * 100).toFixed(0)}%`}
            </Badge>
          </div>
          <div className="p-3 space-y-2">
            {/* Band levels */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2">
                <p className="text-[10px] text-red-400">Upper Band</p>
                <p className="text-xs font-bold tabular-nums">{fmt(bb.upper)}</p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border p-2">
                <p className="text-[10px] text-muted-foreground">Middle (SMA)</p>
                <p className="text-xs font-bold tabular-nums">{fmt(bb.middle)}</p>
              </div>
              <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-2">
                <p className="text-[10px] text-green-400">Lower Band</p>
                <p className="text-xs font-bold tabular-nums">{fmt(bb.lower)}</p>
              </div>
            </div>
            {/* Position bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-green-400">Lower</span>
                <span className="text-[10px] text-muted-foreground">Posisi Harga dalam Band</span>
                <span className="text-[10px] text-red-400">Upper</span>
              </div>
              <div className="relative w-full h-4 rounded-full bg-gradient-to-r from-green-500/30 via-muted/30 to-red-500/30 overflow-hidden">
                <div
                  className="absolute top-1 bottom-1 w-2 rounded-full bg-white shadow"
                  style={{ left: `${Math.max(2, Math.min(96, bb.position * 100))}%`, transform: "translateX(-50%)" }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {bb.position > 0.9 ? "Harga di atas upper band — kondisi overbought ekstrem, potensi reversal atau continuation breakout" :
               bb.position > 0.7 ? "Harga mendekati upper band — pasar panas, waspadai koreksi" :
               bb.position < 0.1 ? "Harga di bawah lower band — kondisi oversold ekstrem, potensi rebound kuat" :
               bb.position < 0.3 ? "Harga mendekati lower band — area demand potensial, perhatikan sinyal beli" :
               "Harga dalam area tengah band — tidak ada sinyal ekstrem, pasar konsolidasi"}
            </p>
          </div>
        </div>
      )}

      {/* Education */}
      <div className="bg-muted/20 rounded-lg p-2.5 space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cara Membaca MACD & Bollinger</p>
        <ul className="space-y-1">
          {[
            "MACD cross ke atas signal line = sinyal beli (bullish crossover)",
            "Histogram positif di atas zero = momentum bullish kuat",
            "Harga sentuh lower Bollinger Band = oversold (potensi beli)",
            "Harga sentuh upper Bollinger Band = overbought (potensi jual)",
            "Band menyempit (squeeze) = volatilitas rendah, breakout akan datang",
          ].map((r, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary/60 shrink-0">•</span> {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MarketAnalysisPanel({
  analysis, price, isCrypto, backendInd,
}: {
  analysis: MarketAnalysis; price: number; isCrypto: boolean; backendInd?: BackendIndicators;
}) {
  const [activeTab, setActiveTab] = useState<"sr" | "flow" | "volume" | "ema" | "structure" | "smc" | "macd">("sr");
  const currency = isCrypto ? "USD" : "IDR";
  const fmt = (v: number) => formatCurrency(v, currency);

  const tabs = [
    { id: "sr",        icon: Layers,          label: "S/R" },
    { id: "structure", icon: GitBranch,        label: "Struktur" },
    { id: "smc",       icon: Brain,            label: "SMC" },
    { id: "macd",      icon: Activity,         label: "MACD" },
    { id: "flow",      icon: BarChart2,        label: "Order Flow" },
    { id: "volume",    icon: Volume2,          label: "Volume" },
    { id: "ema",       icon: TrendingUp,       label: "EMA/VWAP" },
  ] as const;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Activity className="h-4 w-4" /> Analisis Teknikal Lanjutan
        </CardTitle>
        {/* Tab buttons */}
        <div className="flex flex-wrap gap-1 mt-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-3 w-3" />
                {t.label}
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent>
        {/* Summary bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4 p-2.5 bg-muted/20 rounded-lg border border-border/50">
          <Badge variant="outline" className={`text-[10px] ${
            analysis.delta === "bullish" ? "border-green-500/40 text-green-400" :
            analysis.delta === "bearish" ? "border-red-500/40 text-red-400" :
            "border-yellow-500/40 text-yellow-400"
          }`}>
            {analysis.delta === "bullish" ? "↑ Bullish" : analysis.delta === "bearish" ? "↓ Bearish" : "→ Netral"}
          </Badge>
          <Badge variant="outline" className={`text-[10px] ${
            analysis.volumeConfirm ? "border-green-500/40 text-green-400" : "border-border"
          }`}>
            Vol {analysis.volumeStatus === "high" ? "Tinggi" : analysis.volumeStatus === "low" ? "Rendah" : "Normal"}
            {analysis.volumeConfirm ? " ✓" : ""}
          </Badge>
          {backendInd?.breakOfStructure && (
            <Badge variant="outline" className={`text-[10px] ${backendInd.bosDirection === "bullish" ? "border-green-400/40 text-green-400" : "border-red-400/40 text-red-400"}`}>
              BOS {backendInd.bosDirection === "bullish" ? "↑" : "↓"}
            </Badge>
          )}
          {backendInd?.changeOfCharacter && (
            <Badge variant="outline" className="text-[10px] border-blue-400/40 text-blue-400">CHOCH</Badge>
          )}
          {analysis.emaCross !== "neutral" && (
            <Badge variant="outline" className={`text-[10px] ${
              analysis.emaCross === "golden" ? "border-yellow-400/40 text-yellow-400" : "border-blue-400/40 text-blue-400"
            }`}>
              {analysis.emaCross === "golden" ? "✨ Golden" : "💧 Death"}
            </Badge>
          )}
          {backendInd?.macd && (
            <Badge variant="outline" className={`text-[10px] ${backendInd.macd.bullish ? "border-green-400/40 text-green-400" : "border-red-400/40 text-red-400"}`}>
              MACD {backendInd.macd.bullish ? "↑" : "↓"}
            </Badge>
          )}
          <p className="text-xs text-muted-foreground ml-1 flex-1">
            {activeTab === "sr" ? analysis.srComment :
             activeTab === "flow" ? analysis.orderFlowLabel :
             activeTab === "volume" ? analysis.volumeComment :
             activeTab === "structure" ? (backendInd?.marketStructure === "uptrend" ? "Struktur pasar bullish: HH & HL terkonfirmasi" : backendInd?.marketStructure === "downtrend" ? "Struktur pasar bearish: LH & LL aktif" : "Pasar ranging, belum ada arah tren jelas") :
             activeTab === "smc" ? "Smart Money: Order Block & Fair Value Gap untuk entry presisi" :
             activeTab === "macd" ? (backendInd?.macd?.bullish ? "MACD bullish — momentum positif" : "MACD bearish — momentum negatif") :
             analysis.maComment}
          </p>
        </div>

        {/* Panel content */}
        {activeTab === "sr" && (
          <SRLadder levels={analysis.srLevels} currentPrice={price} fmt={fmt} />
        )}
        {activeTab === "structure" && backendInd && (
          <StructurePanel ind={backendInd} fmt={fmt} />
        )}
        {activeTab === "smc" && backendInd && (
          <SMCPanel ind={backendInd} fmt={fmt} />
        )}
        {activeTab === "macd" && backendInd && (
          <MACDPanel ind={backendInd} price={price} fmt={fmt} />
        )}
        {activeTab === "flow" && (
          <OrderFlowGauge
            score={analysis.orderFlowScore}
            label={analysis.orderFlowLabel}
            buyPressurePct={analysis.buyPressurePct}
          />
        )}
        {activeTab === "volume" && (
          <VolumePanel
            status={analysis.volumeStatus}
            trend={analysis.volumeTrend}
            confirm={analysis.volumeConfirm}
            comment={analysis.volumeComment}
          />
        )}
        {activeTab === "ema" && (
          <EmaVwapPanel
            price={price}
            ema7={analysis.ema7}
            ema25={analysis.ema25}
            vwap={analysis.vwap}
            priceVsEma7={analysis.priceVsEma7}
            priceVsVwap={analysis.priceVsVwap}
            emaCross={analysis.emaCross}
            maComment={analysis.maComment}
            fmt={fmt}
          />
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════ SMALL HELPERS ═════════════════════════════════ */

function PriceBox({ label, value, sub, color, accent, bold }: {
  label: string; value: string; sub?: string;
  color?: string; accent?: string; bold?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3.5 flex flex-col gap-1 ${color ?? "border-border bg-muted/20"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${accent ?? "text-muted-foreground"}`}>{label}</p>
      <p className={`text-base tabular-nums ${bold ? "font-extrabold text-lg" : "font-bold"}`}>{value}</p>
      {sub && <p className={`text-xs ${accent ?? "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}

function RRBar({ value, max = 4 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 3 ? "bg-green-500" : value >= 2 ? "bg-yellow-500" : "bg-orange-400";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`${color} h-full rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums">{value}:1</span>
    </div>
  );
}

function TechIndicatorRow({ label, value, badge }: { label: string; value: React.ReactNode; badge?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{value}</span>
        {badge && <Badge variant="outline" className="text-[10px]">{badge}</Badge>}
      </div>
    </div>
  );
}

/* ═══════════════════════════ FUTURES GUIDE ═════════════════════════════════ */

function FuturesTradingGuide({ setup, isCrypto, assetName }: {
  setup: TradeSetup; isCrypto: boolean; assetName: string;
}) {
  const isLong = setup.direction === "LONG";
  const fmt = (v: number) => formatCurrency(v, isCrypto ? "USD" : "IDR");

  return (
    <Card className={`border ${isLong ? "border-green-500/30" : "border-red-500/30"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Target className="h-4 w-4" /> Panduan Trading Futures
          </CardTitle>
          <div className="flex items-center gap-2">
            {isLong ? (
              <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1 text-sm font-bold gap-1.5">
                <ArrowUpCircle className="h-3.5 w-3.5" /> LONG
              </Badge>
            ) : (
              <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 text-sm font-bold gap-1.5">
                <ArrowDownCircle className="h-3.5 w-3.5" /> SHORT
              </Badge>
            )}
            <Badge variant="outline" className="text-xs gap-1">
              <Zap className="h-3 w-3" /> {setup.leverage}x – {setup.maxLeverage}x
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Entry */}
        <div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Zona Entry (Limit Order)</p>
          <div className="grid grid-cols-2 gap-2">
            <PriceBox label="Entry Bawah" value={fmt(setup.entryLow)} sub={isLong ? "Beli di level ini" : "Jual (Short) di sini"} />
            <PriceBox label="Entry Atas" value={fmt(setup.entryHigh)} sub="Batas atas zona entry" />
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Pasang limit order di zona ini untuk harga lebih baik dari market order.
          </p>
        </div>

        {/* SL */}
        <div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Stop Loss</p>
          <PriceBox
            label={`Stop Loss · Risiko ${setup.slPct}%`} value={fmt(setup.stopLoss)}
            sub={isLong ? "Di bawah level support · Batasi kerugian" : "Di atas level resistance · Batasi kerugian"}
            color="border-red-500/30 bg-red-500/5" accent="text-red-400" bold
          />
        </div>

        {/* TP */}
        <div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Target Take Profit</p>
          <div className="space-y-2">
            {[
              { label: "TP 1 · Jangka Pendek",  price: setup.tp1, pct: setup.tp1Pct, rr: setup.tp1RR, note: "Ambil 40–50% posisi", color: "border-green-500/20 bg-green-500/5", textColor: "text-green-400" },
              { label: "TP 2 · Jangka Menengah", price: setup.tp2, pct: setup.tp2Pct, rr: setup.tp2RR, note: "Ambil 30–40% posisi", color: "border-green-500/30 bg-green-500/8", textColor: "text-green-400" },
              { label: "TP 3 · Target Maksimum", price: setup.tp3, pct: setup.tp3Pct, rr: setup.tp3RR, note: "Sisa posisi",         color: "border-emerald-500/30 bg-emerald-500/5", textColor: "text-emerald-400" },
            ].map((t) => (
              <div key={t.label} className={`rounded-xl border p-3.5 ${t.color}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`text-[11px] font-semibold uppercase tracking-wider ${t.textColor}`}>{t.label}</p>
                    <p className="text-lg font-extrabold tabular-nums mt-0.5">{fmt(t.price)}</p>
                    <p className={`text-xs mt-0.5 ${t.textColor}`}>+{t.pct}% dari entry · {t.note}</p>
                  </div>
                  <div className="text-right min-w-[80px]">
                    <p className="text-[10px] text-muted-foreground">Risk/Reward</p>
                    <RRBar value={t.rr} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Leverage + Risk */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-yellow-400 flex items-center gap-1">
              <Zap className="h-3 w-3" /> Leverage
            </p>
            <p className="text-base font-extrabold">{setup.leverage}x</p>
            <p className="text-xs text-muted-foreground">Maks {setup.maxLeverage}x · Gunakan konservatif</p>
          </div>
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> Manajemen Risiko
            </p>
            <p className="text-base font-extrabold">1–2%</p>
            <p className="text-xs text-muted-foreground">Risiko per trade dari modal</p>
          </div>
        </div>

        {/* Steps */}
        <div className="bg-muted/30 rounded-xl border border-border p-3.5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cara Eksekusi</p>
          <ol className="space-y-2">
            {[
              `Buka posisi ${setup.direction} di exchange futures (Binance / Bybit / OKX)`,
              `Pilih ${assetName} Perpetual · Set leverage ${setup.leverage}x (jangan lebih dari ${setup.maxLeverage}x)`,
              `Pasang limit order di zona entry: ${fmt(setup.entryLow)} – ${fmt(setup.entryHigh)}`,
              `Set Stop Loss otomatis di ${fmt(setup.stopLoss)} (risiko ${setup.slPct}% per trade)`,
              `Pasang Take Profit bertahap: TP1 → TP2 → TP3 sesuai target di atas`,
              `Risiko maksimal 1–2% dari total modal per posisi`,
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-foreground/80">
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
          <Info className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-yellow-400/80 leading-relaxed">
            Panduan ini hanya bersifat edukatif dan bukan saran investasi. Trading futures mengandung risiko tinggi — selalu gunakan manajemen risiko yang ketat.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════ PAGE ══════════════════════════════════════════ */

export default function PredictionDetail() {
  const params = useParams<{ assetType: string; assetId: string }>();
  const [days, setDays] = useState("7");

  const assetType = (params.assetType === "crypto" || params.assetType === "stock")
    ? params.assetType : "crypto" as const;

  const { data: detail, isLoading, error } = useGetPredictionDetail(assetType, params.assetId ?? "");

  const isCrypto = assetType === "crypto";
  const historyId = params.assetId ?? "";
  const historyDays = parseInt(days);

  const { data: history, isLoading: histLoading } = useGetCryptoHistory(
    historyId, historyDays,
    { query: { enabled: isCrypto && !!historyId, queryKey: getGetCryptoHistoryQueryKey(historyId, historyDays) } }
  );

  const chartData = (history?.prices ?? []).map((p) => ({
    time: new Date(p.timestamp).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
    price: p.price,
  }));
  const priceMin = Math.min(...(history?.prices ?? []).map((p) => p.price)) * 0.999;
  const priceMax = Math.max(...(history?.prices ?? []).map((p) => p.price)) * 1.001;

  // Computed setups
  const tradeSetup = detail?.signal && detail?.currentPrice
    ? buildTradeSetup(
        detail.signal as Signal, detail.currentPrice,
        detail.confidence ?? 50, detail.priceChange24h ?? 0,
        detail.technicalIndicators?.support, detail.technicalIndicators?.resistance,
      ) : null;

  const ti = detail?.technicalIndicators;
  const backendInd: BackendIndicators | undefined = ti ? {
    marketStructure: (ti as any).marketStructure,
    higherHighs: (ti as any).higherHighs,
    higherLows: (ti as any).higherLows,
    lowerHighs: (ti as any).lowerHighs,
    lowerLows: (ti as any).lowerLows,
    breakOfStructure: (ti as any).breakOfStructure,
    bosDirection: (ti as any).bosDirection,
    changeOfCharacter: (ti as any).changeOfCharacter,
    cochDirection: (ti as any).cochDirection,
    candlePattern: (ti as any).candlePattern,
    rejectionCandle: (ti as any).rejectionCandle,
    momentumCandle: (ti as any).momentumCandle,
    fomoAlert: (ti as any).fomoAlert,
    stopHuntRisk: (ti as any).stopHuntRisk,
    liquidationRisk: (ti as any).liquidationRisk,
    leverageWarning: (ti as any).leverageWarning,
    riskRewardRatio: (ti as any).riskRewardRatio,
    macd: (ti as any).macd,
    bollingerBands: (ti as any).bollingerBands,
    orderBlocks: (ti as any).orderBlocks,
    fairValueGap: (ti as any).fairValueGap,
    supplyZone: (ti as any).supplyZone,
    demandZone: (ti as any).demandZone,
    multiTimeframeAlignment: (ti as any).multiTimeframeAlignment,
    ema7: (ti as any).ema7,
    ema25: (ti as any).ema25,
    ema99: (ti as any).ema99,
  } : undefined;

  const marketAnalysis = detail?.currentPrice && ti
    ? buildMarketAnalysis(
        detail.currentPrice,
        ti.support ?? detail.currentPrice * 0.95,
        ti.resistance ?? detail.currentPrice * 1.05,
        detail.priceChange24h ?? 0,
        detail.priceChange7d ?? null,
        ti.volumeTrend ?? "stable",
        ti.movingAverage7d ?? null,
        detail.signal ?? "neutral",
        backendInd?.ema7 ? (ti as any).vwap : null,
        backendInd?.ema25 ?? null,
      ) : null;

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/predictions">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Kembali ke Predictions
          </button>
        </Link>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Data prediksi tidak ditemukan untuk aset ini.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/predictions">
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Predictions
        </button>
      </Link>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          {/* Header Card */}
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start gap-4 justify-between">
                <div className="flex items-center gap-4">
                  {detail?.image ? (
                    <img src={detail.image} alt={detail?.assetName} className="w-14 h-14 rounded-full bg-muted"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {detail?.symbol?.replace(".JK", "").slice(0, 4)}
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-bold">{detail?.assetName}</h1>
                    <p className="text-sm text-muted-foreground uppercase">{detail?.symbol} · {detail?.assetType}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {detail?.signal && <SignalBadge signal={detail.signal} className="text-sm px-3 py-1" />}
                  <p className="text-2xl font-bold tabular-nums">
                    {detail?.currentPrice != null ? formatCurrency(detail.currentPrice, isCrypto ? "USD" : "IDR") : "–"}
                  </p>
                  <PriceChange value={detail?.priceChange24h} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-border">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Keyakinan AI</p>
                  <p className="text-xl font-bold text-primary">{detail?.confidence}%</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Skor Sentimen</p>
                  <p className={`text-xl font-bold ${(detail?.sentimentScore ?? 0) > 0 ? "text-green-500" : (detail?.sentimentScore ?? 0) < 0 ? "text-red-500" : "text-yellow-500"}`}>
                    {((detail?.sentimentScore ?? 0) * 100).toFixed(0)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">7D Change</p>
                  <PriceChange value={detail?.priceChange7d ?? undefined} className="justify-center text-lg font-bold" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Futures Trading Guide */}
          {tradeSetup && (
            <FuturesTradingGuide setup={tradeSetup} isCrypto={isCrypto} assetName={detail?.assetName ?? ""} />
          )}
          {detail?.signal === "neutral" && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow-400">Sinyal Netral – Panduan Trading Tidak Tersedia</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    AI tidak mendeteksi momentum yang cukup. Tunggu konfirmasi sinyal lebih jelas sebelum membuka posisi futures.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Risk Alert Bar */}
          {backendInd && (backendInd.fomoAlert || backendInd.stopHuntRisk === "high" || backendInd.liquidationRisk === "high" || backendInd.leverageWarning) && (
            <Card className="border-orange-500/40 bg-orange-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-orange-400">Peringatan Risiko Terdeteksi</p>
                    <p className="text-xs text-muted-foreground mt-0.5">AI mendeteksi kondisi risiko tinggi pada aset ini</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {backendInd.fomoAlert && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/30 px-2.5 py-1.5">
                      <Flame className="h-3.5 w-3.5 text-red-400" />
                      <span className="text-xs font-semibold text-red-400">FOMO Alert — Waspadai Beli di Puncak</span>
                    </div>
                  )}
                  {backendInd.stopHuntRisk === "high" && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 px-2.5 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                      <span className="text-xs font-semibold text-orange-400">Stop Hunt Risk Tinggi</span>
                    </div>
                  )}
                  {backendInd.liquidationRisk === "high" && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/30 px-2.5 py-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                      <span className="text-xs font-semibold text-red-400">Risiko Likuidasi Tinggi</span>
                    </div>
                  )}
                  {backendInd.leverageWarning && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-2.5 py-1.5">
                      <Zap className="h-3.5 w-3.5 text-yellow-400" />
                      <span className="text-xs font-semibold text-yellow-400">Leverage Warning — Volatilitas Tinggi</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Market Analysis Panel (S/R, Struktur, SMC, MACD, Order Flow, Volume, EMA/VWAP) */}
          {marketAnalysis && (
            <MarketAnalysisPanel
              analysis={marketAnalysis}
              price={detail?.currentPrice ?? 0}
              isCrypto={isCrypto}
              backendInd={backendInd}
            />
          )}

          {/* Chart + Technical Indicators */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {isCrypto && (
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Grafik Harga</CardTitle>
                  <Tabs value={days} onValueChange={setDays}>
                    <TabsList className="h-7">
                      {["1", "7", "14", "30", "90"].map((d) => (
                        <TabsTrigger key={d} value={d} className="text-xs px-2 h-6">{d}D</TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </CardHeader>
                <CardContent>
                  {histLoading ? (
                    <Skeleton className="h-48 w-full" />
                  ) : chartData.length > 0 ? (
                    <>
                      {/* Legend */}
                      <div className="flex flex-wrap gap-3 mb-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-red-400 inline-block" />SL</span>
                        <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-green-400 inline-block" />TP1/TP2</span>
                        {marketAnalysis?.vwap && <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-yellow-400 inline-block" />VWAP</span>}
                        {marketAnalysis?.ema7 && <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-purple-400 inline-block" />EMA7</span>}
                      </div>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                          <defs>
                            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                          <YAxis domain={[priceMin, priceMax]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
                            tickFormatter={(v) => `$${(v / 1000).toFixed(v > 999 ? 0 : 2)}${v > 999 ? "k" : ""}`} width={60} />
                          <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                            formatter={(value: number) => [formatCurrency(value), "Harga"]} />

                          {/* SL / TP lines */}
                          {tradeSetup && <>
                            <ReferenceLine y={tradeSetup.stopLoss} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "SL", fill: "#ef4444", fontSize: 10 }} />
                            <ReferenceLine y={tradeSetup.tp1} stroke="#22c55e" strokeDasharray="4 2" label={{ value: "TP1", fill: "#22c55e", fontSize: 10 }} />
                            <ReferenceLine y={tradeSetup.tp2} stroke="#16a34a" strokeDasharray="4 2" label={{ value: "TP2", fill: "#16a34a", fontSize: 10 }} />
                          </>}
                          {/* VWAP line */}
                          {marketAnalysis?.vwap && (
                            <ReferenceLine y={marketAnalysis.vwap} stroke="#eab308" strokeDasharray="6 3"
                              label={{ value: "VWAP", fill: "#eab308", fontSize: 10 }} />
                          )}
                          {/* EMA7 line */}
                          {marketAnalysis?.ema7 && (
                            <ReferenceLine y={marketAnalysis.ema7} stroke="#a855f7" strokeDasharray="6 3"
                              label={{ value: "EMA7", fill: "#a855f7", fontSize: 10 }} />
                          )}

                          <Area type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#priceGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                      Data grafik tidak tersedia
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {ti && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Indikator Teknikal Lengkap</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Core */}
                  <TechIndicatorRow label="RSI (14)" value={ti.rsi.toFixed(1)}
                    badge={ti.rsi > 70 ? "Overbought" : ti.rsi < 30 ? "Oversold" : "Normal"} />
                  <TechIndicatorRow label="Tren" value={ti.trend} />
                  <TechIndicatorRow label="Market Structure" value={(backendInd?.marketStructure ?? ti.trend) as string}
                    badge={backendInd?.breakOfStructure ? "BOS ✓" : undefined} />
                  <TechIndicatorRow label="Momentum" value={ti.momentum} />
                  <TechIndicatorRow label="Multi-TF Alignment" value={backendInd?.multiTimeframeAlignment ?? "–"}
                    badge={backendInd?.multiTimeframeAlignment === "aligned_bull" ? "Bullish" : backendInd?.multiTimeframeAlignment === "aligned_bear" ? "Bearish" : "Mixed"} />
                  <TechIndicatorRow label="Candle Pattern" value={backendInd?.candlePattern?.replace(/_/g, " ") ?? "–"} />
                  {/* Volume */}
                  <TechIndicatorRow label="Volume Trend" value={ti.volumeTrend}
                    badge={backendInd?.riskRewardRatio ? `R/R: ${backendInd.riskRewardRatio}x` : undefined} />
                  {/* S/R */}
                  {ti.support > 0 && (
                    <TechIndicatorRow label="Support (S1)" value={formatCurrency(ti.support, isCrypto ? "USD" : "IDR")} />
                  )}
                  {ti.resistance > 0 && (
                    <TechIndicatorRow label="Resistance (R1)" value={formatCurrency(ti.resistance, isCrypto ? "USD" : "IDR")} />
                  )}
                  {backendInd?.demandZone && (
                    <TechIndicatorRow label="Demand Zone" value={formatCurrency(backendInd.demandZone, isCrypto ? "USD" : "IDR")}
                      badge="Supply/Demand" />
                  )}
                  {backendInd?.supplyZone && (
                    <TechIndicatorRow label="Supply Zone" value={formatCurrency(backendInd.supplyZone, isCrypto ? "USD" : "IDR")} />
                  )}
                  {/* EMA */}
                  {backendInd?.ema7 && (
                    <TechIndicatorRow label="EMA 7" value={formatCurrency(backendInd.ema7, isCrypto ? "USD" : "IDR")}
                      badge={detail?.currentPrice && detail.currentPrice > backendInd.ema7 ? "Above" : "Below"} />
                  )}
                  {backendInd?.ema25 && (
                    <TechIndicatorRow label="EMA 25" value={formatCurrency(backendInd.ema25, isCrypto ? "USD" : "IDR")}
                      badge={detail?.currentPrice && detail.currentPrice > backendInd.ema25 ? "Above" : "Below"} />
                  )}
                  {backendInd?.ema99 && (
                    <TechIndicatorRow label="EMA 99" value={formatCurrency(backendInd.ema99, isCrypto ? "USD" : "IDR")}
                      badge={detail?.currentPrice && detail.currentPrice > backendInd.ema99 ? "Above" : "Below"} />
                  )}
                  {marketAnalysis?.emaCross !== "neutral" && (
                    <TechIndicatorRow label="EMA Cross"
                      value={marketAnalysis?.emaCross === "golden" ? "✨ Golden Cross" : "💧 Death Cross"}
                      badge={marketAnalysis?.emaCross === "golden" ? "Bullish" : "Bearish"} />
                  )}
                  {/* MACD */}
                  {backendInd?.macd && (
                    <TechIndicatorRow label="MACD"
                      value={`${backendInd.macd.value > 0 ? "+" : ""}${backendInd.macd.value.toFixed(2)}`}
                      badge={backendInd.macd.bullish ? "Bullish" : "Bearish"} />
                  )}
                  {backendInd?.macd && (
                    <TechIndicatorRow label="MACD Histogram"
                      value={`${backendInd.macd.histogram > 0 ? "+" : ""}${backendInd.macd.histogram.toFixed(2)}`} />
                  )}
                  {/* Bollinger */}
                  {backendInd?.bollingerBands && (
                    <TechIndicatorRow label="Bollinger Position"
                      value={`${(backendInd.bollingerBands.position * 100).toFixed(0)}%`}
                      badge={backendInd.bollingerBands.position > 0.8 ? "Overbought" : backendInd.bollingerBands.position < 0.2 ? "Oversold" : "Normal"} />
                  )}
                  {/* SMC */}
                  {backendInd?.fairValueGap?.exists && (
                    <TechIndicatorRow label="Fair Value Gap"
                      value={backendInd.fairValueGap.direction === "bullish" ? "Bullish FVG" : "Bearish FVG"}
                      badge="SMC" />
                  )}
                  {/* Risk */}
                  <TechIndicatorRow label="Stop Hunt Risk" value={backendInd?.stopHuntRisk ?? "–"} />
                  <TechIndicatorRow label="Liquidation Risk" value={backendInd?.liquidationRisk ?? "–"} />
                  {(backendInd?.riskRewardRatio ?? 0) > 0 && (
                    <TechIndicatorRow label="Risk/Reward" value={`${backendInd?.riskRewardRatio}:1`}
                      badge={(backendInd?.riskRewardRatio ?? 0) >= 2 ? "Good" : "Low"} />
                  )}
                  {backendInd?.fomoAlert && (
                    <TechIndicatorRow label="FOMO Alert" value="⚠️ Aktif — Waspadai Entry" />
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Reasons */}
          {detail?.reasons && detail.reasons.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Alasan Prediksi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {detail.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-foreground/80 leading-relaxed">{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Related News */}
          {detail?.newsItems && detail.newsItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="h-4 w-4" /> Berita Terkait
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detail.newsItems.slice(0, 5).map((item) => (
                    <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2">{item.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">{item.source}</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">{formatDate(item.publishedAt)}</span>
                          <Badge variant="outline" className={`text-[10px] ml-auto ${item.sentiment === "positive" ? "border-green-500/30 text-green-600" : item.sentiment === "negative" ? "border-red-500/30 text-red-600" : ""}`}>
                            {item.sentiment}
                          </Badge>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
