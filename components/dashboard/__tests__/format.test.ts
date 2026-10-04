import { describe, expect, it } from "vitest";
import { DEMO_NOW, demoFleet, demoSite } from "@/lib/demo";
import { dailyHttpStatus } from "../days";
import { actionError, formatDate, formatMs, formatPercent, formatRelative } from "../format";

describe("format", () => {
  it("formats durations and percentages", () => {
    expect(formatMs(412)).toBe("412 ms");
    expect(formatMs(2480)).toBe("2.5 s");
    expect(formatMs(null)).toBe("—");
    expect(formatPercent(0.99871)).toBe("99.87%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("formats dates in UTC regardless of host timezone", () => {
    expect(formatDate("2026-09-01T23:30:00Z")).toBe("Sep 1, 2026");
  });

  it("formats relative time against a fixed now", () => {
    const now = "2026-10-01T06:00:00Z";
    expect(formatRelative("2026-10-01T05:59:30Z", now)).toBe("just now");
    expect(formatRelative("2026-10-01T05:00:00Z", now)).toBe("1 hour ago");
    expect(formatRelative("2026-09-28T06:00:00Z", now)).toBe("3 days ago");
    expect(formatRelative(null, now)).toBe("never");
  });

  it("hides production-sanitised server action errors", () => {
    expect(actionError(new Error("Slug taken"), "x")).toBe("Slug taken");
    expect(actionError(new Error("An error occurred in the Server Components render."), "fallback")).toBe("fallback");
  });
});

describe("dailyHttpStatus", () => {
  it("returns one bucket per day ending today", () => {
    const site = demoSite(demoFleet()[0].id)!;
    const days = dailyHttpStatus(site, DEMO_NOW);
    expect(days).toHaveLength(30);
    expect(days.at(-1)!.day).toBe("2026-10-01");
    expect(days[0].day).toBe("2026-09-02");
  });

  it("marks days overlapping an http incident as down", () => {
    const days = dailyHttpStatus(
      {
        history: [],
        responseTime: [{ t: "2026-09-30T06:00:00Z", v: 300 }],
        incidents: [{ id: 1, kind: "http", openedAt: "2026-09-29T06:00:00Z", closedAt: "2026-09-29T09:00:00Z", note: null }],
      },
      "2026-10-01T06:00:00Z",
      3,
    );
    expect(days.map((d) => d.status)).toEqual(["down", "up", "unknown"]);
  });

  it("shows the demo site with failing HTTP as down on some day", () => {
    const down = demoFleet().find((s) => s.checks.http?.status === "down");
    if (!down) return;
    const days = dailyHttpStatus(demoSite(down.id)!, DEMO_NOW);
    expect(days.some((d) => d.status === "down")).toBe(true);
  });
});
