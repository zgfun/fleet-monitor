/**
 * Failed-login limiter. Kept in memory because the schema has no table for it: it holds per server
 * instance, which on Vercel (Fluid compute reuses instances) still caps parallel guessing hard.
 */
export const LOGIN_WINDOW_MS = 15 * 60_000;
export const MAX_FAILURES_PER_IP = 5;
// Caps attackers rotating IPs. The cost is that the admin may be locked out too during an attack.
export const MAX_FAILURES_GLOBAL = 30;

export type LoginLimiter = {
  /** Milliseconds until another attempt is allowed, or 0. */
  retryAfter(ip: string, now?: number): number;
  fail(ip: string, now?: number): void;
  succeed(ip: string): void;
};

export function createLoginLimiter(): LoginLimiter {
  const byIp = new Map<string, number[]>();
  let global: number[] = [];

  const prune = (times: number[], now: number) => times.filter((t) => now - t < LOGIN_WINDOW_MS);
  const wait = (times: number[], max: number, now: number) =>
    times.length >= max ? times[times.length - max] + LOGIN_WINDOW_MS - now : 0;

  return {
    retryAfter(ip, now = Date.now()) {
      global = prune(global, now);
      const mine = prune(byIp.get(ip) ?? [], now);
      if (mine.length) byIp.set(ip, mine);
      else byIp.delete(ip);
      return Math.max(wait(mine, MAX_FAILURES_PER_IP, now), wait(global, MAX_FAILURES_GLOBAL, now), 0);
    },
    fail(ip, now = Date.now()) {
      if (byIp.size > 1_000) {
        for (const [key, times] of byIp) if (!prune(times, now).length) byIp.delete(key);
      }
      byIp.set(ip, [...(byIp.get(ip) ?? []), now]);
      global.push(now);
    },
    succeed(ip) {
      byIp.delete(ip);
    },
  };
}

const globalForLimiter = globalThis as unknown as { fmLoginLimiter?: LoginLimiter };
export const loginLimiter = (globalForLimiter.fmLoginLimiter ??= createLoginLimiter());

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
