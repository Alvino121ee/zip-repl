import React from "react";
import { PredictionSignal, PredictionDetailSignal } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SignalType = keyof typeof PredictionSignal | keyof typeof PredictionDetailSignal | string;

export function SignalBadge({ signal, className }: { signal: SignalType, className?: string }) {
  let label = signal.replace("_", " ").toUpperCase();
  let colorClass = "";

  switch (signal) {
    case "strong_buy":
      colorClass = "bg-success text-success-foreground hover:bg-success/90";
      break;
    case "buy":
      colorClass = "bg-success/20 text-success border-success/30 hover:bg-success/30";
      break;
    case "neutral":
      colorClass = "bg-muted text-muted-foreground hover:bg-muted/80";
      break;
    case "sell":
      colorClass = "bg-destructive/20 text-destructive border-destructive/30 hover:bg-destructive/30";
      break;
    case "strong_sell":
      colorClass = "bg-destructive text-destructive-foreground hover:bg-destructive/90";
      break;
    default:
      colorClass = "bg-muted";
  }

  return (
    <Badge variant={signal === "strong_buy" || signal === "strong_sell" ? "default" : "outline"} className={cn("font-bold tracking-wider text-[10px]", colorClass, className)}>
      {label}
    </Badge>
  );
}