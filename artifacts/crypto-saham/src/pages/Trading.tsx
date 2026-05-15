import React, { useState, useEffect } from "react";
import {
  Activity, AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronUp,
  CircleDollarSign, Loader2, Power, RefreshCw, Settings, ShieldAlert,
  TrendingUp, Wallet, XCircle, Zap, Target,
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

function formatUSDT(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pnlColor(v: string) {
  const n = parseFloat(v);
  if (isNaN(n)) return "text-muted-foreground";
  return n >= 0 ? "text-green-400" : "text-red-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SignalCard({
  sig,
  config,
  onExecute,
  executing,
}: {
  sig: Signal;
  config: AutoConfig;
  onExecute: (sig: Signal) => void;
  executing: string | null;
}) {
  const isStrong = sig.signal === "strong_buy";
  const qty = (Math.min(config.maxPositionUSDT, 50) / sig.price).toFixed(4);
  const sl = sig.stopLoss ?? (sig.price * (1 - config.stopLossPct / 100));
  const tp = sig.takeProfit ?? (sig.price * (1 + config.takeProfitPct / 100));
  const isExec = executing === sig.bybitSymbol;

  return (
    <Card className={`border ${isStrong ? "border-green-500/40 bg-green-950/10" : "border-primary/20"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{sig.symbol}</span>
              <Badge className={isStrong ? "bg-green-600 text-white" : "bg-blue-600 text-white"}>
                {isStrong ? "⚡ STRONG BUY" : "▲ BUY"}
              </Badge>
              {sig.riskLevel === "low" && (
                <Badge variant="outline" className="text-green-400 border-green-400/40 text-xs">Low Risk</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{sig.bybitSymbol}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">${formatUSDT(sig.price)}</div>
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
            <div className="font-medium text-red-400">${formatUSDT(sl)}</div>
          </div>
          <div className="bg-green-950/20 rounded p-2 border border-green-500/20">
            <div className="text-muted-foreground">Take Profit</div>
            <div className="font-medium text-green-400">${formatUSDT(tp)}</div>
          </div>
        </div>

        {config.mode === "semi" && (
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            size="sm"
            disabled={isExec}
            onClick={() => onExecute(sig)}
          >
            {isExec ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Executing…</>
            ) : (
              <><Zap className="h-3.5 w-3.5 mr-1" /> Execute Order</>
            )}
          </Button>
        )}

        {config.mode === "auto" && config.enabled && (
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <Bot className="h-3.5 w-3.5" />
            <span>Auto-trading will execute when conditions met</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PositionRow({
  pos,
  onSetTPSL,
}: {
  pos: Position;
  onSetTPSL: (pos: Position) => void;
}) {
  const pnl = parseFloat(pos.unrealisedPnl);
  const pct = parseFloat(pos.percentage ?? "0");

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Badge variant={pos.side === "Buy" ? "default" : "destructive"} className="shrink-0 text-xs">
            {pos.side === "Buy" ? "LONG" : "SHORT"}
          </Badge>
          <div className="min-w-0">
            <div className="font-semibold truncate">{pos.symbol}</div>
            <div className="text-xs text-muted-foreground">
              {pos.size} @ ${formatUSDT(pos.avgPrice)} · {pos.leverage}x
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className={`font-semibold ${pnlColor(pos.unrealisedPnl)}`}>
              {pnl >= 0 ? "+" : ""}{formatUSDT(pnl)} USDT
            </div>
            <div className={`text-xs ${pnlColor(pos.percentage)}`}>
              {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
            </div>
          </div>
          <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => onSetTPSL(pos)}>
            <Target className="h-3 w-3 mr-1" />
            TP/SL
          </Button>
        </div>
      </div>
    </div>
  );
}

function TPSLDialog({
  pos,
  config,
  onClose,
  onSave,
}: {
  pos: Position;
  config: AutoConfig;
  onClose: () => void;
  onSave: (symbol: string, tp: number, sl: number) => Promise<void>;
}) {
  const markPrice = parseFloat(pos.markPrice || pos.avgPrice);
  const [tp, setTp] = useState(+(markPrice * (1 + config.takeProfitPct / 100)).toFixed(4));
  const [sl, setSl] = useState(+(markPrice * (1 - config.stopLossPct / 100)).toFixed(4));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(pos.symbol, tp, sl);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-[340px] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Set TP/SL — {pos.symbol}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="text-xs text-muted-foreground mb-4">
          Mark Price: <span className="font-semibold text-foreground">${formatUSDT(markPrice)}</span>
          &nbsp;·&nbsp;Entry: <span className="font-semibold text-foreground">${formatUSDT(pos.avgPrice)}</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-green-400 font-medium block mb-1">Take Profit (USDT)</label>
            <input
              type="number"
              step="any"
              value={tp}
              onChange={(e) => setTp(parseFloat(e.target.value))}
              className="w-full rounded-md border border-green-500/40 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-xs text-red-400 font-medium block mb-1">Stop Loss (USDT)</label>
            <input
              type="number"
              step="any"
              value={sl}
              onChange={(e) => setSl(parseFloat(e.target.value))}
              className="w-full rounded-md border border-red-500/40 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-muted-foreground">
          <div className="bg-green-950/20 border border-green-500/20 rounded p-2">
            <div>Profit target</div>
            <div className="text-green-400 font-semibold">
              +{(((tp - markPrice) / markPrice) * 100).toFixed(2)}%
            </div>
          </div>
          <div className="bg-red-950/20 border border-red-500/20 rounded p-2">
            <div>Max loss</div>
            <div className="text-red-400 font-semibold">
              {(((sl - markPrice) / markPrice) * 100).toFixed(2)}%
            </div>
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

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Trading() {
  const { toast } = useToast();

  const [signals, setSignals] = useState<Signal[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [config, setConfig] = useState<AutoConfig>({
    enabled: false,
    mode: "semi",
    minConfidence: 80,
    maxPositionUSDT: 50,
    stopLossPct: 2,
    takeProfitPct: 4,
    maxPositions: 5,
    leverage: 1,
    intervalMs: 60_000,
  });
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"signals" | "positions" | "log">("signals");
  const [tpslPos, setTpslPos] = useState<Position | null>(null);

  async function loadAll(silent = false) {
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
      if (posRes.status === "fulfilled") setPositions(posRes.value.list ?? []);
      if (cfgRes.status === "fulfilled") setConfig(cfgRes.value);
      if (logRes.status === "fulfilled") setTradeLogs(logRes.value);
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
  }

  useEffect(() => { void loadAll(); }, []);

  async function updateConfig(patch: Partial<AutoConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    try {
      const updated = await apiFetch<AutoConfig>("/api/trading/config", {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      setConfig(updated);
    } catch (err) {
      toast({ title: "Config error", description: String(err), variant: "destructive" });
    }
  }

  function calcQty(price: number, usdtAmount: number): string {
    const raw = usdtAmount / price;
    if (price >= 10000) return Math.max(0.001, Math.floor(raw * 1000) / 1000).toFixed(3);
    if (price >= 100)   return Math.max(0.01,  Math.floor(raw * 100)  / 100 ).toFixed(2);
    if (price >= 1)     return Math.max(1,      Math.floor(raw * 10)   / 10  ).toFixed(1);
    return Math.max(10, Math.floor(raw)).toFixed(0);
  }

  async function executeOrder(sig: Signal) {
    setExecuting(sig.bybitSymbol);
    try {
      const qty = calcQty(sig.price, config.maxPositionUSDT);
      const slPrice = sig.stopLoss ?? sig.price * (1 - config.stopLossPct / 100);
      const tpPrice = sig.takeProfit ?? sig.price * (1 + config.takeProfitPct / 100);

      // Place market order first (no inline TP/SL to avoid Bybit precision errors)
      await apiFetch("/api/trading/order", {
        method: "POST",
        body: JSON.stringify({
          symbol: sig.bybitSymbol,
          side: "Buy",
          qty,
          takeProfit: tpPrice,
          stopLoss: slPrice,
        }),
      });

      toast({
        title: "Order Placed",
        description: `Buy ${qty} ${sig.symbol} — TP/SL being set on position`,
      });

      setTimeout(() => { void loadAll(true); }, 2500);
    } catch (err) {
      toast({ title: "Order Failed", description: String(err), variant: "destructive" });
    } finally {
      setExecuting(null);
    }
  }

  async function handleSetTPSL(symbol: string, tp: number, sl: number) {
    try {
      await apiFetch("/api/trading/position/tpsl", {
        method: "POST",
        body: JSON.stringify({ symbol, takeProfit: tp, stopLoss: sl }),
      });
      toast({ title: "TP/SL Updated", description: `${symbol} TP: $${tp.toFixed(4)} · SL: $${sl.toFixed(4)}` });
      void loadAll(true);
    } catch (err) {
      toast({ title: "TP/SL Failed", description: String(err), variant: "destructive" });
    }
  }

  const totalPnl = positions.reduce((sum, p) => sum + parseFloat(p.unrealisedPnl ?? "0"), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Bybit Auto Trading
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI-driven signals connected to Bybit Mainnet
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadAll(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Mainnet Warning */}
      <div className="flex items-start gap-2.5 rounded-lg border border-yellow-500/40 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-300">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">Mainnet aktif</span> — Semua order menggunakan uang nyata.
          Pastikan kamu memahami risikonya sebelum mengaktifkan Auto Mode.
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">USDT Balance</div>
              <div className="font-bold text-lg truncate">
                {balance !== null ? `$${formatUSDT(balance)}` : "—"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="h-5 w-5 text-blue-400 shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">Open Positions</div>
              <div className="font-bold text-lg">{positions.length}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CircleDollarSign className={`h-5 w-5 shrink-0 ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`} />
            <div>
              <div className="text-xs text-muted-foreground">Unrealised PnL</div>
              <div className={`font-bold text-lg ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {totalPnl >= 0 ? "+" : ""}{formatUSDT(totalPnl)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-green-400 shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">High-Conf Signals</div>
              <div className="font-bold text-lg">{signals.length}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Auto Trading Control */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Auto Trading Engine
            </CardTitle>
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
              {settingsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Mode</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {config.mode === "auto"
                  ? "Otomatis eksekusi tanpa konfirmasi"
                  : "Kamu klik tombol untuk eksekusi tiap sinyal"}
              </div>
            </div>
            <Tabs value={config.mode} onValueChange={(v) => void updateConfig({ mode: v as "auto" | "semi" })}>
              <TabsList className="h-8">
                <TabsTrigger value="semi" className="text-xs px-3">Semi-Auto</TabsTrigger>
                <TabsTrigger value="auto" className="text-xs px-3">Full Auto</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Power toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <Power className={`h-4 w-4 ${config.enabled ? "text-green-400" : "text-muted-foreground"}`} />
              <div>
                <div className="text-sm font-medium">
                  {config.enabled ? "Engine Aktif" : "Engine Mati"}
                </div>
                {config.mode === "auto" && (
                  <div className="text-xs text-muted-foreground">
                    Scan sinyal tiap {config.intervalMs / 1000}s
                  </div>
                )}
              </div>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => void updateConfig({ enabled: v })}
            />
          </div>

          {/* Settings panel */}
          {settingsOpen && (
            <div className="space-y-4 pt-2 border-t border-border">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-muted-foreground">Min Confidence</span>
                    <span className="font-semibold">{config.minConfidence}%</span>
                  </div>
                  <Slider
                    min={60} max={95} step={5}
                    value={[config.minConfidence]}
                    onValueChange={([v]) => void updateConfig({ minConfidence: v! })}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-muted-foreground">Max per Trade (USDT)</span>
                    <span className="font-semibold">${config.maxPositionUSDT}</span>
                  </div>
                  <Slider
                    min={10} max={500} step={10}
                    value={[config.maxPositionUSDT]}
                    onValueChange={([v]) => void updateConfig({ maxPositionUSDT: v! })}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-muted-foreground">Stop Loss</span>
                    <span className="font-semibold text-red-400">{config.stopLossPct}%</span>
                  </div>
                  <Slider
                    min={1} max={10} step={0.5}
                    value={[config.stopLossPct]}
                    onValueChange={([v]) => void updateConfig({ stopLossPct: v! })}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-muted-foreground">Take Profit</span>
                    <span className="font-semibold text-green-400">{config.takeProfitPct}%</span>
                  </div>
                  <Slider
                    min={1} max={20} step={0.5}
                    value={[config.takeProfitPct]}
                    onValueChange={([v]) => void updateConfig({ takeProfitPct: v! })}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-muted-foreground">Max Positions</span>
                    <span className="font-semibold">{config.maxPositions}</span>
                  </div>
                  <Slider
                    min={1} max={10} step={1}
                    value={[config.maxPositions]}
                    onValueChange={([v]) => void updateConfig({ maxPositions: v! })}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-muted-foreground">Leverage</span>
                    <span className="font-semibold">{config.leverage}x</span>
                  </div>
                  <Slider
                    min={1} max={10} step={1}
                    value={[config.leverage]}
                    onValueChange={([v]) => void updateConfig({ leverage: v! })}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Signals / Positions / Log */}
      <div>
        <div className="flex gap-1 border-b border-border mb-4">
          {(["signals", "positions", "log"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "signals"
                ? `Signals (${signals.length})`
                : tab === "positions"
                ? `Positions (${positions.length})`
                : "Trade Log"}
            </button>
          ))}
        </div>

        {/* Signals */}
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
                    onExecute={executeOrder}
                    executing={executing}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Positions */}
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

        {/* Log */}
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
                  <div key={log.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0 gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      {log.status === "executed" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                      ) : log.status === "rejected" ? (
                        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{log.symbol}</div>
                        <div className="text-xs text-muted-foreground">
                          {log.side} {log.qty} @ ${formatUSDT(log.price)} · {log.confidence}% confidence
                        </div>
                        {log.reason && (
                          <div className="text-xs text-red-400 truncate">{log.reason}</div>
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
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {tpslPos && (
        <TPSLDialog
          pos={tpslPos}
          config={config}
          onClose={() => setTpslPos(null)}
          onSave={handleSetTPSL}
        />
      )}
    </div>
  );
}
