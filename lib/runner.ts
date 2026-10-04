import { eq, inArray } from "drizzle-orm";
import pLimit from "p-limit";
import { checks, CHECK_KINDS, db, sites, type CheckKind, type Site } from "@/db";
import { sendAlert } from "@/lib/alerts";
import {
  checkCookieBanner,
  checkHttp,
  checkLinks,
  checkNoindex,
  checkPagespeed,
  checkSsl,
  fetchHomepage,
} from "@/lib/checks";
import { targetFor, type CheckResult, type CheckTarget } from "@/lib/checks/types";
import { applyIncidents } from "@/lib/incidents";
import { THRESHOLDS } from "@/lib/status";

export type KindResult = {
  kind: CheckKind;
  ok: boolean;
  latency_ms: number | null;
  data: Record<string, unknown>;
};

export type RunSiteResult = {
  siteId: number;
  results: KindResult[];
  opened: number;
  closed: number;
};

export type RunFleetResult = {
  sites: number;
  checks: number;
  opened: number;
  closed: number;
  /** Sites not (fully) checked because the run hit its deadline. */
  skipped: number;
  durationMs: number;
};

const RETRY_KINDS: readonly CheckKind[] = ["http", "ssl"];
const FLEET_CONCURRENCY = 8;
// PageSpeed calls are slow (15-60 s) but cost us nothing locally, so they get their own lane
// instead of holding fleet slots.
const PAGESPEED_CONCURRENCY = 10;
/**
 * No new work starts after this. The cron function is killed at 300 s, and a site started at the
 * deadline can still need ~90 s in the worst case (homepage + 50 timing-out links).
 */
const DEFAULT_DEADLINE_MS = 200_000;

export type CollectDeps = {
  sleep?: (ms: number) => Promise<void>;
  retryDelayMs?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function errorResult(err: unknown, data: Record<string, unknown> = {}): CheckResult {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, latency_ms: null, data: { ...data, error: message } };
}

async function safely<T extends CheckResult | null>(
  fn: () => Promise<T>,
): Promise<CheckResult | null> {
  try {
    return await fn();
  } catch (err) {
    return errorResult(err);
  }
}

/** Only failures that might clear up within seconds are worth the retry delay. */
export function isTransient(kind: CheckKind, r: CheckResult): boolean {
  if (r.ok) return false;
  if (kind === "ssl") return r.data.daysLeft == null; // a cert that was read won't change in 10 s
  const status = typeof r.data.status === "number" ? r.data.status : null;
  return status === null || status >= 500;
}

async function withRetry(
  kind: CheckKind,
  fn: () => Promise<CheckResult | null>,
  deps: Required<CollectDeps>,
): Promise<CheckResult | null> {
  const first = await safely(fn);
  if (!first || !isTransient(kind, first)) return first && { ...first, data: { ...first.data, attempts: 1 } };
  await deps.sleep(deps.retryDelayMs);
  const second = await safely(fn);
  if (!second) return null;
  return { ...second, data: { ...second.data, attempts: 2 } };
}

/**
 * Runs the requested checks for one target without touching the database.
 * The homepage is fetched once and shared by links/noindex/cookie; if that
 * fetch fails, each check falls back to fetching on its own (and reports the error).
 */
export async function collectResults(
  t: CheckTarget,
  kinds: readonly CheckKind[] = CHECK_KINDS,
  deps: CollectDeps = {},
): Promise<KindResult[]> {
  const d: Required<CollectDeps> = {
    sleep: deps.sleep ?? defaultSleep,
    retryDelayMs: deps.retryDelayMs ?? THRESHOLDS.retryDelayMs,
  };
  const want = new Set(kinds);
  const needsHome = want.has("links") || want.has("noindex") || want.has("cookie");

  const homePromise = needsHome
    ? fetchHomepage(t).catch(() => null)
    : Promise.resolve(null);

  const run = (kind: CheckKind, fn: () => Promise<CheckResult | null>) =>
    want.has(kind)
      ? (RETRY_KINDS.includes(kind) ? withRetry(kind, fn, d) : safely(fn)).then((r) =>
          r ? { kind, ...r } : null,
        )
      : Promise.resolve(null);

  const pageDependent = homePromise.then((home) => {
    const linkTarget = home ? { ...t, url: home.finalUrl } : t;
    return Promise.all([
      run("links", () => checkLinks(linkTarget, home ? { html: home.html } : undefined)),
      run("noindex", () =>
        checkNoindex(t, home ? { html: home.html, headers: home.headers } : undefined),
      ),
      run("cookie", () => checkCookieBanner(t, home ? { html: home.html } : undefined)),
    ]);
  });

  const [http, ssl, pagespeed, rest] = await Promise.all([
    run("http", () => checkHttp(t)),
    run("ssl", () => checkSsl(t)),
    run("pagespeed", () => checkPagespeed(t)),
    pageDependent,
  ]);

  const byKind = new Map<CheckKind, KindResult>();
  for (const r of [http, ssl, pagespeed, ...rest]) if (r) byKind.set(r.kind, r);
  return CHECK_KINDS.filter((k) => byKind.has(k)).map((k) => byKind.get(k)!);
}

export async function runSite(
  site: Site,
  opts: { kinds?: CheckKind[] } & CollectDeps = {},
): Promise<RunSiteResult> {
  const results = await collectResults(targetFor(site), opts.kinds ?? CHECK_KINDS, opts);

  if (results.length > 0) {
    const ranAt = new Date();
    await db.insert(checks).values(
      results.map((r) => ({
        siteId: site.id,
        kind: r.kind,
        ranAt,
        ok: r.ok,
        latencyMs: r.latency_ms == null ? null : Math.round(r.latency_ms),
        data: r.data,
      })),
    );
  }

  const events = await applyIncidents(site.id, results);
  // Alerts go out after the incident transaction commits; sendAlert never throws.
  await Promise.all(
    events.map((e) => sendAlert({ site, kind: e.kind, event: e.event, summary: e.summary })),
  );

  return {
    siteId: site.id,
    results,
    opened: events.filter((e) => e.event === "opened").length,
    closed: events.filter((e) => e.event === "closed").length,
  };
}

export async function runFleet(
  opts: {
    siteIds?: number[];
    kinds?: CheckKind[];
    deadlineMs?: number;
    clock?: () => number;
  } & CollectDeps = {},
): Promise<RunFleetResult> {
  const clock = opts.clock ?? (() => performance.now());
  const started = clock();
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const targets = opts.siteIds?.length
    ? await db.select().from(sites).where(inArray(sites.id, opts.siteIds))
    : await db.select().from(sites).where(eq(sites.enabled, true));

  const kinds = opts.kinds ?? CHECK_KINDS;
  const fastKinds = kinds.filter((k) => k !== "pagespeed");
  const phases: { kinds: CheckKind[]; limit: ReturnType<typeof pLimit> }[] = [];
  if (fastKinds.length) phases.push({ kinds: fastKinds, limit: pLimit(FLEET_CONCURRENCY) });
  if (kinds.includes("pagespeed")) {
    phases.push({ kinds: ["pagespeed"], limit: pLimit(PAGESPEED_CONCURRENCY) });
  }

  const skipped = new Set<string>();
  const deps = { sleep: opts.sleep, retryDelayMs: opts.retryDelayMs };
  const outcomes = await Promise.all(
    phases.flatMap((phase) =>
      targets.map((site) =>
        phase.limit(async () => {
          if (clock() - started > deadlineMs) {
            skipped.add(site.host);
            return null;
          }
          try {
            return await runSite(site, { ...deps, kinds: phase.kinds });
          } catch (err) {
            console.error(`[runner] site ${site.host} failed:`, err);
            return null;
          }
        }),
      ),
    ),
  );

  if (skipped.size > 0) {
    console.warn(
      `[runner] deadline of ${deadlineMs} ms reached; not checked: ${[...skipped].join(", ")}`,
    );
  }

  let checksRun = 0;
  let opened = 0;
  let closed = 0;
  for (const o of outcomes) {
    if (!o) continue;
    checksRun += o.results.length;
    opened += o.opened;
    closed += o.closed;
  }

  return {
    sites: targets.length,
    checks: checksRun,
    opened,
    closed,
    skipped: skipped.size,
    durationMs: Math.round(clock() - started),
  };
}
