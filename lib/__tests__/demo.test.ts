import { describe, expect, it } from "vitest";
import { DEMO_NOW, demoFleet, demoSite, demoStats } from "@/lib/demo";
import type { Status } from "@/lib/status";

describe("demo data", () => {
  it("is deterministic", () => {
    expect(JSON.stringify(demoFleet())).toBe(JSON.stringify(demoFleet()));
    expect(JSON.stringify(demoSite(7))).toBe(JSON.stringify(demoSite(7)));
    expect(demoStats()).toEqual(demoStats());
  });

  it("has 30 fake sites on .example hosts", () => {
    const fleet = demoFleet();
    expect(fleet).toHaveLength(30);
    expect(fleet[0]).toMatchObject({ id: 1, host: "site-01.example", url: "https://site-01.example/" });
    expect(fleet[29].host).toBe("site-30.example");
    for (const s of fleet) expect(s.host).toMatch(/^site-\d{2}\.example$/);
    expect(new Set(fleet.map((s) => s.id)).size).toBe(30);
  });

  it("covers every status, mostly green", () => {
    const counts = demoFleet().reduce<Record<Status, number>>(
      (acc, s) => ({ ...acc, [s.status]: acc[s.status] + 1 }),
      { up: 0, warn: 0, down: 0, unknown: 0 },
    );
    expect(counts.up).toBeGreaterThanOrEqual(12);
    expect(counts.warn).toBeGreaterThanOrEqual(1);
    expect(counts.down).toBeGreaterThanOrEqual(1);
    expect(counts.unknown).toBeGreaterThanOrEqual(1);
  });

  it("builds a complete detail view with ISO dates", () => {
    const site = demoSite(4)!;
    expect(site.checks.http?.status).toBe("up");
    expect(Object.keys(site.checks).sort()).toEqual(
      ["cookie", "http", "links", "noindex", "pagespeed", "ssl"],
    );
    expect(site.responseTime).toHaveLength(30);
    expect(site.perfScore).toHaveLength(30);
    expect(site.history).toHaveLength(50);
    expect(site.brokenLinks.length).toBeGreaterThan(0);
    expect(site.uptime30d).toBe(1);
    const times = site.responseTime.map((p) => p.t);
    expect([...times].sort()).toEqual(times);
    for (const p of site.responseTime) {
      expect(new Date(p.t).toISOString()).toBe(p.t);
      expect(p.v).toBeGreaterThanOrEqual(150);
      expect(p.v).toBeLessThanOrEqual(2500);
    }
    for (const p of site.perfScore) {
      expect(p.v).toBeGreaterThanOrEqual(30);
      expect(p.v).toBeLessThanOrEqual(99);
    }
    expect(site.history[0].ranAt >= site.history[49].ranAt).toBe(true);
    expect(site.history[0].ranAt <= new Date(Date.parse(DEMO_NOW) + 60_000).toISOString()).toBe(true);
  });

  it("models the scenario sites", () => {
    const down = demoSite(7)!;
    expect(down.status).toBe("down");
    expect(down.openIncidents).toBe(1);
    expect(down.uptime30d).toBeLessThan(1);

    expect(demoSite(12)!.checks.ssl?.status).toBe("down");
    expect(demoSite(19)!.checks.ssl?.status).toBe("warn");
    expect(demoSite(26)!.checks.noindex?.status).toBe("warn");
    expect(demoSite(9)!.checks.cookie?.status).toBe("warn");

    const recovered = demoSite(3)!;
    expect(recovered.incidents).toHaveLength(1);
    expect(recovered.incidents[0].closedAt).not.toBeNull();
    expect(recovered.status).toBe("up");

    const fresh = demoSite(30)!;
    expect(fresh.status).toBe("unknown");
    expect(fresh.history).toEqual([]);
    expect(fresh.uptime30d).toBeNull();

    expect(demoSite(0)).toBeNull();
    expect(demoSite(31)).toBeNull();
  });

  it("computes plausible stats", () => {
    const stats = demoStats();
    expect(stats.sites).toBe(29);
    expect(stats.checksPerDay).toBeGreaterThan(100);
    expect(stats.incidentsAndCertWarnings).toBeGreaterThanOrEqual(4);
    expect(stats.since).toBe(new Date(stats.since!).toISOString());
  });
});
