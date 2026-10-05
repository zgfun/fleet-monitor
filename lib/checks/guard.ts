import dns from "node:dns";
import { lookup as lookupAll } from "node:dns/promises";
import net from "node:net";

/**
 * Outbound guard for the checks. The add-site form only accepts public-looking hostnames, but a
 * name can still resolve to a private address and a public site can redirect anywhere. So every
 * fetch hop and TLS connect is checked against the address the name actually resolves to.
 */

export const MAX_REDIRECTS = 5;

export class BlockedTargetError extends Error {
  constructor(
    message: string,
    readonly code: "EBLOCKED" | "EREDIRECTS" = "EBLOCKED",
  ) {
    super(message);
    this.name = "BlockedTargetError";
  }
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this" network, unspecified
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // RFC 1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
];

const V6_BLOCKED: [string, number][] = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
];

const blockList = new net.BlockList();
for (const [addr, prefix] of V4_BLOCKED) blockList.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of V6_BLOCKED) blockList.addSubnet(addr, prefix, "ipv6");

/** IPv4-mapped / -compatible IPv6 (::ffff:10.0.0.1) is judged by its embedded IPv4 address. */
function embeddedV4(ip: string): string | null {
  const m = ip.toLowerCase().match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (m) return m[1];
  const hex = ip.toLowerCase().match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
  }
  return null;
}

export function isPublicAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return !blockList.check(ip, "ipv4");
  if (family === 6) {
    const v4 = embeddedV4(ip);
    if (v4) return isPublicAddress(v4);
    return !blockList.check(ip, "ipv6");
  }
  return false;
}

export type Resolve = (hostname: string) => Promise<string[]>;

export const resolveHost: Resolve = async (hostname) =>
  (await lookupAll(hostname, { all: true, verbatim: true })).map((a) => a.address);

/** Throws unless every address the hostname resolves to is public. */
export async function assertPublicHost(hostname: string, resolve: Resolve = resolveHost): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : await resolve(host);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new BlockedTargetError("blocked: non-public address");
  }
}

/**
 * fetch() that follows at most MAX_REDIRECTS redirects itself and checks every hop's host first.
 * Node's fetch has no connect hook, so a DNS answer could still change between the check and the
 * connect; that window is small and the results the checks keep are status codes, not bodies.
 */
export async function safeFetch(
  url: string,
  init: RequestInit,
  opts: { fetchImpl?: typeof fetch; resolve?: Resolve } = {},
): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let current = url;
  for (let hop = 0; ; hop++) {
    const { protocol, hostname } = new URL(current);
    if (protocol !== "http:" && protocol !== "https:") {
      throw new BlockedTargetError(`blocked: ${protocol} URL`);
    }
    await assertPublicHost(hostname, opts.resolve);
    const res = await fetchImpl(current, { ...init, redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) {
      if (!res.url) Object.defineProperty(res, "url", { value: current });
      return res;
    }
    await res.body?.cancel().catch(() => {});
    if (hop >= MAX_REDIRECTS) throw new BlockedTargetError("too many redirects", "EREDIRECTS");
    current = new URL(location, current).href;
  }
}

/** net.LookupFunction for tls.connect: resolves as usual but refuses non-public addresses. */
export const publicOnlyLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const blocked = addresses.find((a) => !isPublicAddress(a.address));
    if (blocked || addresses.length === 0) {
      return callback(new BlockedTargetError("blocked: non-public address"), "", 4);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};
