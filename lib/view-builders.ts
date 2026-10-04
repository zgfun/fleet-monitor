import type { CheckKind } from "@/db/schema";
import { snapshotStatus } from "@/lib/checks/summarize";
import { worst } from "@/lib/status";
import type {
  CheckSnapshot,
  IncidentView,
  SeriesPoint,
  SiteDetail,
  SiteSummary,
} from "@/lib/view-models";

/** Pure helpers shared by the DB queries and the demo data, so both build identical view models. */

export type CheckRow = {
  kind: CheckKind;
  ok: boolean;
  latencyMs: number | null;
  ranAt: Date | string;
  data: Record<string, unknown>;
};

export type IncidentRow = {
  id: number;
  kind: CheckKind;
  openedAt: Date | string;
  closedAt: Date | string | null;
  note: string | null;
};

export type SiteRow = {
  id: number;
  name: string;
  host: string;
  url: string | null;
  enabled: boolean;
  publicSlug: string | null;
};

export const DAY_MS = 24 * 60 * 60 * 1000;

export function iso(d: Date | string): string {
  return typeof d === "string" ? new Date(d).toISOString() : d.toISOString();
}

export function toSnapshot(row: CheckRow): CheckSnapshot {
  const data = row.data ?? {};
  const { status, summary } = snapshotStatus(row.kind, row.ok, row.latencyMs, data);
  return {
    kind: row.kind,
    status,
    ok: row.ok,
    ranAt: iso(row.ranAt),
    latencyMs: row.latencyMs,
    summary,
    data,
  };
}

export function toIncidentView(row: IncidentRow): IncidentView {
  return {
    id: row.id,
    kind: row.kind,
    openedAt: iso(row.openedAt),
    closedAt: row.closedAt ? iso(row.closedAt) : null,
    note: row.note,
  };
}

/** `latest` holds at most one row per kind (the newest). */
export function buildSummary(site: SiteRow, latest: CheckRow[], openIncidents: number): SiteSummary {
  const checks: SiteSummary["checks"] = {};
  for (const row of latest) checks[row.kind] = toSnapshot(row);
  return {
    id: site.id,
    name: site.name,
    host: site.host,
    url: site.url ?? `https://${site.host}/`,
    enabled: site.enabled,
    publicSlug: site.publicSlug,
    status: worst(Object.values(checks).map((c) => c.status)),
    checks,
    openIncidents,
  };
}

function brokenFrom(snapshot: CheckSnapshot | undefined): SiteDetail["brokenLinks"] {
  const broken = snapshot?.data.broken;
  if (!Array.isArray(broken)) return [];
  return broken
    .filter((b): b is { url: string; status: number | string } =>
      typeof b === "object" && b !== null && typeof (b as { url?: unknown }).url === "string",
    )
    .map((b) => ({ url: b.url, status: b.status }));
}

/**
 * `series` holds the http + pagespeed rows of the last 30 days (any order),
 * `history` the newest rows of any kind, newest first.
 */
export function buildDetail(
  summary: SiteSummary,
  series: CheckRow[],
  history: CheckRow[],
  incidents: IncidentRow[],
): SiteDetail {
  const sorted = [...series].sort((a, b) => +new Date(a.ranAt) - +new Date(b.ranAt));
  const http = sorted.filter((r) => r.kind === "http");
  const responseTime: SeriesPoint[] = http.map((r) => ({ t: iso(r.ranAt), v: r.latencyMs }));
  const perfScore: SeriesPoint[] = sorted
    .filter((r) => r.kind === "pagespeed")
    .map((r) => ({
      t: iso(r.ranAt),
      v: typeof r.data?.score === "number" ? r.data.score : null,
    }));
  return {
    ...summary,
    responseTime,
    perfScore,
    history: history.slice(0, 50).map(toSnapshot),
    incidents: incidents.map(toIncidentView),
    brokenLinks: brokenFrom(summary.checks.links),
    uptime30d: http.length ? http.filter((r) => r.ok).length / http.length : null,
  };
}
