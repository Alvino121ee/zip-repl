import React, { useState } from "react";
import { Newspaper, ExternalLink, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetNews, GetNewsType } from "@workspace/api-client-react";
import { formatDate } from "@/lib/format";
import type { NewsArticle } from "@workspace/api-client-react";

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  if (!sentiment) return null;
  const styles: Record<string, string> = {
    positive: "border-green-500/40 text-green-600 bg-green-500/5",
    negative: "border-red-500/40 text-red-600 bg-red-500/5",
    neutral: "border-yellow-500/40 text-yellow-600 bg-yellow-500/5",
  };
  const labels: Record<string, string> = { positive: "Positif", negative: "Negatif", neutral: "Netral" };
  return (
    <Badge variant="outline" className={`text-[10px] ${styles[sentiment] ?? ""}`}>
      {labels[sentiment] ?? sentiment}
    </Badge>
  );
}

function NewsCard({ item }: { item: NewsArticle }) {
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
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider self-center">Sentimen Berita:</span>
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
  const [type, setType] = useState<"all" | "crypto" | "stock">("all");

  const { data: news, isLoading, error } = useGetNews({
    limit: 20,
    type: type as typeof GetNewsType[keyof typeof GetNewsType],
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-primary" />
            News Feed
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Berita pasar dengan analisis sentimen otomatis</p>
        </div>
        <Tabs value={type} onValueChange={(v) => setType(v as "all" | "crypto" | "stock")}>
          <TabsList>
            <TabsTrigger value="all">Semua</TabsTrigger>
            <TabsTrigger value="crypto">Crypto</TabsTrigger>
            <TabsTrigger value="stock">Saham</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {!isLoading && news && news.length > 0 && <SentimentSummary items={news} />}

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
      ) : (Array.isArray(news) ? news : []).length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            Tidak ada berita tersedia saat ini.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(Array.isArray(news) ? news : []).map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
