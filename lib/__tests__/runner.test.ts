import { beforeEach, describe, expect, it, vi } from "vitest";

const checks = vi.hoisted(() => ({
  checkHttp: vi.fn(),
  checkSsl: vi.fn(),
  checkLinks: vi.fn(),
  checkPagespeed: vi.fn(),
  checkNoindex: vi.fn(),
  checkCookieBanner: vi.fn(),
  fetchHomepage: vi.fn(),
}));

const store = vi.hoisted(() => ({
  inserted: [] as unknown[],
  sites: [] as unknown[],
}));

vi.mock("@/lib/checks", () => checks);
vi.mock("@/lib/alerts", () => ({ sendAlert: vi.fn(async () => ({ skipped: true })) }));
vi.mock("@/lib/incidents", () => ({ applyIncidents: vi.fn(async () => []) }));
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  return {
    ...schema,
    db: {
      insert: () => ({
        values: async (rows: unknown[]) => {
          store.inserted.push(...rows);
        },
      }),
      select: () => ({
        from: () => ({ where: async () => store.sites }),
      }),
    },
  };
});

const { collectResults, runSite, runFleet } = await import("@/lib/runner");
const { applyIncidents } = await import("@/lib/incidents");
const { sendAlert } = await import("@/lib/alerts");

const target = { host: "example.com", url: "https://example.com/" };
const ok = (data: Record<string, unknown> = {}) => ({ ok: true, latency_ms: 100, data });
const fail = (data: Record<string, unknown> = {}) => ({ ok: false, latency_ms: null, data });

function site(id: number, host = `site-${id}.example`) {
  return {
    id,
    host,
    url: null,
    name: host,
    enabled: true,
    publicSlug: null,
    createdAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.inserted = [];
  store.sites = [];
  checks.checkHttp.mockResolvedValue(ok({ status: 200 }));
  checks.checkSsl.mockResolvedValue(ok({ daysLeft: 60 }));
  checks.checkLinks.mockResolvedValue(ok({ total: 3, checked: 3, broken: [] }));
  checks.checkPagespeed.mockResolvedValue(null);
  checks.checkNoindex.mockResolvedValue(ok({ noindex: false, source: null }));
  checks.checkCookieBanner.mockResolvedValue(ok({ present: true, vendor: "CookieYes" }));
  checks.fetchHomepage.mockResolvedValue({
    html: "<html></html>",
    headers: new Headers(),
    finalUrl: "https://www.example.com/",
  });
});

describe("collectResults retry", () => {
  it("does not retry passing checks and records attempts: 1", async () => {
    const sleep = vi.fn(async () => {});
    const results = await collectResults(target, ["http", "ssl"], { sleep, retryDelayMs: 5 });
    expect(sleep).not.toHaveBeenCalled();
    expect(checks.checkHttp).toHaveBeenCalledTimes(1);
    expect(results.find((r) => r.kind === "http")?.data.attempts).toBe(1);
    expect(results.find((r) => r.kind === "ssl")?.data.attempts).toBe(1);
  });

  it("retries a failed http check exactly once after the delay", async () => {
    checks.checkHttp.mockResolvedValueOnce(fail({ status: 503 })).mockResolvedValueOnce(ok({ status: 200 }));
    const sleep = vi.fn(async () => {});
    const results = await collectResults(target, ["http"], { sleep, retryDelayMs: 1234 });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1234);
    expect(checks.checkHttp).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { kind: "http", ok: true, latency_ms: 100, data: { status: 200, attempts: 2 } },
    ]);
  });

  it("stores the second failure when both attempts fail (no third try)", async () => {
    checks.checkSsl.mockResolvedValue(fail({ daysLeft: null, error: "ECONNRESET" }));
    const sleep = vi.fn(async () => {});
    const results = await collectResults(target, ["ssl"], { sleep, retryDelayMs: 0 });
    expect(checks.checkSsl).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({ kind: "ssl", ok: false, data: { attempts: 2 } });
  });

  it("does not retry failures that cannot clear up within the run", async () => {
    checks.checkSsl.mockResolvedValue(fail({ daysLeft: 9 }));
    checks.checkHttp.mockResolvedValue(fail({ status: 404 }));
    const sleep = vi.fn(async () => {});
    const results = await collectResults(target, ["http", "ssl"], { sleep, retryDelayMs: 0 });
    expect(sleep).not.toHaveBeenCalled();
    expect(checks.checkSsl).toHaveBeenCalledTimes(1);
    expect(checks.checkHttp).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r).toMatchObject({ ok: false, data: { attempts: 1 } });
  });

  it("treats a thrown check as a failure and retries it", async () => {
    checks.checkHttp.mockRejectedValue(new Error("boom"));
    const sleep = vi.fn(async () => {});
    const results = await collectResults(target, ["http"], { sleep, retryDelayMs: 0 });
    expect(checks.checkHttp).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({ ok: false, data: { error: "boom", attempts: 2 } });
  });

  it("never retries non-http/ssl kinds", async () => {
    checks.checkLinks.mockResolvedValue(fail({ broken: [{ url: "/x", status: 404 }] }));
    checks.checkNoindex.mockResolvedValue(fail({ noindex: true }));
    checks.checkCookieBanner.mockResolvedValue(fail({ present: false }));
    checks.checkPagespeed.mockResolvedValue(fail({ score: 20 }));
    const sleep = vi.fn(async () => {});
    const results = await collectResults(target, ["links", "noindex", "cookie", "pagespeed"], {
      sleep,
      retryDelayMs: 0,
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(checks.checkLinks).toHaveBeenCalledTimes(1);
    expect(checks.checkPagespeed).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r.data.attempts).toBeUndefined();
  });
});

describe("collectResults wiring", () => {
  it("fetches the homepage once and shares it with links/noindex/cookie", async () => {
    await collectResults(target, undefined, { sleep: async () => {}, retryDelayMs: 0 });
    expect(checks.fetchHomepage).toHaveBeenCalledTimes(1);
    expect(checks.checkLinks).toHaveBeenCalledWith(
      { ...target, url: "https://www.example.com/" },
      { html: "<html></html>" },
    );
    expect(checks.checkNoindex.mock.calls[0][1]).toMatchObject({ html: "<html></html>" });
    expect(checks.checkCookieBanner.mock.calls[0][1]).toEqual({ html: "<html></html>" });
  });

  it("skips pagespeed when it returns null and respects kinds", async () => {
    const results = await collectResults(target, undefined, { sleep: async () => {}, retryDelayMs: 0 });
    expect(results.map((r) => r.kind)).toEqual(["http", "ssl", "links", "noindex", "cookie"]);

    vi.clearAllMocks();
    const only = await collectResults(target, ["http"], { sleep: async () => {}, retryDelayMs: 0 });
    expect(only.map((r) => r.kind)).toEqual(["http"]);
    expect(checks.fetchHomepage).not.toHaveBeenCalled();
    expect(checks.checkSsl).not.toHaveBeenCalled();
  });

  it("falls back to standalone checks when the homepage fetch fails", async () => {
    checks.fetchHomepage.mockResolvedValue(null);
    await collectResults(target, ["links", "cookie"], { sleep: async () => {}, retryDelayMs: 0 });
    expect(checks.checkLinks).toHaveBeenCalledWith(target, undefined);
    expect(checks.checkCookieBanner).toHaveBeenCalledWith(target, undefined);
  });
});

describe("runSite / runFleet", () => {
  it("inserts one check row per kind with attempts recorded", async () => {
    checks.checkHttp.mockResolvedValueOnce(fail({ status: 500 })).mockResolvedValueOnce(fail({ status: 500 }));
    const res = await runSite(site(7), { sleep: async () => {}, retryDelayMs: 0 });
    expect(res.siteId).toBe(7);
    expect(store.inserted).toHaveLength(5);
    expect(store.inserted[0]).toMatchObject({
      siteId: 7,
      kind: "http",
      ok: false,
      data: { status: 500, attempts: 2 },
    });
    expect(applyIncidents).toHaveBeenCalledWith(7, res.results);
  });

  it("emails an alert for every incident event", async () => {
    vi.mocked(applyIncidents).mockResolvedValueOnce([
      { kind: "http", event: "opened", summary: "HTTP 500", incidentId: 11 },
      { kind: "ssl", event: "closed", summary: "60 days left", incidentId: 12 },
    ]);
    const s = site(7);
    const res = await runSite(s, { sleep: async () => {}, retryDelayMs: 0 });
    expect(sendAlert).toHaveBeenCalledTimes(2);
    expect(sendAlert).toHaveBeenCalledWith({ site: s, kind: "http", event: "opened", summary: "HTTP 500" });
    expect(sendAlert).toHaveBeenCalledWith({ site: s, kind: "ssl", event: "closed", summary: "60 days left" });
    expect(res).toMatchObject({ opened: 1, closed: 1 });
  });

  it("runs pagespeed in its own lane, as a separate pass per site", async () => {
    store.sites = [site(1), site(2)];
    checks.checkPagespeed.mockResolvedValue(ok({ score: 90, strategy: "mobile" }));
    const res = await runFleet({ sleep: async () => {}, retryDelayMs: 0 });
    expect(res).toMatchObject({ sites: 2, checks: 12, skipped: 0 });
    expect(checks.checkPagespeed).toHaveBeenCalledTimes(2);
    expect(checks.checkHttp).toHaveBeenCalledTimes(2);
    expect(applyIncidents).toHaveBeenCalledTimes(4);
  });

  it("stops starting sites after the deadline and reports them as skipped", async () => {
    store.sites = [site(1), site(2), site(3)];
    let t = 0;
    // Each clock read advances 60 s: start, then one read per site before it starts.
    const clock = () => (t += 60_000) - 60_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await runFleet({ kinds: ["http"], deadlineMs: 100_000, clock });
    expect(res).toMatchObject({ sites: 3, checks: 1, skipped: 2 });
    expect(warn.mock.calls[0][0]).toMatch(/site-2\.example, site-3\.example/);
    warn.mockRestore();
  });

  it("keeps going when one site throws", async () => {
    store.sites = [site(1), site(2), site(3)];
    checks.checkSsl.mockResolvedValue(ok({ daysLeft: 90 }));
    vi.mocked(applyIncidents).mockImplementation(async (id: number) => {
      if (id === 2) throw new Error("db down");
      return [];
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runFleet({ kinds: ["http"] });
    errSpy.mockRestore();
    expect(res.sites).toBe(3);
    expect(res.checks).toBe(2);
    expect(res.opened).toBe(0);
  });
});
