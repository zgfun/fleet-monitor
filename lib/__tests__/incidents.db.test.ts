import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { hasTestDb } = await import("./test-db");
const { db, sites, incidents } = await import("@/db");
const { eq, inArray } = await import("drizzle-orm");
const { applyIncidents } = await import("@/lib/incidents");

const tag = `fm-inc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let siteId = 0;

const http = (ok: boolean, data: Record<string, unknown> = {}) => ({
  kind: "http" as const,
  ok,
  latency_ms: ok ? 120 : null,
  data: { status: ok ? 200 : 503, ...data },
});

const openRows = () =>
  db.select().from(incidents).where(eq(incidents.siteId, siteId)).orderBy(incidents.id);

beforeAll(async () => {
  if (!hasTestDb) return;
  const [s] = await db.insert(sites).values({ host: `${tag}.example`, name: tag }).returning({ id: sites.id });
  siteId = s.id;
});

afterAll(async () => {
  if (!hasTestDb || !siteId) return;
  await db.delete(sites).where(inArray(sites.id, [siteId]));
});

describe.skipIf(!hasTestDb)("applyIncidents (real Postgres)", () => {
  it("opens one http incident, does not duplicate it, and closes it on recovery", async () => {
    const first = await applyIncidents(siteId, [http(false)]);
    expect(first).toEqual([
      { kind: "http", event: "opened", summary: "HTTP 503", incidentId: expect.any(Number) },
    ]);

    expect(await applyIncidents(siteId, [http(false)])).toEqual([]);
    expect((await openRows()).filter((r) => r.kind === "http")).toHaveLength(1);

    const closed = await applyIncidents(siteId, [http(true)]);
    expect(closed).toEqual([
      { kind: "http", event: "closed", summary: "200 in 120 ms", incidentId: first[0].incidentId },
    ]);
    const [row] = (await openRows()).filter((r) => r.kind === "http");
    expect(row.closedAt).toBeInstanceOf(Date);
    expect(row.note).toBe("HTTP 503");
  });

  it("opens an ssl incident for a certificate under the alert threshold", async () => {
    const events = await applyIncidents(siteId, [
      { kind: "ssl", ok: false, latency_ms: 40, data: { validTo: null, daysLeft: 9, issuer: "Test CA" } },
    ]);
    expect(events).toMatchObject([{ kind: "ssl", event: "opened", summary: "9 days left" }]);
  });

  it("ignores kinds that never open incidents", async () => {
    const before = (await openRows()).length;
    const events = await applyIncidents(siteId, [
      { kind: "links", ok: false, latency_ms: null, data: { total: 3, checked: 3, broken: [{ url: "/x", status: 404 }] } },
      { kind: "noindex", ok: false, latency_ms: null, data: { noindex: true, source: "meta" } },
    ]);
    expect(events).toEqual([]);
    expect(await openRows()).toHaveLength(before);
  });

  it("does not open duplicates when two runs race", async () => {
    await applyIncidents(siteId, [http(true)]);
    const results = await Promise.all([
      applyIncidents(siteId, [http(false)]),
      applyIncidents(siteId, [http(false)]),
    ]);
    expect(results.flat().filter((e) => e.event === "opened")).toHaveLength(1);
    const open = (await openRows()).filter((r) => r.kind === "http" && r.closedAt === null);
    expect(open).toHaveLength(1);
  });
});
