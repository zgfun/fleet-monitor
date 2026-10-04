import type { CheckKind } from "@/db/schema";
import type { Status } from "./status";

/** Latest result of one check kind for one site. */
export type CheckSnapshot = {
  kind: CheckKind;
  status: Status;
  ok: boolean;
  ranAt: string; // ISO
  latencyMs: number | null;
  /** Short human summary, e.g. "200 in 412 ms", "41 days left", "2 broken of 37". */
  summary: string;
  data: Record<string, unknown>;
};

export type SiteSummary = {
  id: number;
  name: string;
  host: string;
  url: string;
  enabled: boolean;
  publicSlug: string | null;
  /** Worst status across the latest snapshot of every kind. */
  status: Status;
  checks: Partial<Record<CheckKind, CheckSnapshot>>;
  openIncidents: number;
};

export type SeriesPoint = { t: string; v: number | null };

export type IncidentView = {
  id: number;
  kind: CheckKind;
  openedAt: string;
  closedAt: string | null;
  note: string | null;
};

export type SiteDetail = SiteSummary & {
  /** 30 days, one point per run (daily cron + manual runs). */
  responseTime: SeriesPoint[];
  perfScore: SeriesPoint[];
  /** Latest 50 check rows of any kind, newest first. */
  history: CheckSnapshot[];
  incidents: IncidentView[];
  brokenLinks: { url: string; status: number | string }[];
  uptime30d: number | null; // 0..1 share of ok http checks
};

/** "Monitors N sites, runs M checks a day, has logged K incidents and certificate warnings since <date>." */
export type FleetStats = {
  sites: number;
  checksPerDay: number;
  incidentsAndCertWarnings: number;
  since: string | null; // ISO date of first check
};
