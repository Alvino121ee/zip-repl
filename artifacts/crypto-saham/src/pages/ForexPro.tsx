import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Minus, Brain, Shield, Target,
  Activity, Globe, Zap, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, BarChart2, Clock, BookOpen, ChevronUp, ChevronDown,
  Layers, Eye, Cpu, Crosshair, Flame, Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell,
} from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Tipe Data ─────────────────────────────────────────────────────────────────

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; isComplete: boolean }
interface Session { name: string; active: boolean; start: number; end: number; color: string; description: string }
interface Position {
  id: string; symbol: string; pairName: string; emoji: string;
  side: "Buy" | "Sell"; lotSize: number; entryPrice: number; currentPrice: number;
  stopLoss: number; takeProfit: number; leverage: number; margin: number;
  unrealisedPnl: number; unrealisedPips: number;
  openedAt: number; strategy: string; confidence: number; reasoning: string[];
  trailActivated: boolean; breakeven: boolean; riskReward: number; timeframe: string; aiNote: string;
}
interface Analysis {
  symbol: string; timeframe: string; currentPrice: number; bid: number; ask: number; spread: number;
  sessions: Session[]; activeSession: string;
  technical: {
    ema9: number; ema21: number; ema50: number; trendBias: string; trendStrength: number;
    rsi: number; rsiZone: string; macd: number; macdHistogram: number; macdBias: string;
    atr: number; atrPct: number; bbUpper: number; bbLower: number;
    volumeRatio: number; volumeBias: string; candlePattern: string | null; candleSignal: string;
  };
  smc: {
    marketStructure: string; orderBlock: { type: string; high: number; low: number } | null;
    fairValueGap: { type: string; high: number; low: number } | null;
    liquiditySweep: { direction: string; price: number } | null;
    supplyZone: { high: number; low: number } | null;
    demandZone: { high: number; low: number } | null;
    inducement: boolean; inducementNote: string | null;
    premiumZone: number; discountZone: number; equilibrium: number;
  };
  fundamental: { dxyBias: string; riskSentiment: string; newsImpact: string; upcomingEvent: string | null; interestRateBias: string };
  aiDecision: {
    shouldTrade: boolean; direction: "Buy" | "Sell" | null; confidence: number;
    strategy: string; entryPrice: number; stopLoss: number; takeProfit: number; tp2: number;
    riskReward: number; lotSize: number; reasoning: string[]; waitReason: string | null;
    marketCondition: string; qualityScore: number;
    fibonacci: { level: number; price: number; label: string }[];
    supportLevels: number[]; resistanceLevels: number[];
  };
  multiTimeframe: Record<string, { trend: string; bias: string; note: string }>;
}
interface Balance { balance: number; equity: number; unrealisedPnl: number; usedMargin: number }
interface PairInfo { symbol: string; name: string; category: string; emoji: string; basePrice: number; volatility: number; pipSize: number }

const TIMEFRAMES = ["M1","M5","M15","M30","H1","H4","D1"];
const PAIRS = ["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","XAUUSD","EURJPY","GBPJPY","XAGUSD"];

// ─── Mapping TradingView ───────────────────────────────────────────────────────

const TV_SYMBOL: Record<string, string> = {
  EURUSD: "FX:EURUSD", GBPUSD: "FX:GBPUSD", USDJPY: "FX:USDJPY",
  USDCHF: "FX:USDCHF", AUDUSD: "FX:AUDUSD", USDCAD: "FX:USDCAD",
  NZDUSD: "FX:NZDUSD", EURJPY: "FX:EURJPY", GBPJPY: "FX:GBPJPY",
  XAUUSD: "TVC:GOLD",  XAGUSD: "TVC:SILVER", USOIL: "TVC:USOIL",
};

const TV_INTERVAL: Record<string, string> = {
  M1: "1", M5: "5", M15: "15", M30: "30", H1: "60", H4: "240", D1: "D",
};

// ─── TradingView Advanced Chart Widget ────────────────────────────────────────

const TradingViewWidget: React.FC<{ symbol: string; timeframe: string }> = ({ symbol, timeframe }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`tv_${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.innerHTML = "";
    const inner = document.createElement("div");
    inner.id = idRef.current;
    inner.style.width = "100%";
    inner.style.height = "100%";
    el.appendChild(inner);

    const tvSymbol = TV_SYMBOL[symbol] ?? `FX:${symbol}`;
    const tvInterval = TV_INTERVAL[timeframe] ?? "60";

    const createWidget = () => {
      if (!(window as any).TradingView) return;
      new (window as any).TradingView.widget({
        autosize: true,
        symbol: tvSymbol,
        interval: tvInterval,
        timezone: "Asia/Jakarta",
        theme: "dark",
        style: "1",
        locale: "id",
        toolbar_bg: "#0d1117",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        allow_symbol_change: false,
        save_image: false,
        container_id: idRef.current,
        studies: [
          "RSI@tv-basicstudies",
          "MACD@tv-basicstudies",
          "MAExp@tv-basicstudies",
        ],
        overrides: {
          "paneProperties.background": "#0d1117",
          "paneProperties.backgroundType": "solid",
          "scalesProperties.textColor": "#94a3b8",
        },
        loading_screen: { backgroundColor: "#0d1117", foregroundColor: "#3b82f6" },
      });
    };

    if ((window as any).TradingView) {
      createWidget();
    } else {
      const existing = document.getElementById("tv-script");
      if (existing) {
        existing.addEventListener("load", createWidget);
      } else {
        const script = document.createElement("script");
        script.id = "tv-script";
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        script.onload = createWidget;
        document.head.appendChild(script);
      }
    }

    return () => { if (el) el.innerHTML = ""; };
  }, [symbol, timeframe]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};

// ─── Order Book Simulasi ───────────────────────────────────────────────────────

const OrderBookPanel: React.FC<{ currentPrice: number; spread: number }> = ({ currentPrice, spread }) => {
  const asks = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    price: currentPrice + spread / 2 + (i + 1) * spread * 0.8,
    size: parseFloat((0.1 + Math.random() * 3).toFixed(2)),
    total: 0,
  })).reverse(), [currentPrice]);

  const bids = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    price: currentPrice - spread / 2 - (i + 1) * spread * 0.8,
    size: parseFloat((0.1 + Math.random() * 3).toFixed(2)),
    total: 0,
  })), [currentPrice]);

  const maxSize = Math.max(...asks.map(a => a.size), ...bids.map(b => b.size));

  return (
    <div className="font-mono text-xs">
      <div className="grid grid-cols-3 text-muted-foreground mb-1 px-1">
        <span>Harga</span><span className="text-center">Lot</span><span className="text-right">Total</span>
      </div>
      {asks.map((a, i) => (
        <div key={i} className="grid grid-cols-3 relative px-1 py-0.5">
          <div className="absolute inset-0 right-0" style={{ background: `rgba(239,68,68,0.1)`, width: `${(a.size/maxSize)*100}%`, marginLeft: "auto" }} />
          <span className="text-red-400 z-10">{a.price.toFixed(a.price > 50 ? 2 : 4)}</span>
          <span className="text-center z-10">{a.size.toFixed(2)}</span>
          <span className="text-right text-muted-foreground z-10">{(a.size * a.price).toFixed(0)}</span>
        </div>
      ))}
      <div className="border-y border-yellow-500/30 py-1 px-1 grid grid-cols-3 my-0.5">
        <span className="text-yellow-400 font-bold">{currentPrice.toFixed(currentPrice > 50 ? 2 : 4)}</span>
        <span className="text-center text-muted-foreground text-[10px]">Spread: {spread.toFixed(1)} pips</span>
        <span className="text-right text-yellow-400">—</span>
      </div>
      {bids.map((b, i) => (
        <div key={i} className="grid grid-cols-3 relative px-1 py-0.5">
          <div className="absolute inset-0" style={{ background: `rgba(34,197,94,0.1)`, width: `${(b.size/maxSize)*100}%` }} />
          <span className="text-green-400 z-10">{b.price.toFixed(b.price > 50 ? 2 : 4)}</span>
          <span className="text-center z-10">{b.size.toFixed(2)}</span>
          <span className="text-right text-muted-foreground z-10">{(b.size * b.price).toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Komponen Utama ────────────────────────────────────────────────────────────

export default function ForexPro() {
  const { toast } = useToast();

  const [selectedPair, setSelectedPair] = useState("EURUSD");
  const [selectedTF, setSelectedTF] = useState("H1");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [balance, setBalance] = useState<Balance>({ balance: 1000, equity: 1000, unrealisedPnl: 0, usedMargin: 0 });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tradeLog, setTradeLog] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [scanData, setScanData] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"chart"|"orderbook"|"log">("chart");
  const [rightTab, setRightTab] = useState<"ai"|"order"|"positions">("ai");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [orderLot, setOrderLot] = useState(0.01);
  const [showMTF, setShowMTF] = useState(true);
  const [activityFeed, setActivityFeed] = useState<string[]>([]);

  const addActivity = useCallback((msg: string) => {
    setActivityFeed(prev => [`[${new Date().toLocaleTimeString("id-ID")}] ${msg}`, ...prev.slice(0, 29)]);
  }, []);

  const fetchCandles = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/forex-pro/candles/${selectedPair}/${selectedTF}?count=120`);
      if (r.ok) setCandles(await r.json());
    } catch { /* ignore */ }
  }, [selectedPair, selectedTF]);

  const fetchAnalysis = useCallback(async () => {
    try {
      setIsAnalyzing(true);
      const r = await fetch(`${API}/api/forex-pro/analyze/${selectedPair}?timeframe=${selectedTF}`);
      if (r.ok) {
        const data = await r.json();
        setAnalysis(data);
        if (data.aiDecision.shouldTrade) {
          addActivity(`🎯 AI: ${data.aiDecision.direction} ${selectedPair} — ${data.aiDecision.strategy} (${data.aiDecision.confidence}%)`);
        }
      }
    } finally { setIsAnalyzing(false); }
  }, [selectedPair, selectedTF, addActivity]);

  const fetchPositions = useCallback(async () => {
    try {
      const [posR, balR] = await Promise.all([
        fetch(`${API}/api/forex-pro/positions`),
        fetch(`${API}/api/forex-pro/balance`),
      ]);
      if (posR.ok) setPositions(await posR.json());
      if (balR.ok) setBalance(await balR.json());
    } catch { /* ignore */ }
  }, []);

  const fetchMisc = useCallback(async () => {
    try {
      const [sessR, logR, statsR, configR, scanR] = await Promise.all([
        fetch(`${API}/api/forex-pro/sessions`),
        fetch(`${API}/api/forex-pro/log?limit=30`),
        fetch(`${API}/api/forex-pro/stats`),
        fetch(`${API}/api/forex-pro/config`),
        fetch(`${API}/api/forex-pro/scan`),
      ]);
      if (sessR.ok) setSessions(await sessR.json());
      if (logR.ok) setTradeLog(await logR.json());
      if (statsR.ok) setStats(await statsR.json());
      if (configR.ok) { const c = await configR.json(); setConfig(c); setAutoEnabled(c.autoEnabled); }
      if (scanR.ok) setScanData(await scanR.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchCandles();
    fetchAnalysis();
    fetchPositions();
    fetchMisc();
  }, [selectedPair, selectedTF]);

  // Auto refresh
  useEffect(() => {
    const tfMs = { M1:2000, M5:3000, M15:5000, M30:8000, H1:10000, H4:20000, D1:30000 };
    const ms = tfMs[selectedTF as keyof typeof tfMs] ?? 8000;
    const t1 = setInterval(fetchCandles, ms);
    const t2 = setInterval(fetchAnalysis, ms * 2.5);
    const t3 = setInterval(fetchPositions, 4000);
    const t4 = setInterval(fetchMisc, 30000);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); clearInterval(t4); };
  }, [fetchCandles, fetchAnalysis, fetchPositions, fetchMisc]);

  const handleOrder = async (direction: "Buy" | "Sell") => {
    if (!analysis) return;
    try {
      const r = await fetch(`${API}/api/forex-pro/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: selectedPair, direction, timeframe: selectedTF, lot: orderLot }),
      });
      const data = await r.json();
      if (!r.ok) { toast({ title: "Gagal buka posisi", description: data.error, variant: "destructive" }); return; }
      toast({ title: `Posisi ${direction} dibuka`, description: `${selectedPair} @ ${analysis.currentPrice.toFixed(4)}` });
      addActivity(`📈 ${direction} ${selectedPair} dibuka @ ${analysis.currentPrice.toFixed(4)}`);
      fetchPositions();
    } catch { toast({ title: "Error", variant: "destructive" }); }
  };

  const handleClose = async (id: string, symbol: string) => {
    await fetch(`${API}/api/forex-pro/close/${id}`, { method: "POST" });
    addActivity(`🔴 Posisi ${symbol} ditutup manual`);
    fetchPositions();
    fetchMisc();
  };

  const toggleAuto = async () => {
    const endpoint = autoEnabled ? "stop" : "start";
    await fetch(`${API}/api/forex-pro/engine/${endpoint}`, { method: "POST" });
    setAutoEnabled(!autoEnabled);
    addActivity(autoEnabled ? "⏹ Auto engine dihentikan" : "▶ Auto engine dimulai");
    toast({ title: autoEnabled ? "Engine dihentikan" : "Engine dimulai" });
  };

  const dec = analysis?.aiDecision;
  const tech = analysis?.technical;
  const smc = analysis?.smc;
  const fund = analysis?.fundamental;

  const confidenceColor = !dec ? "#64748b" : dec.confidence >= 80 ? "#22c55e" : dec.confidence >= 65 ? "#fbbf24" : "#ef4444";
  const trendColor = tech?.trendBias === "Bullish" ? "text-green-400" : tech?.trendBias === "Bearish" ? "text-red-400" : "text-yellow-400";
  const pnlColor = balance.unrealisedPnl >= 0 ? "text-green-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-background text-foreground p-0">
      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0a0f1a] border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Title */}
          <div className="flex items-center gap-2 mr-3">
            <Globe className="h-5 w-5 text-blue-400" />
            <span className="font-bold text-white text-sm">FOREX PRO</span>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">AI ENGINE</Badge>
          </div>

          {/* Pair selector */}
          <div className="flex gap-1 flex-wrap">
            {PAIRS.map(p => (
              <button key={p} onClick={() => setSelectedPair(p)}
                className={`px-2 py-0.5 text-xs rounded border font-mono transition-all ${selectedPair === p ? "bg-blue-500/20 border-blue-500 text-blue-300" : "border-border text-muted-foreground hover:border-blue-500/50"}`}>
                {p}
              </button>
            ))}
          </div>

          {/* Timeframe */}
          <div className="flex gap-1 ml-2">
            {TIMEFRAMES.map(tf => (
              <button key={tf} onClick={() => setSelectedTF(tf)}
                className={`px-2 py-0.5 text-xs rounded font-mono transition-all ${selectedTF === tf ? "bg-violet-500/20 text-violet-300 border border-violet-500" : "text-muted-foreground hover:text-white border border-transparent"}`}>
                {tf}
              </button>
            ))}
          </div>

          {/* Live Price */}
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <div className="font-mono font-bold text-white text-lg leading-none">
                {analysis ? analysis.currentPrice.toFixed(analysis.currentPrice > 50 ? 2 : 4) : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Bid: {analysis?.bid.toFixed(analysis.bid > 50 ? 2 : 4)} | Ask: {analysis?.ask.toFixed(analysis.ask > 50 ? 2 : 4)} | Spread: {analysis?.spread}p
              </div>
            </div>

            {/* Sessions */}
            <div className="flex gap-1">
              {sessions.filter(s => s.active).map(s => (
                <Badge key={s.name} style={{ background: `${s.color}20`, borderColor: `${s.color}60`, color: s.color }}
                  className="text-[10px] border">
                  🌍 {s.name}
                </Badge>
              ))}
              {sessions.filter(s => s.active).length === 0 && (
                <Badge className="bg-zinc-500/20 text-zinc-400 text-[10px]">💤 Dead Zone</Badge>
              )}
            </div>

            {/* Auto Engine */}
            <Button size="sm" onClick={toggleAuto}
              className={autoEnabled ? "bg-green-600 hover:bg-green-700 text-xs" : "bg-zinc-700 hover:bg-zinc-600 text-xs"}>
              {autoEnabled ? <><Activity className="h-3 w-3 mr-1" />AUTO ON</> : <><Cpu className="h-3 w-3 mr-1" />AUTO OFF</>}
            </Button>

            {isAnalyzing && <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />}
          </div>
        </div>
      </div>

      {/* ─── Main Grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-0">

        {/* ─── Left: Chart Area ────────────────────────────────────────────── */}
        <div className="border-r border-border">
          {/* Chart Tabs */}
          <div className="flex border-b border-border px-2 pt-1 gap-1">
            {(["chart","orderbook","log"] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${activeTab === t ? "bg-[#0f172a] text-white border-t border-x border-border" : "text-muted-foreground hover:text-white"}`}>
                {t === "chart" ? "Grafik" : t === "orderbook" ? "Order Book" : "Riwayat"}
              </button>
            ))}

            {/* Pair scan quick view */}
            <div className="ml-auto flex items-center gap-2 pb-1">
              {scanData.slice(0,4).map(s => (
                <button key={s.symbol} onClick={() => setSelectedPair(s.symbol)}
                  className="text-[10px] font-mono px-2 py-0.5 rounded border border-border hover:border-blue-500/50 transition-all">
                  <span className={s.direction === "Buy" ? "text-green-400" : s.direction === "Sell" ? "text-red-400" : "text-zinc-500"}>
                    {s.symbol.replace("USDT","").replace("USD","")}
                  </span>
                  <span className="text-muted-foreground ml-1">{s.confidence}%</span>
                </button>
              ))}
            </div>
          </div>

          {activeTab === "chart" && (
            <div>
              {/* TradingView Professional Chart */}
              <div className="w-full bg-[#0d1117]" style={{ height: "520px" }}>
                <TradingViewWidget symbol={selectedPair} timeframe={selectedTF} />
              </div>

              {/* Indicator Row */}
              <div className="grid grid-cols-4 gap-0 border-t border-border divide-x divide-border">
                {[
                  { label: "RSI", value: tech?.rsi?.toFixed(1), sub: tech?.rsiZone, color: tech?.rsi !== undefined ? (tech.rsi > 70 ? "text-red-400" : tech.rsi < 30 ? "text-green-400" : "text-white") : "text-white" },
                  { label: "MACD", value: tech?.macdHistogram?.toFixed(4), sub: tech?.macdBias, color: tech?.macdHistogram !== undefined ? (tech.macdHistogram > 0 ? "text-green-400" : "text-red-400") : "text-white" },
                  { label: "ATR", value: tech?.atr?.toFixed(4), sub: `${tech?.atrPct?.toFixed(2)}%`, color: "text-yellow-400" },
                  { label: "Volume", value: tech?.volumeRatio?.toFixed(2)+"x", sub: tech?.volumeBias, color: tech?.volumeRatio !== undefined ? (tech.volumeRatio > 1.4 ? "text-green-400" : tech.volumeRatio < 0.7 ? "text-red-400" : "text-white") : "text-white" },
                ].map((ind, i) => (
                  <div key={i} className="px-3 py-2">
                    <div className="text-[10px] text-muted-foreground">{ind.label}</div>
                    <div className={`font-mono text-sm font-bold ${ind.color}`}>{ind.value ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{ind.sub ?? "—"}</div>
                  </div>
                ))}
              </div>

              {/* Candle Pattern */}
              {tech?.candlePattern && (
                <div className={`px-4 py-2 border-t border-border text-xs flex items-center gap-2 ${tech.candleSignal === "Bullish" ? "bg-green-500/5 text-green-400" : tech.candleSignal === "Bearish" ? "bg-red-500/5 text-red-400" : "bg-yellow-500/5 text-yellow-400"}`}>
                  <Eye className="h-3 w-3" />
                  <span className="font-semibold">Pola Candle:</span> {tech.candlePattern}
                </div>
              )}

              {/* Multi-Timeframe Analysis */}
              {showMTF && analysis?.multiTimeframe && (
                <div className="border-t border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Analisis Multi-Timeframe</span>
                    <button onClick={() => setShowMTF(false)} className="text-[10px] text-muted-foreground hover:text-white">Sembunyikan</button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(analysis.multiTimeframe).map(([tf, v]) => (
                      <div key={tf} className={`rounded p-2 border text-center text-xs ${v.trend === "Bullish" ? "bg-green-500/10 border-green-500/30" : v.trend === "Bearish" ? "bg-red-500/10 border-red-500/30" : "bg-yellow-500/10 border-yellow-500/30"}`}>
                        <div className="font-bold">{tf}</div>
                        <div className={v.trend === "Bullish" ? "text-green-400" : v.trend === "Bearish" ? "text-red-400" : "text-yellow-400"}>{v.trend}</div>
                        <div className="text-muted-foreground text-[10px]">{v.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SMC + Fundamental Row */}
              <div className="grid grid-cols-2 gap-0 border-t border-border divide-x divide-border">
                {/* SMC */}
                <div className="p-3">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Smart Money Concepts</div>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Struktur:</span>
                      <span className={smc?.marketStructure === "Bullish" ? "text-green-400" : smc?.marketStructure === "Bearish" ? "text-red-400" : "text-yellow-400"}>
                        {smc?.marketStructure ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">OB:</span>
                      <span className={smc?.orderBlock ? (smc.orderBlock.type === "Bullish" ? "text-blue-400" : "text-purple-400") : "text-zinc-500"}>
                        {smc?.orderBlock?.type ?? "Tidak ada"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">FVG:</span>
                      <span className={smc?.fairValueGap ? "text-yellow-400" : "text-zinc-500"}>
                        {smc?.fairValueGap?.type ?? "Tidak ada"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Sweep:</span>
                      <span className={smc?.liquiditySweep ? "text-orange-400" : "text-zinc-500"}>
                        {smc?.liquiditySweep ? `${smc.liquiditySweep.direction} swept` : "Tidak ada"}
                      </span>
                    </div>
                    {smc?.inducement && (
                      <div className="col-span-2 text-orange-400 text-[10px] border border-orange-500/30 rounded px-1.5 py-0.5 mt-1">
                        ⚠️ {smc.inducementNote}
                      </div>
                    )}
                  </div>
                </div>

                {/* Fundamental */}
                <div className="p-3">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Fundamental</div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">DXY:</span>
                      <span className={fund?.dxyBias === "Kuat" ? "text-red-400" : fund?.dxyBias === "Lemah" ? "text-green-400" : "text-yellow-400"}>{fund?.dxyBias ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Sentiment:</span>
                      <span className={fund?.riskSentiment === "Risk-On" ? "text-green-400" : fund?.riskSentiment === "Risk-Off" ? "text-red-400" : "text-yellow-400"}>{fund?.riskSentiment ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Suku Bunga:</span>
                      <span className={fund?.interestRateBias === "Hawkish" ? "text-red-400" : fund?.interestRateBias === "Dovish" ? "text-green-400" : "text-yellow-400"}>{fund?.interestRateBias ?? "—"}</span>
                    </div>
                    {fund?.upcomingEvent && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 text-orange-400 flex-shrink-0" />
                        <span className="text-orange-400 text-[10px]">{fund.upcomingEvent}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Activity Feed */}
              <div className="border-t border-border p-3">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                  <Activity className="h-3 w-3" /> Feed Aktivitas AI
                </div>
                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                  {activityFeed.slice(0, 8).map((msg, i) => (
                    <div key={i} className="text-[10px] text-muted-foreground font-mono">{msg}</div>
                  ))}
                  {activityFeed.length === 0 && (
                    <div className="text-[10px] text-zinc-600">Menunggu aktivitas AI...</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "orderbook" && (
            <div className="p-4">
              <div className="text-xs font-semibold mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-400" /> Order Book Simulasi — {selectedPair}
              </div>
              <OrderBookPanel currentPrice={analysis?.currentPrice ?? 0} spread={analysis?.spread ?? 0.1} />
            </div>
          )}

          {activeTab === "log" && (
            <div className="p-3">
              <div className="text-xs font-semibold mb-2 text-muted-foreground">Riwayat Trade ({tradeLog.length})</div>
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {tradeLog.map((t, i) => (
                  <div key={i} className={`flex items-center gap-2 p-2 rounded border text-xs ${t.pnl > 0 ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                    <span className={t.side === "Buy" ? "text-green-400" : "text-red-400"}>{t.side}</span>
                    <span className="font-mono font-bold">{t.symbol}</span>
                    <span className="text-muted-foreground">{t.strategy}</span>
                    <span className={`ml-auto font-mono font-bold ${t.pnl > 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.pnl > 0 ? "+" : ""}{t.pnl?.toFixed(2)} USDT
                    </span>
                    <Badge className={`text-[9px] ${t.closeReason === "TP" ? "bg-green-500/20 text-green-400" : t.closeReason === "SL" ? "bg-red-500/20 text-red-400" : "bg-zinc-500/20 text-zinc-400"}`}>
                      {t.closeReason}
                    </Badge>
                  </div>
                ))}
                {tradeLog.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">Belum ada riwayat trade</div>}
              </div>
            </div>
          )}
        </div>

        {/* ─── Right Panel ──────────────────────────────────────────────────── */}
        <div className="flex flex-col border-l border-border overflow-y-auto max-h-[calc(100vh-60px)]">

          {/* Balance Bar */}
          <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
            {[
              { label: "Balance", value: `$${balance.balance.toFixed(2)}`, color: "text-white" },
              { label: "Equity", value: `$${balance.equity.toFixed(2)}`, color: "text-blue-400" },
              { label: "Float P/L", value: `${balance.unrealisedPnl >= 0 ? "+" : ""}$${balance.unrealisedPnl.toFixed(2)}`, color: pnlColor },
              { label: "Margin", value: `$${balance.usedMargin.toFixed(2)}`, color: "text-yellow-400" },
            ].map((item, i) => (
              <div key={i} className="px-3 py-2 text-center">
                <div className="text-[9px] text-muted-foreground uppercase">{item.label}</div>
                <div className={`font-mono text-sm font-bold ${item.color}`}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Right Tabs */}
          <div className="flex border-b border-border">
            {(["ai","order","positions"] as const).map(t => (
              <button key={t} onClick={() => setRightTab(t)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${rightTab === t ? "bg-[#0f172a] text-white border-b-2 border-blue-500" : "text-muted-foreground hover:text-white"}`}>
                {t === "ai" ? "🧠 AI" : t === "order" ? "📝 Order" : `📊 Posisi (${positions.length})`}
              </button>
            ))}
          </div>

          {/* AI Analysis Panel */}
          {rightTab === "ai" && (
            <div className="p-3 space-y-3">
              {/* Confidence Meter */}
              <div className="rounded-lg border border-border p-3 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold">AI Confidence</span>
                  <span className="font-mono font-bold text-2xl" style={{ color: confidenceColor }}>
                    {dec?.confidence ?? 0}%
                  </span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2 mb-2">
                  <div className="h-2 rounded-full transition-all duration-500"
                    style={{ width: `${dec?.confidence ?? 0}%`, background: confidenceColor }} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Quality Score</span>
                  <span className="font-mono" style={{ color: confidenceColor }}>{dec?.qualityScore ?? 0}/100</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-1">
                  <div className="h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${dec?.qualityScore ?? 0}%`, background: confidenceColor }} />
                </div>
              </div>

              {/* Direction Badge */}
              <div className={`rounded-lg border p-3 text-center ${
                dec?.shouldTrade && dec.direction === "Buy" ? "bg-green-500/10 border-green-500/40" :
                dec?.shouldTrade && dec.direction === "Sell" ? "bg-red-500/10 border-red-500/40" :
                "bg-zinc-800/50 border-border"
              }`}>
                <div className="text-xs text-muted-foreground mb-1">Rekomendasi AI</div>
                {dec?.shouldTrade ? (
                  <>
                    <div className={`text-3xl font-black ${dec.direction === "Buy" ? "text-green-400" : "text-red-400"}`}>
                      {dec.direction === "Buy" ? "▲ BUY" : "▼ SELL"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{dec.strategy}</div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-black text-zinc-500">⏸ TUNGGU</div>
                    <div className="text-[10px] text-muted-foreground mt-1 px-2">{dec?.waitReason ?? "Tidak ada sinyal"}</div>
                  </>
                )}
              </div>

              {/* Entry Details */}
              {dec?.shouldTrade && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Detail Entry</div>
                  {[
                    { label: "Entry", value: dec.entryPrice.toFixed(dec.entryPrice > 50 ? 2 : 4), color: "text-white" },
                    { label: "Stop Loss", value: dec.stopLoss.toFixed(dec.stopLoss > 50 ? 2 : 4), color: "text-red-400" },
                    { label: "Take Profit 1", value: dec.takeProfit.toFixed(dec.takeProfit > 50 ? 2 : 4), color: "text-green-400" },
                    { label: "Take Profit 2", value: dec.tp2.toFixed(dec.tp2 > 50 ? 2 : 4), color: "text-emerald-300" },
                    { label: "Risk/Reward", value: `1 : ${dec.riskReward.toFixed(2)}`, color: "text-yellow-400" },
                    { label: "Lot Suggested", value: dec.lotSize.toFixed(2), color: "text-blue-400" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className={`font-mono font-bold ${item.color}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Market Condition */}
              <div className="rounded border border-border p-2.5 bg-zinc-900/50">
                <div className="text-[10px] text-muted-foreground uppercase mb-1">Kondisi Market</div>
                <div className="text-xs text-foreground">{dec?.marketCondition ?? "—"}</div>
              </div>

              {/* AI Reasoning */}
              <div className="rounded border border-border p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase mb-2 flex items-center gap-1">
                  <Brain className="h-3 w-3" /> Reasoning AI
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {dec?.reasoning.map((r, i) => (
                    <div key={i} className="text-[11px] text-foreground/80 leading-relaxed">{r}</div>
                  ))}
                </div>
              </div>

              {/* Trend Indicators */}
              <div className="grid grid-cols-3 gap-1 text-center">
                {[
                  { label: "Trend", value: tech?.trendBias ?? "—", color: trendColor },
                  { label: "RSI", value: tech?.rsiZone ?? "—", color: tech?.rsiZone === "Oversold" ? "text-green-400" : tech?.rsiZone === "Overbought" ? "text-red-400" : "text-yellow-400" },
                  { label: "MACD", value: tech?.macdBias ?? "—", color: tech?.macdBias === "Bullish" ? "text-green-400" : tech?.macdBias === "Bearish" ? "text-red-400" : "text-yellow-400" },
                ].map((item, i) => (
                  <div key={i} className="rounded border border-border p-1.5">
                    <div className="text-[9px] text-muted-foreground">{item.label}</div>
                    <div className={`text-xs font-bold ${item.color}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Panel */}
          {rightTab === "order" && (
            <div className="p-3 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground">Order Manual — {selectedPair}</div>

              {/* Lot Size */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Ukuran Lot</span>
                  <span className="font-mono text-white">{orderLot.toFixed(2)}</span>
                </div>
                <input type="range" min="0.01" max="1" step="0.01" value={orderLot}
                  onChange={e => setOrderLot(parseFloat(e.target.value))}
                  className="w-full accent-blue-500" />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>0.01</span><span>0.10</span><span>0.50</span><span>1.00</span>
                </div>
              </div>

              {/* Quick lot buttons */}
              <div className="grid grid-cols-4 gap-1">
                {[0.01, 0.05, 0.10, 0.50].map(l => (
                  <button key={l} onClick={() => setOrderLot(l)}
                    className={`py-1 text-xs rounded border transition-all ${orderLot === l ? "bg-blue-500/20 border-blue-500 text-blue-300" : "border-border text-muted-foreground hover:border-blue-500/50"}`}>
                    {l.toFixed(2)}
                  </button>
                ))}
              </div>

              {/* SL/TP from AI */}
              {dec?.shouldTrade && (
                <div className="rounded border border-blue-500/20 bg-blue-500/5 p-2.5 space-y-1.5 text-xs">
                  <div className="text-blue-400 font-semibold text-[11px]">🤖 Parameter AI</div>
                  {[
                    { l: "SL", v: dec.stopLoss, c: "text-red-400" },
                    { l: "TP1", v: dec.takeProfit, c: "text-green-400" },
                    { l: "TP2", v: dec.tp2, c: "text-emerald-300" },
                    { l: "RR", v: `1:${dec.riskReward.toFixed(1)}`, c: "text-yellow-400" },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-muted-foreground">{item.l}:</span>
                      <span className={`font-mono ${item.c}`}>{typeof item.v === "number" ? item.v.toFixed(item.v > 50 ? 2 : 4) : item.v}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Buy/Sell Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleOrder("Buy")}
                  className="py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
                  <TrendingUp className="h-4 w-4" /> BUY
                </button>
                <button onClick={() => handleOrder("Sell")}
                  className="py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
                  <TrendingDown className="h-4 w-4" /> SELL
                </button>
              </div>

              {/* Risk Warning */}
              <div className="text-[10px] text-zinc-500 text-center border border-zinc-800 rounded p-2">
                ⚠️ Sistem ini adalah simulator. Bukan saran investasi nyata. Trading mengandung risiko kerugian.
              </div>

              {/* Stats */}
              {stats && (
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { l: "Total Trade", v: stats.totalTrades },
                    { l: "Win Rate", v: `${stats.winRate}%`, c: stats.winRate > 50 ? "text-green-400" : "text-red-400" },
                    { l: "Profit Factor", v: stats.profitFactor?.toFixed(2) },
                    { l: "Max Drawdown", v: `${stats.maxDrawdown?.toFixed(1)}%`, c: "text-red-400" },
                    { l: "Total P/L", v: `$${stats.totalPnl?.toFixed(2)}`, c: stats.totalPnl > 0 ? "text-green-400" : "text-red-400" },
                    { l: "Total Pips", v: stats.totalPips?.toFixed(0) },
                  ].map((item, i) => (
                    <div key={i} className="rounded border border-border p-2">
                      <div className="text-[9px] text-muted-foreground">{item.l}</div>
                      <div className={`font-mono text-sm font-bold ${item.c ?? "text-white"}`}>{item.v ?? "—"}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Equity Chart */}
              {stats?.equityHistory?.length > 3 && (
                <div className="rounded border border-border p-2">
                  <div className="text-[10px] text-muted-foreground mb-1">Kurva Ekuitas</div>
                  <ResponsiveContainer width="100%" height={80}>
                    <AreaChart data={stats.equityHistory} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                      <defs>
                        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="url(#eqGrad)" strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Positions Panel */}
          {rightTab === "positions" && (
            <div className="p-3 space-y-2">
              {positions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <div className="text-xs">Tidak ada posisi terbuka</div>
                  <div className="text-[10px] mt-1">AI sedang menunggu setup berkualitas tinggi...</div>
                </div>
              ) : (
                positions.map(pos => (
                  <div key={pos.id}
                    className={`rounded-lg border p-3 space-y-2 ${pos.unrealisedPnl >= 0 ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{pos.emoji}</span>
                        <div>
                          <div className="font-bold text-sm">{pos.symbol}</div>
                          <div className="text-[10px] text-muted-foreground">{pos.pairName}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-mono font-bold text-base ${pos.unrealisedPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {pos.unrealisedPnl >= 0 ? "+" : ""}{pos.unrealisedPnl.toFixed(2)} USD
                        </div>
                        <div className={`text-xs font-mono ${pos.unrealisedPips >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {pos.unrealisedPips >= 0 ? "+" : ""}{pos.unrealisedPips.toFixed(1)} pips
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                      <div><span className="text-muted-foreground">Sisi: </span><span className={pos.side === "Buy" ? "text-green-400" : "text-red-400"}>{pos.side}</span></div>
                      <div><span className="text-muted-foreground">Lot: </span><span>{pos.lotSize}</span></div>
                      <div><span className="text-muted-foreground">Lev: </span><span>{pos.leverage}x</span></div>
                      <div><span className="text-muted-foreground">Entry: </span><span className="font-mono">{pos.entryPrice.toFixed(pos.entryPrice > 50 ? 2 : 4)}</span></div>
                      <div><span className="text-muted-foreground">SL: </span><span className="text-red-400 font-mono">{pos.stopLoss.toFixed(pos.stopLoss > 50 ? 2 : 4)}</span></div>
                      <div><span className="text-muted-foreground">TP: </span><span className="text-green-400 font-mono">{pos.takeProfit.toFixed(pos.takeProfit > 50 ? 2 : 4)}</span></div>
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20">{pos.strategy}</Badge>
                      <Badge className="text-[9px] bg-violet-500/10 text-violet-400 border-violet-500/20">{pos.timeframe}</Badge>
                      {pos.trailActivated && <Badge className="text-[9px] bg-orange-500/10 text-orange-400 border-orange-500/20">Trail Aktif</Badge>}
                      {pos.breakeven && <Badge className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20">Breakeven</Badge>}
                      <Badge className="text-[9px] bg-zinc-800 text-zinc-400">{pos.confidence}% conf</Badge>
                    </div>

                    <div className="text-[10px] text-muted-foreground border-t border-border pt-1.5">{pos.aiNote}</div>

                    <button onClick={() => handleClose(pos.id, pos.symbol)}
                      className="w-full py-1.5 text-xs rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                      Tutup Posisi
                    </button>
                  </div>
                ))
              )}

              {/* Strategy Stats */}
              {stats?.strategyStats && Object.keys(stats.strategyStats).length > 0 && (
                <div className="mt-3 rounded border border-border p-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase mb-2">Performa Strategi</div>
                  <div className="space-y-1.5">
                    {Object.entries(stats.strategyStats).map(([strat, s]: [string, any]) => {
                      const wr = s.wins + s.losses > 0 ? ((s.wins / (s.wins + s.losses)) * 100).toFixed(0) : "0";
                      return (
                        <div key={strat} className="flex items-center gap-2 text-[10px]">
                          <span className="text-muted-foreground flex-1 truncate">{strat}</span>
                          <span className={parseInt(wr) > 50 ? "text-green-400" : "text-red-400"}>{wr}%</span>
                          <span className={s.totalPnl > 0 ? "text-green-400 font-mono" : "text-red-400 font-mono"}>${s.totalPnl.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
