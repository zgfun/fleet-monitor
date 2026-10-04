import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  isAuthConfigured,
  safeNextPath,
  verifyPassword,
  verifySessionFromRequest,
  verifySessionToken,
} from "../session";

const NOW = Date.parse("2026-10-01T06:00:00Z");

describe("session tokens", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "test-secret-0123456789");
    vi.stubEnv("ADMIN_PASSWORD", "correct horse");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a freshly created token", async () => {
    const token = await createSessionToken(NOW);
    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]+$/);
    expect(await verifySessionToken(token, NOW)).toBe(true);
  });

  it("expires after 30 days", async () => {
    const token = await createSessionToken(NOW);
    expect(await verifySessionToken(token, NOW + (SESSION_MAX_AGE - 60) * 1000)).toBe(true);
    expect(await verifySessionToken(token, NOW + SESSION_MAX_AGE * 1000)).toBe(false);
  });

  it("rejects tampered tokens", async () => {
    const token = await createSessionToken(NOW);
    const [expiry, sig] = token.split(".");
    const longer = `${Number(expiry) + 86_400}.${sig}`;
    const flipped = `${expiry}.${sig.slice(0, -2)}${sig.endsWith("AA") ? "BB" : "AA"}`;
    expect(await verifySessionToken(longer, NOW)).toBe(false);
    expect(await verifySessionToken(flipped, NOW)).toBe(false);
    expect(await verifySessionToken(`${token}.extra`, NOW)).toBe(false);
    expect(await verifySessionToken("garbage", NOW)).toBe(false);
    expect(await verifySessionToken("", NOW)).toBe(false);
    expect(await verifySessionToken(undefined, NOW)).toBe(false);
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await createSessionToken(NOW);
    vi.stubEnv("SESSION_SECRET", "another-secret");
    expect(await verifySessionToken(token, NOW)).toBe(false);
  });

  it("revokes existing tokens when ADMIN_PASSWORD changes", async () => {
    const token = await createSessionToken(NOW);
    vi.stubEnv("ADMIN_PASSWORD", "new battery staple");
    expect(await verifySessionToken(token, NOW)).toBe(false);
  });

  it("fails closed when SESSION_SECRET is missing", async () => {
    const token = await createSessionToken(NOW);
    vi.stubEnv("SESSION_SECRET", "");
    expect(isAuthConfigured()).toBe(false);
    await expect(createSessionToken(NOW)).rejects.toThrow(/SESSION_SECRET/);
    expect(await verifySessionToken(token, NOW)).toBe(false);
  });

  it("reads the cookie from a plain Request", async () => {
    const token = await createSessionToken();
    const req = new Request("http://localhost/api/run", {
      headers: { cookie: `other=1; ${SESSION_COOKIE}=${encodeURIComponent(token)}` },
    });
    expect(await verifySessionFromRequest(req)).toBe(true);
    expect(await verifySessionFromRequest(new Request("http://localhost/api/run"))).toBe(false);
  });
});

describe("verifyPassword", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts only the configured password", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "correct horse");
    expect(await verifyPassword("correct horse")).toBe(true);
    expect(await verifyPassword("correct hors")).toBe(false);
    expect(await verifyPassword("")).toBe(false);
  });

  it("always fails when ADMIN_PASSWORD is unset", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(await verifyPassword("")).toBe(false);
    expect(await verifyPassword("anything")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps local paths", () => {
    expect(safeNextPath("/sites/3?tab=links")).toBe("/sites/3?tab=links");
  });

  it("falls back to / for anything off-site", () => {
    for (const value of ["//evil.example", "/\\evil.example", "https://evil.example", "sites", "", undefined, null, "/\nx"]) {
      expect(safeNextPath(value)).toBe("/");
    }
  });
});
