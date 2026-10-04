import type { CheckKind } from "@/db/schema";
import { checkCookieBanner } from "./cookie";
import { checkHttp } from "./http";
import { checkLinks } from "./links";
import { checkNoindex } from "./noindex";
import { checkPagespeed } from "./pagespeed";
import { checkSsl } from "./ssl";
import type { CheckResult, CheckTarget } from "./types";

export { checkCookieBanner, detectCookieVendor } from "./cookie";
export { checkHttp } from "./http";
export { checkLinks, extractLinks } from "./links";
export { checkNoindex } from "./noindex";
export { checkPagespeed } from "./pagespeed";
export { checkSsl } from "./ssl";
export { fetchHomepage, type Homepage } from "./homepage";
export { snapshotStatus } from "./summarize";
export { USER_AGENT, targetFor, type CheckResult, type CheckTarget } from "./types";

/** Runs one check standalone. Null means skipped (e.g. PageSpeed without an API key). */
export async function runCheck(kind: CheckKind, t: CheckTarget): Promise<CheckResult | null> {
  switch (kind) {
    case "http":
      return checkHttp(t);
    case "ssl":
      return checkSsl(t);
    case "links":
      return checkLinks(t);
    case "pagespeed":
      return checkPagespeed(t);
    case "noindex":
      return checkNoindex(t);
    case "cookie":
      return checkCookieBanner(t);
  }
}
