import React from "react";
import { Link } from "wouter";
import { Activity, DollarSign, BarChart2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceChange } from "@/components/shared/PriceChange";
import { SignalBadge } from "@/components/shared/SignalBadge";
import {
  useGetMarketOverview,
  useGetTrending,
  useGetCryptoMarket,
  useGetPredictions,
} from "@workspace/api-client-react";
import { formatCurrency, formatCompactNumber, formatPercentage } from "@/lib/format";

function FearGreedGauge({ value, label }: { value: number; label: string }) {
  const color =
    value >= 75 ? "#22c55e" :
    value >= 55 ? "#86efac" :
    value <= 25 ? "#ef4444" :
    value <= 45 ? "#f97316" :
    "#eab308";
  const angle = (value / 100) * 180 - 90;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-20">
        <svg viewBox="0 0 120 65" className="w-full h-full">
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="25%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#86efac" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="#27272a" strokeWidth="10" strokeLinecap="round" />
          <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="url(#gaugeGrad)" strokeWidth="8" strokeLinecap="round" />
          <g transform={`translate(60,60) rotate(${angle})`}>
            <line x1="0" y1="4" x2="0" y2="-42" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="0" cy="0" r="4" fill="white" />
          </g>
        </svg>
      </div>
      <div className="text-3xl font-bold -mt-2" style={{ color }}>{value}</div>
      <div className="text-sm font-semibold mt-0.5" style={{ color }}>{label}</div>
      <p className="text-xs text-muted-foreground mt-1.5 text-center max-w-[160px]">
        Crypto Fear & Greed Index (Alternative.me)
      </p>
    </div>
  );
}

function StatCard({ title, value, sub, icon: Icon, colorClass }: {
  title: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ElementType; colorClass: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">{title}</p>
            <p className="text-lg font-bold mt-1 truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg shrink-0 ${colorClass}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: overview, isLoading: ovLoading } = useGetMarketOverview();
  const { data: trending, isLoading: trendLoading } = useGetTrending();
  const { data: cryptos, isLoading: cryptoLoading } = useGetCryptoMarket({ limit: 5 });
  const { data: predictions, isLoading: predLoading } = useGetPredictions({ limit: 5, type: "crypto" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Ringkasan pasar crypto &amp; saham real-time</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ovLoading ? Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-5"><Skeleton className="h-14 w-full" /></CardContent></Card>
        )) : (<>
          <StatCard title="Total Market Cap" value={`$${formatCompactNumber(overview?.totalMarketCap)}`}
            sub={overview?.marketCapChange24h != null ? <span className={overview.marketCapChange24h >= 0 ? "text-green-500" : "text-red-500"}>{formatPercentage(overview.marketCapChange24h)} (24h)</span> : undefined}
            icon={DollarSign} colorClass="bg-blue-500/10 text-blue-500" />
          <StatCard title="Volume 24H" value={`$${formatCompactNumber(overview?.totalVolume24h)}`}
            icon={BarChart2} colorClass="bg-purple-500/10 text-purple-500" />
          <StatCard title="Dominasi BTC" value={`${overview?.btcDominance?.toFixed(1)}%`}
            sub={`ETH ${overview?.ethDominance?.toFixed(1)}%`}
            icon={Activity} colorClass="bg-orange-500/10 text-orange-500" />
          <StatCard title="Aktif Kripto" value={formatCompactNumber(overview?.activeCryptocurrencies)}
            icon={Zap} colorClass="bg-green-500/10 text-green-500" />
        </>)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Fear & Greed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Indeks Sentimen</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center pb-4">
            {ovLoading ? <Skeleton className="h-28 w-40" /> : (
              <FearGreedGauge value={overview?.fearGreedIndex ?? 50} label={overview?.fearGreedLabel ?? "Neutral"} />
            )}
          </CardContent>
        </Card>

        {/* Trending */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trending Crypto</CardTitle>
            <Link href="/crypto" className="text-xs text-primary hover:underline">Lihat semua →</Link>
          </CardHeader>
          <CardContent>
            {trendLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
              <div className="space-y-0.5">
                {(trending?.cryptos ?? []).slice(0, 5).map((coin) => (
                  <Link key={coin.id} href="/crypto">
                    <div className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <img src={coin.image} alt={coin.name} className="w-7 h-7 rounded-full bg-muted"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        <div>
                          <p className="text-sm font-medium leading-none">{coin.name}</p>
                          <p className="text-xs text-muted-foreground uppercase mt-0.5">{coin.symbol}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {coin.currentPrice != null && <p className="text-sm font-medium">{formatCurrency(coin.currentPrice)}</p>}
                        <PriceChange value={coin.priceChangePercent24h} className="text-xs justify-end mt-0.5" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Crypto by Market Cap */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Crypto</CardTitle>
            <Link href="/crypto" className="text-xs text-primary hover:underline">Lihat semua →</Link>
          </CardHeader>
          <CardContent>
            {cryptoLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
              <div className="divide-y divide-border/50">
                {(cryptos ?? []).map((coin) => (
                  <div key={coin.id} className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{coin.market_cap_rank}</span>
                      <img src={coin.image} alt={coin.name} className="w-7 h-7 rounded-full bg-muted"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div>
                        <p className="text-sm font-medium leading-none">{coin.name}</p>
                        <p className="text-xs text-muted-foreground uppercase mt-0.5">{coin.symbol}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(coin.current_price)}</p>
                      <PriceChange value={coin.price_change_percentage_24h} className="text-xs justify-end mt-0.5" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Predictions */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Prediksi AI</CardTitle>
            <Link href="/predictions" className="text-xs text-primary hover:underline">Lihat semua →</Link>
          </CardHeader>
          <CardContent>
            {predLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
              <div className="divide-y divide-border/50">
                {(predictions ?? []).map((p) => (
                  <Link key={p.assetId} href={`/predictions/${p.assetType}/${p.assetId}`}>
                    <div className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1 hover:bg-muted/30 rounded px-1 -mx-1 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        {p.image && (
                          <img src={p.image} alt={p.assetName} className="w-7 h-7 rounded-full bg-muted"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        )}
                        <div>
                          <p className="text-sm font-medium leading-none">{p.assetName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{p.symbol}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">Keyakinan</p>
                          <p className="text-sm font-bold">{p.confidence}%</p>
                        </div>
                        <SignalBadge signal={p.signal} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
