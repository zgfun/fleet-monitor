import { DEFAULT_TIMEOUT_MS, describeError, discardBody, requestInit } from "./fetch";
import type { CheckResult, CheckTarget } from "./types";

export type HttpData = {
  status: number | null;
  finalUrl: string | null;
  blocked: boolean;
  error?: string;
};

export async function checkHttp(
  t: CheckTarget,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<CheckResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = performance.now();
  try {
    const res = await fetchImpl(t.url, requestInit(timeoutMs));
    const latency = Math.round(performance.now() - start);
    await discardBody(res);
    // WAFs / bot protection answer 403 or 429 to monitors while the site is fine for humans.
    const blocked = res.status === 403 || res.status === 429;
    const data: HttpData = { status: res.status, finalUrl: res.url || t.url, blocked };
    return { ok: res.ok || blocked, latency_ms: latency, data };
  } catch (err) {
    const data: HttpData = {
      status: null,
      finalUrl: null,
      blocked: false,
      error: describeError(err, timeoutMs),
    };
    return { ok: false, latency_ms: null, data };
  }
}
