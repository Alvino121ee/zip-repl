import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, TrendingUp, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useGetMarketOverview, useGetPredictions } from "@workspace/api-client-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const STARTER_QUESTIONS = [
  "Bagaimana kondisi pasar crypto hari ini?",
  "Jelaskan strategi scalping 5M yang efektif",
  "Apa itu Smart Money Concepts?",
  "Bagaimana cara membaca RSI dan MACD?",
  "Kapan waktu terbaik untuk trading saham IDX?",
];

async function sendChat(messages: { role: string; content: string }[]) {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Gagal menghubungi AI");
  }
  const data = await res.json();
  return data.reply as string;
}

async function fetchMarketSummary(data: object) {
  const res = await fetch(`${API_BASE}/api/ai/market-summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gagal membuat ringkasan");
  const json = await res.json();
  return json.summary as string;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? "bg-primary" : "bg-violet-600"}`}>
        {isUser ? <User className="w-4 h-4 text-primary-foreground" /> : <Bot className="w-4 h-4 text-white" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${isUser ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"}`}>
        {msg.content}
      </div>
    </div>
  );
}

export default function AI() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Halo! Saya KristalAI, asisten analisis crypto & saham IDX Anda. Saya bisa membantu menganalisis pasar, menjelaskan strategi trading, dan menjawab pertanyaan seputar investasi. Ada yang bisa saya bantu? 🔮",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [marketSummary, setMarketSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: overview } = useGetMarketOverview();
  const { data: predictions } = useGetPredictions({ type: "crypto", limit: 5 });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadMarketSummary() {
    if (!overview) return;
    setSummaryLoading(true);
    try {
      const topMovers = Array.isArray(predictions)
        ? predictions.slice(0, 5).map((p: any) => ({
            name: p.assetName,
            symbol: p.symbol,
            change: p.priceChange24h,
          }))
        : [];
      const summary = await fetchMarketSummary({
        fearGreedIndex: overview.fearGreedIndex ?? 50,
        fearGreedLabel: overview.fearGreedLabel ?? "Neutral",
        btcDominance: overview.btcDominance ?? 50,
        totalMarketCap: overview.totalMarketCap ?? 0,
        marketCapChange24h: overview.marketCapChange24h ?? 0,
        topMovers,
      });
      setMarketSummary(summary);
    } catch {
      setMarketSummary("Gagal memuat ringkasan pasar.");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: Message = { role: "user", content, timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const history = newMessages.map((m) => ({ role: m.role, content: m.content }));
      const reply = await sendChat(history);
      setMessages((prev) => [...prev, { role: "assistant", content: reply, timestamp: new Date() }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Maaf, terjadi kesalahan: ${err.message}`, timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            KristalAI <Sparkles className="w-5 h-5 text-violet-400" />
          </h1>
          <p className="text-sm text-muted-foreground">Asisten AI analisis crypto & saham IDX</p>
        </div>
        <Badge variant="secondary" className="ml-auto bg-violet-600/20 text-violet-400 border-violet-600/30">
          Powered by Claude
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col">
          <Card className="flex flex-col h-[600px]">
            <CardContent className="flex flex-col flex-1 p-4 gap-4 min-h-0">
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {messages.map((msg, i) => (
                  <MessageBubble key={i} msg={msg} />
                ))}
                {loading && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">KristalAI sedang berpikir...</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="flex gap-2 pt-2 border-t border-border">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Tanya tentang crypto, saham, atau strategi trading... (Enter untuk kirim)"
                  className="resize-none min-h-[48px] max-h-[120px]"
                  rows={2}
                  disabled={loading}
                />
                <Button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading}
                  size="icon"
                  className="h-auto bg-violet-600 hover:bg-violet-700"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                Pertanyaan Populer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {STARTER_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  disabled={loading}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Ringkasan Pasar AI
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={loadMarketSummary}
                  disabled={summaryLoading || !overview}
                  className="h-7 w-7 p-0"
                >
                  <RefreshCw className={`w-3 h-3 ${summaryLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!marketSummary && !summaryLoading && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMarketSummary}
                  disabled={!overview}
                  className="w-full text-xs"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Generate Ringkasan Pasar
                </Button>
              )}
              {summaryLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Menganalisis pasar...
                </div>
              )}
              {marketSummary && !summaryLoading && (
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{marketSummary}</p>
              )}
            </CardContent>
          </Card>

          {overview && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Data Pasar Aktif</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fear & Greed</span>
                  <span className="font-medium">{overview.fearGreedIndex} — {overview.fearGreedLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">BTC Dominance</span>
                  <span className="font-medium">{overview.btcDominance?.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Market Cap 24h</span>
                  <span className={`font-medium ${(overview.marketCapChange24h ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {(overview.marketCapChange24h ?? 0) >= 0 ? "+" : ""}{overview.marketCapChange24h?.toFixed(2)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
