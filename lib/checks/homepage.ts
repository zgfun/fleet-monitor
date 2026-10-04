import { DEFAULT_TIMEOUT_MS, requestInit } from "./fetch";
import type { CheckTarget } from "./types";

export type Homepage = { html: string; headers: Headers; finalUrl: string };

/** One shared homepage fetch for the HTML-based checks. Null on network error or non-2xx. */
export async function fetchHomepage(
  t: CheckTarget,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<Homepage | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(t.url, requestInit(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const html = await res.text();
    return { html, headers: res.headers, finalUrl: res.url || t.url };
  } catch {
    return null;
  }
}
