import { describe, expect, it } from "vitest";
import { checkCookieBanner, detectCookieVendor } from "../cookie";
import { fixture, mockFetch } from "./helpers";

const target = { host: "site-02.example", url: "https://site-02.example/" };

describe("detectCookieVendor", () => {
  it.each([
    ['<script id="cookieyes" src="https://cdn-cookieyes.com/client_data/abc/script.js"></script>', "CookieYes"],
    ['<div id="cookie-law-info-bar"></div>', "Cookie Law Info"],
    ['<script id="Cookiebot" src="https://consent.cookiebot.com/uc.js"></script>', "Cookiebot"],
    ['<script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>', "OneTrust"],
    ['<script id="usercentrics-cmp" src="https://app.usercentrics.eu/browser-ui/latest/loader.js"></script>', "Usercentrics"],
    ['<script src="https://cdn.iubenda.com/cs/iubenda_cs.js"></script>', "Iubenda"],
    ['<div id="BorlabsCookieBox"></div><script src="/wp-content/plugins/borlabs-cookie/js/x.js"></script>', "Borlabs"],
    ['<script src="https://consent.cookiefirst.com/sites/x/consent.js"></script>', "CookieFirst"],
    ['<script src="https://app.termly.io/embed.min.js"></script>', "Termly"],
    ['<script src="https://cmp.osano.com/abc/osano.js"></script>', "Osano"],
    ['<script defer src="/js/klaro.js" data-config="klaroConfig"></script>', "Klaro"],
    ["<script>window.__tcfapi; /* cmp.quantcast.com */</script>", "Quantcast"],
    ['<script>window.didomiConfig = {};</script>', "Didomi"],
    ['<script src="https://cdn.jsdelivr.net/npm/cookieconsent@3/build/cookieconsent.min.js"></script>', "Cookie Consent"],
    ['<div class="cc-window cc-banner">We use cookies</div>', "Generic banner"],
    ['<div id="cookie-banner" role="dialog">We use cookies</div>', "Generic banner"],
    ['<section class="site-footer gdpr-consent">x</section>', "Generic banner"],
  ])("%s -> %s", (html, vendor) => {
    expect(detectCookieVendor(html)).toBe(vendor);
  });
});

describe("checkCookieBanner", () => {
  it("detects Complianz from a WordPress page", async () => {
    const r = await checkCookieBanner(target, { html: fixture("cookie-complianz.html") });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ present: true, vendor: "Complianz" });
  });

  it("reports a missing banner", async () => {
    const r = await checkCookieBanner(target, { html: fixture("cookie-none.html") });
    expect(r.ok).toBe(false);
    expect(r.data).toEqual({ present: false, vendor: null });
  });

  it("fetches the homepage when no html is given", async () => {
    const fetchImpl = mockFetch(() => new Response(fixture("cookie-complianz.html")));
    const r = await checkCookieBanner(target, { fetchImpl });
    expect(r.data.vendor).toBe("Complianz");
    expect(fetchImpl.calls[0].url).toBe(target.url);
  });
});
