import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPagespeed } from "../pagespeed";
import { fixture, mockFetch } from "./helpers";

const target = { host: "site-01.example", url: "https://site-01.example/" };

describe("checkPagespeed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null (skipped) without an API key", async () => {
    vi.stubEnv("PAGESPEED_API_KEY", "");
    const fetchImpl = mockFetch(() => new Response("{}"));
    expect(await checkPagespeed(target, { fetchImpl })).toBeNull();
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it("parses score and metrics from a PSI v5 response", async () => {
    const fetchImpl = mockFetch(() => new Response(fixture("pagespeed-response.json"), { status: 200 }));
    const r = await checkPagespeed(target, { apiKey: "test-key", fetchImpl });
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(true);
    expect(r!.data).toEqual({ score: 87, lcpMs: 2412, cls: 0.042, tbtMs: 188, strategy: "mobile" });

    const url = new URL(fetchImpl.calls[0].url);
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    expect(url.searchParams.get("url")).toBe(target.url);
    expect(url.searchParams.get("strategy")).toBe("mobile");
    expect(url.searchParams.get("category")).toBe("performance");
    expect(url.searchParams.get("key")).toBe("test-key");
  });

  it("reads the key from the environment", async () => {
    vi.stubEnv("PAGESPEED_API_KEY", "env-key");
    const fetchImpl = mockFetch(() => new Response(fixture("pagespeed-response.json")));
    await checkPagespeed(target, { fetchImpl });
    expect(new URL(fetchImpl.calls[0].url).searchParams.get("key")).toBe("env-key");
  });

  it("is not ok below the warn score", async () => {
    const json = JSON.parse(fixture("pagespeed-response.json"));
    json.lighthouseResult.categories.performance.score = 0.31;
    const fetchImpl = mockFetch(() => new Response(JSON.stringify(json)));
    const r = await checkPagespeed(target, { apiKey: "k", fetchImpl });
    expect(r!.ok).toBe(false);
    expect(r!.data.score).toBe(31);
  });

  it("reports API errors", async () => {
    const fetchImpl = mockFetch(
      () => new Response(JSON.stringify({ error: { code: 500, message: "Lighthouse returned error: NO_FCP" } }), { status: 500 }),
    );
    const r = await checkPagespeed(target, { apiKey: "k", fetchImpl });
    expect(r!.ok).toBe(false);
    expect(r!.data).toMatchObject({ score: null, error: "Lighthouse returned error: NO_FCP" });
  });
});
