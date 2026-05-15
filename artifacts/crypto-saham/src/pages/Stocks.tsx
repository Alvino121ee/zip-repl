import React, { useState } from "react";
import { Search, LineChart, TrendingUp, TrendingDown, Minus, ArrowUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceChange } from "@/components/shared/PriceChange";
import { LivePrice, LiveDot, UpdatedAgo } from "@/components/shared/LivePrice";
import { useGetStockMarket } from "@workspace/api-client-react";
import { formatCurrency, formatCompactNumber } from "@/lib/format";
import { isBEIOpen } from "@/hooks/use-animated-price";
import type { StockAsset } from "@workspace/api-client-react";

const REFETCH_MS = 10_000;

const SECTOR_MAP: Record<string, string> = {
  "BBCA.JK": "Perbankan", "BBRI.JK": "Perbankan", "BMRI.JK": "Perbankan",
  "BBNI.JK": "Perbankan", "BNGA.JK": "Perbankan", "BBTN.JK": "Perbankan",
  "BRIS.JK": "Perbankan",
  "TLKM.JK": "Telekomunikasi", "EXCL.JK": "Telekomunikasi", "ISAT.JK": "Telekomunikasi",
  "ASII.JK": "Otomotif", "AALI.JK": "Agrikultur",
  "UNVR.JK": "Konsumer", "ICBP.JK": "Konsumer", "INDF.JK": "Konsumer",
  "MYOR.JK": "Konsumer", "HMSP.JK": "Konsumer", "GGRM.JK": "Konsumer",
  "GOTO.JK": "Teknologi", "BUKA.JK": "Teknologi", "EMTK.JK": "Teknologi",
  "KLBF.JK": "Farmasi", "SIDO.JK": "Farmasi",
  "ANTM.JK": "Tambang", "ADRO.JK": "Energi", "PTBA.JK": "Energi",
  "INCO.JK": "Tambang", "TINS.JK": "Tambang", "MDKA.JK": "Tambang",
  "PGAS.JK": "Energi", "MEDC.JK": "Energi",
  "SMGR.JK": "Material",
};

export default function Stocks() {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState<string>("Semua");
  const beiOpen = isBEIOpen();

  const { data: stocks, isLoading, error, dataUpdatedAt } = useGetStockMarket(
    {},
    { query: { refetchInterval: REFETCH_MS } as any },
  );

  const idxStocks = (Array.isArray(stocks) ? stocks : []).filter(
    (s) => s.exchange?.includes("IDX") || s.exchange?.includes("Jakarta") || s.symbol?.endsWith(".JK")
  );

  const sectors = ["Semua", ...Array.from(new Set(idxStocks.map((s) => SECTOR_MAP[s.symbol] ?? "Lainnya"))).sort()];

  const filtered = idxStocks.filter((s) => {
    const matchSearch =
      search === "" ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.symbol.toLowerCase().includes(search.toLowerCase());
    const matchSector =
      sector === "Semua" || (SECTOR_MAP[s.symbol] ?? "Lainnya") === sector;
    return matchSearch && matchSector;
  });

  const gainers = [...idxStocks].filter((s) => s.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, 3);
  const losers = [...idxStocks].filter((s) => s.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LineChart className="h-6 w-6 text-primary" />
            Saham Indonesia (IDX / BEI)
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">Data dari Yahoo Finance · diperbarui tiap 10 detik</p>
            <LiveDot active={beiOpen} />
          </div>
          {stocks && <UpdatedAgo dataUpdatedAt={dataUpdatedAt} refetchIntervalMs={REFETCH_MS} />}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama atau kode saham..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/40"
          />
        </div>
      </div>

      {/* Top movers */}
      {!isLoading && idxStocks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-green-500" /> Top Gainers Hari Ini
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {gainers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Belum ada pergerakan positif</p>
              ) : gainers.map((s) => (
                <div key={s.symbol} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold">{s.symbol.replace(".JK", "")}</span>
                    <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">{s.name}</span>
                  </div>
                  <div className="text-right">
                    <LivePrice value={s.price} formatted={formatCurrency(s.price, "IDR")} className="text-sm" />
                    <PriceChange value={s.changePercent} className="text-xs justify-end" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Top Losers Hari Ini
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {losers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Belum ada pergerakan negatif</p>
              ) : losers.map((s) => (
                <div key={s.symbol} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold">{s.symbol.replace(".JK", "")}</span>
                    <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">{s.name}</span>
                  </div>
                  <div className="text-right">
                    <LivePrice value={s.price} formatted={formatCurrency(s.price, "IDR")} className="text-sm" />
                    <PriceChange value={s.changePercent} className="text-xs justify-end" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sector filter */}
      {!isLoading && (
        <div className="flex flex-wrap gap-1.5">
          {sectors.map((s) => (
            <button
              key={s}
              onClick={() => setSector(s)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sector === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/40 border-border hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">IDX / BEI</Badge>
              <span className="text-xs text-muted-foreground">{filtered.length} saham</span>
            </div>
            {search && (
              <button onClick={() => setSearch("")} className="text-xs text-primary hover:underline">
                Reset pencarian
              </button>
            )}
          </div>
          <StocksTable stocks={filtered} />
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground text-sm">
                Tidak ada saham yang cocok dengan &ldquo;{search}&rdquo;{sector !== "Semua" ? ` di sektor ${sector}` : ""}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

type SortKey = keyof Pick<StockAsset, "price" | "change" | "changePercent" | "marketCap">;

function StocksTable({ stocks }: { stocks: StockAsset[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "marketCap", dir: "desc" });

  const sorted = [...stocks].sort((a, b) => {
    const av = (a[sort.key] as number) ?? 0;
    const bv = (b[sort.key] as number) ?? 0;
    return sort.dir === "desc" ? bv - av : av - bv;
  });

  const toggleSort = (key: SortKey) =>
    setSort((prev) => prev.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" });

  function SortBtn({ label, k }: { label: string; k: SortKey }) {
    const active = sort.key === k;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`flex items-center justify-end gap-1 text-xs uppercase tracking-wider font-semibold w-full ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
      >
        {label} <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-30"}`} />
      </button>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="hidden md:grid grid-cols-[1fr_9rem_8rem_8rem_9rem_7rem] gap-3 px-4 py-3 border-b border-border bg-muted/30">
          <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Perusahaan</span>
          <SortBtn label="Harga" k="price" />
          <SortBtn label="Perubahan" k="change" />
          <SortBtn label="%" k="changePercent" />
          <SortBtn label="Mkt Cap" k="marketCap" />
          <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground text-right">Sektor</span>
        </div>
        <div className="divide-y divide-border/50">
          {sorted.map((stock) => <StockRow key={stock.symbol} stock={stock} />)}
        </div>
      </CardContent>
    </Card>
  );
}

function StockRow({ stock }: { stock: StockAsset }) {
  const sector = SECTOR_MAP[stock.symbol] ?? "Lainnya";
  const changeColor = stock.changePercent > 0 ? "text-green-500" : stock.changePercent < 0 ? "text-red-500" : "text-muted-foreground";
  const ChangeIcon = stock.changePercent > 0 ? TrendingUp : stock.changePercent < 0 ? TrendingDown : Minus;

  return (
    <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_9rem_8rem_8rem_9rem_7rem] gap-3 items-center px-4 py-3 hover:bg-muted/40 transition-colors">
      {/* Name */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold bg-primary/10 text-primary shrink-0">
            {stock.symbol.replace(".JK", "").slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{stock.name || stock.symbol}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground uppercase">{stock.symbol.replace(".JK", "")}</p>
              <span className="text-[10px] text-muted-foreground">·</span>
              <p className="text-[10px] text-muted-foreground">{sector}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="text-right md:hidden">
        <LivePrice value={stock.price} formatted={stock.price > 0 ? formatCurrency(stock.price, "IDR") : "N/A"} className="text-sm" />
        <div className={`flex items-center justify-end gap-0.5 text-xs ${changeColor}`}>
          <ChangeIcon className="h-3 w-3" />
          <span>{Math.abs(stock.changePercent).toFixed(2)}%</span>
        </div>
      </div>

      {/* Price (desktop) */}
      <div className="text-right hidden md:block">
        <LivePrice value={stock.price} formatted={stock.price > 0 ? formatCurrency(stock.price, "IDR") : "N/A"} className="text-sm" />
        {stock.high != null && stock.low != null && (
          <p className="text-[10px] text-muted-foreground">
            {formatCurrency(stock.low, "IDR")} – {formatCurrency(stock.high, "IDR")}
          </p>
        )}
      </div>

      {/* Change */}
      <div className="text-right hidden md:block">
        <p className={`text-sm tabular-nums font-medium ${changeColor}`}>
          {stock.change >= 0 ? "+" : ""}{formatCurrency(stock.change, "IDR")}
        </p>
      </div>

      {/* % */}
      <div className="text-right hidden md:block">
        <PriceChange value={stock.changePercent} className="text-sm justify-end" />
      </div>

      {/* Market Cap */}
      <div className="text-right hidden md:block">
        {stock.marketCap ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            Rp {formatCompactNumber(stock.marketCap)}
          </p>
        ) : <p className="text-sm text-muted-foreground">–</p>}
      </div>

      {/* Sector */}
      <div className="text-right hidden md:block">
        <Badge variant="outline" className="text-[10px]">{sector}</Badge>
      </div>
    </div>
  );
}
