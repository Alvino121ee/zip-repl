import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Activity, Filter, Lock, RefreshCw, Unlock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PriceChange } from "@/components/shared/PriceChange";
import { SignalBadge } from "@/components/shared/SignalBadge";
import { useGetPredictions, GetPredictionsType } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";

/** Must match server-side PREDICTION_LOCK_MS in cache.ts */
const PREDICTION_LOCK_MS = 5 * 60 * 1000;

const LOCK_OPTIONS_SECS = [60, 2 * 60, 5 * 60, 10 * 60, 15 * 60] as const;

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PredictionLockBanner({
  dataUpdatedAt,
  lockMs,
  onChangeLock,
}: {
  dataUpdatedAt: number;
  lockMs: number;
  onChangeLock: (ms: number) => void;
}) {
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
    <div
      className={`rounded-xl border p-3.5 flex flex-col gap-2.5 transition-all duration-500 ${
        unlocking
          ? "border-green-500/60 bg-green-500/10"
          : isExpired
          ? "border-yellow-500/40 bg-yellow-500/5"
          : "border-primary/20 bg-muted/30"
      }`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          {unlocking ? (
            <Unlock className="h-4 w-4 text-green-400 animate-bounce" />
          ) : isExpired ? (
            <RefreshCw className="h-4 w-4 text-yellow-400 animate-spin" />
          ) : (
            <Lock className="h-4 w-4 text-primary" />
          )}
          <div>
            <p className="text-sm font-semibold leading-none">
              {unlocking
                ? "Prediksi Diperbarui!"
                : isExpired
                ? "Memuat prediksi baru…"
                : "Prediksi Terkunci"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {unlocking
                ? "Sinyal AI terbaru sudah tersedia"
                : isExpired
                ? "Menunggu data baru dari server"
                : `Sinyal tidak berubah selama ${Math.round(lockMs / 60_000)} menit`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Lock duration selector */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {LOCK_OPTIONS_SECS.map((secs) => {
              const ms = secs * 1000;
              const label = secs < 60 ? `${secs}d` : `${secs / 60}m`;
              return (
                <button
                  key={secs}
                  onClick={() => onChangeLock(ms)}
                  className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors ${
                    lockMs === ms
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Countdown */}
          {!isExpired && !unlocking && (
            <div className="text-right min-w-[48px]">
              <p className="text-lg font-bold tabular-nums leading-none text-primary">
                {formatCountdown(remaining)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">tersisa</p>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            unlocking
              ? "bg-green-500"
              : isExpired
              ? "bg-yellow-500 animate-pulse"
              : "bg-primary"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

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

export default function Predictions() {
  const [type, setType] = useState<"all" | "crypto" | "stock">("crypto");
  const [lockMs, setLockMs] = useState(PREDICTION_LOCK_MS);

  const { data: predictions, isLoading, error, dataUpdatedAt } = useGetPredictions(
    {
      limit: 20,
      type: type as typeof GetPredictionsType[keyof typeof GetPredictionsType],
    },
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

  return (
    <div className="space-y-5">
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

      {/* Lock banner — always shown once data is loaded */}
      {!isLoading && (
        <PredictionLockBanner
          dataUpdatedAt={dataUpdatedAt}
          lockMs={lockMs}
          onChangeLock={setLockMs}
        />
      )}

      {/* Signal distribution legend */}
      {!isLoading && predictions && predictions.length > 0 && (
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
            <span className="text-xs text-muted-foreground">
              Terkunci {Math.round(lockMs / 60_000)} menit
            </span>
          </div>
        </div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-36 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Gagal memuat prediksi. Silakan coba lagi.
          </CardContent>
        </Card>
      ) : predArray.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            Tidak ada prediksi tersedia untuk kategori ini.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {predArray.map((p) => (
            <Link key={`${p.assetType}-${p.assetId}`} href={`/predictions/${p.assetType}/${p.assetId}`}>
              <Card className="hover:border-primary/40 transition-colors cursor-pointer group h-full">
                <CardContent className="p-4 flex flex-col gap-3 h-full">
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
                        <p className="text-sm font-bold truncate group-hover:text-primary transition-colors">{p.assetName}</p>
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
                  <div className="flex items-center justify-between mt-auto">
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
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
