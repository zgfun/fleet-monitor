import type { CheckKind } from "@/db/schema";
import { THRESHOLDS, type Status } from "@/lib/status";

type Snapshot = { status: Status; summary: string };

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const plural = (n: number, word: string) => `${n} ${word}${Math.abs(n) === 1 ? "" : "s"}`;

export function snapshotStatus(
  kind: CheckKind,
  ok: boolean,
  latencyMs: number | null,
  data: Record<string, unknown>,
): Snapshot {
  const error = str(data.error);
  switch (kind) {
    case "http": {
      const status = num(data.status);
      if (!ok) return { status: "down", summary: error ?? (status ? `HTTP ${status}` : "unreachable") };
      if (data.blocked === true) return { status: "warn", summary: `blocked (${status ?? "?"})` };
      const timing = latencyMs === null ? `${status}` : `${status} in ${latencyMs} ms`;
      if (latencyMs !== null && latencyMs > THRESHOLDS.slowMs) {
        return { status: "warn", summary: `${timing} (slow)` };
      }
      return { status: "up", summary: timing };
    }
    case "ssl": {
      const daysLeft = num(data.daysLeft);
      if (daysLeft === null) return { status: "down", summary: error ?? "no certificate" };
      if (error) return { status: "down", summary: error };
      const summary = daysLeft < 0 ? `expired ${plural(-daysLeft, "day")} ago` : `${plural(daysLeft, "day")} left`;
      if (!ok) return { status: "down", summary };
      return { status: daysLeft < THRESHOLDS.sslWarnDays ? "warn" : "up", summary };
    }
    case "links": {
      if (error) return { status: "unknown", summary: error };
      const checked = num(data.checked) ?? 0;
      const broken = Array.isArray(data.broken) ? data.broken.length : 0;
      if (broken > 0) return { status: "warn", summary: `${broken} broken of ${checked}` };
      if (checked === 0) return { status: "up", summary: "no links found" };
      return { status: "up", summary: `${plural(checked, "link")} OK` };
    }
    case "pagespeed": {
      const score = num(data.score);
      if (error || score === null) return { status: "unknown", summary: error ?? "no score" };
      return { status: score < THRESHOLDS.perfWarnScore ? "warn" : "up", summary: `Perf ${score}` };
    }
    case "noindex": {
      if (error) return { status: "unknown", summary: error };
      if (data.noindex === true) {
        const source = str(data.source);
        return { status: "warn", summary: source === "header" ? "noindex set (header)" : "noindex set" };
      }
      return { status: "up", summary: "indexable" };
    }
    case "cookie": {
      if (error) return { status: "unknown", summary: error };
      if (data.present !== true) return { status: "warn", summary: "no banner found" };
      return { status: "up", summary: str(data.vendor) ?? "banner found" };
    }
  }
}
