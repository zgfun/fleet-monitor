import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Must come first: points DATABASE_URL at TEST_DATABASE_URL before db/index.ts creates its client.
const { hasTestDb } = await import("./test-db");
const { db, sites, checks, incidents } = await import("@/db");
const { eq, inArray } = await import("drizzle-orm");
const { getFleet, getFleetStats, getSite, getSiteBySlug } = await import("@/lib/queries");

const DAY = 24 * 60 * 60 * 1000;
const tag = `fm-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const host = `${tag}.example`;
const slug = tag;
const disabledHost = `${tag}-off.example`;
let siteId = 0;
let disabledId = 0;

const ago = (days: number, extraMs = 0) => new Date(Date.now() - days * DAY + extraMs);

beforeAll(async () => {
  if (!hasTestDb) return;
  const [site] = await db
    .insert(sites)
    .values({ host, name: `Test ${tag}`, publicSlug: slug })
    .returning({ id: sites.id });
  siteId = site.id;
  const [off] = await db
    .insert(sites)
    .values({ host: disabledHost, name: `Test ${tag} off`, enabled: false, publicSlug: `${slug}-off` })
    .returning({ id: sites.id });
  disabledId = off.id;

  const rows: (typeof checks.$inferInsert)[] = [];
  // 40 days of http: the oldest 10 fall outside the 30-day window.
  for (let d = 39; d >= 0; d--) {
    rows.push({
      siteId,
      kind: "http",
      ranAt: ago(d),
      ok: d !== 5,
      latencyMs: 300 + d,
      data: d === 5 ? { status: 503, finalUrl: null, blocked: false, error: "HTTP 503" } : { status: 200, finalUrl: `https://${host}/`, blocked: false },
    });
  }
  rows.push(
    { siteId, kind: "pagespeed", ranAt: ago(2), ok: true, latencyMs: 15000, data: { score: 81, strategy: "mobile" } },
    { siteId, kind: "pagespeed", ranAt: ago(1), ok: true, latencyMs: 15000, data: { score: 77, strategy: "mobile" } },
    { siteId, kind: "ssl", ranAt: ago(0, 1000), ok: true, latencyMs: 80, data: { validTo: ago(-20).toISOString(), daysLeft: 20, issuer: "Test CA" } },
    { siteId, kind: "links", ranAt: ago(3), ok: true, latencyMs: 900, data: { total: 10, checked: 10, broken: [] } },
    {
      siteId,
      kind: "links",
      ranAt: ago(0, 2000),
      ok: false,
      latencyMs: 900,
      data: { total: 10, checked: 10, broken: [{ url: `https://${host}/gone`, status: 404 }] },
    },
  );
  await db.insert(checks).values(rows);
  await db.insert(incidents).values([
    { siteId, kind: "http", openedAt: ago(5), closedAt: ago(4), note: "HTTP 503" },
    { siteId, kind: "ssl", openedAt: ago(0), closedAt: null, note: "test" },
    { siteId, kind: "links", openedAt: ago(0), closedAt: null, note: "not an incident kind" },
  ]);
});

afterAll(async () => {
  if (!hasTestDb) return;
  // Cascades to checks and incidents.
  await db.delete(sites).where(inArray(sites.id, [siteId, disabledId].filter(Boolean)));
  const left = await db.select({ id: sites.id }).from(sites).where(eq(sites.host, host));
  expect(left).toHaveLength(0);
});

describe.skipIf(!hasTestDb)("queries (real Postgres)", () => {
  it("getFleet returns the latest snapshot per kind without N+1", async () => {
    const fleet = await getFleet();
    const s = fleet.find((x) => x.id === siteId);
    expect(s).toBeDefined();
    expect(s!.url).toBe(`https://${host}/`);
    expect(s!.publicSlug).toBe(slug);
    expect(Object.keys(s!.checks).sort()).toEqual(["http", "links", "pagespeed", "ssl"]);
    expect(s!.checks.http).toMatchObject({ ok: true, latencyMs: 300, status: "up" });
    expect(s!.checks.links?.ok).toBe(false);
    expect(s!.checks.pagespeed?.data.score).toBe(77);
    expect(s!.checks.ssl?.status).toBe("warn");
    expect(s!.status).toBe("warn");
    expect(s!.openIncidents).toBe(2);
    expect(typeof s!.checks.http!.ranAt).toBe("string");
    expect(fleet.find((x) => x.id === disabledId)).toMatchObject({ enabled: false, status: "unknown" });
  });

  it("getSite builds series, uptime, history and broken links", async () => {
    const s = await getSite(siteId);
    expect(s).not.toBeNull();
    expect(s!.responseTime.length).toBeGreaterThanOrEqual(29);
    expect(s!.responseTime.length).toBeLessThanOrEqual(31);
    const times = s!.responseTime.map((p) => p.t);
    expect([...times].sort()).toEqual(times);
    expect(s!.responseTime.at(-1)).toMatchObject({ v: 300 });
    expect(s!.perfScore.map((p) => p.v)).toEqual([81, 77]);
    expect(s!.uptime30d).toBeCloseTo((s!.responseTime.length - 1) / s!.responseTime.length, 5);
    expect(s!.history).toHaveLength(45);
    expect(s!.history[0].kind).toBe("links");
    for (let i = 1; i < s!.history.length; i++) {
      expect(s!.history[i - 1].ranAt >= s!.history[i].ranAt).toBe(true);
    }
    expect(s!.brokenLinks).toEqual([{ url: `https://${host}/gone`, status: 404 }]);
    expect(s!.incidents).toHaveLength(3);
    expect(s!.incidents.find((i) => i.kind === "http")?.closedAt).toMatch(/Z$/);

    expect(await getSite(2_147_483_000)).toBeNull();
    expect(await getSite(-1)).toBeNull();
  });

  it("getSiteBySlug only returns enabled sites", async () => {
    expect((await getSiteBySlug(slug))?.id).toBe(siteId);
    expect(await getSiteBySlug(`${slug}-off`)).toBeNull();
    expect(await getSiteBySlug(`${slug}-missing`)).toBeNull();
  });

  it("getFleetStats counts sites, checks, and http/ssl incidents", async () => {
    const before = await getFleetStats();
    await db.update(sites).set({ enabled: true }).where(eq(sites.id, disabledId));
    await db.insert(incidents).values({ siteId: disabledId, kind: "http", openedAt: ago(1), closedAt: ago(1) });
    await db.insert(checks).values(
      Array.from({ length: 14 }, (_, i) => ({ siteId: disabledId, kind: "http" as const, ranAt: ago(i % 7), ok: true, latencyMs: 100 })),
    );
    const after = await getFleetStats();
    expect(after.sites).toBe(before.sites + 1);
    expect(after.incidentsAndCertWarnings).toBe(before.incidentsAndCertWarnings + 1);
    expect(after.checksPerDay).toBe(before.checksPerDay + 2);
    expect(after.since).not.toBeNull();
    expect(new Date(after.since!).getTime()).toBeLessThanOrEqual(ago(39).getTime() + 60_000);
    expect(after.since).toBe(new Date(after.since!).toISOString());
  });
});
