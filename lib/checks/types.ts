export type CheckResult = {
  ok: boolean;
  latency_ms: number | null;
  data: Record<string, unknown>;
};

export type CheckTarget = {
  host: string;
  /** Fully qualified URL to check, e.g. https://example.com/ */
  url: string;
};

/** Browser-like UA: some hosts block obvious bots. */
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 FleetMonitor/1.0";

export function targetFor(site: { host: string; url: string | null }): CheckTarget {
  return { host: site.host, url: site.url ?? `https://${site.host}/` };
}
