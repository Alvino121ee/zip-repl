import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Dir = "up" | "down" | "neutral";

export function useFlash(value: number | undefined | null) {
  const prev = useRef<number | null>(null);
  const [dir, setDir] = useState<Dir>("neutral");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value == null) return;
    if (prev.current !== null && prev.current !== value) {
      setDir(value > prev.current ? "up" : "down");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDir("neutral"), 1000);
    }
    prev.current = value;
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value]);

  return dir;
}

interface LivePriceProps {
  value: number | undefined | null;
  formatted: string;
  className?: string;
}

export function LivePrice({ value, formatted, className }: LivePriceProps) {
  const dir = useFlash(value);
  return (
    <span
      className={cn(
        "tabular-nums font-semibold transition-colors duration-150",
        dir === "up" && "text-green-400",
        dir === "down" && "text-red-400",
        dir === "neutral" && "text-foreground",
        className,
      )}
    >
      {formatted}
    </span>
  );
}

export function LiveDot({ active }: { active: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {active ? (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </>
        ) : (
          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
        )}
      </span>
      <span className={cn("text-xs font-semibold", active ? "text-green-500" : "text-yellow-500")}>
        {active ? "LIVE" : "TUTUP"}
      </span>
    </span>
  );
}

/** Shows "X detik lalu · refresh Yd" based on when data was last fetched */
export function UpdatedAgo({ dataUpdatedAt, refetchIntervalMs }: { dataUpdatedAt: number; refetchIntervalMs: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.floor((Date.now() - dataUpdatedAt) / 1000));
  const next = Math.max(0, Math.round(refetchIntervalMs / 1000) - elapsed);

  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {elapsed === 0 ? "baru diperbarui" : `${elapsed}d lalu`} · refresh {next}d lagi
    </span>
  );
}

/** kept for backward compat */
export function useRefreshEpoch(dataUpdatedAt: number) {
  return dataUpdatedAt;
}
