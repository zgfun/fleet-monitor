import { THRESHOLDS, worst, type Status } from "@/lib/status";
import type { SiteDetail } from "@/lib/view-models";

export type DayBucket = { day: string; status: Status; note: string };

const DAY_MS = 86_400_000;

function dayKey(iso: string | number): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * One bucket per UTC day, oldest first, coloured by the worst HTTP state seen that day.
 * SiteDetail has no per-day rollup, so this combines what it does carry: http rows in the
 * recent history, the response-time series (one point per run) and http incident windows.
 */
export function dailyHttpStatus(
  site: Pick<SiteDetail, "history" | "responseTime" | "incidents">,
  nowIso: string,
  days = 30,
): DayBucket[] {
  const today = Date.parse(dayKey(nowIso));
  const buckets = new Map<string, Status[]>();
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(today - i * DAY_MS);
    keys.push(key);
    buckets.set(key, []);
  }

  for (const p of site.responseTime) {
    if (p.v == null) continue;
    buckets.get(dayKey(p.t))?.push(p.v > THRESHOLDS.slowMs ? "warn" : "up");
  }
  for (const h of site.history) {
    if (h.kind === "http") buckets.get(dayKey(h.ranAt))?.push(h.status);
  }
  const end = today + DAY_MS;
  for (const inc of site.incidents) {
    if (inc.kind !== "http") continue;
    const from = Date.parse(inc.openedAt);
    const to = inc.closedAt ? Date.parse(inc.closedAt) : Date.parse(nowIso);
    for (const key of keys) {
      const start = Date.parse(key);
      if (from < start + DAY_MS && to >= start && start < end) buckets.get(key)?.push("down");
    }
  }

  return keys.map((day) => {
    const statuses = buckets.get(day) ?? [];
    const status = worst(statuses);
    const note =
      status === "down"
        ? "Outage recorded"
        : status === "warn"
          ? "Slow or blocked responses"
          : status === "up"
            ? "No downtime"
            : "No data";
    return { day, status, note };
  });
}
