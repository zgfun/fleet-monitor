import { and, eq, isNull, sql } from "drizzle-orm";
import { db, incidents, type CheckKind, type Incident } from "@/db";
import { snapshotStatus } from "@/lib/checks/summarize";
import { INCIDENT_KINDS } from "@/lib/status";

export type IncidentDecision = "open" | "close" | "none";

/**
 * Opening on a single failed final result is enough to satisfy the
 * "two failures in a row" rule: the runner already retries a failed http/ssl
 * check once within the same run, so a stored failure means two consecutive
 * failed attempts.
 */
export function decideIncident({
  open,
  ok,
}: {
  open: Pick<Incident, "id"> | null;
  ok: boolean;
}): IncidentDecision {
  if (!ok && !open) return "open";
  if (ok && open) return "close";
  return "none";
}

export type IncidentInput = {
  kind: CheckKind;
  ok: boolean;
  latency_ms: number | null;
  data: Record<string, unknown>;
};

export type IncidentEvent = {
  kind: CheckKind;
  event: "opened" | "closed";
  summary: string;
  incidentId: number;
};

// Namespace for pg_advisory_xact_lock(int, int) so site ids don't collide with other locks.
const LOCK_NAMESPACE = sql`hashtext('fleet-monitor:incidents')`;

/**
 * Applies open/close decisions for a site's results. A per-site advisory lock
 * serialises concurrent runs (e.g. the cron firing twice), so the open-incident
 * lookup and insert can't race into duplicate incidents.
 */
export async function applyIncidents(
  siteId: number,
  results: IncidentInput[],
): Promise<IncidentEvent[]> {
  const relevant = results.filter((r) => INCIDENT_KINDS.includes(r.kind));
  if (relevant.length === 0) return [];

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${siteId})`);
    const events: IncidentEvent[] = [];

    for (const r of relevant) {
      const [open] = await tx
        .select()
        .from(incidents)
        .where(
          and(eq(incidents.siteId, siteId), eq(incidents.kind, r.kind), isNull(incidents.closedAt)),
        )
        .orderBy(incidents.openedAt)
        .limit(1);

      const decision = decideIncident({ open: open ?? null, ok: r.ok });
      if (decision === "none") continue;

      const { summary } = snapshotStatus(r.kind, r.ok, r.latency_ms, r.data);
      if (decision === "open") {
        const [row] = await tx
          .insert(incidents)
          .values({ siteId, kind: r.kind, note: summary })
          .returning({ id: incidents.id });
        events.push({ kind: r.kind, event: "opened", summary, incidentId: row.id });
      } else {
        await tx
          .update(incidents)
          .set({ closedAt: new Date() })
          .where(
            and(
              eq(incidents.siteId, siteId),
              eq(incidents.kind, r.kind),
              isNull(incidents.closedAt),
            ),
          );
        events.push({ kind: r.kind, event: "closed", summary, incidentId: open!.id });
      }
    }

    return events;
  });
}
