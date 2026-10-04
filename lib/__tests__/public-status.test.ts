import { describe, expect, it } from "vitest";
import { DEMO_NOW, demoFleet, demoSite } from "@/lib/demo";
import { toPublicStatus } from "@/lib/public-status";

describe("toPublicStatus", () => {
  const withEverything = demoFleet()
    .map((s) => demoSite(s.id)!)
    .find((s) => s.brokenLinks.length > 0 && s.incidents.length > 0) ?? demoSite(1)!;

  it("keeps only availability data", () => {
    const pub = toPublicStatus(withEverything, DEMO_NOW);
    expect(Object.keys(pub).sort()).toEqual(
      ["components", "days", "host", "incidents", "lastChecked", "name", "now", "overall", "uptime30d"],
    );
    expect(pub.components.map((c) => Object.keys(c).sort())).toEqual([["kind", "status"], ["kind", "status"]]);
    expect(pub.days).toHaveLength(30);
    for (const inc of pub.incidents) {
      expect(Object.keys(inc).sort()).toEqual(["closedAt", "kind", "openedAt"]);
      expect(["http", "ssl"]).toContain(inc.kind);
    }
  });

  it("serialises without admin-only fields or check data", () => {
    const json = JSON.stringify(toPublicStatus(withEverything, DEMO_NOW));
    for (const leak of ["brokenLinks", "history", "publicSlug", "enabled", '"id"', '"url"', '"data"', "summary"]) {
      expect(json).not.toContain(leak);
    }
    for (const link of withEverything.brokenLinks) expect(json).not.toContain(link.url);
    for (const inc of withEverything.incidents) if (inc.note) expect(json).not.toContain(inc.note);
  });
});
