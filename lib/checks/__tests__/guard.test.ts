import { describe, expect, it } from "vitest";
import { checkHttp } from "../http";
import { MAX_REDIRECTS, assertPublicHost, isPublicAddress, safeFetch } from "../guard";
import { checkSsl } from "../ssl";
import { mockFetch } from "./helpers";

const PUBLIC = "93.184.215.14";
const dnsTable: Record<string, string[]> = {
  "site-01.example": [PUBLIC],
  "127.0.0.1.nip.io": ["127.0.0.1"],
  "169.254.169.254.nip.io": ["169.254.169.254"],
  "localtest.me": ["127.0.0.1", "::1"],
  "mixed.example": [PUBLIC, "10.0.0.5"],
};
const resolve = async (host: string) => dnsTable[host] ?? [];

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:a9fe:a9fe",
  ])("refuses %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each([PUBLIC, "1.1.1.1", "2606:4700:4700::1111", "::ffff:1.1.1.1"])("allows %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it("refuses things that are not IPs", () => {
    expect(isPublicAddress("example.com")).toBe(false);
  });
});

describe("assertPublicHost", () => {
  it.each(["127.0.0.1.nip.io", "169.254.169.254.nip.io", "localtest.me", "mixed.example", "nxdomain.example"])(
    "refuses %s",
    async (host) => {
      await expect(assertPublicHost(host, resolve)).rejects.toThrow("non-public address");
    },
  );

  it("allows a name that resolves only to public addresses", async () => {
    await expect(assertPublicHost("site-01.example", resolve)).resolves.toBeUndefined();
  });

  it("checks IP literals without resolving", async () => {
    await expect(assertPublicHost("[::1]", resolve)).rejects.toThrow();
    await expect(assertPublicHost("10.0.0.1", resolve)).rejects.toThrow();
  });
});

describe("safeFetch", () => {
  it("follows redirects itself and reports the final URL", async () => {
    const fetchImpl = mockFetch((url) =>
      url === "https://site-01.example/" ? redirect("/en/") : new Response("ok", { status: 200 }),
    );
    const res = await safeFetch("https://site-01.example/", {}, { fetchImpl, resolve });
    expect(res.status).toBe(200);
    expect(res.url).toBe("https://site-01.example/en/");
    expect(fetchImpl.calls.map((c) => c.init?.redirect)).toEqual(["manual", "manual"]);
  });

  it("refuses a redirect to the cloud metadata address", async () => {
    const fetchImpl = mockFetch(() => redirect("http://169.254.169.254/latest/meta-data/"));
    await expect(safeFetch("https://site-01.example/", {}, { fetchImpl, resolve })).rejects.toThrow(
      "non-public address",
    );
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it("refuses a redirect to a name that resolves privately", async () => {
    const fetchImpl = mockFetch(() => redirect("https://127.0.0.1.nip.io/admin"));
    await expect(safeFetch("https://site-01.example/", {}, { fetchImpl, resolve })).rejects.toThrow();
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it("refuses non-http redirects", async () => {
    const fetchImpl = mockFetch(() => redirect("file:///etc/passwd"));
    await expect(safeFetch("https://site-01.example/", {}, { fetchImpl, resolve })).rejects.toThrow("file:");
  });

  it("stops after MAX_REDIRECTS hops", async () => {
    let n = 0;
    const fetchImpl = mockFetch(() => redirect(`/hop/${++n}`));
    await expect(safeFetch("https://site-01.example/", {}, { fetchImpl, resolve })).rejects.toThrow(
      "too many redirects",
    );
    expect(fetchImpl.calls).toHaveLength(MAX_REDIRECTS + 1);
  });

  it("never fetches a host that resolves privately", async () => {
    const fetchImpl = mockFetch(() => new Response("secret", { status: 200 }));
    const r = await checkHttp({ host: "127.0.0.1.nip.io", url: "https://127.0.0.1.nip.io/" }, { fetchImpl, resolve });
    expect(r.ok).toBe(false);
    expect(r.data.error).toBe("blocked: non-public address");
    expect(fetchImpl.calls).toHaveLength(0);
  });
});

describe("checkSsl guard", () => {
  it("passes the public-only lookup to tls.connect", async () => {
    let lookup: unknown;
    const connect = ((options: { lookup?: unknown }) => {
      lookup = options.lookup;
      throw new Error("stop");
    }) as never;
    await checkSsl({ host: "site-01.example", url: "https://site-01.example/" }, { connect });
    expect(lookup).toBeTypeOf("function");
  });

  it("refuses private IP literals without connecting", async () => {
    let called = false;
    const connect = (() => {
      called = true;
      throw new Error("should not connect");
    }) as never;
    const r = await checkSsl({ host: "10.0.0.1", url: "https://10.0.0.1/" }, { connect });
    expect(r.data.error).toBe("blocked: non-public address");
    expect(called).toBe(false);
  });
});
