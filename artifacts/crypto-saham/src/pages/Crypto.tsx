import React, { useState } from "react";
import { Link } from "wouter";
import { Search, ArrowUpDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceChange } from "@/components/shared/PriceChange";
import { LivePrice, LiveDot, UpdatedAgo } from "@/components/shared/LivePrice";
import { useGetCryptoMarket } from "@workspace/api-client-react";
import { formatCurrency, formatCompactNumber } from "@/lib/format";
import type { CryptoAsset } from "@workspace/api-client-react";

const REFETCH_MS = 10_000;

type SortKey = "market_cap_rank" | "current_price" | "price_change_percentage_24h" | "price_change_percentage_7d" | "total_volume";

export default function Crypto() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("market_cap_rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: coins, isLoading, error, dataUpdatedAt } = useGetCryptoMarket(
    { limit: 50 },
    { query: { refetchInterval: REFETCH_MS } as any },
  );

  const filtered = (coins ?? [])
    .filter((c) =>
      search === "" ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.symbol.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortHeader({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col;
    return (
      <button
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 text-xs uppercase tracking-wider font-semibold hover:text-foreground transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
      </button>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Crypto Market
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">Harga kripto live dari CoinGecko</p>
            <LiveDot active={true} />
          </div>
          {coins && <UpdatedAgo dataUpdatedAt={dataUpdatedAt} refetchIntervalMs={REFETCH_MS} />}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama atau simbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/40"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="hidden md:grid grid-cols-[2rem_1fr_9rem_8rem_8rem_8rem_9rem] gap-3 px-4 py-3 border-b border-border bg-muted/30">
            <SortHeader col="market_cap_rank" label="#" />
            <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Nama</span>
            <div className="text-right"><SortHeader col="current_price" label="Harga" /></div>
            <div className="text-right"><SortHeader col="price_change_percentage_24h" label="24H %" /></div>
            <div className="text-right"><SortHeader col="price_change_percentage_7d" label="7D %" /></div>
            <div className="text-right"><SortHeader col="total_volume" label="Volume" /></div>
            <div className="text-right">
              <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Mkt Cap</span>
            </div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="px-4 py-3"><Skeleton className="h-8 w-full" /></div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p>Gagal memuat data. Silakan coba lagi.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map((coin) => (
                <CryptoRow key={coin.id} coin={coin} />
              ))}
              {filtered.length === 0 && (
                <div className="py-16 text-center text-muted-foreground text-sm">
                  Tidak ada aset yang cocok dengan pencarian &ldquo;{search}&rdquo;
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CryptoRow({ coin }: { coin: CryptoAsset }) {
  return (
    <Link href={`/predictions/crypto/${coin.id}`}>
      <div className="grid grid-cols-[auto_1fr] md:grid-cols-[2rem_1fr_9rem_8rem_8rem_8rem_9rem] gap-3 items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer">
        <span className="text-xs text-muted-foreground hidden md:block text-center">{coin.market_cap_rank}</span>

        <div className="flex items-center gap-3">
          <img src={coin.image} alt={coin.name} className="w-8 h-8 rounded-full bg-muted shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{coin.name}</p>
            <p className="text-xs text-muted-foreground uppercase">{coin.symbol}</p>
          </div>
          <span className="text-xs text-muted-foreground md:hidden ml-auto">#{coin.market_cap_rank}</span>
        </div>

        <div className="text-right hidden md:block">
          <LivePrice
            value={coin.current_price}
            formatted={formatCurrency(coin.current_price)}
            className="text-sm"
          />
        </div>

        <div className="text-right hidden md:block">
          <PriceChange value={coin.price_change_percentage_24h} className="text-sm justify-end" />
        </div>

        <div className="text-right hidden md:block">
          <PriceChange value={coin.price_change_percentage_7d ?? undefined} className="text-sm justify-end" />
        </div>

        <div className="text-right hidden md:block">
          <p className="text-sm text-muted-foreground tabular-nums">${formatCompactNumber(coin.total_volume)}</p>
        </div>

        <div className="text-right hidden md:block">
          <p className="text-sm text-muted-foreground tabular-nums">${formatCompactNumber(coin.market_cap)}</p>
        </div>

        <div className="text-right md:hidden col-span-1">
          <LivePrice
            value={coin.current_price}
            formatted={formatCurrency(coin.current_price)}
            className="text-sm block"
          />
          <PriceChange value={coin.price_change_percentage_24h} className="text-xs justify-end mt-0.5" />
        </div>
      </div>
    </Link>
  );
}
