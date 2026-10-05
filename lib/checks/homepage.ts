import { DEFAULT_TIMEOUT_MS, discardBody, requestInit } from "./fetch";
import { safeFetch, type Resolve } from "./guard";
import type { CheckTarget } from "./types";

export type Homepage = { html: string; headers: Headers; finalUrl: string };

/** Homepages beyond this are truncated: head and nav, where the checks look, come first. */
export const MAX_HOMEPAGE_BYTES = 3 * 1024 * 1024;

const isMarkup = (contentType: string | null) => !contentType || /html|xml|^text\//i.test(contentType);

/** Reads at most maxBytes of the body, then cancels the rest of the stream. */
export async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let received = 0;
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) return html + decoder.decode();
      const chunk = value.subarray(0, maxBytes - received);
      received += chunk.byteLength;
      html += decoder.decode(chunk, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** One shared homepage fetch for the HTML-based checks. Null on network error, non-2xx or non-HTML. */
export async function fetchHomepage(
  t: CheckTarget,
  opts: { fetchImpl?: typeof fetch; resolve?: Resolve; timeoutMs?: number; maxBytes?: number } = {},
): Promise<Homepage | null> {
  try {
    const res = await safeFetch(t.url, requestInit(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS), opts);
    if (!res.ok || !isMarkup(res.headers.get("content-type"))) {
      await discardBody(res);
      return null;
    }
    const html = await readCapped(res, opts.maxBytes ?? MAX_HOMEPAGE_BYTES);
    return { html, headers: res.headers, finalUrl: res.url || t.url };
  } catch {
    return null;
  }
}
