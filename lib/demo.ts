import type { CheckKind } from "@/db/schema";
import { THRESHOLDS } from "@/lib/status";
import {
  buildDetail,
  buildSummary,
  DAY_MS,
  type CheckRow,
  type IncidentRow,
  type SiteRow,
} from "@/lib/view-builders";
import type { FleetStats, SiteDetail, SiteSummary } from "@/lib/view-models";

/** Fixed clock so server and client renders (and tests) always agree. */
export const DEMO_NOW = "2026-10-01T06:00:00Z";
const NOW = Date.parse(DEMO_NOW);
const DAYS = 30;
const SITE_COUNT = 30;

const VENDORS = ["CookieYes", "Complianz", "Cookiebot", "OneTrust", "Usercentrics", "Iubenda", "Borlabs"];
const ISSUERS = ["Let's Encrypt R11", "Let's Encrypt E6", "Sectigo RSA DV", "Google Trust Services WE1"];
const DEAD_PATHS = ["/old-pricing", "/blog/2019/launch", "/team/former-member", "/docs/v1/setup", "/careers/archive"];

/** Per-site quirks; everything else is healthy. Keys are 1-based site numbers. */
type Scenario = {
  /** Days ago (0 = today's run) when HTTP failed. */
  httpDown?: number[];
  httpError?: "timeout" | 503 | 502;
  sslDaysLeft?: number;
  broken?: number;
  noindex?: boolean;
  noCookie?: boolean;
  perfBase?: number;
  latencyBase?: number;
  blocked?: boolean;
  neverChecked?: boolean;
  disabled?: boolean;
};

const SCENARIOS: Record<number, Scenario> = {
  3: { httpDown: [12], httpError: "timeout" },
  4: { broken: 2 },
  7: { httpDown: [0, 1], httpError: 503 },
  9: { noCookie: true },
  11: { latencyBase: 2100 },
  12: { sslDaysLeft: 9 },
  15: { broken: 1, perfBase: 44 },
  17: { httpDown: [20], httpError: 502 },
  19: { sslDaysLeft: 22 },
  21: { perfBase: 38 },
  23: { broken: 3 },
  24: { blocked: true },
  26: { noindex: true },
  28: { noCookie: true },
  29: { disabled: true },
  30: { neverChecked: true },
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

type DemoCheck = CheckRow & { ranAt: string };
type DemoIncident = IncidentRow & { openedAt: string; closedAt: string | null };
type DemoSite = { site: SiteRow; checks: DemoCheck[]; incidents: DemoIncident[] };

let incidentSeq = 0;

function generateSite(n: number): DemoSite {
  const sc = SCENARIOS[n] ?? {};
  const rand = mulberry32(0x5eed + n * 7919);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const host = `site-${pad(n)}.example`;
  const url = `https://${host}/`;
  const site: SiteRow = {
    id: n,
    name: `Site ${pad(n)}`,
    host,
    url: null,
    enabled: !sc.disabled,
    publicSlug: null,
  };
  if (sc.neverChecked) return { site, checks: [], incidents: [] };

  const latencyBase = sc.latencyBase ?? Math.round(between(180, 900));
  const perfBase = sc.perfBase ?? Math.round(between(62, 94));
  const validTo = NOW + (sc.sslDaysLeft ?? Math.round(between(38, 85))) * DAY_MS + 7 * 60 * 60 * 1000;
  const issuer = ISSUERS[Math.floor(rand() * ISSUERS.length)];
  const vendor = VENDORS[Math.floor(rand() * VENDORS.length)];
  const totalLinks = Math.round(between(18, 48));
  const broken = Array.from({ length: sc.broken ?? 0 }, (_, i) => ({
    url: `https://${host}${DEAD_PATHS[(n + i) % DEAD_PATHS.length]}`,
    status: i === 2 ? "timeout" : 404,
  }));

  const checks: DemoCheck[] = [];
  const incidents: DemoIncident[] = [];
  let openHttp: DemoIncident | null = null;
  let openSsl: DemoIncident | null = null;
  // A disabled site simply stopped being checked a few days ago.
  const lastDay = sc.disabled ? 5 : 0;

  for (let d = DAYS - 1; d >= lastDay; d--) {
    const runAt = NOW - d * DAY_MS + Math.round(between(0, 40_000));
    const at = (offsetMs: number) => new Date(runAt + offsetMs).toISOString();

    const down = sc.httpDown?.includes(d) ?? false;
    const spike = rand() < 0.06 ? between(1.6, 2.6) : 1;
    const latency = Math.min(2500, Math.round(latencyBase * between(0.8, 1.25) * spike));
    if (down) {
      const status = sc.httpError === "timeout" ? null : (sc.httpError ?? 503);
      checks.push({
        kind: "http",
        ok: false,
        latencyMs: sc.httpError === "timeout" ? 8000 : Math.round(between(90, 400)),
        ranAt: at(0),
        data: {
          status,
          finalUrl: status ? url : null,
          blocked: false,
          error: status ? `HTTP ${status}` : "Request timed out after 8000 ms",
        },
      });
      if (!openHttp) {
        openHttp = {
          id: 0,
          kind: "http",
          openedAt: at(0),
          closedAt: null,
          note: status ? `HTTP ${status}` : "Request timed out after 8000 ms",
        };
        incidents.push(openHttp);
      }
    } else {
      checks.push({
        kind: "http",
        ok: true,
        latencyMs: latency,
        ranAt: at(0),
        data: sc.blocked
          ? { status: 403, finalUrl: url, blocked: true }
          : { status: 200, finalUrl: url, blocked: false },
      });
      if (openHttp) {
        openHttp.closedAt = at(0);
        openHttp = null;
      }
    }

    const daysLeft = Math.floor((validTo - runAt) / DAY_MS);
    const sslOk = daysLeft >= THRESHOLDS.sslAlertDays;
    checks.push({
      kind: "ssl",
      ok: sslOk,
      latencyMs: Math.round(between(40, 160)),
      ranAt: at(1_000),
      data: { validTo: new Date(validTo).toISOString(), daysLeft, issuer },
    });
    if (!sslOk && !openSsl) {
      openSsl = {
        id: 0,
        kind: "ssl",
        openedAt: at(1_000),
        closedAt: null,
        note: `Certificate expires in ${daysLeft} days`,
      };
      incidents.push(openSsl);
    }

    if (down) continue;

    // Broken links appeared about a week ago.
    const brokenToday = d <= 6 ? broken : [];
    checks.push({
      kind: "links",
      ok: brokenToday.length === 0,
      latencyMs: Math.round(between(1500, 6000)),
      ranAt: at(2_000),
      data: { total: totalLinks, checked: totalLinks, broken: brokenToday },
    });

    const score = Math.max(30, Math.min(99, Math.round(perfBase + between(-6, 6))));
    checks.push({
      kind: "pagespeed",
      ok: score >= THRESHOLDS.perfWarnScore,
      latencyMs: Math.round(between(9000, 22000)),
      ranAt: at(3_000),
      data: {
        score,
        lcpMs: Math.round(1200 + (100 - score) * between(45, 70)),
        cls: Math.round(between(0, 0.18) * 1000) / 1000,
        tbtMs: Math.round((100 - score) * between(6, 14)),
        strategy: "mobile",
      },
    });

    const noindex = sc.noindex ?? false;
    checks.push({
      kind: "noindex",
      ok: !noindex,
      latencyMs: null,
      ranAt: at(4_000),
      data: { noindex, source: noindex ? "meta" : null },
    });

    const present = !sc.noCookie;
    checks.push({
      kind: "cookie",
      ok: present,
      latencyMs: null,
      ranAt: at(5_000),
      data: { present, vendor: present ? vendor : null },
    });
  }

  for (const inc of incidents) inc.id = ++incidentSeq;
  return { site, checks, incidents };
}

let cache: DemoSite[] | null = null;

function allSites(): DemoSite[] {
  if (!cache) {
    incidentSeq = 0;
    cache = Array.from({ length: SITE_COUNT }, (_, i) => generateSite(i + 1));
  }
  return cache;
}

function latestPerKind(rows: DemoCheck[]): DemoCheck[] {
  const latest = new Map<CheckKind, DemoCheck>();
  for (const row of rows) {
    const prev = latest.get(row.kind);
    if (!prev || row.ranAt > prev.ranAt) latest.set(row.kind, row);
  }
  return [...latest.values()];
}

function summaryOf(s: DemoSite): SiteSummary {
  const open = s.incidents.filter((i) => i.closedAt === null).length;
  return buildSummary(s.site, latestPerKind(s.checks), open);
}

export function demoFleet(): SiteSummary[] {
  return allSites().map(summaryOf);
}

export function demoSite(id: number): SiteDetail | null {
  const s = allSites().find((x) => x.site.id === id);
  if (!s) return null;
  const series = s.checks.filter((c) => c.kind === "http" || c.kind === "pagespeed");
  const history = [...s.checks].sort((a, b) => (a.ranAt < b.ranAt ? 1 : -1));
  const incidents = [...s.incidents].sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
  return buildDetail(summaryOf(s), series, history, incidents);
}

export function demoStats(): FleetStats {
  const sites = allSites();
  const all = sites.flatMap((s) => s.checks);
  const weekAgo = new Date(NOW - 7 * DAY_MS).toISOString();
  const recent = all.filter((c) => c.ranAt >= weekAgo).length;
  const since = all.reduce<string | null>(
    (acc, c) => (acc === null || c.ranAt < acc ? c.ranAt : acc),
    null,
  );
  return {
    sites: sites.filter((s) => s.site.enabled).length,
    checksPerDay: Math.round(recent / 7),
    incidentsAndCertWarnings: sites.reduce(
      (n, s) => n + s.incidents.filter((i) => i.kind === "http" || i.kind === "ssl").length,
      0,
    ),
    since,
  };
}
