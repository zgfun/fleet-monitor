import type { CheckKind } from "@/db/schema";

/** Colour of a tile / badge. */
export type Status = "up" | "warn" | "down" | "unknown";

export const THRESHOLDS = {
  /** HTTP response slower than this is "warn". */
  slowMs: 3000,
  /** SSL: fewer days than this is "warn". */
  sslWarnDays: 30,
  /** SSL: fewer days than this is "down" and opens an incident + alert. */
  sslAlertDays: 14,
  /** PageSpeed performance score (0-100) below this is "warn". */
  perfWarnScore: 50,
  /** Max same-origin homepage links checked. */
  maxLinks: 50,
  /** Concurrency for link checks. */
  linkConcurrency: 5,
  /** Delay before the in-run retry of a failed check. */
  retryDelayMs: Number(process.env.RETRY_DELAY_MS ?? 30_000),
} as const;

/** Only these kinds open incidents and send alerts. The rest show as warnings. */
export const INCIDENT_KINDS: readonly CheckKind[] = ["http", "ssl"];

export const STATUS_RANK: Record<Status, number> = { unknown: 0, up: 1, warn: 2, down: 3 };

export function worst(statuses: Status[]): Status {
  return statuses.reduce<Status>(
    (acc, s) => (STATUS_RANK[s] > STATUS_RANK[acc] ? s : acc),
    "unknown",
  );
}
