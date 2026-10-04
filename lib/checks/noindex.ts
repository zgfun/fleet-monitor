import * as cheerio from "cheerio";
import { fetchHomepage } from "./homepage";
import type { CheckResult, CheckTarget } from "./types";

export type NoindexData = {
  noindex: boolean;
  source: "meta" | "header" | null;
  error?: string;
};

const BLOCKING = new Set(["noindex", "none"]);
// Directives that contain a colon themselves, so "name:" is not a user-agent prefix.
const COLON_DIRECTIVES = new Set(["max-snippet", "max-image-preview", "max-video-preview", "unavailable_after"]);
const GOOGLE_AGENTS = new Set(["googlebot", "robots"]);

export function metaNoindex(html: string): boolean {
  const $ = cheerio.load(html);
  let found = false;
  $("meta[name][content]").each((_, el) => {
    const name = $(el).attr("name")!.trim().toLowerCase();
    if (name !== "robots" && name !== "googlebot") return;
    const directives = $(el).attr("content")!.toLowerCase().split(/[\s,]+/);
    if (directives.some((d) => BLOCKING.has(d))) found = true;
  });
  return found;
}

/** X-Robots-Tag: "noindex", "googlebot: noindex", "bingbot: noindex, nofollow" (only Google / unscoped count). */
export function headerNoindex(value: string | null): boolean {
  if (!value) return false;
  let agent: string | null = null;
  for (const raw of value.toLowerCase().split(",")) {
    let directive = raw.trim();
    const m = directive.match(/^([a-z0-9_-]+)\s*:\s*(.*)$/);
    if (m && !COLON_DIRECTIVES.has(m[1])) {
      agent = m[1];
      directive = m[2].trim();
    }
    if (BLOCKING.has(directive) && (agent === null || GOOGLE_AGENTS.has(agent))) return true;
  }
  return false;
}

export async function checkNoindex(
  t: CheckTarget,
  opts: { fetchImpl?: typeof fetch; html?: string; headers?: Headers } = {},
): Promise<CheckResult> {
  let html = opts.html;
  let headers = opts.headers;
  const start = performance.now();
  if (html === undefined) {
    const page = await fetchHomepage(t, { fetchImpl: opts.fetchImpl });
    if (!page) {
      const data: NoindexData = { noindex: false, source: null, error: "homepage unavailable" };
      return { ok: false, latency_ms: null, data };
    }
    html = page.html;
    headers = headers ?? page.headers;
  }

  let source: NoindexData["source"] = null;
  if (metaNoindex(html)) source = "meta";
  else if (headerNoindex(headers?.get("x-robots-tag") ?? null)) source = "header";

  const data: NoindexData = { noindex: source !== null, source };
  return { ok: source === null, latency_ms: Math.round(performance.now() - start), data };
}
