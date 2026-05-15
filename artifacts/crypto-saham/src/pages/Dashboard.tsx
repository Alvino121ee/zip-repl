import React from "react";
import { Link } from "wouter";
import { Activity, DollarSign, BarChart2, Zap, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PriceChange } from "@/components/shared/PriceChange";
import { SignalBadge } from "@/components/shared/SignalBadge";
import { LivePrice, LiveDot, UpdatedAgo } from "@/components/shared/LivePrice";
import { isBEIOpen } from "@/hooks/use-animated-price";
import {
  useGetMarketOverview,
  useGetTrending,
  useGetCryptoMarket,
  useGetPredictions,
  useGetStockMarket,
} from "@workspace/api-client-react";
import { formatCurrency, formatCompactNumber, formatPercentage } from "@/lib/format";

const REFETCH_STOCKS = 10_000;
const REFETCH_CRYPTO = 10_000;

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
        Crypto Fear & Greed Index
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
  const beiOpen = isBEIOpen();

  const { data: overview, isLoading: ovLoading } = useGetMarketOverview(
    { query: { refetchInterval: 15_000 } as any }
  );
  const { data: trending, isLoading: trendLoading } = useGetTrending(
    { query: { refetchInterval: REFETCH_CRYPTO } as any }
  );
  const { data: cryptos, isLoading: cryptoLoading, dataUpdatedAt: cryptoUpdatedAt } = useGetCryptoMarket(
    { limit: 5 },
    { query: { refetchInterval: REFETCH_CRYPTO } as any }
  );
  const { data: predictions, isLoading: predLoading } = useGetPredictions(
    { limit: 5, type: "stock" },
    { query: { refetchInterval: REFETCH_STOCKS } as any }
  );
  const { data: stocks, isLoading: stockLoading, dataUpdatedAt: stockUpdatedAt } = useGetStockMarket(
    {},
    { query: { refetchInterval: REFETCH_STOCKS } as any }
  );

  const idxStocks = (Array.isArray(stocks) ? stocks : [])
    .filter((s) => s.symbol?.endsWith(".JK") || s.exchange?.includes("IDX") || s.exchange?.includes("Jakarta"))
    .slice(0, 8);

  const gainers = [...idxStocks].filter((s) => s.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, 3);
  const losers = [...idxStocks].filter((s) => s.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">Saham Indonesia (IDX) &amp; pasar kripto global</p>
            <LiveDot active={beiOpen} />
          </div>
          {stocks && <UpdatedAgo dataUpdatedAt={stockUpdatedAt} refetchIntervalMs={REFETCH_STOCKS} />}
        </div>
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

      {/* IDX Top Movers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-green-500" /> Top Gainers IDX
            </CardTitle>
            <Link href="/stocks" className="text-xs text-primary hover:underline">Lihat semua →</Link>
          </CardHeader>
          <CardContent>
            {stockLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : gainers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Belum ada pergerakan positif</p>
            ) : (
              <div className="space-y-0.5">
                {gainers.map((s) => (
                  <Link key={s.symbol} href="/stocks">
                    <div className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-green-500/10 flex items-center justify-center text-[10px] font-bold text-green-600">
                          {s.symbol.replace(".JK", "").slice(0, 4)}
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-none">{s.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.symbol.replace(".JK", "")} · IDX</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <LivePrice value={s.price} formatted={formatCurrency(s.price, "IDR")} className="text-sm" />
                        <PriceChange value={s.changePercent} className="text-xs justify-end mt-0.5" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Top Losers IDX
            </CardTitle>
            <Link href="/stocks" className="text-xs text-primary hover:underline">Lihat semua →</Link>
          </CardHeader>
          <CardContent>
            {stockLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : losers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Belum ada pergerakan negatif</p>
            ) : (
              <div className="space-y-0.5">
                {losers.map((s) => (
                  <Link key={s.symbol} href="/stocks">
                    <div className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-red-500/10 flex items-center justify-center text-[10px] font-bold text-red-600">
                          {s.symbol.replace(".JK", "").slice(0, 4)}
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-none">{s.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.symbol.replace(".JK", "")} · IDX</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <LivePrice value={s.price} formatted={formatCurrency(s.price, "IDR")} className="text-sm" />
                        <PriceChange value={s.changePercent} className="text-xs justify-end mt-0.5" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Fear & Greed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Indeks Sentimen Kripto</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center pb-4">
            {ovLoading ? <Skeleton className="h-28 w-40" /> : (
              <FearGreedGauge value={overview?.fearGreedIndex ?? 50} label={overview?.fearGreedLabel ?? "Neutral"} />
            )}
          </CardContent>
        </Card>

        {/* Trending Crypto */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trending Crypto</CardTitle>
              <LiveDot active={true} />
            </div>
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
                        {coin.currentPrice != null && (
                          <LivePrice value={coin.currentPrice} formatted={formatCurrency(coin.currentPrice)} className="text-sm" />
                        )}
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
        {/* IDX Stocks Overview */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saham IDX</CardTitle>
              <Badge variant="outline" className="text-[10px]">BEI</Badge>
            </div>
            <div className="flex items-center gap-2">
              {stocks && <UpdatedAgo dataUpdatedAt={stockUpdatedAt} refetchIntervalMs={REFETCH_STOCKS} />}
              <Link href="/stocks" className="text-xs text-primary hover:underline">Lihat semua →</Link>
            </div>
          </CardHeader>
          <CardContent>
            {stockLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
              <div className="divide-y divide-border/50">
                {idxStocks.slice(0, 6).map((s) => (
                  <Link key={s.symbol} href="/stocks">
                    <div className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1 hover:bg-muted/30 rounded px-1 -mx-1 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">
                          {s.symbol.replace(".JK", "").slice(0, 4)}
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-none">{s.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.symbol.replace(".JK", "")}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <LivePrice value={s.price} formatted={formatCurrency(s.price, "IDR")} className="text-sm" />
                        <PriceChange value={s.changePercent} className="text-xs justify-end mt-0.5" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Predictions */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prediksi AI – Saham IDX</CardTitle>
            <Link href="/predictions" className="text-xs text-primary hover:underline">Lihat semua →</Link>
          </CardHeader>
          <CardContent>
            {predLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
              <div className="divide-y divide-border/50">
                {(Array.isArray(predictions) ? predictions : []).map((p) => (
                  <Link key={p.assetId} href={`/predictions/${p.assetType}/${p.assetId}`}>
                    <div className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1 hover:bg-muted/30 rounded px-1 -mx-1 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        {p.image ? (
                          <img src={p.image} alt={p.assetName} className="w-7 h-7 rounded-full bg-muted"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">
                            {p.symbol.replace(".JK", "").slice(0, 4)}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium leading-none">{p.assetName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{p.symbol.replace(".JK", "")}</p>
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

      {/* Top Crypto */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Crypto Global</CardTitle>
            <LiveDot active={true} />
          </div>
          <div className="flex items-center gap-2">
            {cryptos && <UpdatedAgo dataUpdatedAt={cryptoUpdatedAt} refetchIntervalMs={REFETCH_CRYPTO} />}
            <Link href="/crypto" className="text-xs text-primary hover:underline">Lihat semua →</Link>
          </div>
        </CardHeader>
        <CardContent>
          {cryptoLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {(Array.isArray(cryptos) ? cryptos : []).map((coin) => (
                <Link key={coin.id} href="/crypto">
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer">
                    <img src={coin.image} alt={coin.name} className="w-8 h-8 rounded-full bg-muted shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{coin.name}</p>
                      <LivePrice value={coin.current_price} formatted={formatCurrency(coin.current_price)} className="text-sm" />
                      <PriceChange value={coin.price_change_percentage_24h} className="text-xs" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
