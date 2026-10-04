import { describe, expect, it } from "vitest";
import { checkHttp } from "../http";
import { USER_AGENT } from "../types";
import { hangingFetch, mockFetch, responseAt } from "./helpers";

const target = { host: "site-01.example", url: "https://site-01.example/" };

describe("checkHttp", () => {
  it("reports 200 as ok with latency and the user agent", async () => {
    const fetchImpl = mockFetch(() => new Response("<html></html>", { status: 200 }));
    const r = await checkHttp(target, { fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.latency_ms).toBeTypeOf("number");
    expect(r.data).toEqual({ status: 200, finalUrl: "https://site-01.example/", blocked: false });
    const init = fetchImpl.calls[0].init!;
    expect(init.redirect).toBe("follow");
    expect((init.headers as Record<string, string>)["user-agent"]).toBe(USER_AGENT);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("records the final URL after a redirect", async () => {
    const fetchImpl = mockFetch(() => responseAt("https://www.site-01.example/en/", "ok", { status: 200 }));
    const r = await checkHttp(target, { fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.data.finalUrl).toBe("https://www.site-01.example/en/");
  });

  it.each([403, 429])("treats %i as blocked, not down", async (status) => {
    const fetchImpl = mockFetch(() => new Response("denied", { status }));
    const r = await checkHttp(target, { fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ status, blocked: true });
  });

  it.each([500, 503, 404])("treats %i as down", async (status) => {
    const fetchImpl = mockFetch(() => new Response("err", { status }));
    const r = await checkHttp(target, { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.data).toMatchObject({ status, blocked: false });
  });

  it("reports a timeout as down", async () => {
    const r = await checkHttp(target, { fetchImpl: hangingFetch(), timeoutMs: 20 });
    expect(r.ok).toBe(false);
    expect(r.latency_ms).toBeNull();
    expect(r.data).toEqual({ status: null, finalUrl: null, blocked: false, error: "timeout after 20 ms" });
  });

  it("surfaces the network error code", async () => {
    const fetchImpl = mockFetch(() => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo"), { code: "ENOTFOUND" }) });
    });
    const r = await checkHttp(target, { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.data.error).toBe("ENOTFOUND");
  });
});
