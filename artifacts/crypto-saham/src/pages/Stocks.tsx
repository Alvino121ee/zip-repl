import React, { useState } from "react";
import { Search, LineChart, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PriceChange } from "@/components/shared/PriceChange";
import { useGetStockMarket } from "@workspace/api-client-react";
import { formatCurrency, formatCompactNumber } from "@/lib/format";
import type { StockAsset } from "@workspace/api-client-react";

export default function Stocks() {
  const [search, setSearch] = useState("");
  const { data: stocks, isLoading, error } = useGetStockMarket();

  const filtered = (stocks ?? []).filter((s) =>
    search === "" ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const idxStocks = filtered.filter((s) => s.exchange?.includes("IDX") || s.exchange?.includes("Indonesia") || s.symbol?.endsWith(".JK"));
  const globalStocks = filtered.filter((s) => !s.exchange?.includes("IDX") && !s.exchange?.includes("Indonesia") && !s.symbol?.endsWith(".JK"));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LineChart className="h-6 w-6 text-primary" />
            Stock Market
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Saham IDX & global – harga indikatif</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama atau ticker..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/40"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="py-4"><Skeleton className="h-10 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Gagal memuat data saham. Silakan coba lagi.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {idxStocks.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Saham Indonesia (IDX)</h2>
                <Badge variant="outline" className="text-[10px]">BEI</Badge>
              </div>
              <StocksTable stocks={idxStocks} />
            </section>
          )}
          {globalStocks.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Saham Global</h2>
                <Badge variant="outline" className="text-[10px]">NASDAQ / NYSE</Badge>
              </div>
              <StocksTable stocks={globalStocks} />
            </section>
          )}
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground text-sm">
                Tidak ada saham yang cocok dengan &ldquo;{search}&rdquo;
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function StocksTable({ stocks }: { stocks: StockAsset[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="hidden md:grid grid-cols-[1fr_8rem_8rem_8rem_8rem_6rem] gap-3 px-4 py-3 border-b border-border bg-muted/30">
          {["Perusahaan", "Harga", "Perubahan", "24H %", "Market Cap", "Bursa"].map((h, i) => (
            <span key={i} className={`text-xs uppercase tracking-wider font-semibold text-muted-foreground ${i > 0 ? "text-right" : ""}`}>{h}</span>
          ))}
        </div>
        <div className="divide-y divide-border/50">
          {stocks.map((stock) => <StockRow key={stock.symbol} stock={stock} />)}
        </div>
      </CardContent>
    </Card>
  );
}

function StockRow({ stock }: { stock: StockAsset }) {
  const isIDX = stock.exchange?.includes("IDX") || stock.exchange?.includes("Indonesia") || stock.symbol?.endsWith(".JK");
  const currency = isIDX ? "IDR" : stock.currency ?? "USD";

  return (
    <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_8rem_8rem_8rem_8rem_6rem] gap-3 items-center px-4 py-3 hover:bg-muted/40 transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold truncate">{stock.name || stock.symbol}</p>
          {stock.price === 0 && (
            <Tooltip>
              <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
              <TooltipContent>Data harga tidak tersedia saat ini</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-xs text-muted-foreground uppercase">{stock.symbol}</p>
      </div>

      {/* Price */}
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">
          {stock.price > 0 ? formatCurrency(stock.price, currency) : <span className="text-muted-foreground">N/A</span>}
        </p>
        <PriceChange value={stock.changePercent} className="text-xs justify-end mt-0.5 md:hidden" />
      </div>

      {/* Change (desktop) */}
      <div className="text-right hidden md:block">
        <p className={`text-sm tabular-nums font-medium ${stock.change >= 0 ? "text-green-500" : "text-red-500"}`}>
          {stock.change >= 0 ? "+" : ""}{formatCurrency(stock.change, currency)}
        </p>
      </div>

      {/* Change % (desktop) */}
      <div className="text-right hidden md:block">
        <PriceChange value={stock.changePercent} className="text-sm justify-end" />
      </div>

      {/* Market Cap (desktop) */}
      <div className="text-right hidden md:block">
        <p className="text-sm text-muted-foreground tabular-nums">
          {stock.marketCap ? `$${formatCompactNumber(stock.marketCap)}` : "–"}
        </p>
      </div>

      {/* Exchange (desktop) */}
      <div className="text-right hidden md:block">
        <Badge variant="outline" className="text-[10px]">{stock.exchange || "–"}</Badge>
      </div>
    </div>
  );
}
