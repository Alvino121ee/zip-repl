import React, { useState, useEffect, useRef } from "react";
import { Terminal, Trash2, Loader2, Wifi, WifiOff } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ActivityEntry {
  id: string;
  timestamp: number;
  source: string;
  level: "info" | "success" | "warning" | "error" | "signal" | "scan";
  message: string;
  symbol?: string;
  confidence?: number;
}

interface Props {
  source?: "auto" | "demo" | "scalp" | "auto,demo";
  maxEntries?: number;
  pollInterval?: number;
  height?: string;
  showClear?: boolean;
}

const LEVEL_STYLE: Record<string, string> = {
  info: "text-blue-300",
  success: "text-green-400 font-semibold",
  warning: "text-yellow-400",
  error: "text-red-400 font-semibold",
  signal: "text-purple-400 font-bold",
  scan: "text-cyan-400",
};

const LEVEL_PREFIX: Record<string, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕",
  signal: "⚡",
  scan: "◉",
};

const SOURCE_BADGE: Record<string, string> = {
  auto: "bg-blue-500/20 text-blue-400",
  demo: "bg-green-500/20 text-green-400",
  scalp: "bg-purple-500/20 text-purple-400",
  brain: "bg-orange-500/20 text-orange-400",
  system: "bg-muted text-muted-foreground",
};

export function ActivityFeed({
  source,
  maxEntries = 80,
  pollInterval = 2000,
  height = "h-72",
  showClear = true,
}: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCount = useRef(0);

  const fetchEntries = async () => {
    try {
      const src = source ?? "auto,demo";
      const url = src.includes(",")
        ? `${API}/api/trading/activity?limit=${maxEntries}`
        : `${API}/api/trading/activity?source=${src}&limit=${maxEntries}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json() as ActivityEntry[];
      setEntries(data);
      setConnected(true);
      setLoading(false);
      if (prevCount.current < data.length && autoScroll && feedRef.current) {
        feedRef.current.scrollTop = 0;
      }
      prevCount.current = data.length;
    } catch {
      setConnected(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    timerRef.current = setInterval(fetchEntries, pollInterval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [source, pollInterval, maxEntries]);

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString("id-ID", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  }

  return (
    <div className="rounded-xl border border-border bg-black/60 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/10">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-mono font-semibold text-muted-foreground">AI Activity Console</span>
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : connected ? (
            <Wifi className="h-3 w-3 text-green-400" />
          ) : (
            <WifiOff className="h-3 w-3 text-red-400" />
          )}
          {entries.length > 0 && (
            <span className="text-[10px] text-muted-foreground font-mono">({entries.length} entri)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="w-3 h-3"
            />
            Auto-scroll
          </label>
          {showClear && entries.length > 0 && (
            <button
              onClick={() => setEntries([])}
              className="text-muted-foreground hover:text-red-400 transition-colors"
              title="Bersihkan log"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        className={`${height} overflow-y-auto font-mono text-[11px] p-2 space-y-0.5`}
        style={{ scrollbarWidth: "thin" }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Memuat log aktivitas...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-2">
            <Terminal className="h-8 w-8" />
            <span>Belum ada aktivitas AI</span>
            <span className="text-[10px]">Aktifkan engine untuk melihat log real-time</span>
          </div>
        ) : (
          entries.map((entry) => {
            const style = LEVEL_STYLE[entry.level] ?? "text-foreground";
            const prefix = LEVEL_PREFIX[entry.level] ?? "·";
            const badge = SOURCE_BADGE[entry.source] ?? SOURCE_BADGE.system;

            return (
              <div
                key={entry.id}
                className={`flex items-start gap-2 py-0.5 px-1 rounded hover:bg-white/5 transition-colors group`}
              >
                <span className="text-muted-foreground/50 shrink-0 tabular-nums text-[10px] mt-0.5 leading-4">
                  {formatTime(entry.timestamp)}
                </span>
                <span className={`shrink-0 ${style} leading-4`}>{prefix}</span>
                {entry.source && (
                  <span className={`text-[9px] px-1.5 rounded shrink-0 font-bold leading-4 ${badge}`}>
                    {entry.source.toUpperCase()}
                  </span>
                )}
                {entry.symbol && (
                  <span className="text-cyan-400 font-bold shrink-0 leading-4">{entry.symbol}</span>
                )}
                <span className={`flex-1 leading-4 break-words ${style}`}>{entry.message}</span>
                {entry.confidence != null && (
                  <span className={`shrink-0 text-[10px] font-bold leading-4 ${
                    entry.confidence >= 80 ? "text-green-400" : entry.confidence >= 65 ? "text-yellow-400" : "text-red-400"
                  }`}>
                    {entry.confidence}%
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
