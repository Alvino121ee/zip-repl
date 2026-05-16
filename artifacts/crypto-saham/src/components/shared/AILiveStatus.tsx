import React, { useState, useEffect, useRef } from "react";
import { Bot, Loader2, Zap, Search, TrendingUp, TrendingDown, Shield, AlertTriangle, CheckCircle2, Activity } from "lucide-react";

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
  source: "auto" | "demo" | "scalp";
  pollInterval?: number;
}

const LEVEL_CONFIG = {
  info: { color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", dot: "bg-blue-400" },
  success: { color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", dot: "bg-green-400" },
  warning: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", dot: "bg-yellow-400" },
  error: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", dot: "bg-red-400" },
  signal: { color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30", dot: "bg-purple-400" },
  scan: { color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/30", dot: "bg-cyan-400" },
};

const KEYWORDS_TO_ICON = (msg: string, level: string) => {
  const m = msg.toLowerCase();
  if (level === "error") return AlertTriangle;
  if (level === "success" || m.includes("berhasil") || m.includes("profit") || m.includes("dibuka")) return CheckCircle2;
  if (m.includes("scan") || m.includes("memindai") || m.includes("mencari")) return Search;
  if (m.includes("long") || m.includes("beli") || m.includes("naik")) return TrendingUp;
  if (m.includes("short") || m.includes("jual") || m.includes("turun")) return TrendingDown;
  if (m.includes("stop") || m.includes("paused") || m.includes("berhenti")) return Shield;
  if (level === "scan" || m.includes("analisis") || m.includes("menganalisis")) return Activity;
  if (level === "signal") return Zap;
  return Bot;
};

function ScanAnimation() {
  return (
    <div className="relative w-8 h-8 flex items-center justify-center">
      <div className="absolute inset-0 rounded-full border-2 border-cyan-500/30 animate-ping" />
      <div className="absolute inset-1 rounded-full border border-cyan-400/50 animate-pulse" />
      <div className="w-2 h-2 rounded-full bg-cyan-400" />
    </div>
  );
}

function PulseRing({ color }: { color: string }) {
  return (
    <span className="relative flex h-3 w-3">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex rounded-full h-3 w-3 ${color}`} />
    </span>
  );
}

export function AILiveStatus({ source, pollInterval = 2000 }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API}/api/trading/activity?source=${source}&limit=5`);
      if (!res.ok) return;
      const data = await res.json() as ActivityEntry[];
      setEntries(data);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, pollInterval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [source, pollInterval]);

  const latest = entries[0];
  const level = latest?.level ?? "info";
  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.info;
  const Icon = latest ? KEYWORDS_TO_ICON(latest.message, level) : Bot;

  const isScanning = latest && (
    latest.message.toLowerCase().includes("scan") ||
    latest.message.toLowerCase().includes("memindai") ||
    latest.message.toLowerCase().includes("mencari") ||
    latest.message.toLowerCase().includes("menganalisis")
  );

  if (!connected && entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-3 flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Menghubungkan ke AI...</span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2 transition-all ${cfg.bg}`}>
      {/* Header status */}
      <div className="flex items-center gap-2.5">
        {isScanning ? (
          <ScanAnimation />
        ) : (
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${level === "success" ? "bg-green-500/20" : level === "error" ? "bg-red-500/20" : level === "signal" ? "bg-purple-500/20" : "bg-blue-500/20"}`}>
            <Icon className={`h-4 w-4 ${cfg.color}`} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <PulseRing color={cfg.dot} />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {source === "auto" ? "Auto Trading" : source === "demo" ? "Demo Engine" : "Scalping"} · Status AI
            </span>
          </div>
          <p className={`text-sm font-medium leading-tight ${cfg.color} truncate`}>
            {latest?.message ?? "Menunggu sinyal..."}
          </p>
        </div>
        {latest?.confidence != null && (
          <div className="shrink-0 text-right">
            <div className={`text-lg font-bold ${latest.confidence >= 80 ? "text-green-400" : latest.confidence >= 65 ? "text-yellow-400" : "text-red-400"}`}>
              {latest.confidence}%
            </div>
            <div className="text-[10px] text-muted-foreground">confidence</div>
          </div>
        )}
      </div>

      {/* Recent entries mini-feed */}
      {entries.length > 1 && (
        <div className="space-y-0.5 pt-1 border-t border-white/5">
          {entries.slice(1, 4).map((e) => {
            const eCfg = LEVEL_CONFIG[e.level] ?? LEVEL_CONFIG.info;
            return (
              <div key={e.id} className="flex items-center gap-2 text-[10px] opacity-60">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${eCfg.dot}`} />
                <span className="text-muted-foreground shrink-0">
                  {new Date(e.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className="truncate">{e.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
