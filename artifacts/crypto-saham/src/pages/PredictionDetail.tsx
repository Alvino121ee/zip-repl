import React, { useState } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, TrendingUp, TrendingDown, Activity, BookOpen,
  Target, ShieldAlert, ArrowUpCircle, ArrowDownCircle, Zap, Info,
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

/* ─────────────────────────────────── helpers ──────────────────────────────── */

type Signal = "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";

interface TradeSetup {
  direction: "LONG" | "SHORT" | null;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  slPct: number;
  tp1: number;
  tp1Pct: number;
  tp1RR: number;
  tp2: number;
  tp2Pct: number;
  tp2RR: number;
  tp3: number;
  tp3Pct: number;
  tp3RR: number;
  leverage: number;
  maxLeverage: number;
}

function buildTradeSetup(
  signal: Signal,
  price: number,
  confidence: number,
  change24h: number,
  support?: number | null,
  resistance?: number | null,
): TradeSetup | null {
  if (signal === "neutral" || price <= 0) return null;

  const isLong = signal === "buy" || signal === "strong_buy";
  const direction = isLong ? "LONG" : "SHORT";

  // Entry zone: current ±0.3% (untuk limit order)
  const entryLow  = price * (isLong ? 0.997 : 1.003);
  const entryHigh = price * (isLong ? 1.003 : 1.007);
  const entryMid  = price;

  // Volatility → SL distance (3–12%)
  const vol = Math.min(Math.abs(change24h), 20);
  const slPct = parseFloat(Math.max(3, Math.min(12, vol * 0.6 + 3)).toFixed(2));

  // Stop loss — gunakan support/resistance jika ada dan lebih konservatif
  let stopLoss: number;
  if (isLong) {
    const supportLevel = (support && support > 0 && support < price) ? support : price * (1 - slPct / 100);
    stopLoss = Math.min(supportLevel, price * (1 - slPct / 100));
  } else {
    const resistLevel = (resistance && resistance > 0 && resistance > price) ? resistance : price * (1 + slPct / 100);
    stopLoss = Math.max(resistLevel, price * (1 + slPct / 100));
  }
  const actualSlPct = Math.abs((stopLoss - entryMid) / entryMid) * 100;

  // Take Profits — RR 1.5, 2.5, 4
  const rrMultipliers = [1.5, 2.5, 4.0];
  const [rr1, rr2, rr3] = rrMultipliers;

  const tp = (rr: number) =>
    isLong
      ? entryMid * (1 + (actualSlPct * rr) / 100)
      : entryMid * (1 - (actualSlPct * rr) / 100);

  const tpPct = (rr: number) => parseFloat((actualSlPct * rr).toFixed(2));

  // Leverage: confidence drives it, but always conservative
  const baseLeverage = signal === "strong_buy" || signal === "strong_sell" ? 5 : 3;
  const confBonus = confidence >= 75 ? 5 : confidence >= 60 ? 3 : 1;
  const leverage = Math.min(baseLeverage + confBonus, 20);
  const maxLeverage = Math.min(leverage + 5, 25);

  return {
    direction,
    entryLow, entryHigh,
    stopLoss, slPct: parseFloat(actualSlPct.toFixed(2)),
    tp1: tp(rr1), tp1Pct: tpPct(rr1), tp1RR: rr1,
    tp2: tp(rr2), tp2Pct: tpPct(rr2), tp2RR: rr2,
    tp3: tp(rr3), tp3Pct: tpPct(rr3), tp3RR: rr3,
    leverage, maxLeverage,
  };
}

/* ──────────────────────────── Trading Guide Component ─────────────────────── */

function PriceBox({
  label, value, sub, color, accent, bold,
}: {
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

function FuturesTradingGuide({
  setup,
  isCrypto,
  assetName,
}: {
  setup: TradeSetup;
  isCrypto: boolean;
  assetName: string;
}) {
  const isLong = setup.direction === "LONG";
  const currency = isCrypto ? "USD" : "IDR";
  const fmt = (v: number) => formatCurrency(v, currency);

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
        {/* Entry Zone */}
        <div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
            Zona Entry (Limit Order)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <PriceBox
              label="Entry Bawah"
              value={fmt(setup.entryLow)}
              sub={isLong ? "Beli di level ini" : "Jual (Short) di sini"}
              color={`border-border bg-muted/30`}
              accent="text-muted-foreground"
            />
            <PriceBox
              label="Entry Atas"
              value={fmt(setup.entryHigh)}
              sub="Batas atas zona entry"
              color={`border-border bg-muted/30`}
              accent="text-muted-foreground"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Pasang limit order di dalam zona ini untuk harga yang lebih baik dari market order.
          </p>
        </div>

        {/* Stop Loss */}
        <div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
            Stop Loss
          </p>
          <PriceBox
            label={`Stop Loss · Risiko ${setup.slPct}%`}
            value={fmt(setup.stopLoss)}
            sub={isLong ? "Di bawah level support · Batasi kerugian" : "Di atas level resistance · Batasi kerugian"}
            color="border-red-500/30 bg-red-500/5"
            accent="text-red-400"
            bold
          />
        </div>

        {/* Take Profits */}
        <div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
            Target Take Profit
          </p>
          <div className="space-y-2">
            {/* TP1 */}
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-green-400">TP 1 · Jangka Pendek</p>
                  <p className="text-lg font-extrabold tabular-nums mt-0.5">{fmt(setup.tp1)}</p>
                  <p className="text-xs text-green-400 mt-0.5">+{setup.tp1Pct}% dari entry · Ambil 40–50% posisi</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Risk/Reward</p>
                  <RRBar value={setup.tp1RR} />
                </div>
              </div>
            </div>

            {/* TP2 */}
            <div className="rounded-xl border border-green-500/30 bg-green-500/8 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-green-400">TP 2 · Jangka Menengah</p>
                  <p className="text-lg font-extrabold tabular-nums mt-0.5">{fmt(setup.tp2)}</p>
                  <p className="text-xs text-green-400 mt-0.5">+{setup.tp2Pct}% dari entry · Ambil 30–40% posisi</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Risk/Reward</p>
                  <RRBar value={setup.tp2RR} />
                </div>
              </div>
            </div>

            {/* TP3 */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">TP 3 · Target Maksimum</p>
                  <p className="text-lg font-extrabold tabular-nums mt-0.5">{fmt(setup.tp3)}</p>
                  <p className="text-xs text-emerald-400 mt-0.5">+{setup.tp3Pct}% dari entry · Sisa posisi</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Risk/Reward</p>
                  <RRBar value={setup.tp3RR} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Leverage & Risk Management */}
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

        {/* Step-by-step */}
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
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
          <Info className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-yellow-400/80 leading-relaxed">
            Panduan ini hanya bersifat edukatif dan bukan saran investasi. Trading futures mengandung risiko tinggi —
            selalu gunakan manajemen risiko yang ketat dan hanya gunakan dana yang siap hilang.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────── Tech Indicator Row ───────────────────────── */

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

/* ─────────────────────────────────── Page ─────────────────────────────────── */

export default function PredictionDetail() {
  const params = useParams<{ assetType: string; assetId: string }>();
  const [days, setDays] = useState("7");

  const assetType = (params.assetType === "crypto" || params.assetType === "stock")
    ? params.assetType
    : "crypto" as const;

  const { data: detail, isLoading, error } = useGetPredictionDetail(
    assetType,
    params.assetId ?? ""
  );

  const isCrypto = assetType === "crypto";
  const historyId = params.assetId ?? "";
  const historyDays = parseInt(days);

  const { data: history, isLoading: histLoading } = useGetCryptoHistory(
    historyId,
    historyDays,
    {
      query: {
        enabled: isCrypto && !!historyId,
        queryKey: getGetCryptoHistoryQueryKey(historyId, historyDays),
      },
    }
  );

  const chartData = (history?.prices ?? []).map((p) => ({
    time: new Date(p.timestamp).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
    price: p.price,
  }));

  const priceMin = Math.min(...(history?.prices ?? []).map((p) => p.price)) * 0.999;
  const priceMax = Math.max(...(history?.prices ?? []).map((p) => p.price)) * 1.001;

  // Build trading setup once detail is loaded
  const tradeSetup = detail?.signal && detail?.currentPrice
    ? buildTradeSetup(
        detail.signal as Signal,
        detail.currentPrice,
        detail.confidence ?? 50,
        detail.priceChange24h ?? 0,
        detail.technicalIndicators?.support,
        detail.technicalIndicators?.resistance,
      )
    : null;

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
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          {/* Header */}
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
                    {detail?.currentPrice != null
                      ? formatCurrency(detail.currentPrice, isCrypto ? "USD" : "IDR")
                      : "–"}
                  </p>
                  <PriceChange value={detail?.priceChange24h} />
                </div>
              </div>

              {/* Confidence */}
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

          {/* ── Futures Trading Guide ── */}
          {tradeSetup && (
            <FuturesTradingGuide
              setup={tradeSetup}
              isCrypto={isCrypto}
              assetName={detail?.assetName ?? ""}
            />
          )}

          {/* NEUTRAL notice */}
          {detail?.signal === "neutral" && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow-400">Sinyal Netral – Panduan Trading Tidak Tersedia</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    AI tidak mendeteksi momentum yang cukup untuk setup trading. Tunggu konfirmasi sinyal yang lebih jelas sebelum membuka posisi futures.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Price Chart (crypto only) */}
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
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                          formatter={(value: number) => [formatCurrency(value), "Harga"]}
                        />
                        {/* Mark SL and TP1 on chart if available */}
                        {tradeSetup && (
                          <>
                            <ReferenceLine y={tradeSetup.stopLoss} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "SL", fill: "#ef4444", fontSize: 10 }} />
                            <ReferenceLine y={tradeSetup.tp1} stroke="#22c55e" strokeDasharray="4 2" label={{ value: "TP1", fill: "#22c55e", fontSize: 10 }} />
                            <ReferenceLine y={tradeSetup.tp2} stroke="#16a34a" strokeDasharray="4 2" label={{ value: "TP2", fill: "#16a34a", fontSize: 10 }} />
                          </>
                        )}
                        <Area type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#priceGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                      Data grafik tidak tersedia
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Technical Indicators */}
            {detail?.technicalIndicators && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Indikator Teknikal</CardTitle>
                </CardHeader>
                <CardContent>
                  <TechIndicatorRow label="RSI (14)" value={detail.technicalIndicators.rsi.toFixed(1)}
                    badge={detail.technicalIndicators.rsi > 70 ? "Overbought" : detail.technicalIndicators.rsi < 30 ? "Oversold" : "Normal"} />
                  <TechIndicatorRow label="Tren" value={detail.technicalIndicators.trend} />
                  <TechIndicatorRow label="Momentum" value={detail.technicalIndicators.momentum} />
                  <TechIndicatorRow label="Volume Trend" value={detail.technicalIndicators.volumeTrend} />
                  {detail.technicalIndicators.support > 0 && (
                    <TechIndicatorRow label="Support" value={formatCurrency(detail.technicalIndicators.support)} />
                  )}
                  {detail.technicalIndicators.resistance > 0 && (
                    <TechIndicatorRow label="Resistance" value={formatCurrency(detail.technicalIndicators.resistance)} />
                  )}
                  {detail.technicalIndicators.movingAverage7d && (
                    <TechIndicatorRow label="MA 7D" value={formatCurrency(detail.technicalIndicators.movingAverage7d)} />
                  )}
                  {detail.technicalIndicators.movingAverage30d && (
                    <TechIndicatorRow label="MA 30D" value={formatCurrency(detail.technicalIndicators.movingAverage30d)} />
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
