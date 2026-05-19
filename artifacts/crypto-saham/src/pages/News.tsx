import React, { useState } from "react";
import { Newspaper, ExternalLink, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetNews, GetNewsType } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { formatDate } from "@/lib/format";
import type { NewsArticle } from "@workspace/api-client-react";

type NewsTab = "forex" | "all" | "crypto" | "stock";

async function fetchForexNews(): Promise<NewsArticle[]> {
  const res = await fetch("/api/news?type=forex&limit=30");
  if (!res.ok) throw new Error("Failed to fetch forex news");
  return res.json();
}

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  if (!sentiment) return null;
  const styles: Record<string, string> = {
    positive: "border-green-500/40 text-green-600 bg-green-500/5",
    negative: "border-red-500/40 text-red-600 bg-red-500/5",
    neutral:  "border-yellow-500/40 text-yellow-600 bg-yellow-500/5",
  };
  const labels: Record<string, string> = { positive: "Positif", negative: "Negatif", neutral: "Netral" };
  return (
    <Badge variant="outline" className={`text-[10px] ${styles[sentiment] ?? ""}`}>
      {labels[sentiment] ?? sentiment}
    </Badge>
  );
}

function TypeBadge({ type }: { type?: string }) {
  if (!type || type === "general") return null;
  const styles: Record<string, string> = {
    forex:  "border-blue-500/40 text-blue-400 bg-blue-500/5",
    crypto: "border-orange-500/40 text-orange-400 bg-orange-500/5",
    stock:  "border-purple-500/40 text-purple-400 bg-purple-500/5",
  };
  const labels: Record<string, string> = { forex: "Forex", crypto: "Crypto", stock: "Saham" };
  return (
    <Badge variant="outline" className={`text-[10px] ${styles[type] ?? ""}`}>
      {labels[type] ?? type}
    </Badge>
  );
}

function NewsCard({ item, showType }: { item: NewsArticle; showType?: boolean }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="group block">
      <Card className="hover:border-primary/40 transition-all duration-200 group-hover:shadow-md">
        <CardContent className="p-0">
          <div className="flex gap-0">
            {item.imageUrl && (
              <div className="shrink-0 w-28 sm:w-36 overflow-hidden rounded-l-lg">
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  style={{ minHeight: "100px" }}
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                />
              </div>
            )}
            <div className="flex-1 p-4 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2 flex-1">
                  {item.title}
                </h3>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {item.summary && (
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{item.summary}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <Badge variant="secondary" className="text-[10px] h-5">{item.source}</Badge>
                {showType && <TypeBadge type={item.type} />}
                <SentimentBadge sentiment={item.sentiment} />
                {(item.relatedAssets ?? []).slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] h-5 text-muted-foreground">{tag}</Badge>
                ))}
                <div className="flex items-center gap-1 ml-auto text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {item.publishedAt ? formatDate(item.publishedAt) : "–"}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </a>
  );
}

function SentimentSummary({ items }: { items: NewsArticle[] }) {
  const pos = items.filter((n) => n.sentiment === "positive").length;
  const neg = items.filter((n) => n.sentiment === "negative").length;
  const neu = items.filter((n) => n.sentiment === "neutral").length;
  const total = items.length;
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap gap-4 p-4 bg-muted/30 rounded-lg border border-border">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider self-center">Sentimen:</span>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs"><span className="font-bold text-green-500">{pos}</span> Positif</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-xs"><span className="font-bold text-red-500">{neg}</span> Negatif</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-yellow-500" />
        <span className="text-xs"><span className="font-bold text-yellow-500">{neu}</span> Netral</span>
      </div>
      <div className="ml-auto flex-1 min-w-[120px]">
        <div className="flex h-2 rounded-full overflow-hidden bg-muted">
          {pos > 0 && <div className="bg-green-500 transition-all" style={{ width: `${(pos / total) * 100}%` }} />}
          {neu > 0 && <div className="bg-yellow-500 transition-all" style={{ width: `${(neu / total) * 100}%` }} />}
          {neg > 0 && <div className="bg-red-500 transition-all" style={{ width: `${(neg / total) * 100}%` }} />}
        </div>
      </div>
    </div>
  );
}

export default function News() {
  const [tab, setTab] = useState<NewsTab>("forex");

  const { data: forexData, isLoading: forexLoading, error: forexError } = useQuery({
    queryKey: ["news", "forex"],
    queryFn: fetchForexNews,
    staleTime: 5 * 60 * 1000,
    enabled: tab === "forex",
  });

  const { data: otherData, isLoading: otherLoading, error: otherError } = useGetNews(
    {
      limit: 30,
      type: tab === "crypto"
        ? GetNewsType.crypto
        : tab === "stock"
        ? GetNewsType.stock
        : GetNewsType.all,
    },
    { enabled: tab !== "forex" },
  );

  const news: NewsArticle[] = tab === "forex"
    ? (Array.isArray(forexData) ? forexData : [])
    : (Array.isArray(otherData) ? otherData : []);

  const isLoading = tab === "forex" ? forexLoading : otherLoading;
  const error     = tab === "forex" ? forexError  : otherError;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-primary" />
            News Feed
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Berita pasar terkini dengan analisis sentimen otomatis —{" "}
            <span className="text-blue-400 font-medium">Forex diutamakan</span>
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as NewsTab)}>
          <TabsList>
            <TabsTrigger value="forex" className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Forex
            </TabsTrigger>
            <TabsTrigger value="all">Semua</TabsTrigger>
            <TabsTrigger value="crypto">Crypto</TabsTrigger>
            <TabsTrigger value="stock">Saham</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "forex" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-400">
          <TrendingUp className="h-4 w-4 shrink-0" />
          <span>
            Sumber: <strong>FXStreet · DailyFX · ForexLive · ForexCrunch · Investing.com Forex</strong>
            {" "}— diperbarui setiap 5 menit
          </span>
        </div>
      )}

      {!isLoading && news.length > 0 && <SentimentSummary items={news} />}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Gagal memuat berita. Silakan coba lagi.
          </CardContent>
        </Card>
      ) : news.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            Tidak ada berita tersedia saat ini.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {news.map((item) => (
            <NewsCard key={item.id} item={item} showType={tab === "all"} />
          ))}
        </div>
      )}
    </div>
  );
}
