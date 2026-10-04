import { describe, expect, it } from "vitest";
import { checkNoindex, headerNoindex } from "../noindex";
import { fixture, mockFetch } from "./helpers";

const target = { host: "site-01.example", url: "https://site-01.example/" };

describe("checkNoindex", () => {
  it("detects meta robots noindex (case-insensitive)", async () => {
    const r = await checkNoindex(target, { html: fixture("noindex-meta.html") });
    expect(r.ok).toBe(false);
    expect(r.data).toEqual({ noindex: true, source: "meta" });
  });

  it("detects googlebot meta and the 'none' directive", async () => {
    const r = await checkNoindex(target, { html: '<meta name="googlebot" content="none">' });
    expect(r.data).toEqual({ noindex: true, source: "meta" });
  });

  it("is ok for an indexable page", async () => {
    const r = await checkNoindex(target, { html: fixture("indexable.html") });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ noindex: false, source: null });
  });

  it("detects the X-Robots-Tag header from a homepage fetch", async () => {
    const fetchImpl = mockFetch(
      () => new Response(fixture("indexable.html"), { headers: { "X-Robots-Tag": "noindex, nofollow" } }),
    );
    const r = await checkNoindex(target, { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.data).toEqual({ noindex: true, source: "header" });
  });

  it("uses passed headers alongside passed html", async () => {
    const r = await checkNoindex(target, {
      html: fixture("indexable.html"),
      headers: new Headers({ "x-robots-tag": "googlebot: noindex" }),
    });
    expect(r.data).toEqual({ noindex: true, source: "header" });
  });

  it("reports an unavailable homepage", async () => {
    const fetchImpl = mockFetch(() => new Response("", { status: 500 }));
    const r = await checkNoindex(target, { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.data.error).toBe("homepage unavailable");
  });
});

describe("headerNoindex", () => {
  it.each([
    ["noindex", true],
    ["NOINDEX", true],
    ["none", true],
    ["googlebot: noindex", true],
    ["max-snippet:-1, noindex", true],
    ["bingbot: noindex", false],
    ["bingbot: noindex, googlebot: index", false],
    ["max-image-preview:large", false],
    ["nofollow", false],
    [null, false],
  ])("%s -> %s", (value, expected) => {
    expect(headerNoindex(value)).toBe(expected);
  });
});
