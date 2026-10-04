import { THRESHOLDS } from "@/lib/status";
import { describeError } from "./fetch";
import type { CheckResult, CheckTarget } from "./types";

export type PagespeedData = {
  score: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  strategy: "mobile";
  error?: string;
};

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TIMEOUT_MS = 60_000;

type Audit = { numericValue?: number };
type PsiResponse = {
  lighthouseResult?: {
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, Audit | undefined>;
  };
  error?: { message?: string };
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parsePagespeed(json: PsiResponse): Omit<PagespeedData, "strategy"> {
  const lh = json.lighthouseResult;
  const rawScore = num(lh?.categories?.performance?.score);
  const audits = lh?.audits ?? {};
  const lcp = num(audits["largest-contentful-paint"]?.numericValue);
  const cls = num(audits["cumulative-layout-shift"]?.numericValue);
  const tbt = num(audits["total-blocking-time"]?.numericValue);
  return {
    score: rawScore === null ? null : Math.round(rawScore * 100),
    lcpMs: lcp === null ? null : Math.round(lcp),
    cls: cls === null ? null : Math.round(cls * 1000) / 1000,
    tbtMs: tbt === null ? null : Math.round(tbt),
  };
}

/** Null when no API key is configured: the check is skipped, not failed. */
export async function checkPagespeed(
  t: CheckTarget,
  opts: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<CheckResult | null> {
  const apiKey = opts.apiKey ?? process.env.PAGESPEED_API_KEY;
  if (!apiKey) return null;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const qs = new URLSearchParams({
    url: t.url,
    strategy: "mobile",
    category: "performance",
    key: apiKey,
  });
  const start = performance.now();
  const empty: PagespeedData = { score: null, lcpMs: null, cls: null, tbtMs: null, strategy: "mobile" };

  try {
    const res = await fetchImpl(`${ENDPOINT}?${qs}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latency = Math.round(performance.now() - start);
    const json = (await res.json().catch(() => ({}))) as PsiResponse;
    if (!res.ok) {
      const error = json.error?.message ?? `PageSpeed API ${res.status}`;
      return { ok: false, latency_ms: latency, data: { ...empty, error } };
    }
    const parsed = parsePagespeed(json);
    const data: PagespeedData = { ...parsed, strategy: "mobile" };
    if (parsed.score === null) data.error = "no performance score in response";
    const ok = parsed.score !== null && parsed.score >= THRESHOLDS.perfWarnScore;
    return { ok, latency_ms: latency, data };
  } catch (err) {
    return { ok: false, latency_ms: null, data: { ...empty, error: describeError(err, TIMEOUT_MS) } };
  }
}
