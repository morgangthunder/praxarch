import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Conditionally compose Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a number as compact currency (EUR by default). */
export function formatCurrency(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format large integers compactly (e.g. 12.4k). */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

const UTC_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Fixed UTC timestamp for deploy rows — avoids SSR/client locale hydration mismatches. */
export function formatDeployTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.getUTCDate();
  const month = UTC_MONTHS[d.getUTCMonth()];
  const hours = d.getUTCHours().toString().padStart(2, "0");
  const minutes = d.getUTCMinutes().toString().padStart(2, "0");
  return `${day} ${month} ${hours}:${minutes} UTC`;
}
