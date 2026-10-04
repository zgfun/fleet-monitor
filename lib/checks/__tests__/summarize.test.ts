import { describe, expect, it } from "vitest";
import { snapshotStatus } from "../summarize";

describe("snapshotStatus", () => {
  describe("http", () => {
    it("up with status and latency", () => {
      expect(snapshotStatus("http", true, 412, { status: 200, blocked: false })).toEqual({
        status: "up",
        summary: "200 in 412 ms",
      });
    });
    it("warn when blocked", () => {
      expect(snapshotStatus("http", true, 90, { status: 403, blocked: true })).toEqual({
        status: "warn",
        summary: "blocked (403)",
      });
    });
    it("warn when slow", () => {
      expect(snapshotStatus("http", true, 3400, { status: 200, blocked: false })).toEqual({
        status: "warn",
        summary: "200 in 3400 ms (slow)",
      });
    });
    it("down when not ok", () => {
      expect(snapshotStatus("http", false, 120, { status: 500 })).toEqual({ status: "down", summary: "HTTP 500" });
      expect(snapshotStatus("http", false, null, { status: null, error: "timeout after 8000 ms" })).toEqual({
        status: "down",
        summary: "timeout after 8000 ms",
      });
    });
  });

  describe("ssl", () => {
    it("up with plenty of days", () => {
      expect(snapshotStatus("ssl", true, 50, { daysLeft: 41 })).toEqual({ status: "up", summary: "41 days left" });
    });
    it("warn below sslWarnDays", () => {
      expect(snapshotStatus("ssl", true, 50, { daysLeft: 20 })).toEqual({ status: "warn", summary: "20 days left" });
    });
    it("down when not ok", () => {
      expect(snapshotStatus("ssl", false, 50, { daysLeft: 1 })).toEqual({ status: "down", summary: "1 day left" });
      expect(snapshotStatus("ssl", false, 50, { daysLeft: -3 })).toEqual({
        status: "down",
        summary: "expired 3 days ago",
      });
      expect(snapshotStatus("ssl", false, null, { daysLeft: null, error: "ECONNREFUSED" })).toEqual({
        status: "down",
        summary: "ECONNREFUSED",
      });
    });
    it("down with the trust error even when days are known", () => {
      expect(
        snapshotStatus("ssl", false, 50, { daysLeft: 84, error: "ERR_TLS_CERT_ALTNAME_INVALID" }),
      ).toEqual({ status: "down", summary: "ERR_TLS_CERT_ALTNAME_INVALID" });
    });
  });

  describe("links", () => {
    it("warn (never down) with broken links", () => {
      const broken = [{ url: "a", status: 404 }, { url: "b", status: 500 }];
      expect(snapshotStatus("links", false, 900, { total: 37, checked: 37, broken })).toEqual({
        status: "warn",
        summary: "2 broken of 37",
      });
    });
    it("up when all fine", () => {
      expect(snapshotStatus("links", true, 900, { total: 37, checked: 37, broken: [] })).toEqual({
        status: "up",
        summary: "37 links OK",
      });
    });
    it("unknown when the homepage could not be fetched", () => {
      expect(snapshotStatus("links", false, null, { error: "homepage unavailable", broken: [] }).status).toBe("unknown");
    });
  });

  describe("pagespeed", () => {
    it("up / warn by score", () => {
      expect(snapshotStatus("pagespeed", true, 9000, { score: 87 })).toEqual({ status: "up", summary: "Perf 87" });
      expect(snapshotStatus("pagespeed", false, 9000, { score: 42 })).toEqual({ status: "warn", summary: "Perf 42" });
    });
    it("unknown on error", () => {
      expect(snapshotStatus("pagespeed", false, null, { score: null, error: "quota" })).toEqual({
        status: "unknown",
        summary: "quota",
      });
    });
  });

  describe("noindex", () => {
    it("warn when set, up otherwise", () => {
      expect(snapshotStatus("noindex", false, 1, { noindex: true, source: "meta" })).toEqual({
        status: "warn",
        summary: "noindex set",
      });
      expect(snapshotStatus("noindex", true, 1, { noindex: false, source: null })).toEqual({
        status: "up",
        summary: "indexable",
      });
    });
  });

  describe("cookie", () => {
    it("up with vendor, warn when absent", () => {
      expect(snapshotStatus("cookie", true, 1, { present: true, vendor: "Cookiebot" })).toEqual({
        status: "up",
        summary: "Cookiebot",
      });
      expect(snapshotStatus("cookie", false, 1, { present: false, vendor: null })).toEqual({
        status: "warn",
        summary: "no banner found",
      });
    });
  });
});
