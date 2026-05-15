import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity, AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronUp,
  CircleDollarSign, Clock, Loader2, Power, RefreshCw, Settings, ShieldAlert,
  TrendingUp, TrendingDown, Wallet, XCircle, Zap, Target, Bell, Search,
  BarChart2, Shield, Minus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  assetId: string;
  symbol: string;
  bybitSymbol: string;
  signal: "strong_buy" | "buy";
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
  config: {
    enabled: boolean;
    mode: string;
    maxPositions: number;
    minConfidence: number;
    maxPositionUSDT: number;
    intervalMs: number;
  };
}

interface TimeframeSignal {
  interval: string;
  trend: "up" | "down" | "sideways";
  momentum: "strong" | "normal" | "weak";
  confirmation: boolean;
  ema20: number;
  ema50: number;
  rsi: number;
  volumeRatio: number;
  candlePattern: string | null;
  note: string;
}

interface FullAnalysis {
  symbol: string;
  analyzedAt: number;
  marketDirection: "BULLISH" | "BEARISH" | "SIDEWAYS";
  overallConfidence: number;
  shouldEnter: boolean;
  waitReason: string | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  side: "Buy" | "Sell";
  reasons: string[];
  warnings: string[];
  confirmations: number;
  indicators: {
    ema20: number;
    ema50: number;
    ema200: number;
    vwap: number;
    rsi14: number;
    atr14: number;
    volumeRatio: number;
    priceVsVwap: "above" | "below";
    emaAlignment: "bullish" | "bearish" | "mixed";
    rsiZone: "overbought" | "oversold" | "neutral";
  };
  multiTimeframe: Record<string, TimeframeSignal>;
  supportResistance: {
    support: number[];
    resistance: number[];
    nearestSupport: number;
    nearestResistance: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
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
  if (isNaN(n)) return "text-muted-foreground";
  return n >= 0 ? "text-green-400" : "text-red-400";
}

function smartQty(price: number, usdtAmount: number): string {
  if (!price || price === 0) return "—";
  const raw = usdtAmount / price;
  if (price >= 10000) return Math.max(0.001, Math.floor(raw * 1000) / 1000).toFixed(3);
  if (price >= 100) return Math.max(0.01, Math.floor(raw * 100) / 100).toFixed(2);
  if (price >= 1) return Math.max(1, Math.floor(raw * 10) / 10).toFixed(1);
  return Math.max(10, Math.floor(raw)).toFixed(0);
}

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "baru saja";
  if (diff < 60) return `${diff}s lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
  return `${Math.floor(diff / 3600)}j lalu`;
}

function timeUntil(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.ceil((ts - Date.now()) / 1000);
  if (diff <= 0) return "segera…";
  return `${diff}s`;
}

// ─── Signal Badge ─────────────────────────────────────────────────────────────

function SignalBadge({ signal }: { signal: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    strong_buy: { label: "⚡ STRONG BUY", cls: "bg-green-500/20 text-green-400 border-green-500/40" },
    buy: { label: "↑ BUY", cls: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  };
  const m = map[signal] ?? { label: signal.toUpperCase(), cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.cls}`}>
      {m.label}
    </span>
  );
}

// ─── Analysis Modal ───────────────────────────────────────────────────────────

function AnalysisModal({
  analysis,
  config,
  onClose,
  onExecute,
  executing,
}: {
  analysis: FullAnalysis;
  config: AutoConfig;
  onClose: () => void;
  onExecute: () => void;
  executing: boolean;
}) {
  const dirColor =
    analysis.marketDirection === "BULLISH"
      ? "text-green-400"
      : analysis.marketDirection === "BEARISH"
      ? "text-red-400"
      : "text-yellow-400";

  const dirBg =
    analysis.marketDirection === "BULLISH"
      ? "bg-green-950/30 border-green-500/30"
      : analysis.marketDirection === "BEARISH"
      ? "bg-red-950/30 border-red-500/30"
      : "bg-yellow-950/30 border-yellow-500/30";

  const confColor =
    analysis.overallConfidence >= 75
      ? "text-green-400"
      : analysis.overallConfidence >= 55
      ? "text-yellow-400"
      : "text-red-400";

  const confBar =
    analysis.overallConfidence >= 75
      ? "bg-green-500"
      : analysis.overallConfidence >= 55
      ? "bg-yellow-500"
      : "bg-red-500";

  const TF_ORDER = ["1m", "5m", "15m", "1h"];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-3 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-bold text-lg">{analysis.symbol}</div>
              <div className="text-xs text-muted-foreground">
                Analisis lengkap · {new Date(analysis.analyzedAt).toLocaleTimeString()}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/50">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Market Direction + Confidence */}
          <div className={`rounded-xl border p-4 ${dirBg}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Arah Market</div>
                <div className={`font-bold text-xl flex items-center gap-2 ${dirColor}`}>
                  {analysis.marketDirection === "BULLISH" ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : analysis.marketDirection === "BEARISH" ? (
                    <TrendingDown className="h-5 w-5" />
                  ) : (
                    <Minus className="h-5 w-5" />
                  )}
                  {analysis.marketDirection}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Confidence Score</div>
                <div className={`font-bold text-3xl ${confColor}`}>{analysis.overallConfidence}%</div>
                <div className="text-xs text-muted-foreground">{analysis.confirmations} konfirmasi</div>
              </div>
            </div>
            <div className="h-2 w-full bg-black/20 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${confBar}`} style={{ width: `${analysis.overallConfidence}%` }} />
            </div>
          </div>

          {/* Entry Details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-muted/30 rounded-xl p-3 border border-border">
              <div className="text-xs text-muted-foreground mb-1">Entry Price</div>
              <div className="font-bold text-sm">${fmt(analysis.entryPrice, 4)}</div>
            </div>
            <div className="bg-red-950/20 rounded-xl p-3 border border-red-500/20">
              <div className="text-xs text-muted-foreground mb-1">Stop Loss</div>
              <div className="font-bold text-sm text-red-400">${fmt(analysis.stopLoss, 4)}</div>
            </div>
            <div className="bg-green-950/20 rounded-xl p-3 border border-green-500/20">
              <div className="text-xs text-muted-foreground mb-1">Take Profit</div>
              <div className="font-bold text-sm text-green-400">${fmt(analysis.takeProfit, 4)}</div>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border border-border">
              <div className="text-xs text-muted-foreground mb-1">Risk/Reward</div>
              <div className={`font-bold text-sm ${analysis.riskRewardRatio >= 2 ? "text-green-400" : "text-yellow-400"}`}>
                1 : {analysis.riskRewardRatio.toFixed(1)}
              </div>
            </div>
          </div>

          {/* Reasons & Warnings */}
          <div className="grid sm:grid-cols-2 gap-3">
            {analysis.reasons.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-green-400 uppercase tracking-wide">Alasan Entry</div>
                {analysis.reasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-green-950/20 border border-green-500/15 rounded-lg px-3 py-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            )}
            {analysis.warnings.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">Peringatan</div>
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
                { label: "EMA 20", val: `$${fmt(analysis.indicators.ema20, 4)}`, sub: analysis.indicators.ema20 < analysis.entryPrice ? "↑ Price above" : "↓ Price below", good: analysis.indicators.ema20 < analysis.entryPrice },
                { label: "EMA 50", val: `$${fmt(analysis.indicators.ema50, 4)}`, sub: analysis.indicators.ema50 < analysis.entryPrice ? "↑ Price above" : "↓ Price below", good: analysis.indicators.ema50 < analysis.entryPrice },
                { label: "EMA 200", val: `$${fmt(analysis.indicators.ema200, 4)}`, sub: analysis.indicators.emaAlignment, good: analysis.indicators.emaAlignment === "bullish" },
                { label: "VWAP", val: `$${fmt(analysis.indicators.vwap, 4)}`, sub: `Price ${analysis.indicators.priceVsVwap} VWAP`, good: analysis.indicators.priceVsVwap === "above" },
                { label: "RSI 14", val: analysis.indicators.rsi14.toFixed(1), sub: analysis.indicators.rsiZone, good: analysis.indicators.rsiZone === "neutral" },
                { label: "Volume", val: `${(analysis.indicators.volumeRatio * 100).toFixed(0)}%`, sub: "vs avg volume", good: analysis.indicators.volumeRatio >= 1 },
              ].map((ind) => (
                <div key={ind.label} className={`rounded-lg p-2.5 border text-xs ${ind.good ? "bg-green-950/15 border-green-500/20" : "bg-red-950/15 border-red-500/20"}`}>
                  <div className="text-muted-foreground mb-0.5">{ind.label}</div>
                  <div className="font-bold">{ind.val}</div>
                  <div className={`text-[10px] ${ind.good ? "text-green-400" : "text-red-400"}`}>{ind.sub}</div>
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
                    {["TF", "Tren", "Momentum", "RSI", "Volume", "Konfirmasi"].map((h) => (
                      <th key={h} className="text-left text-muted-foreground font-medium pb-2 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TF_ORDER.filter((tf) => analysis.multiTimeframe[tf]).map((tf) => {
                    const t = analysis.multiTimeframe[tf];
                    return (
                      <tr key={tf} className="border-b border-border/40 last:border-0">
                        <td className="py-2 pr-3 font-bold">{tf}</td>
                        <td className="py-2 pr-3">
                          <span className={`inline-flex items-center gap-1 font-medium ${t.trend === "up" ? "text-green-400" : t.trend === "down" ? "text-red-400" : "text-yellow-400"}`}>
                            {t.trend === "up" ? <TrendingUp className="h-3 w-3" /> : t.trend === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {t.trend}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`${t.momentum === "strong" ? "text-green-400" : t.momentum === "normal" ? "text-foreground" : "text-muted-foreground"}`}>
                            {t.momentum}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{t.rsi.toFixed(0)}</td>
                        <td className="py-2 pr-3">{(t.volumeRatio * 100).toFixed(0)}%</td>
                        <td className="py-2">
                          {t.confirmation ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Wait reason or Execute */}
          {!analysis.shouldEnter ? (
            <div className="rounded-xl bg-yellow-950/30 border border-yellow-500/30 p-4 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-yellow-400 mb-1">Jangan Entry Sekarang</div>
                <div className="text-sm text-muted-foreground">{analysis.waitReason}</div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-green-950/20 border border-green-500/30 p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-green-400 mb-1">Setup Valid — Siap Entry</div>
                <div className="text-sm text-muted-foreground">
                  {analysis.confirmations} konfirmasi · RR {analysis.riskRewardRatio.toFixed(1)}x · Confidence {analysis.overallConfidence}%
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>Tutup</Button>
            {config.mode === "semi" && (
              <Button
                className={`flex-1 ${analysis.shouldEnter ? "bg-green-600 hover:bg-green-700 text-white" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
                disabled={!analysis.shouldEnter || executing}
                onClick={onExecute}
              >
                {executing ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Executing…</>
                ) : (
                  <><Zap className="h-4 w-4 mr-2" />Execute Order</>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

function SignalCard({
  sig, config, onAnalyze, onExecute, analyzing, executing,
}: {
  sig: Signal;
  config: AutoConfig;
  onAnalyze: (sig: Signal) => void;
  onExecute: (sig: Signal) => void;
  analyzing: string | null;
  executing: string | null;
}) {
  const qty = smartQty(sig.price, config.maxPositionUSDT);
  const sl = sig.stopLoss ?? sig.price * (1 - config.stopLossPct / 100);
  const tp = sig.takeProfit ?? sig.price * (1 + config.takeProfitPct / 100);
  const isAnalyzing = analyzing === sig.bybitSymbol;
  const isExec = executing === sig.bybitSymbol;

  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-bold text-base">{sig.symbol}</div>
            <div className="text-xs text-muted-foreground">{sig.bybitSymbol}</div>
          </div>
          <div className="text-right">
            <SignalBadge signal={sig.signal} />
            <div className="text-sm font-semibold mt-1">${fmt(sig.price, 4)}</div>
            <div className="text-xs text-muted-foreground">Current Price</div>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Confidence</span>
            <span className="font-semibold text-foreground">{sig.confidence}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${sig.confidence >= 85 ? "bg-green-500" : "bg-blue-500"}`}
              style={{ width: `${sig.confidence}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
          <div className="bg-muted/40 rounded p-2">
            <div className="text-muted-foreground">Qty</div>
            <div className="font-medium">{qty}</div>
          </div>
          <div className="bg-red-950/20 rounded p-2 border border-red-500/20">
            <div className="text-muted-foreground">Stop Loss</div>
            <div className="font-medium text-red-400">{sl != null ? `$${fmt(sl, 4)}` : "—"}</div>
          </div>
          <div className="bg-green-950/20 rounded p-2 border border-green-500/20">
            <div className="text-muted-foreground">Take Profit</div>
            <div className="font-medium text-green-400">{tp != null ? `$${fmt(tp, 4)}` : "—"}</div>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Analyze button — always visible */}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs border-primary/40 text-primary hover:bg-primary/10"
            disabled={isAnalyzing}
            onClick={() => onAnalyze(sig)}
          >
            {isAnalyzing ? (
              <><Loader2 className="h-3 w-3 animate-spin mr-1" />Analyzing…</>
            ) : (
              <><BarChart2 className="h-3 w-3 mr-1" />Analisa AI</>
            )}
          </Button>

          {/* Quick execute in semi mode */}
          {config.mode === "semi" && (
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs"
              size="sm"
              disabled={isExec}
              onClick={() => onExecute(sig)}
            >
              {isExec ? (
                <><Loader2 className="h-3 w-3 animate-spin mr-1" />Exec…</>
              ) : (
                <><Zap className="h-3 w-3 mr-1" />Execute</>
              )}
            </Button>
          )}
        </div>

        {config.mode === "auto" && config.enabled && (
          <div className="flex items-center gap-1.5 text-xs text-green-400 mt-2">
            <Bot className="h-3.5 w-3.5" />
            <span>Auto-engine akan eksekusi jika analisis valid</span>
          </div>
        )}
        {config.mode === "auto" && !config.enabled && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
            <Power className="h-3.5 w-3.5" />
            <span>Aktifkan engine untuk auto-eksekusi</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Position Row ─────────────────────────────────────────────────────────────

function PositionRow({ pos, onSetTPSL }: { pos: Position; onSetTPSL: (p: Position) => void }) {
  const pnl = parseFloat(pos.unrealisedPnl ?? "0");
  const pct = parseFloat(pos.percentage ?? "0");

  return (
    <div className="flex items-start justify-between py-3 border-b border-border last:border-0 gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm">{pos.symbol}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-400 border-blue-500/40">
            {pos.side}
          </Badge>
          <span className="text-xs text-muted-foreground">{pos.leverage}x</span>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>Ukuran: <span className="text-foreground">{pos.size}</span></div>
          <div>Avg Price: <span className="text-foreground">${fmt(pos.avgPrice)}</span></div>
          <div>Mark Price: <span className="text-foreground">${fmt(pos.markPrice)}</span></div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-bold text-base ${pnlColor(pos.unrealisedPnl)}`}>
          {pnl >= 0 ? "+" : ""}{fmt(pnl)} USDT
        </div>
        <div className={`text-xs ${pnlColor(pos.unrealisedPnl)}`}>
          ({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)
        </div>
        <Button size="sm" variant="outline" className="mt-2 text-xs h-7 px-2" onClick={() => onSetTPSL(pos)}>
          <Target className="h-3 w-3 mr-1" /> TP/SL
        </Button>
      </div>
    </div>
  );
}

// ─── TPSL Dialog ──────────────────────────────────────────────────────────────

function TPSLDialog({
  pos, config, onClose, onSave,
}: {
  pos: Position;
  config: AutoConfig;
  onClose: () => void;
  onSave: (symbol: string, tp: number, sl: number) => Promise<void>;
}) {
  const markPrice = parseFloat(pos.markPrice);
  const [tp, setTp] = useState(markPrice * (1 + config.takeProfitPct / 100));
  const [sl, setSl] = useState(markPrice * (1 - config.stopLossPct / 100));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(pos.symbol, tp, sl);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl p-5 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Set TP/SL — {pos.symbol}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Take Profit (USDT)</label>
            <input
              type="number"
              value={tp}
              onChange={(e) => setTp(parseFloat(e.target.value))}
              className="w-full bg-background border border-green-500/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 text-green-400"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Stop Loss (USDT)</label>
            <input
              type="number"
              value={sl}
              onChange={(e) => setSl(parseFloat(e.target.value))}
              className="w-full bg-background border border-red-500/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 text-red-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-center">
          <div className="bg-green-950/20 border border-green-500/20 rounded p-2">
            <div>Profit target</div>
            <div className="text-green-400 font-semibold">{(((tp - markPrice) / markPrice) * 100).toFixed(2)}%</div>
          </div>
          <div className="bg-red-950/20 border border-red-500/20 rounded p-2">
            <div>Max loss</div>
            <div className="text-red-400 font-semibold">{(((sl - markPrice) / markPrice) * 100).toFixed(2)}%</div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Set TP/SL
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Engine Status Panel ──────────────────────────────────────────────────────

function EngineStatusPanel({ stat, config }: { stat: EngineStatusData | null; config: AutoConfig }) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!config.enabled || config.mode !== "auto") return null;

  const isAnalyzing = stat?.analyzing ?? false;
  const lastCycle = stat?.lastCycleAt ?? null;
  const nextCycle = stat?.nextCycleAt ?? null;
  const cycleCount = stat?.cycleCount ?? 0;
  const lastSignals = stat?.lastSignalsFound ?? 0;
  const lastOrders = stat?.lastOrdersPlaced ?? 0;
  const lastError = stat?.lastError ?? null;

  return (
    <div className="mt-3 rounded-lg bg-green-950/20 border border-green-500/20 p-3 space-y-2">
      {isAnalyzing ? (
        <div className="flex items-center gap-2 text-sm text-green-300 font-medium">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Sedang menganalisis sinyal multi-timeframe…</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-green-400 font-medium">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          Engine aktif — analisis teknikal otomatis berjalan
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Scan terakhir: <span className="text-foreground">{timeAgo(lastCycle)}</span></span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span>Berikutnya: <span className="text-foreground">{timeUntil(nextCycle)}</span></span>
        </div>
      </div>

      {cycleCount > 0 && (
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>Scan ke-<span className="text-foreground font-medium">{cycleCount}</span></span>
          <span>Sinyal: <span className="text-foreground font-medium">{lastSignals}</span></span>
          <span>Order: <span className={lastOrders > 0 ? "text-green-400 font-medium" : "text-foreground font-medium"}>{lastOrders}</span></span>
        </div>
      )}

      {lastError && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-950/30 rounded p-2 border border-red-500/20">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{lastError}</span>
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({
  config, onChange, onClose,
}: {
  config: AutoConfig;
  onChange: (patch: Partial<AutoConfig>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="font-bold flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Pengaturan Bot
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Mode */}
          <div>
            <label className="text-xs text-muted-foreground block mb-2">Mode Trading</label>
            <div className="grid grid-cols-2 gap-2">
              {(["semi", "auto"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => onChange({ mode: m })}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${config.mode === m ? "bg-primary/20 border-primary text-primary" : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {m === "semi" ? "Semi (Manual)" : "Auto (Full-Auto)"}
                </button>
              ))}
            </div>
          </div>

          {/* Scan Source */}
          <div>
            <label className="text-xs text-muted-foreground block mb-2">Sumber Sinyal</label>
            <div className="grid grid-cols-2 gap-2">
              {(["universe", "predictions"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onChange({ scanSource: s })}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${config.scanSource === s ? "bg-primary/20 border-primary text-primary" : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {s === "universe" ? "Bybit Universe" : "AI Predictions"}
                </button>
              ))}
            </div>
          </div>

          {/* Order Type */}
          <div>
            <label className="text-xs text-muted-foreground block mb-2">Tipe Order</label>
            <div className="grid grid-cols-2 gap-2">
              {(["Market", "Limit"] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => onChange({ orderType: o })}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${config.orderType === o ? "bg-primary/20 border-primary text-primary" : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* Sliders */}
          {([
            { key: "minConfidence" as const, label: "Min Confidence (%)", min: 50, max: 99, step: 1, display: `${config.minConfidence}%` },
            { key: "maxPositionUSDT" as const, label: "Max Posisi (USDT)", min: 5, max: 500, step: 5, display: `$${config.maxPositionUSDT}` },
            { key: "stopLossPct" as const, label: "Stop Loss (%)", min: 0.5, max: 10, step: 0.5, display: `${config.stopLossPct}%` },
            { key: "takeProfitPct" as const, label: "Take Profit (%)", min: 0.5, max: 20, step: 0.5, display: `${config.takeProfitPct}%` },
            { key: "maxPositions" as const, label: "Max Posisi Serentak", min: 1, max: 20, step: 1, display: `${config.maxPositions}` },
            { key: "leverage" as const, label: "Leverage", min: 1, max: 20, step: 1, display: `${config.leverage}x` },
          ]).map(({ key, label, min, max, step, display }) => (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold">{display}</span>
              </div>
              <Slider
                min={min} max={max} step={step}
                value={[config[key] as number]}
                onValueChange={([v]) => onChange({ [key]: v })}
                className="w-full"
              />
            </div>
          ))}

          {/* Scan interval */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Interval Scan</span>
              <span className="font-semibold">{config.intervalMs / 1000}s</span>
            </div>
            <Slider
              min={15000} max={300000} step={15000}
              value={[config.intervalMs]}
              onValueChange={([v]) => onChange({ intervalMs: v })}
              className="w-full"
            />
          </div>
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
  });
  const [engineStat, setEngineStat] = useState<EngineStatusData | null>(null);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<FullAnalysis | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"signals" | "positions" | "log">("signals");
  const [tpslPos, setTpslPos] = useState<Position | null>(null);
  const [pendingExecuteSig, setPendingExecuteSig] = useState<Signal | null>(null);

  const prevPosCount = useRef<number>(-1);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

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
        const newPositions = posRes.value.list ?? [];
        const newCount = newPositions.length;
        if (prevPosCount.current >= 0 && newCount > prevPosCount.current) {
          const diff = newCount - prevPosCount.current;
          toast({
            title: `🔔 ${diff} Posisi Baru Dibuka!`,
            description: `Kamu sekarang punya ${newCount} posisi aktif di Bybit.`,
          });
          setActiveTab("positions");
        }
        prevPosCount.current = newCount;
        setPositions(newPositions);
      }

      if (balRes.status === "fulfilled") {
        const coins = balRes.value.list?.[0]?.coin ?? [];
        const usdt = coins.find((c) => c.coin === "USDT");
        setBalance(usdt ? parseFloat(usdt.walletBalance) : null);
      }
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  const loadEngineStat = useCallback(async () => {
    try {
      const stat = await apiFetch<EngineStatusData>("/api/trading/engine-status");
      setEngineStat(stat);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => {
    void loadEngineStat();
    const id = setInterval(() => { void loadEngineStat(); }, 5000);
    return () => clearInterval(id);
  }, [loadEngineStat]);
  useEffect(() => {
    if (!config.enabled || config.mode !== "auto") return;
    const id = setInterval(() => { void loadAll(true); }, 30_000);
    return () => clearInterval(id);
  }, [config.enabled, config.mode, loadAll]);

  async function updateConfig(patch: Partial<AutoConfig>) {
    const isToggle = "enabled" in patch;
    if (isToggle) setToggling(true);
    const next = { ...config, ...patch };
    setConfig(next);
    try {
      const updated = await apiFetch<AutoConfig>("/api/trading/config", {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      setConfig(updated);
      if (isToggle) {
        if (patch.enabled) {
          toast({ title: "Engine Aktif", description: "Bot dimulai dengan analisis teknikal penuh. Scan tiap " + Math.round(updated.intervalMs / 1000) + "s." });
          setTimeout(() => { void loadEngineStat(); }, 500);
        } else {
          toast({ title: "Engine Dimatikan", description: "Auto-trading dihentikan." });
        }
      }
    } catch (err) {
      setConfig(config);
      toast({ title: "Config error", description: String(err), variant: "destructive" });
    } finally {
      if (isToggle) setToggling(false);
    }
  }

  async function handleAnalyze(sig: Signal) {
    setAnalyzing(sig.bybitSymbol);
    try {
      const analysis = await apiFetch<FullAnalysis>(`/api/trading/analyze/${sig.bybitSymbol}`);
      setActiveAnalysis(analysis);
      setPendingExecuteSig(sig);
    } catch (err) {
      toast({ title: "Analisis gagal", description: String(err), variant: "destructive" });
    } finally {
      setAnalyzing(null);
    }
  }

  function calcQty(price: number, usdtAmount: number): string {
    const raw = usdtAmount / price;
    if (price >= 10000) return Math.max(0.001, Math.floor(raw * 1000) / 1000).toFixed(3);
    if (price >= 100) return Math.max(0.01, Math.floor(raw * 100) / 100).toFixed(2);
    if (price >= 1) return Math.max(1, Math.floor(raw * 10) / 10).toFixed(1);
    return Math.max(10, Math.floor(raw)).toFixed(0);
  }

  async function executeOrder(sig: Signal) {
    setExecuting(sig.bybitSymbol);
    try {
      const qty = calcQty(sig.price, config.maxPositionUSDT);
      const slPrice = sig.stopLoss ?? sig.price * (1 - config.stopLossPct / 100);
      const tpPrice = sig.takeProfit ?? sig.price * (1 + config.takeProfitPct / 100);

      await apiFetch("/api/trading/order", {
        method: "POST",
        body: JSON.stringify({ symbol: sig.bybitSymbol, side: "Buy", qty, takeProfit: tpPrice, stopLoss: slPrice }),
      });

      toast({
        title: `Order ${sig.bybitSymbol} tereksekusi!`,
        description: `Buy ${qty} @ $${fmt(sig.price, 4)} · TP: $${fmt(tpPrice, 4)} · SL: $${fmt(slPrice, 4)}`,
      });
      void loadAll(true);
      setActiveAnalysis(null);
      setPendingExecuteSig(null);
    } catch (err) {
      toast({ title: "Order gagal", description: String(err), variant: "destructive" });
    } finally {
      setExecuting(null);
    }
  }

  async function handleSetTPSL(symbol: string, tp: number, sl: number) {
    await apiFetch("/api/trading/position/tpsl", {
      method: "POST",
      body: JSON.stringify({ symbol, takeProfit: tp, stopLoss: sl }),
    });
    toast({ title: "TP/SL diperbarui", description: `${symbol}: TP $${fmt(tp, 4)} · SL $${fmt(sl, 4)}` });
    void loadAll(true);
  }

  // Settings panel applies config without toggling engine
  async function applySettings(patch: Partial<AutoConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    try {
      const updated = await apiFetch<AutoConfig>("/api/trading/config", {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      setConfig(updated);
    } catch (err) {
      setConfig(config);
      toast({ title: "Config error", description: String(err), variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalPnl = positions.reduce((sum, p) => sum + parseFloat(p.unrealisedPnl ?? "0"), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            AI Futures Bot
          </h1>
          <p className="text-sm text-muted-foreground">Bybit USDT Perpetual · Analisis teknikal multi-timeframe otomatis</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadAll(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Balance</span>
            </div>
            <div className="font-bold text-lg">
              {balance != null ? `$${fmt(balance)}` : <span className="text-muted-foreground text-sm">No API key</span>}
            </div>
            <div className="text-xs text-muted-foreground">USDT</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Open PnL</span>
            </div>
            <div className={`font-bold text-lg ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)} USDT
            </div>
            <div className="text-xs text-muted-foreground">{positions.length} posisi aktif</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Sumber Scan</span>
            </div>
            <div className="font-bold capitalize">{config.scanSource}</div>
            <div className="text-xs text-muted-foreground">{config.orderType} orders</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Engine</span>
              </div>
              {toggling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(v) => void updateConfig({ enabled: v })}
                />
              )}
            </div>
            <div className={`font-bold text-sm ${config.enabled ? "text-green-400" : "text-muted-foreground"}`}>
              {config.enabled ? "AKTIF" : "NONAKTIF"}
            </div>
            <div className="text-xs text-muted-foreground capitalize">{config.mode} mode</div>
          </CardContent>
        </Card>
      </div>

      {/* Engine Status */}
      <EngineStatusPanel stat={engineStat} config={config} />

      {/* AI analysis info banner */}
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-start gap-3 text-sm">
        <BarChart2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-primary">Analisis AI Aktif</span>
          <span className="text-muted-foreground"> · Klik <strong>Analisa AI</strong> pada signal untuk melihat full analisis: EMA 20/50/200, VWAP, RSI, Volume, Support/Resistance, dan konfirmasi multi-timeframe (1m 5m 15m 1h) sebelum entry.</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-1">
        {(["signals", "positions", "log"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "signals"
              ? `Signals (${signals.length})`
              : tab === "positions"
              ? (
                <span className={positions.length > 0 ? "text-orange-400" : ""}>
                  Positions ({positions.length})
                  {positions.length > 0 && <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />}
                </span>
              )
              : `Trade Log (${tradeLogs.length})`}
          </button>
        ))}
      </div>

      {/* Signals Tab */}
      {activeTab === "signals" && (
        <>
          {signals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Tidak ada sinyal dengan confidence ≥ {config.minConfidence}% saat ini
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {signals.map((sig) => (
                <SignalCard
                  key={sig.bybitSymbol}
                  sig={sig}
                  config={config}
                  onAnalyze={handleAnalyze}
                  onExecute={executeOrder}
                  analyzing={analyzing}
                  executing={executing}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Positions Tab */}
      {activeTab === "positions" && (
        <Card>
          <CardContent className="p-4">
            {positions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <CircleDollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Tidak ada posisi terbuka
              </div>
            ) : (
              positions.map((pos) => (
                <PositionRow key={pos.symbol + pos.side} pos={pos} onSetTPSL={setTpslPos} />
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Trade Log Tab */}
      {activeTab === "log" && (
        <Card>
          <CardContent className="p-4 space-y-0">
            {tradeLogs.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Belum ada riwayat trading
              </div>
            ) : (
              tradeLogs.map((log) => (
                <div key={log.id} className="flex items-start justify-between py-2.5 border-b border-border last:border-0 gap-2 text-sm">
                  <div className="flex items-start gap-2 min-w-0">
                    {log.status === "executed" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                    ) : log.status === "rejected" ? (
                      <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium">{log.symbol}</div>
                      <div className="text-xs text-muted-foreground">
                        {log.side} {log.qty} @ ${fmt(log.price, 4)} · {log.confidence}% conf
                      </div>
                      {log.reason && (
                        <div className={`text-xs truncate mt-0.5 ${log.status === "rejected" ? "text-yellow-500" : "text-muted-foreground"}`}>
                          {log.reason}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge
                      variant="outline"
                      className={
                        log.status === "executed"
                          ? "border-green-500/40 text-green-400"
                          : log.status === "rejected"
                          ? "border-red-500/40 text-red-400"
                          : "border-yellow-500/40 text-yellow-400"
                      }
                    >
                      {log.status}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                    {log.orderId && (
                      <div className="text-[10px] text-muted-foreground/60 truncate max-w-[80px]">{log.orderId.slice(0, 8)}…</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Analysis Modal */}
      {activeAnalysis && pendingExecuteSig && (
        <AnalysisModal
          analysis={activeAnalysis}
          config={config}
          onClose={() => { setActiveAnalysis(null); setPendingExecuteSig(null); }}
          onExecute={() => { void executeOrder(pendingExecuteSig); }}
          executing={executing === pendingExecuteSig.bybitSymbol}
        />
      )}

      {/* TPSL Dialog */}
      {tpslPos && (
        <TPSLDialog
          pos={tpslPos}
          config={config}
          onClose={() => setTpslPos(null)}
          onSave={handleSetTPSL}
        />
      )}

      {/* Settings Panel */}
      {settingsOpen && (
        <SettingsPanel
          config={config}
          onChange={applySettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
