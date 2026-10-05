import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { THRESHOLDS } from "@/lib/status";
import { DEFAULT_TIMEOUT_MS, describeError, discardBody, requestInit } from "./fetch";
import { safeFetch, type Resolve } from "./guard";
import { fetchHomepage } from "./homepage";
import type { CheckResult, CheckTarget } from "./types";

export type BrokenLink = { url: string; status: number | string };

export type LinksData = {
  total: number;
  checked: number;
  broken: BrokenLink[];
  error?: string;
};

const siteKey = (hostname: string) => hostname.toLowerCase().replace(/^www\./, "");

/** Same-site http(s) links from the page, fragment-free, deduped, in document order. */
export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#")) return;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      return;
    }
    // Drops mailto:, tel:, javascript:, data: etc.
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (siteKey(url.hostname) !== siteKey(base.hostname)) return;
    url.hash = "";
    const key = url.href;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(key);
  });
  return links;
}

export async function checkLinks(
  t: CheckTarget,
  opts: {
    fetchImpl?: typeof fetch;
    resolve?: Resolve;
    html?: string;
    baseUrl?: string;
    timeoutMs?: number;
  } = {},
): Promise<CheckResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = performance.now();

  let html = opts.html;
  let baseUrl = opts.baseUrl ?? t.url;
  if (html === undefined) {
    const page = await fetchHomepage(t, opts);
    if (!page) {
      const data: LinksData = { total: 0, checked: 0, broken: [], error: "homepage unavailable" };
      return { ok: false, latency_ms: null, data };
    }
    html = page.html;
    baseUrl = page.finalUrl;
  }

  const all = extractLinks(html, baseUrl);
  const toCheck = all.slice(0, THRESHOLDS.maxLinks);
  const limit = pLimit(THRESHOLDS.linkConcurrency);

  // GET rather than HEAD: some WordPress hosts answer HEAD with 405/404.
  const results = await Promise.all(
    toCheck.map((url) =>
      limit(async (): Promise<BrokenLink | null> => {
        try {
          const res = await safeFetch(url, requestInit(timeoutMs), opts);
          await discardBody(res);
          if (res.ok || res.status === 403 || res.status === 429) return null;
          return { url, status: res.status };
        } catch (err) {
          return { url, status: describeError(err, timeoutMs) };
        }
      }),
    ),
  );

  const broken = results.filter((r): r is BrokenLink => r !== null);
  const data: LinksData = { total: all.length, checked: toCheck.length, broken };
  return { ok: broken.length === 0, latency_ms: Math.round(performance.now() - start), data };
}
