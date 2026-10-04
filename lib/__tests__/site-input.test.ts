import { describe, expect, it } from "vitest";
import { addSiteSchema, normaliseHost, slugSchema } from "@/lib/site-input";

const add = (host: string, url: string | null = null) =>
  addSiteSchema.safeParse({ host: normaliseHost(host), url, name: "" });

describe("normaliseHost", () => {
  it("strips protocol, port, path and trailing dot", () => {
    expect(normaliseHost(" HTTPS://WWW.Example.com:443/path?q#x ")).toBe("www.example.com");
    expect(normaliseHost("nextjs.org.")).toBe("nextjs.org");
  });
});

describe("addSiteSchema", () => {
  it("accepts public hosts and URLs on the same site", () => {
    expect(add("nextjs.org").success).toBe(true);
    expect(add("nextjs.org", "https://nextjs.org/docs").success).toBe(true);
    expect(add("nextjs.org", "https://www.nextjs.org/").success).toBe(true);
    expect(add("www.nextjs.org", "http://nextjs.org/").success).toBe(true);
  });

  it.each(["localhost", "127.0.0.1", "10.0.0.5", "169.254.169.254", "[::1]", "db.internal", "nas.local", "app.localhost", "router.home.arpa", "intranet"])(
    "rejects the private host %s",
    (host) => {
      expect(add(host).success).toBe(false);
    },
  );

  it.each([
    "http://127.0.0.1:5433/",
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:3000/api/run",
    "http://[::1]/",
    "http://10.0.0.5/",
    "https://other.example.com/",
    "https://nextjs.org.evil.com/",
    "https://nextjs.org:8443/",
    "https://user:pw@nextjs.org/",
    "ftp://nextjs.org/",
  ])("rejects the URL %s for nextjs.org", (url) => {
    expect(add("nextjs.org", url).success).toBe(false);
  });
});

describe("slugSchema", () => {
  it("allows lowercase words joined by single dashes", () => {
    expect(slugSchema.safeParse("next-js").success).toBe(true);
    expect(slugSchema.safeParse("Next").success).toBe(false);
    expect(slugSchema.safeParse("a--b").success).toBe(false);
    expect(slugSchema.safeParse("-a").success).toBe(false);
  });
});
