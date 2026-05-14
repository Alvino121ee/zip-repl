import React, { useState } from "react";
import { Link } from "wouter";
import { Activity, Filter, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PriceChange } from "@/components/shared/PriceChange";
import { SignalBadge } from "@/components/shared/SignalBadge";
import { useGetPredictions, GetPredictionsType } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";

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

  const { data: predictions, isLoading, error } = useGetPredictions({
    limit: 20,
    type: type as typeof GetPredictionsType[keyof typeof GetPredictionsType],
  });

  const grouped = {
    strong_buy: (predictions ?? []).filter((p) => p.signal === "strong_buy"),
    buy: (predictions ?? []).filter((p) => p.signal === "buy"),
    neutral: (predictions ?? []).filter((p) => p.signal === "neutral"),
    sell: (predictions ?? []).filter((p) => p.signal === "sell"),
    strong_sell: (predictions ?? []).filter((p) => p.signal === "strong_sell"),
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

      {/* Legend */}
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
      ) : (predictions ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            Tidak ada prediksi tersedia untuk kategori ini.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(predictions ?? []).map((p) => (
            <Link key={`${p.assetType}-${p.assetId}`} href={`/predictions/${p.assetType}/${p.assetId}`}>
              <Card className="hover:border-primary/40 transition-colors cursor-pointer group h-full">
                <CardContent className="p-4 flex flex-col gap-3 h-full">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {p.image && (
                        <img src={p.image} alt={p.assetName} className="w-9 h-9 rounded-full bg-muted shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate group-hover:text-primary transition-colors">{p.assetName}</p>
                        <p className="text-xs text-muted-foreground uppercase">{p.symbol}</p>
                      </div>
                    </div>
                    <SignalBadge signal={p.signal} className="shrink-0" />
                  </div>

                  {/* Price */}
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold tabular-nums">
                      {p.currentPrice != null ? formatCurrency(p.currentPrice) : "–"}
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
