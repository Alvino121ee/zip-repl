import { useEffect, useRef, useState } from "react";

export type PriceDirection = "up" | "down" | "neutral";

export function useAnimatedPrice(value: number | undefined | null) {
  const prevRef = useRef<number | null>(null);
  const [direction, setDirection] = useState<PriceDirection>("neutral");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value == null) return;
    const prev = prevRef.current;
    if (prev !== null && prev !== value) {
      setDirection(value > prev ? "up" : "down");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setDirection("neutral"), 1200);
    }
    prevRef.current = value;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value]);

  return direction;
}

export function useLiveCountdown(intervalMs: number) {
  const [elapsed, setElapsed] = useState(0);
  const lastFetchRef = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - lastFetchRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const reset = () => {
    lastFetchRef.current = Date.now();
    setElapsed(0);
  };

  const nextIn = Math.max(0, Math.floor(intervalMs / 1000) - elapsed);
  return { elapsed, nextIn, reset };
}

export function isBEIOpen(): boolean {
  const now = new Date();
  const wib = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const day = wib.getDay();
  const h = wib.getHours();
  const m = wib.getMinutes();
  const mins = h * 60 + m;
  if (day === 0 || day === 6) return false;
  return (mins >= 9 * 60 && mins < 11 * 60 + 30) || (mins >= 13 * 60 + 30 && mins < 15 * 60 + 50);
}
