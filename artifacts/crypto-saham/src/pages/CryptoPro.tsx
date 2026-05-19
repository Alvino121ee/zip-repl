import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Brain, Shield, Activity,
  RefreshCw, BarChart2, Zap, AlertTriangle, Target,
  Cpu, Flame, Globe, ChevronUp, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, BarChart, Bar, Cell, RadialBarChart, RadialBar,
} from "recharts";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");
const TIMEFRAMES = ["M5","M15","H1","H4","D1"];
const SYMBOLS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","AVAXUSDT","LINKUSDT"];

// ─── Candlestick Chart ────────────────────────────────────────────────────────

const CryptoChart: React.FC<{ candles: any[]; width: number; height: number }> = ({ candles, width, height }) => {
  const chartH = height * 0.75;
  const volH = height * 0.18;
  const padL = 8; const padR = 68; const padT = 10; const padB = 28;
  const chartW = width - padL - padR;
  const visible = candles.slice(-Math.floor(chartW / 9));
  if (visible.length === 0) return <rect width={width} height={height} fill="#0a0f1a" />;

  const priceMin = Math.min(...visible.map((c: any) => c.low)) * 0.9995;
  const priceMax = Math.max(...visible.map((c: any) => c.high)) * 1.0005;
  const priceRange = priceMax - priceMin || 1;
  const maxVol = Math.max(...visible.map((c: any) => c.volume), 1);
  const xStep = chartW / visible.length;
  const cw = Math.max(2, xStep * 0.7);
  const pxY = (p: number) => padT + ((priceMax - p) / priceRange) * chartH;
  const pxX = (i: number) => padL + (i + 0.5) * xStep;
  const cp = visible[visible.length - 1]?.close ?? 0;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <rect width={width} height={height} fill="#0a0f1a" />
      {[0,1,2,3,4,5].map(i => {
        const p = priceMin + (priceRange * i) / 5;
        const y = pxY(p);
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="#1e293b" strokeWidth={0.5} />
            <text x={padL + chartW + 4} y={y + 4} fill="#64748b" fontSize={9} fontFamily="monospace">
              {p > 1000 ? p.toFixed(0) : p > 1 ? p.toFixed(2) : p.toFixed(4)}
            </text>
          </g>
        );
      })}
      {visible.map((c: any, i: number) => {
        const x = pxX(i);
        const isG = c.close >= c.open;
        const col = isG ? "#22c55e" : "#ef4444";
        const bodyT = pxY(Math.max(c.open, c.close));
        const bodyB = pxY(Math.min(c.open, c.close));
        return (
          <g key={c.time}>
            <line x1={x} y1={pxY(c.high)} x2={x} y2={pxY(c.low)} stroke={col} strokeWidth={1} />
            <rect x={x - cw/2} y={bodyT} width={cw} height={Math.max(bodyB - bodyT, 1)} fill={col} fillOpacity={0.9} />
          </g>
        );
      })}
      <line x1={padL} y1={pxY(cp)} x2={padL + chartW} y2={pxY(cp)} stroke="#fbbf24" strokeWidth={1} strokeDasharray="4,3" />
      <rect x={padL + chartW + 2} y={pxY(cp) - 8} width={padR - 4} height={16} fill="#fbbf24" rx={3} />
      <text x={padL + chartW + 4} y={pxY(cp) + 4} fill="#000" fontSize={9} fontFamily="monospace" fontWeight="bold">
        {cp > 1000 ? cp.toFixed(1) : cp > 1 ? cp.toFixed(3) : cp.toFixed(5)}
      </text>
      {visible.map((c: any, i: number) => {
        const x = pxX(i);
        const vh = (c.volume / maxVol) * volH * 0.9;
        const vy = chartH + padT + padB + volH - vh;
        return <rect key={c.time} x={x - cw/2} y={vy} width={cw} height={vh} fill={c.close >= c.open ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"} />;
      })}
      {visible.filter((_: any, i: number) => i % Math.ceil(visible.length / 6) === 0).map((c: any, i: number) => {
        const idx = visible.indexOf(c);
        const d = new Date(c.time);
        return (
          <text key={i} x={pxX(idx)} y={chartH + padT + 14} fill="#475569" fontSize={8} textAnchor="middle" fontFamily="monospace">
            {`${d.getUTCHours().toString().padStart(2,"0")}:${d.getUTCMinutes().toString().padStart(2,"0")}`}
          </text>
        );
      })}
    </svg>
  );
};

// ─── Fear & Greed Gauge ───────────────────────────────────────────────────────

const FearGreedGauge: React.FC<{ value: number; classification: string; trend: string }> = ({ value, classification, trend }) => {
  const color = value >= 75 ? "#ef4444" : value >= 55 ? "#f97316" : value >= 45 ? "#fbbf24" : value >= 25 ? "#3b82f6" : "#6366f1";
  const label = value >= 75 ? "Keserakahan Ekstrem" : value >= 55 ? "Serakah" : value >= 45 ? "Netral" : value >= 25 ? "Takut" : "Ketakutan Ekstrem";
  const rotation = -135 + (value / 100) * 270;

  return (
    <div className="flex flex-col items-center">
      <svg width={160} height={100} viewBox="0 0 160 100">
        {/* Background arc */}
        <path d="M 20 90 A 60 60 0 1 1 140 90" fill="none" stroke="#1e293b" strokeWidth={12} strokeLinecap="round" />
        {/* Color segments */}
        {[["#6366f1",0,20],["#3b82f6",20,40],["#fbbf24",40,60],["#f97316",60,80],["#ef4444",80,100]].map(([c, s, e], i) => {
          const startAngle = -135 + (Number(s) / 100) * 270;
          const endAngle = -135 + (Number(e) / 100) * 270;
          const start = { x: 80 + 60 * Math.cos(startAngle * Math.PI / 180), y: 90 + 60 * Math.sin(startAngle * Math.PI / 180) };
          const end = { x: 80 + 60 * Math.cos(endAngle * Math.PI / 180), y: 90 + 60 * Math.sin(endAngle * Math.PI / 180) };
          return <path key={i} d={`M ${start.x} ${start.y} A 60 60 0 0 1 ${end.x} ${end.y}`} fill="none" stroke={String(c)} strokeWidth={12} strokeLinecap="round" />;
        })}
        {/* Needle */}
        <g transform={`rotate(${rotation}, 80, 90)`}>
          <line x1={80} y1={90} x2={80} y2={38} stroke="white" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={80} cy={90} r={5} fill={color} />
        </g>
        <text x={80} y={78} textAnchor="middle" fill="white" fontSize={18} fontWeight="bold" fontFamily="monospace">{value}</text>
      </svg>
      <div className="text-center mt-1">
        <div className="font-bold text-sm" style={{ color }}>{label}</div>
        <div className="text-[10px] text-muted-foreground">{trend}</div>
      </div>
    </div>
  );
};

// ─── Komponen Utama ────────────────────────────────────────────────────────────

export default function CryptoPro() {
  const { toast } = useToast();
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(650);

  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [selectedTF, setSelectedTF] = useState("H1");
  const [candles, setCandles] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [balance, setBalance] = useState({ balance: 500, equity: 500, unrealisedPnl: 0, usedMargin: 0 });
  const [tradeLog, setTradeLog] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [fearGreed, setFearGreed] = useState<any>(null);
  const [btcDom, setBtcDom] = useState<any>(null);
  const [whaleActivity, setWhaleActivity] = useState<any>(null);
  const [fundingRates, setFundingRates] = useState<any[]>([]);
  const [openInterest, setOpenInterest] = useState<any[]>([]);
  const [onChain, setOnChain] = useState<any>(null);
  const [social, setSocial] = useState<any>(null);
  const [liquidations, setLiquidations] = useState<any>(null);
  const [scanData, setScanData] = useState<any[]>([]);
  const [rightTab, setRightTab] = useState<"ai"|"order"|"positions"|"crypto">("ai");
  const [isLoading, setIsLoading] = useState(false);
  const [orderSize, setOrderSize] = useState(20);
  const [activityFeed, setActivityFeed] = useState<string[]>([]);

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setChartWidth(e.contentRect.width - 4);
    });
    if (chartRef.current) ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  const addActivity = useCallback((msg: string) => {
    setActivityFeed(prev => [`[${new Date().toLocaleTimeString("id-ID")}] ${msg}`, ...prev.slice(0, 29)]);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      setIsLoading(true);
      const [
        candleR, analysisR, posR, balR, logR, statsR,
        fgR, domR, whaleR, fundR, oiR, chainR, socialR, liqR, scanR,
      ] = await Promise.all([
        fetch(`${API}/api/crypto-pro/candles/${selectedSymbol}/${selectedTF}?count=120`),
        fetch(`${API}/api/crypto-pro/analyze/${selectedSymbol}`),
        fetch(`${API}/api/crypto-pro/positions`),
        fetch(`${API}/api/crypto-pro/balance`),
        fetch(`${API}/api/crypto-pro/log?limit=30`),
        fetch(`${API}/api/crypto-pro/stats`),
        fetch(`${API}/api/crypto-pro/fear-greed`),
        fetch(`${API}/api/crypto-pro/btc-dominance`),
        fetch(`${API}/api/crypto-pro/whale-activity`),
        fetch(`${API}/api/crypto-pro/funding-rates`),
        fetch(`${API}/api/crypto-pro/open-interest`),
        fetch(`${API}/api/crypto-pro/on-chain`),
        fetch(`${API}/api/crypto-pro/social-sentiment`),
        fetch(`${API}/api/crypto-pro/liquidation-heatmap`),
        fetch(`${API}/api/crypto-pro/scan`),
      ]);
      if (candleR.ok) setCandles(await candleR.json());
      if (analysisR.ok) {
        const d = await analysisR.json();
        setAnalysis(d);
        if (d.aiDecision?.shouldTrade) addActivity(`🎯 AI: ${d.aiDecision.direction} ${selectedSymbol} — ${d.aiDecision.strategy} (${d.aiDecision.confidence}%)`);
      }
      if (posR.ok) setPositions(await posR.json());
      if (balR.ok) setBalance(await balR.json());
      if (logR.ok) setTradeLog(await logR.json());
      if (statsR.ok) setStats(await statsR.json());
      if (fgR.ok) setFearGreed(await fgR.json());
      if (domR.ok) setBtcDom(await domR.json());
      if (whaleR.ok) setWhaleActivity(await whaleR.json());
      if (fundR.ok) setFundingRates(await fundR.json());
      if (oiR.ok) setOpenInterest(await oiR.json());
      if (chainR.ok) setOnChain(await chainR.json());
      if (socialR.ok) setSocial(await socialR.json());
      if (liqR.ok) setLiquidations(await liqR.json());
      if (scanR.ok) setScanData(await scanR.json());
    } finally { setIsLoading(false); }
  }, [selectedSymbol, selectedTF, addActivity]);

  useEffect(() => { fetchAll(); }, [selectedSymbol, selectedTF]);

  useEffect(() => {
    const t = setInterval(() => {
      fetch(`${API}/api/crypto-pro/candles/${selectedSymbol}/${selectedTF}?count=120`)
        .then(r => r.ok ? r.json() : null).then(d => d && setCandles(d));
      fetch(`${API}/api/crypto-pro/positions`)
        .then(r => r.ok ? r.json() : null).then(d => d && setPositions(d));
      fetch(`${API}/api/crypto-pro/balance`)
        .then(r => r.ok ? r.json() : null).then(d => d && setBalance(d));
    }, 5000);
    const t2 = setInterval(() => {
      fetch(`${API}/api/crypto-pro/whale-activity`).then(r => r.ok ? r.json() : null).then(d => d && setWhaleActivity(d));
      fetch(`${API}/api/crypto-pro/btc-dominance`).then(r => r.ok ? r.json() : null).then(d => d && setBtcDom(d));
    }, 15000);
    return () => { clearInterval(t); clearInterval(t2); };
  }, [selectedSymbol, selectedTF]);

  const handleOrder = async (direction: "Buy" | "Sell") => {
    const r = await fetch(`${API}/api/crypto-pro/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: selectedSymbol, direction, size: orderSize }),
    });
    const d = await r.json();
    if (!r.ok) { toast({ title: "Gagal", description: d.error, variant: "destructive" }); return; }
    toast({ title: `${direction} dibuka`, description: `${selectedSymbol}` });
    addActivity(`📈 ${direction} ${selectedSymbol} dibuka`);
    fetchAll();
  };

  const handleClose = async (id: string, symbol: string) => {
    await fetch(`${API}/api/crypto-pro/close/${id}`, { method: "POST" });
    addActivity(`🔴 ${symbol} ditutup`);
    fetchAll();
  };

  const dec = analysis?.aiDecision;
  const confColor = !dec ? "#64748b" : dec.confidence >= 78 ? "#22c55e" : dec.confidence >= 62 ? "#fbbf24" : "#ef4444";

  const currentCandle = candles[candles.length - 1];
  const currentPrice = currentCandle?.close ?? 0;
  const prevCandle = candles[candles.length - 2];
  const priceChange = prevCandle ? ((currentPrice - prevCandle.close) / prevCandle.close * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0a0f1a] border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <Cpu className="h-5 w-5 text-orange-400" />
            <span className="font-bold text-white text-sm">CRYPTO PRO</span>
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">ENGINE TERPISAH</Badge>
          </div>

          {/* Symbol selector */}
          <div className="flex gap-1 flex-wrap">
            {SYMBOLS.map(s => {
              const scan = scanData.find(x => x.symbol === s);
              return (
                <button key={s} onClick={() => setSelectedSymbol(s)}
                  className={`px-2 py-0.5 text-xs rounded border font-mono transition-all ${selectedSymbol === s ? "bg-orange-500/20 border-orange-500 text-orange-300" : "border-border text-muted-foreground hover:border-orange-500/50"}`}>
                  <span>{s.replace("USDT","")}</span>
                  {scan && <span className={`ml-1 text-[9px] ${scan.direction === "Buy" ? "text-green-400" : scan.direction === "Sell" ? "text-red-400" : "text-zinc-500"}`}>
                    {scan.confidence}%
                  </span>}
                </button>
              );
            })}
          </div>

          {/* Timeframe */}
          <div className="flex gap-1">
            {TIMEFRAMES.map(tf => (
              <button key={tf} onClick={() => setSelectedTF(tf)}
                className={`px-2 py-0.5 text-xs rounded font-mono transition-all ${selectedTF === tf ? "bg-orange-500/20 text-orange-300 border border-orange-500" : "text-muted-foreground hover:text-white border border-transparent"}`}>
                {tf}
              </button>
            ))}
          </div>

          {/* Price */}
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <div className="font-mono font-bold text-white text-xl leading-none">
                {currentPrice > 1000 ? `$${currentPrice.toFixed(1)}` : currentPrice > 1 ? `$${currentPrice.toFixed(3)}` : `$${currentPrice.toFixed(5)}`}
              </div>
              <div className={`text-xs font-mono ${priceChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                {priceChange >= 0 ? "▲" : "▼"} {Math.abs(priceChange).toFixed(2)}%
              </div>
            </div>

            {/* Fear & Greed mini */}
            {fearGreed && (
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground">Fear & Greed</div>
                <div className={`font-bold text-sm ${fearGreed.value >= 60 ? "text-red-400" : fearGreed.value <= 40 ? "text-blue-400" : "text-yellow-400"}`}>
                  {fearGreed.value} — {fearGreed.classification}
                </div>
              </div>
            )}

            {/* BTC Dom */}
            {btcDom && (
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground">BTC Dom</div>
                <div className={`font-bold text-sm ${btcDom.phase === "Bitcoin Season" ? "text-orange-400" : btcDom.phase === "Altcoin Season" ? "text-green-400" : "text-yellow-400"}`}>
                  {btcDom.value}%
                </div>
              </div>
            )}

            {isLoading && <RefreshCw className="h-4 w-4 animate-spin text-orange-400" />}
          </div>
        </div>
      </div>

      {/* ─── Main Grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px]">
        {/* ─── Left: Chart + Crypto Panels ─────────────────────────────────── */}
        <div className="border-r border-border">
          {/* Chart */}
          <div ref={chartRef} className="w-full bg-[#0a0f1a]">
            {candles.length > 0 ? (
              <CryptoChart candles={candles} width={chartWidth} height={360} />
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" /> Memuat grafik...
              </div>
            )}
          </div>

          {/* Crypto-Specific Panels Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 border-t border-border divide-x divide-border">
            {/* Fear & Greed */}
            <div className="p-3 flex flex-col items-center">
              {fearGreed ? (
                <FearGreedGauge value={fearGreed.value} classification={fearGreed.classification} trend={fearGreed.trend} />
              ) : <div className="h-24 flex items-center text-muted-foreground text-xs">Memuat...</div>}
              <div className="text-[10px] text-muted-foreground mt-1 text-center">
                Kemarin: {fearGreed?.previousDay} | Minggu lalu: {fearGreed?.previousWeek}
              </div>
            </div>

            {/* BTC Dominance */}
            <div className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">BTC Dominance</div>
              {btcDom ? (
                <>
                  <div className="text-3xl font-black font-mono mb-1"
                    style={{ color: btcDom.phase === "Bitcoin Season" ? "#f97316" : btcDom.phase === "Altcoin Season" ? "#22c55e" : "#fbbf24" }}>
                    {btcDom.value}%
                  </div>
                  <div className="text-xs mb-2">
                    <span className={btcDom.phase === "Bitcoin Season" ? "text-orange-400" : btcDom.phase === "Altcoin Season" ? "text-green-400" : "text-yellow-400"}>
                      {btcDom.phase}
                    </span>
                  </div>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Altseason Index</span>
                      <span className={btcDom.altseasonIndex > 60 ? "text-green-400" : "text-muted-foreground"}>{btcDom.altseasonIndex}/100</span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${btcDom.altseasonIndex}%` }} />
                    </div>
                    <div className="text-muted-foreground">
                      {btcDom.topAltcoinsOutperforming} altcoin outperform BTC
                    </div>
                  </div>
                </>
              ) : <div className="text-xs text-muted-foreground">Memuat...</div>}
            </div>

            {/* Whale Activity */}
            <div className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">Aktivitas Whale 🐋</div>
              {whaleActivity ? (
                <>
                  <div className={`text-lg font-bold mb-1 ${whaleActivity.dominantSide === "Buy" ? "text-green-400" : whaleActivity.dominantSide === "Sell" ? "text-red-400" : "text-yellow-400"}`}>
                    {whaleActivity.dominantSide === "Buy" ? "▲ AKUMULASI" : whaleActivity.dominantSide === "Sell" ? "▼ DISTRIBUSI" : "⟷ NETRAL"}
                  </div>
                  <div className="text-[10px] text-muted-foreground mb-2">Tekanan: {whaleActivity.pressure}%</div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-2">
                    <div className={`h-1.5 rounded-full transition-all ${whaleActivity.dominantSide === "Buy" ? "bg-green-500" : "bg-red-500"}`}
                      style={{ width: `${whaleActivity.pressure}%` }} />
                  </div>
                  <div className="space-y-0.5 max-h-16 overflow-y-auto">
                    {whaleActivity.recentLargeOrders.slice(0,3).map((o: any, i: number) => (
                      <div key={i} className="flex justify-between text-[10px]">
                        <span className={o.side === "Buy" ? "text-green-400" : "text-red-400"}>{o.side}</span>
                        <span className="text-muted-foreground">{o.symbol.replace("USDT","")}</span>
                        <span>${(o.size/1000).toFixed(0)}K</span>
                        <span className="text-zinc-500">{o.timeAgo}</span>
                      </div>
                    ))}
                  </div>
                  {whaleActivity.alert && (
                    <div className="mt-1 text-[10px] text-orange-400 border border-orange-500/30 rounded px-1.5 py-0.5">
                      {whaleActivity.alert}
                    </div>
                  )}
                </>
              ) : <div className="text-xs text-muted-foreground">Memuat...</div>}
            </div>

            {/* On-Chain */}
            <div className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">On-Chain Metrics</div>
              {onChain ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Health Score</span>
                    <span className={onChain.marketHealthScore > 60 ? "text-green-400" : onChain.marketHealthScore > 40 ? "text-yellow-400" : "text-red-400"}>
                      {onChain.marketHealthScore}/100
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${onChain.marketHealthScore > 60 ? "bg-green-500" : onChain.marketHealthScore > 40 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${onChain.marketHealthScore}%` }} />
                  </div>
                  {[
                    { l: "Hashrate", v: onChain.btcNetworkHashrate },
                    { l: "NVT Ratio", v: onChain.btcNvtRatio.toFixed(1), c: onChain.btcNvtRatio < 70 ? "text-green-400" : "text-red-400" },
                    { l: "Net Flow", v: `${onChain.exchangeNetFlow > 0 ? "+" : ""}${onChain.exchangeNetFlow.toFixed(0)}`, c: onChain.exchangeNetFlow < 0 ? "text-green-400" : "text-red-400" },
                    { l: "SSR", v: onChain.stablecoinSupplyRatio.toFixed(3) },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">{item.l}</span>
                      <span className={item.c ?? "text-white"}>{item.v}</span>
                    </div>
                  ))}
                  <div className="text-[10px] text-muted-foreground mt-1">{onChain.note}</div>
                </div>
              ) : <div className="text-xs text-muted-foreground">Memuat...</div>}
            </div>
          </div>

          {/* Funding Rates + Open Interest */}
          <div className="grid grid-cols-2 gap-0 border-t border-border divide-x divide-border">
            <div className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">Funding Rate (8 jam)</div>
              <div className="space-y-1">
                {fundingRates.slice(0,5).map((f: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-16 truncate">{f.symbol.replace("USDT","")}</span>
                    <span className={`font-mono font-bold ${f.rate > 0.05 ? "text-red-400" : f.rate < -0.05 ? "text-green-400" : "text-yellow-400"}`}>
                      {f.rate > 0 ? "+" : ""}{f.rate.toFixed(4)}%
                    </span>
                    <span className={`text-[10px] ${f.bias === "Long Heavy" ? "text-red-400/70" : f.bias === "Short Heavy" ? "text-green-400/70" : "text-zinc-500"}`}>
                      {f.bias}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">Open Interest 24h</div>
              <div className="space-y-1">
                {openInterest.slice(0,5).map((oi: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-16 truncate">{oi.symbol.replace("USDT","")}</span>
                    <span className="font-mono">${(oi.oi/1_000_000).toFixed(1)}M</span>
                    <span className={`text-[10px] font-mono ${oi.oiChange24h > 0 ? "text-green-400" : "text-red-400"}`}>
                      {oi.oiChange24h > 0 ? "+" : ""}{oi.oiChange24h.toFixed(1)}%
                    </span>
                    <span className={`text-[10px] ${oi.oiTrend === "Naik" ? "text-green-400" : oi.oiTrend === "Turun" ? "text-red-400" : "text-zinc-500"}`}>
                      {oi.oiTrend}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Liquidation Heatmap + Social */}
          <div className="grid grid-cols-2 gap-0 border-t border-border divide-x divide-border">
            <div className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">🔥 Liquidation Heatmap</div>
              {liquidations ? (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded border border-green-500/20 p-2 text-center">
                      <div className="text-[10px] text-muted-foreground">Long Liq</div>
                      <div className="text-xs font-bold text-red-400">${(liquidations.longLiquidations24h/1_000_000).toFixed(1)}M</div>
                    </div>
                    <div className="rounded border border-red-500/20 p-2 text-center">
                      <div className="text-[10px] text-muted-foreground">Short Liq</div>
                      <div className="text-xs font-bold text-green-400">${(liquidations.shortLiquidations24h/1_000_000).toFixed(1)}M</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">Level panas BTC:</div>
                  {liquidations.hotLevels.slice(0,3).map((h: any, i: number) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className={h.side === "Long" ? "text-green-400" : "text-red-400"}>{h.side}</span>
                      <span className="font-mono">${h.price.toFixed(0)}</span>
                      <span className="text-muted-foreground">${(h.liquidationSize/1_000_000).toFixed(1)}M</span>
                    </div>
                  ))}
                </div>
              ) : <div className="text-xs text-muted-foreground">Memuat...</div>}
            </div>

            <div className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">📱 Social Sentiment</div>
              {social ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Overall Score</span>
                    <span className={`font-bold text-lg ${social.overallScore > 60 ? "text-green-400" : social.overallScore > 40 ? "text-yellow-400" : "text-red-400"}`}>
                      {social.overallScore}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${social.overallScore > 60 ? "bg-green-500" : social.overallScore > 40 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${social.overallScore}%` }} />
                  </div>
                  {[
                    { l: "Reddit Mood", v: social.redditMood, c: social.redditMood === "Bullish" || social.redditMood === "Euphoria" ? "text-green-400" : social.redditMood === "Bearish" || social.redditMood === "Panic" ? "text-red-400" : "text-yellow-400" },
                    { l: "Twitter Score", v: social.twitterSentiment, c: "text-blue-400" },
                    { l: "BTC Mentions", v: `${(social.btcMentions/1000).toFixed(0)}K`, c: "text-white" },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">{item.l}</span>
                      <span className={item.c}>{item.v}</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {social.trending?.map((t: string, i: number) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{t}</span>
                    ))}
                  </div>
                </div>
              ) : <div className="text-xs text-muted-foreground">Memuat...</div>}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="border-t border-border p-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
              <Activity className="h-3 w-3" /> Feed Aktivitas AI Crypto
            </div>
            <div className="space-y-0.5 max-h-20 overflow-y-auto">
              {activityFeed.slice(0,8).map((msg, i) => (
                <div key={i} className="text-[10px] text-muted-foreground font-mono">{msg}</div>
              ))}
              {activityFeed.length === 0 && <div className="text-[10px] text-zinc-600">Menunggu sinyal AI...</div>}
            </div>
          </div>
        </div>

        {/* ─── Right Panel ──────────────────────────────────────────────────── */}
        <div className="flex flex-col border-l border-border overflow-y-auto max-h-[calc(100vh-56px)]">
          {/* Balance */}
          <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
            {[
              { l: "Balance", v: `$${balance.balance.toFixed(2)}`, c: "text-white" },
              { l: "Equity", v: `$${balance.equity.toFixed(2)}`, c: "text-orange-400" },
              { l: "Float P/L", v: `${balance.unrealisedPnl >= 0 ? "+" : ""}$${balance.unrealisedPnl.toFixed(2)}`, c: balance.unrealisedPnl >= 0 ? "text-green-400" : "text-red-400" },
              { l: "Margin", v: `$${balance.usedMargin.toFixed(2)}`, c: "text-yellow-400" },
            ].map((item, i) => (
              <div key={i} className="px-3 py-2 text-center">
                <div className="text-[9px] text-muted-foreground uppercase">{item.l}</div>
                <div className={`font-mono text-sm font-bold ${item.c}`}>{item.v}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            {(["ai","order","positions","crypto"] as const).map(t => (
              <button key={t} onClick={() => setRightTab(t)}
                className={`flex-1 py-2 text-[10px] font-medium transition-colors ${rightTab === t ? "bg-[#0f172a] text-white border-b-2 border-orange-500" : "text-muted-foreground hover:text-white"}`}>
                {t === "ai" ? "🧠 AI" : t === "order" ? "📝 Order" : t === "positions" ? `📊 Pos(${positions.length})` : "🔬 Data"}
              </button>
            ))}
          </div>

          {/* AI Panel */}
          {rightTab === "ai" && (
            <div className="p-3 space-y-3">
              {/* Confidence */}
              <div className="rounded-lg border border-border p-3 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold">AI Confidence</span>
                  <span className="font-mono font-bold text-2xl" style={{ color: confColor }}>{dec?.confidence ?? 0}%</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${dec?.confidence ?? 0}%`, background: confColor }} />
                </div>
              </div>

              {/* Direction */}
              <div className={`rounded-lg border p-3 text-center ${dec?.shouldTrade && dec.direction === "Buy" ? "bg-green-500/10 border-green-500/40" : dec?.shouldTrade && dec.direction === "Sell" ? "bg-red-500/10 border-red-500/40" : "bg-zinc-800/50 border-border"}`}>
                <div className="text-xs text-muted-foreground mb-1">Rekomendasi AI Crypto</div>
                {dec?.shouldTrade ? (
                  <>
                    <div className={`text-3xl font-black ${dec.direction === "Buy" ? "text-green-400" : "text-red-400"}`}>
                      {dec.direction === "Buy" ? "▲ BUY" : "▼ SELL"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{dec.strategy}</div>
                    <div className={`text-xs mt-1 px-2 py-0.5 rounded inline-block ${dec.marketRegime?.includes("Bull") ? "bg-green-500/20 text-green-400" : dec.marketRegime?.includes("Bear") ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                      {dec.marketRegime}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-black text-zinc-500">⏸ TUNGGU</div>
                    <div className="text-[10px] text-muted-foreground mt-1 px-2">{dec?.waitReason ?? "Setup belum optimal"}</div>
                  </>
                )}
              </div>

              {/* Crypto Factors */}
              {dec?.cryptoSpecificFactors?.length > 0 && (
                <div className="rounded border border-orange-500/20 p-2.5 bg-orange-500/5">
                  <div className="text-[10px] text-orange-400 font-semibold mb-1.5">⚡ Faktor Spesifik Crypto</div>
                  {dec.cryptoSpecificFactors.map((f: string, i: number) => (
                    <div key={i} className="text-[11px] text-foreground/80">• {f}</div>
                  ))}
                </div>
              )}

              {/* AI Reasoning */}
              <div className="rounded border border-border p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase mb-2 flex items-center gap-1">
                  <Brain className="h-3 w-3" /> Reasoning AI
                </div>
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {dec?.reasoning?.map((r: string, i: number) => (
                    <div key={i} className="text-[11px] text-foreground/80 leading-relaxed">{r}</div>
                  ))}
                </div>
              </div>

              {/* Market Regime */}
              <div className="rounded border border-border p-2.5 bg-zinc-900/50">
                <div className="text-[10px] text-muted-foreground uppercase mb-1">Kondisi Market Crypto</div>
                <div className="text-xs">{dec?.marketRegime ?? "—"}</div>
              </div>

              {/* Equity Chart */}
              {stats?.equityHistory?.length > 3 && (
                <div className="rounded border border-border p-2">
                  <div className="text-[10px] text-muted-foreground mb-1">Kurva Ekuitas</div>
                  <ResponsiveContainer width="100%" height={80}>
                    <AreaChart data={stats.equityHistory}>
                      <defs>
                        <linearGradient id="cpEqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="value" stroke="#f97316" fill="url(#cpEqGrad)" strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Order Panel */}
          {rightTab === "order" && (
            <div className="p-3 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground">Order Crypto — {selectedSymbol}</div>

              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Ukuran Order (USDT)</span>
                  <span className="font-mono text-white">${orderSize}</span>
                </div>
                <input type="range" min="5" max="200" step="5" value={orderSize}
                  onChange={e => setOrderSize(parseInt(e.target.value))}
                  className="w-full accent-orange-500" />
                <div className="grid grid-cols-4 gap-1 mt-1">
                  {[10, 25, 50, 100].map(s => (
                    <button key={s} onClick={() => setOrderSize(s)}
                      className={`py-1 text-xs rounded border transition-all ${orderSize === s ? "bg-orange-500/20 border-orange-500 text-orange-300" : "border-border text-muted-foreground hover:border-orange-500/50"}`}>
                      ${s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleOrder("Buy")}
                  className="py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
                  <TrendingUp className="h-4 w-4" /> BUY / LONG
                </button>
                <button onClick={() => handleOrder("Sell")}
                  className="py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
                  <TrendingDown className="h-4 w-4" /> SELL / SHORT
                </button>
              </div>

              <div className="text-[10px] text-zinc-500 text-center border border-zinc-800 rounded p-2">
                ⚠️ Sistem ini adalah simulator edukasi. Bukan saran investasi nyata.
              </div>

              {/* Stats Grid */}
              {stats && (
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { l: "Total Trade", v: stats.totalTrades },
                    { l: "Win Rate", v: `${stats.winRate}%`, c: stats.winRate > 50 ? "text-green-400" : "text-red-400" },
                    { l: "Total P/L", v: `$${stats.totalPnl?.toFixed(2)}`, c: stats.totalPnl > 0 ? "text-green-400" : "text-red-400" },
                    { l: "Daily P/L", v: `$${stats.dailyPnl?.toFixed(2)}`, c: stats.dailyPnl > 0 ? "text-green-400" : "text-red-400" },
                  ].map((item, i) => (
                    <div key={i} className="rounded border border-border p-2">
                      <div className="text-[9px] text-muted-foreground">{item.l}</div>
                      <div className={`font-mono text-sm font-bold ${item.c ?? "text-white"}`}>{item.v ?? "—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Positions */}
          {rightTab === "positions" && (
            <div className="p-3 space-y-2">
              {positions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <div className="text-xs">Tidak ada posisi crypto terbuka</div>
                  <div className="text-[10px] mt-1">AI menunggu setup optimal...</div>
                </div>
              ) : positions.map(pos => (
                <div key={pos.id}
                  className={`rounded-lg border p-3 space-y-2 ${pos.unrealisedPnl >= 0 ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{pos.emoji}</span>
                      <div>
                        <div className="font-bold">{pos.symbol}</div>
                        <div className="text-[10px] text-muted-foreground">{pos.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-bold text-base ${pos.unrealisedPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {pos.unrealisedPnl >= 0 ? "+" : ""}{pos.unrealisedPnl.toFixed(2)} USD
                      </div>
                      <div className={`text-xs ${pos.unrealisedPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {pos.unrealisedPct >= 0 ? "+" : ""}{pos.unrealisedPct.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[10px]">
                    <div><span className="text-muted-foreground">Sisi: </span><span className={pos.side === "Buy" ? "text-green-400" : "text-red-400"}>{pos.side}</span></div>
                    <div><span className="text-muted-foreground">Lev: </span><span>{pos.leverage}x</span></div>
                    <div><span className="text-muted-foreground">Margin: </span><span>${pos.margin?.toFixed(1)}</span></div>
                    <div><span className="text-muted-foreground">SL: </span><span className="text-red-400 font-mono">{pos.stopLoss?.toFixed(pos.stopLoss > 100 ? 1 : 4)}</span></div>
                    <div><span className="text-muted-foreground">TP: </span><span className="text-green-400 font-mono">{pos.takeProfit?.toFixed(pos.takeProfit > 100 ? 1 : 4)}</span></div>
                    <div><span className="text-muted-foreground">Conf: </span><span>{pos.confidence}%</span></div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge className="text-[9px] bg-orange-500/10 text-orange-400 border-orange-500/20">{pos.strategy}</Badge>
                    {pos.trailActivated && <Badge className="text-[9px] bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Trail</Badge>}
                    {pos.cryptoFactors?.slice(0,1).map((f: string, i: number) => (
                      <Badge key={i} className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20">{f}</Badge>
                    ))}
                  </div>
                  <button onClick={() => handleClose(pos.id, pos.symbol)}
                    className="w-full py-1.5 text-xs rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                    Tutup Posisi
                  </button>
                </div>
              ))}

              {/* Trade Log */}
              {tradeLog.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] text-muted-foreground uppercase mb-1.5">Riwayat ({tradeLog.length})</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {tradeLog.map((t, i) => (
                      <div key={i} className={`flex items-center gap-2 p-1.5 rounded border text-[10px] ${t.pnl > 0 ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                        <span className={t.side === "Buy" ? "text-green-400" : "text-red-400"}>{t.side}</span>
                        <span className="font-mono">{t.symbol.replace("USDT","")}</span>
                        <span className="text-muted-foreground flex-1 truncate">{t.strategy}</span>
                        <span className={`font-mono font-bold ${t.pnl > 0 ? "text-green-400" : "text-red-400"}`}>
                          {t.pnl > 0 ? "+" : ""}{t.pnl?.toFixed(2)}
                        </span>
                        <Badge className={`text-[8px] ${t.closeReason === "TP" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{t.closeReason}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Crypto Data Panel */}
          {rightTab === "crypto" && (
            <div className="p-3 space-y-3">
              {/* Fear & Greed Full */}
              <div className="rounded border border-border p-3">
                <div className="text-[10px] text-muted-foreground uppercase mb-2">Fear & Greed Index</div>
                {fearGreed && <FearGreedGauge value={fearGreed.value} classification={fearGreed.classification} trend={fearGreed.trend} />}
              </div>

              {/* Scanner */}
              <div className="rounded border border-border p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase mb-2">Scanner AI ({scanData.length} aset)</div>
                <div className="space-y-1">
                  {scanData.map((s, i) => (
                    <button key={i} onClick={() => { setSelectedSymbol(s.symbol); setRightTab("ai"); }}
                      className="w-full flex items-center gap-2 text-xs hover:bg-zinc-800 rounded p-1.5 transition-colors">
                      <span className="font-mono w-14 text-left">{s.symbol.replace("USDT","")}</span>
                      <span className={`w-8 text-xs ${s.direction === "Buy" ? "text-green-400" : s.direction === "Sell" ? "text-red-400" : "text-zinc-500"}`}>
                        {s.direction === "Buy" ? "▲" : s.direction === "Sell" ? "▼" : "—"}
                      </span>
                      <div className="flex-1 bg-zinc-800 rounded-full h-1">
                        <div className="h-1 rounded-full" style={{ width: `${s.confidence}%`, background: s.confidence >= 75 ? "#22c55e" : s.confidence >= 60 ? "#fbbf24" : "#ef4444" }} />
                      </div>
                      <span className="text-muted-foreground text-[10px]">{s.confidence}%</span>
                      <span className={`text-[10px] px-1 rounded ${s.marketRegime?.includes("Bull") ? "text-green-400" : s.marketRegime?.includes("Bear") ? "text-red-400" : "text-yellow-400"}`}>
                        {s.marketRegime?.split(" ")[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Strategy Stats */}
              {stats?.strategyStats && Object.keys(stats.strategyStats).length > 0 && (
                <div className="rounded border border-border p-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase mb-2">Performa Strategi</div>
                  {Object.entries(stats.strategyStats).map(([strat, s]: [string, any]) => {
                    const total = s.wins + s.losses;
                    const wr = total > 0 ? ((s.wins / total) * 100).toFixed(0) : "0";
                    return (
                      <div key={strat} className="flex items-center gap-2 text-[10px] mb-1">
                        <span className="text-muted-foreground flex-1 truncate text-left">{strat}</span>
                        <span className={parseInt(wr) > 50 ? "text-green-400" : "text-red-400"}>{wr}%</span>
                        <span className={s.totalPnl > 0 ? "text-green-400 font-mono" : "text-red-400 font-mono"}>${s.totalPnl.toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
