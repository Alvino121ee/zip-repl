import { format } from "date-fns";

export function formatCurrency(value: number | undefined | null, currency = "USD"): string {
  if (value == null) return "N/A";
  
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

export function formatCompactNumber(number: number | undefined | null): string {
  if (number == null) return "N/A";
  
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(number);
}

export function formatPercentage(value: number | undefined | null): string {
  if (value == null) return "N/A";
  
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatDate(dateString: string | number | Date): string {
  if (!dateString) return "N/A";
  try {
    return format(new Date(dateString), "MMM d, yyyy HH:mm");
  } catch (e) {
    return "Invalid Date";
  }
}
