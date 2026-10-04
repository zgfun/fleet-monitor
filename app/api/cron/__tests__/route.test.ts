import { afterEach, describe, expect, it, vi } from "vitest";

const runFleet = vi.hoisted(() =>
  vi.fn(async () => ({ sites: 2, checks: 10, opened: 0, closed: 0, skipped: 0, durationMs: 5 })),
);
vi.mock("@/lib/runner", () => ({ runFleet }));

const { GET, maxDuration } = await import("../route");

const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron", { headers: authorization ? { authorization } : {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/cron", () => {
  it("allows the full Vercel function budget", () => {
    expect(maxDuration).toBe(300);
  });

  it("rejects a missing or wrong bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect((await call("s3cret-value")).status).toBe(401);
    expect(runFleet).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(runFleet).not.toHaveBeenCalled();
  });

  it("runs the fleet with the right token", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const res = await call("Bearer s3cret-value");
    expect(res.status).toBe(200);
    expect(runFleet).toHaveBeenCalledWith();
    expect(await res.json()).toMatchObject({ sites: 2, checks: 10 });
  });
});
