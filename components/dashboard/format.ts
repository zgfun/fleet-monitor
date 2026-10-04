import type { CheckKind } from "@/db/schema";
import type { Status } from "@/lib/status";

// Fixed locale + UTC so server and client render identical strings.
const dateFmt = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dateTimeFmt = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});
const shortDayFmt = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateFmt.format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${dateTimeFmt.format(new Date(iso))} UTC`;
}

export function formatShortDay(iso: string): string {
  return shortDayFmt.format(new Date(iso));
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms >= 10_000) return `${(ms / 1000).toFixed(0)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

export function formatPercent(share: number | null | undefined, digits = 2): string {
  if (share == null) return "—";
  const pct = share * 100;
  return `${pct >= 99.995 ? "100" : pct.toFixed(digits)}%`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en").format(n);
}

export function formatRelative(iso: string | null | undefined, nowIso: string): string {
  if (!iso) return "never";
  const diff = new Date(nowIso).getTime() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const units: [number, string][] = [
    [86_400_000, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
  ];
  for (const [size, name] of units) {
    if (abs >= size) {
      const n = Math.floor(abs / size);
      const label = `${n} ${name}${n === 1 ? "" : "s"}`;
      return future ? `in ${label}` : `${label} ago`;
    }
  }
  return "just now";
}

export function formatDuration(fromIso: string, toIso: string): string {
  const mins = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ${mins % 60} min`;
  return `${Math.floor(hours / 24)} days`;
}

// Not imported from db/schema: that would pull drizzle into the client bundle.
export const KIND_ORDER: CheckKind[] = ["http", "ssl", "links", "pagespeed", "noindex", "cookie"];

export const KIND_LABELS: Record<CheckKind, string> = {
  http: "Uptime",
  ssl: "SSL certificate",
  links: "Broken links",
  pagespeed: "Performance",
  noindex: "Indexing",
  cookie: "Cookie banner",
};

export const KIND_SHORT: Record<CheckKind, string> = {
  http: "HTTP",
  ssl: "SSL",
  links: "Links",
  pagespeed: "Perf",
  noindex: "Index",
  cookie: "Cookie",
};

export const STATUS_LABELS: Record<Status, string> = {
  up: "Healthy",
  warn: "Warning",
  down: "Down",
  unknown: "No data",
};

export const STATUS_PALETTE: Record<Status, string> = {
  up: "green",
  warn: "orange",
  down: "red",
  unknown: "gray",
};

export function latestRanAt(items: { checks: Partial<Record<CheckKind, { ranAt: string }>> }[]): string | null {
  let max: string | null = null;
  for (const item of items) {
    for (const snap of Object.values(item.checks)) {
      if (snap && (!max || snap.ranAt > max)) max = snap.ranAt;
    }
  }
  return max;
}

/** Server action errors are replaced by a generic digest message in production builds. */
export function actionError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : "";
  if (!msg || /Server Components render|omitted in production|digest/i.test(msg)) return fallback;
  return msg;
}
