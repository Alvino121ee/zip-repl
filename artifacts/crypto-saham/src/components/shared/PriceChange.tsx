import React from "react";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import { formatPercentage } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PriceChangeProps {
  value?: number | null;
  className?: string;
  iconOnly?: boolean;
}

export function PriceChange({ value, className, iconOnly = false }: PriceChangeProps) {
  if (value == null) return <span className="text-muted-foreground">N/A</span>;
  
  const isPositive = value > 0;
  const isNegative = value < 0;
  const isNeutral = value === 0;

  return (
    <div className={cn(
      "flex items-center font-medium",
      isPositive ? "text-success" : isNegative ? "text-destructive" : "text-muted-foreground",
      className
    )}>
      {isPositive && <ArrowUpIcon className="h-3 w-3 mr-1" />}
      {isNegative && <ArrowDownIcon className="h-3 w-3 mr-1" />}
      {isNeutral && <MinusIcon className="h-3 w-3 mr-1" />}
      {!iconOnly && formatPercentage(Math.abs(value))}
    </div>
  );
}