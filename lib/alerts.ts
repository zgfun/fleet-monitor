import { Resend } from "resend";
import type { CheckKind, Site } from "@/db/schema";

export type AlertInput = {
  site: Pick<Site, "id" | "name" | "host">;
  kind: CheckKind;
  event: "opened" | "closed";
  summary: string;
};

export type AlertResult = { skipped: true } | { sent: true; id: string | null } | { error: string };

const KIND_LABEL: Partial<Record<CheckKind, string>> = {
  http: "HTTP",
  ssl: "SSL certificate",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stateFor(kind: CheckKind, event: AlertInput["event"], summary: string): string {
  if (kind !== "ssl") return event === "opened" ? "DOWN" : "RECOVERED";
  if (event === "closed") return "CERT OK";
  // snapshotStatus only produces "N days left" for a readable, trusted cert that is merely expiring.
  if (/\bdays? left$/.test(summary)) return "CERT EXPIRING";
  return summary.startsWith("expired") ? "CERT EXPIRED" : "CERT INVALID";
}

export function buildAlertEmail({ site, kind, event, summary }: AlertInput) {
  const label = KIND_LABEL[kind] ?? kind;
  const state = stateFor(kind, event, summary);
  const subject = `[Fleet Monitor] ${state}: ${site.name} (${label})`;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const link = appUrl ? `${appUrl}/sites/${site.id}` : null;

  const text = [
    `${site.name} (${site.host})`,
    `${label} incident ${event}.`,
    `Latest result: ${summary}`,
    link ? `Details: ${link}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const colour = event === "opened" ? "#dc2626" : "#16a34a";
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">
<p style="margin:0 0 8px"><strong style="color:${colour}">${state}</strong> &middot; ${escapeHtml(label)} incident ${event}</p>
<p style="margin:0 0 8px"><strong>${escapeHtml(site.name)}</strong> <span style="color:#666">${escapeHtml(site.host)}</span></p>
<p style="margin:0 0 8px">Latest result: ${escapeHtml(summary)}</p>
${link ? `<p style="margin:0"><a href="${escapeHtml(link)}">View site details</a></p>` : ""}
</div>`;

  return { subject, text, html };
}

/** Never throws: a failing email must not break a check run. */
export async function sendAlert(input: AlertInput): Promise<AlertResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM;
  const to = process.env.ALERT_TO;
  if (!apiKey || !from || !to) {
    console.info(
      `[alerts] skipped (email not configured): ${input.site.host} ${input.kind} ${input.event} - ${input.summary}`,
    );
    return { skipped: true };
  }

  try {
    const { subject, text, html } = buildAlertEmail(input);
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      text,
      html,
    });
    if (error) {
      console.error(`[alerts] send failed for ${input.site.host}:`, error.message);
      return { error: error.message };
    }
    return { sent: true, id: data?.id ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[alerts] send threw for ${input.site.host}:`, message);
    return { error: message };
  }
}
