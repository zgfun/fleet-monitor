import { and, asc, count, desc, eq, gte, inArray, isNull, min } from "drizzle-orm";
import { checks, db, incidents, sites, type Site } from "@/db";
import { INCIDENT_KINDS } from "@/lib/status";
import { buildDetail, buildSummary, DAY_MS, type CheckRow } from "@/lib/view-builders";
import type { FleetStats, SiteDetail, SiteSummary } from "@/lib/view-models";

const checkCols = {
  siteId: checks.siteId,
  kind: checks.kind,
  ok: checks.ok,
  latencyMs: checks.latencyMs,
  ranAt: checks.ranAt,
  data: checks.data,
};

/** Newest check per (site, kind); served by checks_site_kind_ran_idx. */
function latestChecks(siteId?: number) {
  return db
    .selectDistinctOn([checks.siteId, checks.kind], checkCols)
    .from(checks)
    .where(siteId === undefined ? undefined : eq(checks.siteId, siteId))
    .orderBy(checks.siteId, checks.kind, desc(checks.ranAt));
}

function openIncidentCounts(siteId?: number) {
  return db
    .select({ siteId: incidents.siteId, n: count() })
    .from(incidents)
    .where(
      siteId === undefined
        ? isNull(incidents.closedAt)
        : and(isNull(incidents.closedAt), eq(incidents.siteId, siteId)),
    )
    .groupBy(incidents.siteId);
}

export async function getFleet(): Promise<SiteSummary[]> {
  const [siteRows, latest, open] = await Promise.all([
    db.select().from(sites).orderBy(asc(sites.name), asc(sites.id)),
    latestChecks(),
    openIncidentCounts(),
  ]);
  const bySite = new Map<number, CheckRow[]>();
  for (const row of latest) {
    const list = bySite.get(row.siteId) ?? [];
    list.push(row);
    bySite.set(row.siteId, list);
  }
  const openBySite = new Map(open.map((o) => [o.siteId, o.n]));
  return siteRows.map((s) => buildSummary(s, bySite.get(s.id) ?? [], openBySite.get(s.id) ?? 0));
}

async function detailFor(site: Site): Promise<SiteDetail> {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [latest, open, series, history, incidentRows] = await Promise.all([
    latestChecks(site.id),
    openIncidentCounts(site.id),
    db
      .select(checkCols)
      .from(checks)
      .where(
        and(
          eq(checks.siteId, site.id),
          inArray(checks.kind, ["http", "pagespeed"]),
          gte(checks.ranAt, since),
        ),
      )
      .orderBy(asc(checks.ranAt)),
    db
      .select(checkCols)
      .from(checks)
      .where(eq(checks.siteId, site.id))
      .orderBy(desc(checks.ranAt), desc(checks.id))
      .limit(50),
    db
      .select()
      .from(incidents)
      .where(eq(incidents.siteId, site.id))
      .orderBy(desc(incidents.openedAt))
      .limit(50),
  ]);
  const summary = buildSummary(site, latest, open[0]?.n ?? 0);
  return buildDetail(summary, series, history, incidentRows);
}

export async function getSite(id: number): Promise<SiteDetail | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [site] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  return site ? detailFor(site) : null;
}

export async function getSiteBySlug(slug: string): Promise<SiteDetail | null> {
  if (!slug) return null;
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.publicSlug, slug), eq(sites.enabled, true)))
    .limit(1);
  return site ? detailFor(site) : null;
}

export async function getFleetStats(): Promise<FleetStats> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY_MS);
  const [[siteCount], [first], [recent], [incidentCount]] = await Promise.all([
    db.select({ n: count() }).from(sites).where(eq(sites.enabled, true)),
    db.select({ since: min(checks.ranAt) }).from(checks),
    db.select({ n: count() }).from(checks).where(gte(checks.ranAt, weekAgo)),
    db
      .select({ n: count() })
      .from(incidents)
      .where(inArray(incidents.kind, [...INCIDENT_KINDS])),
  ]);
  // min() on a timestamptz comes back as a string from postgres-js
  const since = first?.since ? new Date(first.since as unknown as string | Date) : null;
  let checksPerDay = 0;
  if (since) {
    const days = Math.min(7, Math.max(1, Math.ceil((now - since.getTime()) / DAY_MS)));
    checksPerDay = Math.round(recent.n / days);
  }
  return {
    sites: siteCount.n,
    checksPerDay,
    incidentsAndCertWarnings: incidentCount.n,
    since: since ? since.toISOString() : null,
  };
}
