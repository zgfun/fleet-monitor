import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, incidents: {} }));
vi.mock("@/lib/checks/summarize", () => ({
  snapshotStatus: () => ({ status: "down", summary: "x" }),
}));

const { decideIncident } = await import("@/lib/incidents");

describe("decideIncident", () => {
  it("opens when the check failed and nothing is open", () => {
    expect(decideIncident({ open: null, ok: false })).toBe("open");
  });

  it("does not open a duplicate when one is already open", () => {
    expect(decideIncident({ open: { id: 1 }, ok: false })).toBe("none");
  });

  it("closes an open incident when the check recovers", () => {
    expect(decideIncident({ open: { id: 1 }, ok: true })).toBe("close");
  });

  it("does nothing when healthy and nothing is open", () => {
    expect(decideIncident({ open: null, ok: true })).toBe("none");
  });
});
