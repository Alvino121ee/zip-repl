import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity, AlertTriangle, Bot, CheckCircle2,
  CircleDollarSign, Clock, Loader2, Power, RefreshCw, Settings, ShieldAlert,
  TrendingUp, TrendingDown, Wallet, XCircle, Zap, Target,
  BarChart2, Shield, Minus, ArrowUpDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  assetId: string;
  symbol: string;
  bybitSymbol: string;
  signal: "strong_buy" | "buy" | "strong_sell" | "sell";
  side: "Buy" | "Sell";
  confidence: number;
  price: number;
  riskLevel: "low" | "medium" | "high";
  stopLoss: number | null;
  takeProfit: number | null;
}

interface Position {
  symbol: string;
  side: string;
  size: string;
  avgPrice: string;
  unrealisedPnl: string;
  percentage: string;
  markPrice: string;
  leverage: string;
}

interface AutoConfig {
  enabled: boolean;
  mode: "auto" | "semi";
  minConfidence: number;
  maxPositionUSDT: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPositions: number;
  leverage: number;
  intervalMs: number;
  orderType: "Market" | "Limit";
  limitOffsetPct: number;
  scanSource: "universe" | "predictions";
  scalpEnabled: boolean;
  scalpTargetUSDT: number;
}

interface TradeLog {
  id: string;
  timestamp: number;
  symbol: string;
  side: string;
  qty: string;
  price: number;
  confidence: number;
  signal: string;
  status: "executed" | "pending" | "rejected" | "cancelled";
  reason?: string;
  orderId?: string;
}

interface EngineStatusData {
  running: boolean;
  analyzing: boolean;
  lastCycleAt: number | null;
  nextCycleAt: number | null;
  cycleCount: number;
  lastSignalsFound: number;
  lastOrdersPlaced: number;
  lastError: string | null;
  scalpMonitoring: boolean;
  scalpCurrentNetPnl: number;
  scalpLastTriggerAt: number | null;
  config: { enabled: boolean; mode: string; maxPositions: number; minConfidence: number; maxPositionUSDT: number; intervalMs: number; scalpEnabled: boolean; scalpTargetUSDT: number };
}

interface TimeframeSignal {
  interval: string;
  trend: "up" | "down" | "sideways";
  momentum: "strong" | "normal" | "weak";
  bullishConf: boolean;
  bearishConf: boolean;
  ema20: number;
  ema50: number;
  rsi: number;
  volumeRatio: number;
  candlePattern: string | null;
  note: string;
}

interface MacdData {
  macd: number;
  signal: number;
  histogram: number;
  trend: "bullish" | "bearish" | "neutral";
  crossover: "golden" | "death" | "none";
}

interface MarketStructure {
  structure: "bullish" | "bearish" | "ranging";
  pattern: string;
  lastHigh: number;
  lastLow: number;
  prevHigh: number;
  prevLow: number;
}

interface FullAnalysis {
  symbol: string;
  analyzedAt: number;
  marketDirection: "BULLISH" | "BEARISH" | "SIDEWAYS";
  overallConfidence: number;
  indicatorAgreementPct: number;
  side: "Buy" | "Sell" | null;
  shouldEnter: boolean;
  waitReason: string | null;
  shouldExitLong: boolean;
  shouldExitShort: boolean;
  exitReason: string | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  optimalEntry?: number;
  entryQuality?: "optimal" | "good" | "risky";
  entryNote?: string | null;
  scalpTargets: { tp05pct: number; tp1pct: number; sl: number };
  recommendedLeverage: number;
  reasons: string[];
  warnings: string[];
  confirmations: number;
  indicators: {
    ema20: number; ema50: number; ema200: number; vwap: number;
    rsi14: number; atr14: number; volumeRatio: number;
    priceVsVwap: "above" | "below";
    emaAlignment: "bullish" | "bearish" | "mixed";
    rsiZone: "overbought" | "oversold" | "neutral";
  };
  macdData: MacdData;
  marketStructure: MarketStructure;
  openInterest: { value: number; change: number } | null;
  fundingRate: { rate: number; nextFundingTime: number } | null;
  fakeBreakout: { isFakeBreakoutUp: boolean; isFakeBreakoutDown: boolean; note: string | null };
  supplyDemandZones: {
    supplyZone: { high: number; low: number } | null;
    demandZone: { high: number; low: number } | null;
  };
  signalGrade?: "A" | "B" | "C";
  trendStrength?: number;
  rsiDivergence?: "bullish" | "bearish" | "none";
  multiTimeframe: Record<string, TimeframeSignal>;
  supportResistance: { support: number[]; resistance: number[]; nearestSupport: number; nearestResistance: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

function fmt(n: number | string, dec = 2) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function pnlColor(v: string) {
  const n = parseFloat(v);
  return isNaN(n) ? "text-muted-foreground" : n >= 0 ? "text-green-400" : "text-red-400";
}

function smartQty(price: number, usdtAmount: number): string {
  if (!price) return "—";
  const raw = usdtAmount / price;
  if (price >= 10000) return Math.max(0.001, Math.floor(raw * 1000) / 1000).toFixed(3);
  if (price >= 100) return Math.max(0.01, Math.floor(raw * 100) / 100).toFixed(2);
  if (price >= 1) return Math.max(1, Math.floor(raw * 10) / 10).toFixed(1);
  return Math.max(10, Math.floor(raw)).toFixed(0);
}

function timeAgo(ts: number | null) {
  if (!ts) return "—";
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5) return "baru saja";
  if (d < 60) return `${d}s lalu`;
  if (d < 3600) return `${Math.floor(d / 60)}m lalu`;
  return `${Math.floor(d / 3600)}j lalu`;
}

function timeUntil(ts: number | null) {
  if (!ts) return "—";
  const d = Math.ceil((ts - Date.now()) / 1000);
  return d <= 0 ? "segera…" : `${d}s`;
}

// ─── Signal Badge ─────────────────────────────────────────────────────────────

function SigBadge({ signal, side }: { signal: string; side?: "Buy" | "Sell" }) {
  if (side === "Sell" || signal.includes("sell")) {
    const strong = signal === "strong_sell";
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${strong ? "bg-red-500/20 text-red-400 border-red-500/40" : "bg-orange-500/20 text-orange-400 border-orange-500/40"}`}>
        {strong ? "⚡ STRONG SHORT" : "↓ SHORT"}
      </span>
    );
  }
  const strong = signal === "strong_buy";
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${strong ? "bg-green-500/20 text-green-400 border-green-500/40" : "bg-blue-500/20 text-blue-400 border-blue-500/40"}`}>
      {strong ? "⚡ STRONG LONG" : "↑ LONG"}
    </span>
  );
}

// ─── Analysis Modal ───────────────────────────────────────────────────────────

function AnalysisModal({ analysis, config, onClose, onExecute, executing }: {
  analysis: FullAnalysis; config: AutoConfig; onClose: () => void;
  onExecute: () => void; executing: boolean;
}) {
  const isShort = analysis.side === "Sell";
  const dirColor = analysis.marketDirection === "BULLISH" ? "text-green-400"
    : analysis.marketDirection === "BEARISH" ? "text-red-400" : "text-yellow-400";
  const dirBg = analysis.marketDirection === "BULLISH" ? "bg-green-950/30 border-green-500/30"
    : analysis.marketDirection === "BEARISH" ? "bg-red-950/30 border-red-500/30"
    : "bg-yellow-950/30 border-yellow-500/30";
  const confColor = analysis.overallConfidence >= 80 ? "text-green-400"
    : analysis.overallConfidence >= 65 ? "text-yellow-400" : "text-red-400";
  const confBar = analysis.overallConfidence >= 80 ? "bg-green-500"
    : analysis.overallConfidence >= 65 ? "bg-yellow-500" : "bg-red-500";
  const agreeColor = analysis.indicatorAgreementPct >= 75 ? "text-green-400"
    : analysis.indicatorAgreementPct >= 60 ? "text-yellow-400" : "text-red-400";

  const macdColor = analysis.macdData.trend === "bullish" ? "text-green-400"
    : analysis.macdData.trend === "bearish" ? "text-red-400" : "text-yellow-400";
  const msColor = analysis.marketStructure.structure === "bullish" ? "text-green-400"
    : analysis.marketStructure.structure === "bearish" ? "text-red-400" : "text-yellow-400";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-3 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${isShort ? "bg-red-500/10" : "bg-green-500/10"}`}>
              {isShort ? <TrendingDown className="h-5 w-5 text-red-400" /> : <TrendingUp className="h-5 w-5 text-green-400" />}
            </div>
            <div>
              <div className="font-bold text-lg">{analysis.symbol}</div>
              <div className="text-xs text-muted-foreground">
                AI Scalping Analysis · {new Date(analysis.analyzedAt).toLocaleTimeString()}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/50">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Direction + Confidence + Agreement */}
          <div className={`rounded-xl border p-4 ${dirBg}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Arah Market</div>
                <div className={`font-bold text-xl flex items-center gap-2 ${dirColor}`}>
                  {analysis.marketDirection === "BULLISH" ? <TrendingUp className="h-5 w-5" />
                    : analysis.marketDirection === "BEARISH" ? <TrendingDown className="h-5 w-5" />
                    : <Minus className="h-5 w-5" />}
                  {analysis.marketDirection}
                  {analysis.side && (
                    <span className={`text-sm font-medium px-2 py-0.5 rounded-full border ml-1 ${isShort ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-green-500/20 text-green-400 border-green-500/30"}`}>
                      {isShort ? "↓ SHORT" : "↑ LONG"}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Confidence</div>
                <div className={`font-bold text-3xl ${confColor}`}>{analysis.overallConfidence}%</div>
                <div className="text-xs text-muted-foreground">{analysis.confirmations} konfirmasi</div>
              </div>
            </div>
            {/* Confidence bar */}
            <div className="mb-2">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Confidence Score</span><span className={confColor}>{analysis.overallConfidence}% / butuh ≥80%</span>
              </div>
              <div className="h-1.5 w-full bg-black/20 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${confBar}`} style={{ width: `${analysis.overallConfidence}%` }} />
              </div>
            </div>
            {/* Indicator agreement bar */}
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Indikator Setuju</span><span className={agreeColor}>{analysis.indicatorAgreementPct}% / butuh ≥75%</span>
              </div>
              <div className="h-1.5 w-full bg-black/20 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${analysis.indicatorAgreementPct >= 75 ? "bg-green-500" : analysis.indicatorAgreementPct >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${analysis.indicatorAgreementPct}%` }} />
              </div>
            </div>
          </div>

          {/* Fake breakout warning */}
          {analysis.fakeBreakout.note && (
            <div className="rounded-xl bg-orange-950/30 border border-orange-500/40 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
              <span className="text-xs text-orange-300">{analysis.fakeBreakout.note}</span>
            </div>
          )}

          {/* Market structure + MACD + OI + Funding row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-muted/20 rounded-xl p-3 border border-border">
              <div className="text-[10px] text-muted-foreground mb-1">Market Structure</div>
              <div className={`font-bold text-xs ${msColor}`}>{analysis.marketStructure.pattern}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                H: ${fmt(analysis.marketStructure.lastHigh, 4)}
              </div>
            </div>
            <div className={`rounded-xl p-3 border ${analysis.macdData.crossover === "golden" ? "bg-green-950/20 border-green-500/30" : analysis.macdData.crossover === "death" ? "bg-red-950/20 border-red-500/30" : "bg-muted/20 border-border"}`}>
              <div className="text-[10px] text-muted-foreground mb-1">MACD</div>
              <div className={`font-bold text-xs ${macdColor}`}>
                {analysis.macdData.crossover === "golden" ? "⚡ Golden Cross"
                  : analysis.macdData.crossover === "death" ? "💀 Death Cross"
                  : analysis.macdData.trend.charAt(0).toUpperCase() + analysis.macdData.trend.slice(1)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Hist: {analysis.macdData.histogram >= 0 ? "+" : ""}{analysis.macdData.histogram.toFixed(6)}
              </div>
            </div>
            <div className="bg-muted/20 rounded-xl p-3 border border-border">
              <div className="text-[10px] text-muted-foreground mb-1">Open Interest</div>
              {analysis.openInterest ? (
                <>
                  <div className={`font-bold text-xs ${analysis.openInterest.change > 1 ? "text-green-400" : analysis.openInterest.change < -1 ? "text-red-400" : "text-foreground"}`}>
                    {analysis.openInterest.change >= 0 ? "+" : ""}{analysis.openInterest.change.toFixed(2)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {(analysis.openInterest.value / 1e6).toFixed(2)}M USDT
                  </div>
                </>
              ) : <div className="text-xs text-muted-foreground">N/A</div>}
            </div>
            <div className="bg-muted/20 rounded-xl p-3 border border-border">
              <div className="text-[10px] text-muted-foreground mb-1">Funding Rate</div>
              {analysis.fundingRate ? (
                <>
                  <div className={`font-bold text-xs ${analysis.fundingRate.rate > 0.05 ? "text-orange-400" : analysis.fundingRate.rate < -0.05 ? "text-blue-400" : "text-foreground"}`}>
                    {analysis.fundingRate.rate >= 0 ? "+" : ""}{analysis.fundingRate.rate.toFixed(4)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {analysis.fundingRate.rate > 0.05 ? "Longs bayar" : analysis.fundingRate.rate < -0.05 ? "Shorts bayar" : "Netral"}
                  </div>
                </>
              ) : <div className="text-xs text-muted-foreground">N/A</div>}
            </div>
          </div>

          {/* Entry Details + Scalp Targets */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Entry & Target</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-muted/30 rounded-xl p-3 border border-border">
                <div className="text-xs text-muted-foreground mb-1">Entry</div>
                <div className="font-bold text-sm">${fmt(analysis.entryPrice, 4)}</div>
                <div className="text-[10px] text-muted-foreground">Leverage: <span className="text-primary font-semibold">{analysis.recommendedLeverage}x</span></div>
              </div>
              <div className={`rounded-xl p-3 border ${isShort ? "bg-green-950/20 border-green-500/20" : "bg-red-950/20 border-red-500/20"}`}>
                <div className="text-xs text-muted-foreground mb-1">Stop Loss</div>
                <div className={`font-bold text-sm ${isShort ? "text-green-400" : "text-red-400"}`}>${fmt(analysis.stopLoss, 4)}</div>
                <div className="text-[10px] text-muted-foreground">{isShort ? "↑ atas entry" : "↓ bawah entry"}</div>
              </div>
              <div className={`rounded-xl p-3 border ${isShort ? "bg-red-950/20 border-red-500/20" : "bg-green-950/20 border-green-500/20"}`}>
                <div className="text-xs text-muted-foreground mb-1">TP Scalp 0.5%</div>
                <div className={`font-bold text-sm ${isShort ? "text-red-400" : "text-green-400"}`}>${fmt(analysis.scalpTargets.tp05pct, 4)}</div>
                <div className="text-[10px] text-muted-foreground">Quick exit</div>
              </div>
              <div className={`rounded-xl p-3 border ${isShort ? "bg-red-950/20 border-red-500/20" : "bg-green-950/20 border-green-500/20"}`}>
                <div className="text-xs text-muted-foreground mb-1">TP Scalp 1%</div>
                <div className={`font-bold text-sm ${isShort ? "text-red-400" : "text-green-400"}`}>${fmt(analysis.scalpTargets.tp1pct, 4)}</div>
                <div className="text-[10px] text-muted-foreground">R/R {analysis.riskRewardRatio.toFixed(1)}x</div>
              </div>
            </div>
          </div>

          {/* Optimal Entry Zone */}
          {analysis.optimalEntry && analysis.side && (
            <div className={`rounded-xl p-3 border text-xs flex items-start gap-3 ${
              analysis.entryQuality === "optimal" ? "bg-green-950/20 border-green-500/30" :
              analysis.entryQuality === "good" ? "bg-blue-950/20 border-blue-500/30" :
              "bg-orange-950/20 border-orange-500/30"}`}>
              <div className="shrink-0 mt-0.5 text-base">
                {analysis.entryQuality === "optimal" ? "🎯" : analysis.entryQuality === "good" ? "📍" : "⚠️"}
              </div>
              <div className="flex-1">
                <div className={`font-semibold mb-1 ${
                  analysis.entryQuality === "optimal" ? "text-green-400" :
                  analysis.entryQuality === "good" ? "text-blue-400" : "text-orange-400"}`}>
                  {analysis.entryQuality === "optimal" ? "Rate Optimal — Entry Sekarang" :
                   analysis.entryQuality === "good" ? "Rate Bagus — Tunggu Sedikit" : "Rate Kurang Ideal — Tahan Dulu"}
                </div>
                <div className="text-muted-foreground">{analysis.entryNote}</div>
                <div className="mt-1.5 font-bold">
                  Harga saat ini: <span className="text-foreground">${fmt(analysis.entryPrice, 4)}</span>
                  {analysis.optimalEntry !== analysis.entryPrice && (
                    <> · Target entry: <span className={analysis.entryQuality === "optimal" ? "text-green-400" : "text-blue-400"}>${fmt(analysis.optimalEntry, 4)}</span></>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Supply & Demand Zones */}
          {(analysis.supplyDemandZones.supplyZone || analysis.supplyDemandZones.demandZone) && (
            <div className="grid grid-cols-2 gap-2">
              {analysis.supplyDemandZones.demandZone && (
                <div className="bg-green-950/15 rounded-xl p-3 border border-green-500/20">
                  <div className="text-[10px] text-green-400 font-semibold mb-1">DEMAND ZONE</div>
                  <div className="text-xs font-bold text-green-400">${fmt(analysis.supplyDemandZones.demandZone.low, 4)}</div>
                  <div className="text-[10px] text-muted-foreground">– ${fmt(analysis.supplyDemandZones.demandZone.high, 4)}</div>
                </div>
              )}
              {analysis.supplyDemandZones.supplyZone && (
                <div className="bg-red-950/15 rounded-xl p-3 border border-red-500/20">
                  <div className="text-[10px] text-red-400 font-semibold mb-1">SUPPLY ZONE</div>
                  <div className="text-xs font-bold text-red-400">${fmt(analysis.supplyDemandZones.supplyZone.high, 4)}</div>
                  <div className="text-[10px] text-muted-foreground">– ${fmt(analysis.supplyDemandZones.supplyZone.low, 4)}</div>
                </div>
              )}
            </div>
          )}

          {/* Reasons + Warnings */}
          <div className="grid sm:grid-cols-2 gap-3">
            {analysis.reasons.length > 0 && (
              <div className="space-y-1.5">
                <div className={`text-xs font-semibold uppercase tracking-wide ${isShort ? "text-red-400" : "text-green-400"}`}>
                  Konfirmasi {isShort ? "SHORT" : "LONG"} ({analysis.reasons.length})
                </div>
                {analysis.reasons.map((r, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${isShort ? "bg-red-950/20 border border-red-500/15" : "bg-green-950/20 border border-green-500/15"}`}>
                    <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${isShort ? "text-red-400" : "text-green-400"}`} />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}
            {analysis.warnings.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">Peringatan ({analysis.warnings.length})</div>
                {analysis.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-yellow-950/20 border border-yellow-500/15 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Key Indicators */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Indikator Teknikal (15m)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { label: "EMA 20", val: `$${fmt(analysis.indicators.ema20, 4)}`, sub: analysis.indicators.emaAlignment, good: isShort ? analysis.indicators.ema20 > analysis.entryPrice : analysis.indicators.ema20 < analysis.entryPrice },
                { label: "EMA 200", val: `$${fmt(analysis.indicators.ema200, 4)}`, sub: analysis.indicators.emaAlignment, good: isShort ? analysis.indicators.emaAlignment === "bearish" : analysis.indicators.emaAlignment === "bullish" },
                { label: "VWAP", val: `$${fmt(analysis.indicators.vwap, 4)}`, sub: `Price ${analysis.indicators.priceVsVwap} VWAP`, good: isShort ? analysis.indicators.priceVsVwap === "below" : analysis.indicators.priceVsVwap === "above" },
                { label: "RSI 14", val: analysis.indicators.rsi14.toFixed(1), sub: analysis.indicators.rsiZone, good: analysis.indicators.rsiZone === "neutral" },
                { label: "Volume", val: `${(analysis.indicators.volumeRatio * 100).toFixed(0)}%`, sub: "vs avg", good: analysis.indicators.volumeRatio >= 1.2 },
                { label: "ATR 14", val: `$${fmt(analysis.indicators.atr14, 4)}`, sub: `${((analysis.indicators.atr14 / analysis.entryPrice) * 100).toFixed(2)}% volatilitas`, good: analysis.indicators.atr14 < analysis.entryPrice * 0.025 },
              ].map((ind) => (
                <div key={ind.label} className={`rounded-lg p-2.5 border text-xs ${ind.good ? (isShort ? "bg-red-950/15 border-red-500/20" : "bg-green-950/15 border-green-500/20") : "bg-muted/20 border-border"}`}>
                  <div className="text-muted-foreground mb-0.5">{ind.label}</div>
                  <div className="font-bold">{ind.val}</div>
                  <div className={`text-[10px] ${ind.good ? (isShort ? "text-red-400" : "text-green-400") : "text-muted-foreground"}`}>{ind.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Support & Resistance */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/20 rounded-xl p-3 border border-border">
              <div className="text-xs text-muted-foreground mb-2">Support Terdekat</div>
              <div className="font-bold text-green-400">${fmt(analysis.supportResistance.nearestSupport, 4)}</div>
              {analysis.supportResistance.support.slice(0, 2).map((s, i) => (
                <div key={i} className="text-xs text-muted-foreground mt-1">${fmt(s, 4)}</div>
              ))}
            </div>
            <div className="bg-muted/20 rounded-xl p-3 border border-border">
              <div className="text-xs text-muted-foreground mb-2">Resistance Terdekat</div>
              <div className="font-bold text-red-400">${fmt(analysis.supportResistance.nearestResistance, 4)}</div>
              {analysis.supportResistance.resistance.slice(0, 2).map((r, i) => (
                <div key={i} className="text-xs text-muted-foreground mt-1">${fmt(r, 4)}</div>
              ))}
            </div>
          </div>

          {/* Multi-Timeframe */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Analisis Multi-Timeframe</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["TF", "Tren", "Momentum", "RSI", "Vol", "Long✓", "Short✓"].map((h) => (
                      <th key={h} className="text-left text-muted-foreground font-medium pb-2 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {["1m", "5m", "15m", "1h"].filter((tf) => analysis.multiTimeframe[tf]).map((tf) => {
                    const t = analysis.multiTimeframe[tf];
                    return (
                      <tr key={tf} className="border-b border-border/40 last:border-0">
                        <td className="py-2 pr-3 font-bold">{tf}</td>
                        <td className="py-2 pr-3">
                          <span className={`flex items-center gap-1 font-medium ${t.trend === "up" ? "text-green-400" : t.trend === "down" ? "text-red-400" : "text-yellow-400"}`}>
                            {t.trend === "up" ? <TrendingUp className="h-3 w-3" /> : t.trend === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {t.trend}
                          </span>
                        </td>
                        <td className={`py-2 pr-3 ${t.momentum === "strong" ? "text-foreground font-medium" : "text-muted-foreground"}`}>{t.momentum}</td>
                        <td className="py-2 pr-3">{t.rsi.toFixed(0)}</td>
                        <td className="py-2 pr-3">{(t.volumeRatio * 100).toFixed(0)}%</td>
                        <td className="py-2 pr-2">{t.bullishConf ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}</td>
                        <td className="py-2">{t.bearishConf ? <CheckCircle2 className="h-3.5 w-3.5 text-red-400" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Verdict */}
          {!analysis.shouldEnter ? (
            <div className="rounded-xl bg-yellow-950/30 border border-yellow-500/30 p-4 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-yellow-400 mb-1">Jangan Entry Sekarang</div>
                <div className="text-sm text-muted-foreground">{analysis.waitReason}</div>
              </div>
            </div>
          ) : (
            <div className={`rounded-xl p-4 flex items-start gap-3 border ${isShort ? "bg-red-950/20 border-red-500/30" : "bg-green-950/20 border-green-500/30"}`}>
              <CheckCircle2 className={`h-5 w-5 shrink-0 mt-0.5 ${isShort ? "text-red-400" : "text-green-400"}`} />
              <div>
                <div className={`font-semibold mb-1 ${isShort ? "text-red-400" : "text-green-400"}`}>
                  ⚡ Setup Valid — Siap Scalp {isShort ? "SHORT" : "LONG"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {analysis.confirmations} konfirmasi · {analysis.indicatorAgreementPct}% indikator setuju · RR {analysis.riskRewardRatio.toFixed(1)}x · Leverage {analysis.recommendedLeverage}x
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>Tutup</Button>
            {config.mode === "semi" && (
              <Button
                className={`flex-1 text-white ${analysis.shouldEnter ? (isShort ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700") : "bg-muted text-muted-foreground cursor-not-allowed"}`}
                disabled={!analysis.shouldEnter || executing}
                onClick={onExecute}
              >
                {executing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Executing…</>
                  : <><Zap className="h-4 w-4 mr-2" />{isShort ? "Open SHORT" : "Open LONG"}</>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

function SignalCard({ sig, config, onAnalyze, onExecute, analyzing, executing }: {
  sig: Signal; config: AutoConfig;
  onAnalyze: (sig: Signal) => void; onExecute: (sig: Signal) => void;
  analyzing: string | null; executing: string | null;
}) {
  const isShort = sig.side === "Sell";
  const qty = smartQty(sig.price, config.maxPositionUSDT);
  const sl = sig.stopLoss ?? (isShort ? sig.price * (1 + config.stopLossPct / 100) : sig.price * (1 - config.stopLossPct / 100));
  const tp = sig.takeProfit ?? (isShort ? sig.price * (1 - config.takeProfitPct / 100) : sig.price * (1 + config.takeProfitPct / 100));
  const isAnalyzing = analyzing === sig.bybitSymbol;
  const isExec = executing === sig.bybitSymbol;

  return (
    <Card className={`border ${isShort ? "border-red-500/30" : "border-green-500/20"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-bold text-base">{sig.symbol}</div>
            <div className="text-xs text-muted-foreground">{sig.bybitSymbol}</div>
          </div>
          <div className="text-right">
            <SigBadge signal={sig.signal} side={sig.side} />
            <div className="text-sm font-semibold mt-1">${fmt(sig.price, 4)}</div>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Confidence</span>
            <span className="font-semibold text-foreground">{sig.confidence}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${isShort ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${sig.confidence}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
          <div className="bg-muted/40 rounded p-2">
            <div className="text-muted-foreground">Qty</div>
            <div className="font-medium">{qty}</div>
          </div>
          <div className={`rounded p-2 border ${isShort ? "bg-green-950/20 border-green-500/20" : "bg-red-950/20 border-red-500/20"}`}>
            <div className="text-muted-foreground">SL</div>
            <div className={`font-medium ${isShort ? "text-green-400" : "text-red-400"}`}>${fmt(sl, 4)}</div>
          </div>
          <div className={`rounded p-2 border ${isShort ? "bg-red-950/20 border-red-500/20" : "bg-green-950/20 border-green-500/20"}`}>
            <div className="text-muted-foreground">TP</div>
            <div className={`font-medium ${isShort ? "text-red-400" : "text-green-400"}`}>${fmt(tp, 4)}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs border-primary/40 text-primary hover:bg-primary/10" disabled={isAnalyzing} onClick={() => onAnalyze(sig)}>
            {isAnalyzing ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Analyzing…</> : <><BarChart2 className="h-3 w-3 mr-1" />Analisa AI</>}
          </Button>
          {config.mode === "semi" && (
            <Button className={`flex-1 text-white text-xs ${isShort ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}`} size="sm" disabled={isExec} onClick={() => onExecute(sig)}>
              {isExec ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Exec…</> : <><Zap className="h-3 w-3 mr-1" />{isShort ? "SHORT" : "LONG"}</>}
            </Button>
          )}
        </div>
        {config.mode === "auto" && (
          <div className={`flex items-center gap-1.5 text-xs mt-2 ${config.enabled ? "text-primary" : "text-muted-foreground"}`}>
            <Bot className="h-3.5 w-3.5" />
            <span>{config.enabled ? "Auto-engine aktif — analisis akan memfilter entry" : "Aktifkan engine untuk auto-eksekusi"}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Position Row ─────────────────────────────────────────────────────────────

function PositionRow({ pos, onSetTPSL, onClose }: {
  pos: Position;
  onSetTPSL: (p: Position) => void;
  onClose: (p: Position) => void;
}) {
  const pnl = parseFloat(pos.unrealisedPnl ?? "0");
  const pct = parseFloat(pos.percentage ?? "0");
  const isShort = pos.side === "Sell";

  return (
    <div className="flex items-start justify-between py-3 border-b border-border last:border-0 gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm">{pos.symbol}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isShort ? "text-red-400 border-red-500/40" : "text-green-400 border-green-500/40"}`}>
            {isShort ? "↓ SHORT" : "↑ LONG"}
          </Badge>
          <span className="text-xs text-muted-foreground">{pos.leverage}x</span>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>Ukuran: <span className="text-foreground">{pos.size}</span></div>
          <div>Avg: <span className="text-foreground">${fmt(pos.avgPrice)}</span> · Mark: <span className="text-foreground">${fmt(pos.markPrice)}</span></div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-bold text-base ${pnlColor(pos.unrealisedPnl)}`}>
          {pnl >= 0 ? "+" : ""}{fmt(pnl)} USDT
        </div>
        <div className={`text-xs mb-2 ${pnlColor(pos.unrealisedPnl)}`}>({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)</div>
        <div className="flex gap-1.5 justify-end">
          <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => onSetTPSL(pos)}>
            <Target className="h-3 w-3 mr-1" />TP/SL
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7 px-2 border-red-500/40 text-red-400 hover:bg-red-950/30" onClick={() => onClose(pos)}>
            <XCircle className="h-3 w-3 mr-1" />Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── TPSL Dialog ──────────────────────────────────────────────────────────────

function TPSLDialog({ pos, config, onClose, onSave }: {
  pos: Position; config: AutoConfig; onClose: () => void;
  onSave: (symbol: string, tp: number, sl: number) => Promise<void>;
}) {
  const markPrice = parseFloat(pos.markPrice);
  const isShort = pos.side === "Sell";
  const [tp, setTp] = useState(isShort ? markPrice * (1 - config.takeProfitPct / 100) : markPrice * (1 + config.takeProfitPct / 100));
  const [sl, setSl] = useState(isShort ? markPrice * (1 + config.stopLossPct / 100) : markPrice * (1 - config.stopLossPct / 100));
  const [saving, setSaving] = useState(false);

  async function handleSave() { setSaving(true); await onSave(pos.symbol, tp, sl); setSaving(false); onClose(); }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl p-5 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Set TP/SL — {pos.symbol} {isShort ? "SHORT" : "LONG"}</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Take Profit (USDT) {isShort ? "— bawah harga" : "— atas harga"}</label>
            <input type="number" value={tp} onChange={(e) => setTp(parseFloat(e.target.value))} className={`w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none ${isShort ? "border-red-500/40 focus:border-red-500 text-red-400" : "border-green-500/40 focus:border-green-500 text-green-400"}`} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Stop Loss (USDT) {isShort ? "— atas harga" : "— bawah harga"}</label>
            <input type="number" value={sl} onChange={(e) => setSl(parseFloat(e.target.value))} className={`w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none ${isShort ? "border-green-500/40 focus:border-green-500 text-green-400" : "border-red-500/40 focus:border-red-500 text-red-400"}`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-center">
          <div className={`rounded p-2 border ${isShort ? "bg-red-950/20 border-red-500/20" : "bg-green-950/20 border-green-500/20"}`}>
            <div>Profit target</div>
            <div className={`font-semibold ${isShort ? "text-red-400" : "text-green-400"}`}>{Math.abs(((tp - markPrice) / markPrice) * 100).toFixed(2)}%</div>
          </div>
          <div className={`rounded p-2 border ${isShort ? "bg-green-950/20 border-green-500/20" : "bg-red-950/20 border-red-500/20"}`}>
            <div>Max loss</div>
            <div className={`font-semibold ${isShort ? "text-green-400" : "text-red-400"}`}>{Math.abs(((sl - markPrice) / markPrice) * 100).toFixed(2)}%</div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}Set TP/SL
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Engine Status Panel ──────────────────────────────────────────────────────

function EngineStatusPanel({ stat, config }: { stat: EngineStatusData | null; config: AutoConfig }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, []);
  if (!config.enabled || config.mode !== "auto") return null;

  return (
    <div className="mt-3 rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2">
      {stat?.analyzing ? (
        <div className="flex items-center gap-2 text-sm text-primary font-medium">
          <Loader2 className="h-4 w-4 animate-spin" />Sedang menganalisis sinyal bidirectional…
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-green-400 font-medium">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          Engine aktif — scan LONG + SHORT + auto close/reverse
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3 w-3" />Scan: <span className="text-foreground ml-1">{timeAgo(stat?.lastCycleAt ?? null)}</span></div>
        <div className="flex items-center gap-1.5 text-muted-foreground"><Activity className="h-3 w-3" />Berikutnya: <span className="text-foreground ml-1">{timeUntil(stat?.nextCycleAt ?? null)}</span></div>
      </div>
      {(stat?.cycleCount ?? 0) > 0 && (
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>Scan ke-<span className="text-foreground font-medium">{stat?.cycleCount}</span></span>
          <span>Sinyal: <span className="text-foreground font-medium">{stat?.lastSignalsFound}</span></span>
          <span>Order: <span className={`font-medium ${(stat?.lastOrdersPlaced ?? 0) > 0 ? "text-green-400" : "text-foreground"}`}>{stat?.lastOrdersPlaced}</span></span>
        </div>
      )}
      {config.scalpEnabled && (
        <div className={`flex items-center justify-between text-xs rounded px-2 py-1.5 border ${(stat?.scalpCurrentNetPnl ?? 0) >= (config.scalpTargetUSDT ?? 1) ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-300" : "bg-muted/40 border-border text-muted-foreground"}`}>
          <span className="flex items-center gap-1.5 font-medium">
            <span>⚡</span>
            Scalp monitor {stat?.scalpMonitoring ? "(checking…)" : "aktif"}
          </span>
          <span className="font-mono">
            {(stat?.scalpCurrentNetPnl ?? 0) >= 0 ? "+" : ""}${((stat?.scalpCurrentNetPnl ?? 0)).toFixed(3)} / ${config.scalpTargetUSDT}
          </span>
        </div>
      )}
      {stat?.lastError && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-950/30 rounded p-2 border border-red-500/20">
          <AlertTriangle className="h-3 w-3 shrink-0" /><span className="truncate">{stat.lastError}</span>
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({ config, onChange, onClose }: {
  config: AutoConfig; onChange: (patch: Partial<AutoConfig>) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="font-bold flex items-center gap-2"><Settings className="h-4 w-4 text-primary" />Pengaturan Bot</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>
        <div className="p-5 space-y-5">
          {[["Mode Trading", ["semi", "auto"], "mode", { semi: "Semi (Manual)", auto: "Auto (Full-Auto)" }],
            ["Sumber Sinyal", ["universe", "predictions"], "scanSource", { universe: "Bybit Universe", predictions: "AI Predictions" }],
            ["Tipe Order", ["Market", "Limit"], "orderType", { Market: "Market", Limit: "Limit" }],
          ].map(([label, opts, key, labels]) => (
            <div key={key as string}>
              <label className="text-xs text-muted-foreground block mb-2">{label as string}</label>
              <div className="grid grid-cols-2 gap-2">
                {(opts as string[]).map((o) => (
                  <button key={o} onClick={() => onChange({ [key as string]: o } as Partial<AutoConfig>)}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${(config as unknown as Record<string, unknown>)[key as string] === o ? "bg-primary/20 border-primary text-primary" : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"}`}>
                    {(labels as Record<string, string>)[o]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {[
            { key: "minConfidence", label: "Min Confidence (%)", min: 50, max: 99, step: 1, display: `${config.minConfidence}%` },
            { key: "maxPositionUSDT", label: "Max Posisi (USDT)", min: 5, max: 500, step: 5, display: `$${config.maxPositionUSDT}` },
            { key: "stopLossPct", label: "Stop Loss (%)", min: 0.5, max: 10, step: 0.5, display: `${config.stopLossPct}%` },
            { key: "takeProfitPct", label: "Take Profit (%)", min: 0.5, max: 20, step: 0.5, display: `${config.takeProfitPct}%` },
            { key: "maxPositions", label: "Max Posisi Serentak", min: 1, max: 20, step: 1, display: `${config.maxPositions}` },
            { key: "leverage", label: "Leverage", min: 1, max: 20, step: 1, display: `${config.leverage}x` },
            { key: "intervalMs", label: "Interval Scan (detik)", min: 15000, max: 300000, step: 15000, display: `${config.intervalMs / 1000}s` },
          ].map(({ key, label, min, max, step, display }) => (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1.5"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{display}</span></div>
              <Slider min={min} max={max} step={step} value={[(config as unknown as Record<string, unknown>)[key] as number]}
                onValueChange={([v]) => onChange({ [key]: v } as Partial<AutoConfig>)} className="w-full" />
            </div>
          ))}

          {/* ── Scalp Mode ─────────────────────────────────────────── */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <span>⚡</span> Auto-Scalp Mode
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Tutup semua posisi saat net PnL ≥ target, lalu langsung cari entry baru</div>
              </div>
              <button
                onClick={() => onChange({ scalpEnabled: !config.scalpEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.scalpEnabled ? "bg-yellow-500" : "bg-muted"}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${config.scalpEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {config.scalpEnabled && (
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Target Net PnL (setelah fee Bybit 0.055%)</span>
                  <span className="font-semibold text-yellow-400">${config.scalpTargetUSDT.toFixed(2)} USDT</span>
                </div>
                <Slider min={0.5} max={10} step={0.25} value={[config.scalpTargetUSDT]}
                  onValueChange={([v]) => onChange({ scalpTargetUSDT: v })} className="w-full" />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>$0.50</span><span>$10.00</span>
                </div>
                <div className="mt-2 text-[11px] text-yellow-500/80 bg-yellow-500/5 border border-yellow-500/20 rounded p-2">
                  Monitor berjalan setiap 10 detik. Net = unrealisedPnL − fee close (size × mark × 0.055%)
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Close Dialog ─────────────────────────────────────────────────────

function ConfirmCloseDialog({ pos, onClose, onConfirm, closing }: {
  pos: Position; onClose: () => void; onConfirm: () => void; closing: boolean;
}) {
  const isShort = pos.side === "Sell";
  const pnl = parseFloat(pos.unrealisedPnl ?? "0");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl p-5 w-full max-w-sm shadow-2xl">
        <div className="font-bold mb-3 flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-400" />Close Posisi {isShort ? "SHORT" : "LONG"} — {pos.symbol}
        </div>
        <div className="text-sm text-muted-foreground mb-4">
          Tutup posisi {isShort ? "short" : "long"} {pos.size} {pos.symbol} @ mark ${fmt(pos.markPrice)}.<br />
          <span className={`font-semibold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>PnL: {pnl >= 0 ? "+" : ""}{fmt(pnl)} USDT</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Batal</Button>
          <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={onConfirm} disabled={closing}>
            {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}Close Posisi
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Trading Page ────────────────────────────────────────────────────────

export default function Trading() {
  const { toast } = useToast();

  const [signals, setSignals] = useState<Signal[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [config, setConfig] = useState<AutoConfig>({
    enabled: false, mode: "semi", minConfidence: 80, maxPositionUSDT: 50,
    stopLossPct: 2, takeProfitPct: 4, maxPositions: 5, leverage: 1,
    intervalMs: 60_000, orderType: "Market", limitOffsetPct: 0.3, scanSource: "universe",
    scalpEnabled: false, scalpTargetUSDT: 1.0,
  });
  const [engineStat, setEngineStat] = useState<EngineStatusData | null>(null);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState<FullAnalysis | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"signals" | "positions" | "log">("signals");
  const [tpslPos, setTpslPos] = useState<Position | null>(null);
  const [closePos, setClosePos] = useState<Position | null>(null);
  const [pendingSig, setPendingSig] = useState<Signal | null>(null);
  const prevPosCount = useRef<number>(-1);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [sigRes, posRes, cfgRes, logRes, balRes] = await Promise.allSettled([
        apiFetch<Signal[]>("/api/trading/signals"),
        apiFetch<{ list: Position[] }>("/api/trading/positions"),
        apiFetch<AutoConfig>("/api/trading/config"),
        apiFetch<TradeLog[]>("/api/trading/log"),
        apiFetch<{ list: { coin: { coin: string; walletBalance: string }[] }[] }>("/api/trading/balance"),
      ]);
      if (sigRes.status === "fulfilled") setSignals(sigRes.value);
      if (cfgRes.status === "fulfilled") setConfig(cfgRes.value);
      if (logRes.status === "fulfilled") setTradeLogs(logRes.value);
      if (posRes.status === "fulfilled") {
        const newPos = posRes.value.list ?? [];
        if (prevPosCount.current >= 0 && newPos.length > prevPosCount.current) {
          toast({ title: `🔔 ${newPos.length - prevPosCount.current} Posisi Baru Dibuka!`, description: `${newPos.length} posisi aktif di Bybit.` });
          setActiveTab("positions");
        }
        prevPosCount.current = newPos.length;
        setPositions(newPos);
      }
      if (balRes.status === "fulfilled") {
        const usdt = balRes.value.list?.[0]?.coin?.find((c) => c.coin === "USDT");
        setBalance(usdt ? parseFloat(usdt.walletBalance) : null);
      }
    } catch (err) { toast({ title: "Error", description: String(err), variant: "destructive" }); }
    finally { setLoading(false); setRefreshing(false); }
  }, [toast]);

  const loadEngineStat = useCallback(async () => {
    try { setEngineStat(await apiFetch<EngineStatusData>("/api/trading/engine-status")); } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => {
    void loadEngineStat();
    const id = setInterval(() => void loadEngineStat(), 5000);
    return () => clearInterval(id);
  }, [loadEngineStat]);
  useEffect(() => {
    if (!config.enabled || config.mode !== "auto") return;
    const id = setInterval(() => void loadAll(true), 30_000);
    return () => clearInterval(id);
  }, [config.enabled, config.mode, loadAll]);

  async function updateConfig(patch: Partial<AutoConfig>) {
    const isToggle = "enabled" in patch;
    if (isToggle) setToggling(true);
    setConfig((c) => ({ ...c, ...patch }));
    try {
      const updated = await apiFetch<AutoConfig>("/api/trading/config", { method: "PUT", body: JSON.stringify(patch) });
      setConfig(updated);
      if (isToggle) {
        toast(patch.enabled
          ? { title: "Engine Aktif", description: `Bot berjalan — scan LONG + SHORT tiap ${Math.round(updated.intervalMs / 1000)}s, auto close/reverse aktif.` }
          : { title: "Engine Dimatikan" });
        if (patch.enabled) setTimeout(() => void loadEngineStat(), 500);
      }
    } catch (err) { void loadAll(); toast({ title: "Config error", description: String(err), variant: "destructive" }); }
    finally { if (isToggle) setToggling(false); }
  }

  async function handleAnalyze(sig: Signal) {
    setAnalyzing(sig.bybitSymbol);
    try {
      const analysis = await apiFetch<FullAnalysis>(`/api/trading/analyze/${sig.bybitSymbol}`);
      setActiveAnalysis(analysis); setPendingSig(sig);
    } catch (err) { toast({ title: "Analisis gagal", description: String(err), variant: "destructive" }); }
    finally { setAnalyzing(null); }
  }

  function calcQty(price: number, usdtAmount: number): string {
    const raw = usdtAmount / price;
    if (price >= 10000) return Math.max(0.001, Math.floor(raw * 1000) / 1000).toFixed(3);
    if (price >= 100) return Math.max(0.01, Math.floor(raw * 100) / 100).toFixed(2);
    if (price >= 1) return Math.max(1, Math.floor(raw * 10) / 10).toFixed(1);
    return Math.max(10, Math.floor(raw)).toFixed(0);
  }

  async function executeOrder(sig: Signal, overrideAnalysis?: FullAnalysis) {
    setExecuting(sig.bybitSymbol);
    try {
      const qty = calcQty(sig.price, config.maxPositionUSDT);
      const isShort = sig.side === "Sell";
      const slPrice = overrideAnalysis?.stopLoss
        ?? (isShort ? sig.price * (1 + config.stopLossPct / 100) : sig.price * (1 - config.stopLossPct / 100));
      const tpPrice = overrideAnalysis?.takeProfit
        ?? (isShort ? sig.price * (1 - config.takeProfitPct / 100) : sig.price * (1 + config.takeProfitPct / 100));

      await apiFetch("/api/trading/order", {
        method: "POST",
        body: JSON.stringify({ symbol: sig.bybitSymbol, side: sig.side, qty, takeProfit: tpPrice, stopLoss: slPrice }),
      });
      toast({ title: `${isShort ? "SHORT" : "LONG"} ${sig.bybitSymbol} tereksekusi!`, description: `${sig.side} ${qty} @ $${fmt(sig.price, 4)} · TP $${fmt(tpPrice, 4)} · SL $${fmt(slPrice, 4)}` });
      void loadAll(true);
      setActiveAnalysis(null); setPendingSig(null);
    } catch (err) { toast({ title: "Order gagal", description: String(err), variant: "destructive" }); }
    finally { setExecuting(null); }
  }

  async function handleCloseAll() {
    setClosingAll(true);
    try {
      const result = await apiFetch<{ closed: number; errors: string[] }>("/api/trading/close-all", { method: "POST" });
      if (result.errors.length > 0) {
        toast({ title: `${result.closed} posisi ditutup, ${result.errors.length} gagal`, description: result.errors[0], variant: "destructive" });
      } else {
        toast({ title: `✅ ${result.closed} posisi berhasil ditutup`, description: "Semua posisi sudah di-close." });
      }
      void loadAll(true);
    } catch (err) { toast({ title: "Gagal close all", description: String(err), variant: "destructive" }); }
    finally { setClosingAll(false); }
  }

  async function handleClosePosition(pos: Position) {
    setClosing(pos.symbol);
    try {
      const side = pos.side === "Buy" ? "Sell" : "Buy"; // opposite to close
      await apiFetch("/api/trading/close-position", {
        method: "POST",
        body: JSON.stringify({ symbol: pos.symbol, side, qty: pos.size }),
      });
      toast({ title: `Posisi ${pos.symbol} ditutup`, description: `${pos.side} ${pos.size} closed` });
      setClosePos(null);
      void loadAll(true);
    } catch (err) { toast({ title: "Gagal close posisi", description: String(err), variant: "destructive" }); }
    finally { setClosing(null); }
  }

  async function handleSetTPSL(symbol: string, tp: number, sl: number) {
    await apiFetch("/api/trading/position/tpsl", { method: "POST", body: JSON.stringify({ symbol, takeProfit: tp, stopLoss: sl }) });
    toast({ title: "TP/SL diperbarui", description: `${symbol}: TP $${fmt(tp, 4)} · SL $${fmt(sl, 4)}` });
    void loadAll(true);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const totalPnl = positions.reduce((s, p) => s + parseFloat(p.unrealisedPnl ?? "0"), 0);
  const longSigs = signals.filter((s) => s.side === "Buy");
  const shortSigs = signals.filter((s) => s.side === "Sell");

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-yellow-400" />AI Scalping Bot
          </h1>
          <p className="text-sm text-muted-foreground">Bybit Futures · MACD · Market Structure · OI · Funding Rate · Min 80% Conf</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadAll(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Wallet className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Balance</span></div>
          <div className="font-bold text-lg">{balance != null ? `$${fmt(balance)}` : <span className="text-muted-foreground text-sm">No API key</span>}</div>
          <div className="text-xs text-muted-foreground">USDT</div>
        </CardContent></Card>

        <Card className={config.scalpEnabled && positions.length > 0 ? "border-yellow-500/40" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Open PnL</span>
              {config.scalpEnabled && <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-1.5 rounded border border-yellow-500/30">SCALP</span>}
            </div>
            <div className={`font-bold text-lg ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)} USDT</div>
            {config.scalpEnabled ? (
              <div className="mt-1.5">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Net target</span>
                  <span className="font-semibold text-yellow-400">${fmt(engineStat?.scalpCurrentNetPnl ?? 0, 3)} / ${config.scalpTargetUSDT}</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${(engineStat?.scalpCurrentNetPnl ?? 0) >= config.scalpTargetUSDT ? "bg-yellow-400" : "bg-yellow-600"}`}
                    style={{ width: `${Math.min(100, Math.max(0, ((engineStat?.scalpCurrentNetPnl ?? 0) / config.scalpTargetUSDT) * 100))}%` }}
                  />
                </div>
                {engineStat?.scalpLastTriggerAt && (
                  <div className="text-[10px] text-yellow-400 mt-1">⚡ Last scalp: {timeAgo(engineStat.scalpLastTriggerAt)}</div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">{positions.length} posisi aktif</div>
            )}
          </CardContent>
        </Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><BarChart2 className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Sinyal</span></div>
          <div className="font-bold flex items-center gap-2">
            <span className="text-green-400">{longSigs.length}↑</span>
            <span className="text-red-400">{shortSigs.length}↓</span>
          </div>
          <div className="text-xs text-muted-foreground">LONG / SHORT</div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Engine</span></div>
            {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Switch checked={config.enabled} onCheckedChange={(v) => void updateConfig({ enabled: v })} />}
          </div>
          <div className={`font-bold text-sm ${config.enabled ? "text-green-400" : "text-muted-foreground"}`}>{config.enabled ? "AKTIF" : "NONAKTIF"}</div>
          <div className="text-xs text-muted-foreground capitalize">{config.mode} mode</div>
        </CardContent></Card>
      </div>

      <EngineStatusPanel stat={engineStat} config={config} />

      {/* Info banner */}
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-start gap-3 text-sm">
        <ArrowUpDown className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-primary">Bidirectional AI Trading</span>
          <span className="text-muted-foreground"> · Bot otomatis scan LONG dan SHORT. Entry jika tren kuat, skip jika market sideways. Di mode Auto: posisi yang berlawanan dengan tren baru akan otomatis di-close dan di-reverse.</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-1">
        {(["signals", "positions", "log"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab === "signals" ? `Signals (${signals.length})`
              : tab === "positions" ? (
                <span className={positions.length > 0 ? "text-orange-400" : ""}>
                  Positions ({positions.length}){positions.length > 0 && <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />}
                </span>
              ) : `Trade Log (${tradeLogs.length})`}
          </button>
        ))}
      </div>

      {/* Signals Tab */}
      {activeTab === "signals" && (
        <div className="space-y-4">
          {signals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Tidak ada sinyal dengan confidence ≥ {config.minConfidence}% saat ini
            </div>
          ) : (
            <>
              {longSigs.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-green-400">
                    <TrendingUp className="h-4 w-4" />LONG Signals ({longSigs.length})
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {longSigs.map((sig) => (
                      <SignalCard key={sig.bybitSymbol + sig.side} sig={sig} config={config}
                        onAnalyze={handleAnalyze} onExecute={(s) => void executeOrder(s)}
                        analyzing={analyzing} executing={executing} />
                    ))}
                  </div>
                </div>
              )}
              {shortSigs.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-red-400">
                    <TrendingDown className="h-4 w-4" />SHORT Signals ({shortSigs.length})
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {shortSigs.map((sig) => (
                      <SignalCard key={sig.bybitSymbol + sig.side} sig={sig} config={config}
                        onAnalyze={handleAnalyze} onExecute={(s) => void executeOrder(s)}
                        analyzing={analyzing} executing={executing} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Positions Tab */}
      {activeTab === "positions" && (
        <Card><CardContent className="p-4">
          {positions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <CircleDollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />Tidak ada posisi terbuka
            </div>
          ) : positions.map((pos) => (
            <PositionRow key={pos.symbol + pos.side} pos={pos} onSetTPSL={setTpslPos} onClose={setClosePos} />
          ))}
        </CardContent></Card>
      )}

      {/* Trade Log Tab */}
      {activeTab === "log" && (
        <Card><CardContent className="p-4">
          {tradeLogs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />Belum ada riwayat trading
            </div>
          ) : tradeLogs.map((log) => (
            <div key={log.id} className="flex items-start justify-between py-2.5 border-b border-border last:border-0 gap-2 text-sm">
              <div className="flex items-start gap-2 min-w-0">
                {log.status === "executed" ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                  : log.status === "rejected" ? <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  : <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-1.5">
                    {log.symbol}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${log.side === "Sell" ? "text-red-400 border-red-500/30" : "text-green-400 border-green-500/30"}`}>
                      {log.side === "Sell" ? "↓SHORT" : "↑LONG"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{log.side} {log.qty} @ ${fmt(log.price, 4)} · {log.confidence}% conf</div>
                  {log.reason && <div className={`text-xs truncate mt-0.5 ${log.status === "rejected" ? "text-yellow-500" : "text-muted-foreground"}`}>{log.reason}</div>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <Badge variant="outline" className={
                  log.status === "executed" ? "border-green-500/40 text-green-400"
                    : log.status === "rejected" ? "border-red-500/40 text-red-400"
                    : "border-yellow-500/40 text-yellow-400"
                }>{log.status}</Badge>
                <div className="text-xs text-muted-foreground mt-1">{new Date(log.timestamp).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
        </CardContent></Card>
      )}

      {/* Modals */}
      {activeAnalysis && pendingSig && (
        <AnalysisModal analysis={activeAnalysis} config={config}
          onClose={() => { setActiveAnalysis(null); setPendingSig(null); }}
          onExecute={() => void executeOrder(pendingSig, activeAnalysis)}
          executing={executing === pendingSig.bybitSymbol} />
      )}
      {tpslPos && <TPSLDialog pos={tpslPos} config={config} onClose={() => setTpslPos(null)} onSave={handleSetTPSL} />}
      {closePos && (
        <ConfirmCloseDialog pos={closePos} onClose={() => setClosePos(null)}
          onConfirm={() => void handleClosePosition(closePos)} closing={closing === closePos.symbol} />
      )}
      {settingsOpen && <SettingsPanel config={config} onChange={updateConfig} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
