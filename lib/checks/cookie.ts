import { fetchHomepage } from "./homepage";
import type { CheckResult, CheckTarget } from "./types";

export type CookieData = {
  present: boolean;
  vendor: string | null;
  error?: string;
};

/** Ordered: specific vendors first, generic markup patterns last. */
const VENDORS: { vendor: string; pattern: RegExp }[] = [
  { vendor: "CookieYes", pattern: /cdn-cookieyes\.com|cookieyes/i },
  { vendor: "Cookie Law Info", pattern: /cookie-law-info|cookielawinfo|cli_settings/i },
  { vendor: "Complianz", pattern: /complianz|cmplz[-_]/i },
  { vendor: "Cookiebot", pattern: /cookiebot/i },
  { vendor: "OneTrust", pattern: /cdn\.cookielaw\.org|onetrust|optanon/i },
  { vendor: "Usercentrics", pattern: /usercentrics/i },
  { vendor: "Iubenda", pattern: /iubenda/i },
  { vendor: "Borlabs", pattern: /borlabs[-_]?cookie/i },
  { vendor: "CookieFirst", pattern: /cookiefirst/i },
  { vendor: "Termly", pattern: /termly\.io|termly-/i },
  { vendor: "Osano", pattern: /cmp\.osano\.com|\bosano\.js|\bosano-cm/i },
  { vendor: "Klaro", pattern: /\bklaro(\.js|-config|\b)/i },
  { vendor: "Quantcast", pattern: /quantcast\.mgr|cmp\.quantcast\.com|quantcast choice/i },
  { vendor: "Didomi", pattern: /didomi/i },
  { vendor: "Cookie Consent", pattern: /cookieconsent(\.min)?\.js|cookieconsent2?\b/i },
  {
    vendor: "Generic banner",
    pattern:
      /\b(?:id|class)\s*=\s*["'][^"']*\b(?:cookie[-_]?(?:banner|consent|notice|bar|popup|law)|cc-(?:window|banner)|gdpr[-_]?(?:banner|consent|cookie)|consent[-_]?(?:banner|manager))\b/i,
  },
];

export function detectCookieVendor(html: string): string | null {
  return VENDORS.find(({ pattern }) => pattern.test(html))?.vendor ?? null;
}

export async function checkCookieBanner(
  t: CheckTarget,
  opts: { fetchImpl?: typeof fetch; html?: string } = {},
): Promise<CheckResult> {
  let html = opts.html;
  const start = performance.now();
  if (html === undefined) {
    const page = await fetchHomepage(t, { fetchImpl: opts.fetchImpl });
    if (!page) {
      const data: CookieData = { present: false, vendor: null, error: "homepage unavailable" };
      return { ok: false, latency_ms: null, data };
    }
    html = page.html;
  }
  const vendor = detectCookieVendor(html);
  const data: CookieData = { present: vendor !== null, vendor };
  return { ok: vendor !== null, latency_ms: Math.round(performance.now() - start), data };
}
