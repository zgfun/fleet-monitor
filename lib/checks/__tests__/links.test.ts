import { describe, expect, it } from "vitest";
import { THRESHOLDS } from "@/lib/status";
import { checkLinks, extractLinks } from "../links";
import { fixture, mockFetch } from "./helpers";

const target = { host: "site-01.example", url: "https://site-01.example/" };
const html = fixture("homepage-links.html");

const statusFor: Record<string, number> = {
  "/broken": 404,
  "/gone": 500,
  "/members": 403,
  "/rate-limited": 429,
};

const siteFetch = () =>
  mockFetch((url) => {
    const { pathname } = new URL(url);
    if (url === target.url) return new Response(html, { status: 200 });
    return new Response("", { status: statusFor[pathname] ?? 200 });
  });

describe("extractLinks", () => {
  it("keeps same-site http(s) links, strips fragments and dedupes", () => {
    expect(extractLinks(html, target.url)).toEqual([
      "https://site-01.example/",
      "https://site-01.example/about",
      "https://www.site-01.example/blog",
      "https://site-01.example/pricing",
      "http://site-01.example/legacy",
      "https://site-01.example/broken",
      "https://site-01.example/gone",
      "https://site-01.example/members",
      "https://site-01.example/rate-limited",
    ]);
  });

  it("treats apex links as same-site when the page is on www", () => {
    const links = extractLinks('<a href="https://site-01.example/a">a</a><a href="/b">b</a>', "https://www.site-01.example/");
    expect(links).toEqual(["https://site-01.example/a", "https://www.site-01.example/b"]);
  });
});

describe("checkLinks", () => {
  it("fetches the homepage and flags 4xx/5xx but not 403/429", async () => {
    const fetchImpl = siteFetch();
    const r = await checkLinks(target, { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.data).toEqual({
      total: 9,
      checked: 9,
      broken: [
        { url: "https://site-01.example/broken", status: 404 },
        { url: "https://site-01.example/gone", status: 500 },
      ],
    });
    expect(fetchImpl.calls.every((c) => c.init?.method === "GET")).toBe(true);
  });

  it("uses provided html without refetching the homepage", async () => {
    const fetchImpl = mockFetch(() => new Response("", { status: 200 }));
    const r = await checkLinks(target, { fetchImpl, html: '<a href="/x">x</a><a href="/x#y">y</a>' });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ total: 1, checked: 1, broken: [] });
    expect(fetchImpl.calls.map((c) => c.url)).toEqual(["https://site-01.example/x"]);
  });

  it("caps checked links at THRESHOLDS.maxLinks", async () => {
    const many = Array.from({ length: 70 }, (_, i) => `<a href="/p/${i}">${i}</a>`).join("");
    const fetchImpl = mockFetch(() => new Response("", { status: 200 }));
    const r = await checkLinks(target, { fetchImpl, html: many });
    expect(r.data).toMatchObject({ total: 70, checked: THRESHOLDS.maxLinks });
    expect(fetchImpl.calls).toHaveLength(THRESHOLDS.maxLinks);
  });

  it("limits concurrency", async () => {
    const many = Array.from({ length: 20 }, (_, i) => `<a href="/p/${i}">${i}</a>`).join("");
    let active = 0;
    let peak = 0;
    const fetchImpl = mockFetch(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return new Response("", { status: 200 });
    });
    await checkLinks(target, { fetchImpl, html: many });
    expect(peak).toBeLessThanOrEqual(THRESHOLDS.linkConcurrency);
  });

  it("counts network errors as broken", async () => {
    const fetchImpl = mockFetch(() => {
      throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
    });
    const r = await checkLinks(target, { fetchImpl, html: '<a href="/x">x</a>' });
    expect(r.data.broken).toEqual([{ url: "https://site-01.example/x", status: "ECONNRESET" }]);
  });

  it("reports an unavailable homepage", async () => {
    const fetchImpl = mockFetch(() => new Response("", { status: 503 }));
    const r = await checkLinks(target, { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.data).toEqual({ total: 0, checked: 0, broken: [], error: "homepage unavailable" });
  });
});
