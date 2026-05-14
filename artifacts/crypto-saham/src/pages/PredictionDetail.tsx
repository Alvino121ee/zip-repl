import React, { useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, TrendingUp, TrendingDown, Activity, BookOpen } from "lucide-react";
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
} from "recharts";

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
                  {detail?.image && (
                    <img src={detail.image} alt={detail?.assetName} className="w-14 h-14 rounded-full bg-muted"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  )}
                  <div>
                    <h1 className="text-xl font-bold">{detail?.assetName}</h1>
                    <p className="text-sm text-muted-foreground uppercase">{detail?.symbol} · {detail?.assetType}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {detail?.signal && <SignalBadge signal={detail.signal} className="text-sm px-3 py-1" />}
                  <p className="text-2xl font-bold tabular-nums">
                    {detail?.currentPrice != null ? formatCurrency(detail.currentPrice) : "–"}
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Price Chart (crypto only) */}
            {params.assetType === "crypto" && (
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
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis domain={[priceMin, priceMax]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(v > 999 ? 0 : 2)}${v > 999 ? "k" : ""}`} width={60} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                          formatter={(value: number) => [formatCurrency(value), "Harga"]}
                        />
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
                  <TechIndicatorRow label="RSI (14)" value={detail.technicalIndicators.rsi.toFixed(1)} badge={detail.technicalIndicators.rsi > 70 ? "Overbought" : detail.technicalIndicators.rsi < 30 ? "Oversold" : "Normal"} />
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
                        <div className="flex items-center gap-2 mt-1">
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
