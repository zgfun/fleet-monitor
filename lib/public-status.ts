import { dailyHttpStatus, type DayBucket } from "@/components/dashboard/days";
import { worst, type Status } from "@/lib/status";
import type { SiteDetail } from "@/lib/view-models";

const PUBLIC_KINDS = ["http", "ssl"] as const;
type PublicKind = (typeof PUBLIC_KINDS)[number];

/**
 * Everything the public /status/[slug] page may show. It is built on the server because every prop
 * of a client component ends up in the page's HTML; SiteDetail carries admin data (raw check rows,
 * broken-link URLs, incident notes, the site id) that must never reach anonymous visitors.
 */
export type PublicStatus = {
  name: string;
  host: string;
  overall: Status;
  components: { kind: PublicKind; status: Status }[];
  lastChecked: string | null;
  uptime30d: number | null;
  days: DayBucket[];
  incidents: { kind: PublicKind; openedAt: string; closedAt: string | null }[];
  now: string;
};

export function toPublicStatus(site: SiteDetail, now: string): PublicStatus {
  const components = PUBLIC_KINDS.map((kind) => ({
    kind,
    status: site.checks[kind]?.status ?? ("unknown" as Status),
  }));
  const lastChecked =
    PUBLIC_KINDS.map((k) => site.checks[k]?.ranAt)
      .filter((t): t is string => Boolean(t))
      .sort()
      .at(-1) ?? null;
  const incidents = site.incidents
    .filter((i): i is typeof i & { kind: PublicKind } => i.kind === "http" || i.kind === "ssl")
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .slice(0, 10)
    .map(({ kind, openedAt, closedAt }) => ({ kind, openedAt, closedAt }));

  return {
    name: site.name,
    host: site.host,
    overall: worst(components.map((c) => c.status)),
    components,
    lastChecked,
    uptime30d: site.uptime30d,
    days: dailyHttpStatus(site, now, 30),
    incidents,
    now,
  };
}
