import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const { buildAlertEmail, sendAlert } = await import("@/lib/alerts");

const site = { id: 4, name: "Site <One>", host: "site-01.example" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("buildAlertEmail", () => {
  it("labels http incidents DOWN / RECOVERED and links to the site", () => {
    vi.stubEnv("APP_URL", "https://fleet.example/");
    const opened = buildAlertEmail({ site, kind: "http", event: "opened", summary: "HTTP 503" });
    expect(opened.subject).toBe("[Fleet Monitor] DOWN: Site <One> (HTTP)");
    expect(opened.text).toContain("Details: https://fleet.example/sites/4");
    expect(opened.html).toContain('href="https://fleet.example/sites/4"');
    const closed = buildAlertEmail({ site, kind: "http", event: "closed", summary: "200 in 120 ms" });
    expect(closed.subject).toBe("[Fleet Monitor] RECOVERED: Site <One> (HTTP)");
  });

  it("labels certificate incidents by what is wrong, not as an outage", () => {
    const subject = (summary: string, event: "opened" | "closed" = "opened") =>
      buildAlertEmail({ site, kind: "ssl", event, summary }).subject;
    expect(subject("9 days left")).toBe("[Fleet Monitor] CERT EXPIRING: Site <One> (SSL certificate)");
    expect(subject("1 day left")).toContain("CERT EXPIRING");
    expect(subject("expired 3 days ago")).toContain("CERT EXPIRED");
    expect(subject("ERR_TLS_CERT_ALTNAME_INVALID")).toContain("CERT INVALID");
    expect(subject("41 days left", "closed")).toContain("CERT OK");
  });

  it("escapes HTML and omits the link without APP_URL", () => {
    vi.stubEnv("APP_URL", "");
    const { html, text } = buildAlertEmail({ site, kind: "http", event: "opened", summary: '<img src=x onerror="1">' });
    expect(html).toContain("Site &lt;One&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;1&quot;&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("href=");
    expect(text).not.toContain("Details:");
  });
});

describe("sendAlert", () => {
  it.each(["RESEND_API_KEY", "ALERT_FROM", "ALERT_TO"])("is skipped without %s", async (missing) => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ALERT_FROM", "alerts@fleet.example");
    vi.stubEnv("ALERT_TO", "me@fleet.example");
    vi.stubEnv(missing, "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await sendAlert({ site, kind: "http", event: "opened", summary: "HTTP 503" })).toEqual({ skipped: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends to every ALERT_TO address and never throws", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ALERT_FROM", "alerts@fleet.example");
    vi.stubEnv("ALERT_TO", "a@fleet.example, b@fleet.example");
    send.mockResolvedValueOnce({ data: { id: "em_1" }, error: null });
    expect(await sendAlert({ site, kind: "http", event: "opened", summary: "HTTP 503" })).toEqual({ sent: true, id: "em_1" });
    expect(send.mock.calls[0][0]).toMatchObject({
      from: "alerts@fleet.example",
      to: ["a@fleet.example", "b@fleet.example"],
      subject: "[Fleet Monitor] DOWN: Site <One> (HTTP)",
    });

    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockRejectedValueOnce(new Error("network"));
    expect(await sendAlert({ site, kind: "http", event: "opened", summary: "x" })).toEqual({ error: "network" });
  });
});
