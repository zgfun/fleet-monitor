/**
 * Failed-login limiter. Kept in memory because the schema has no table for it: it holds per server
 * instance, which on Vercel (Fluid compute reuses instances) still caps parallel guessing hard.
 */
export const LOGIN_WINDOW_MS = 15 * 60_000;
export const MAX_FAILURES_PER_IP = 5;
// Attackers rotating IPs are slowed down, never locked out globally: a hard global cap would let
// anyone lock the admin out with a few wrong passwords.
export const GLOBAL_SLOWDOWN_AFTER = 30;
export const GLOBAL_SLOWDOWN_STEP_MS = 250;
export const MAX_GLOBAL_SLOWDOWN_MS = 5_000;

export type LoginLimiter = {
  /** Milliseconds until this IP may try again, or 0. */
  retryAfter(ip: string, now?: number): number;
  /** Delay applied to every attempt while many logins are failing across all IPs, or 0. */
  slowdown(now?: number): number;
  fail(ip: string, now?: number): void;
  succeed(ip: string): void;
};

export function createLoginLimiter(): LoginLimiter {
  const byIp = new Map<string, number[]>();
  let global: number[] = [];

  const prune = (times: number[], now: number) => times.filter((t) => now - t < LOGIN_WINDOW_MS);

  return {
    retryAfter(ip, now = Date.now()) {
      const mine = prune(byIp.get(ip) ?? [], now);
      if (mine.length) byIp.set(ip, mine);
      else byIp.delete(ip);
      if (mine.length < MAX_FAILURES_PER_IP) return 0;
      return Math.max(mine[mine.length - MAX_FAILURES_PER_IP] + LOGIN_WINDOW_MS - now, 0);
    },
    slowdown(now = Date.now()) {
      global = prune(global, now);
      const over = global.length - GLOBAL_SLOWDOWN_AFTER;
      return over < 0 ? 0 : Math.min((over + 1) * GLOBAL_SLOWDOWN_STEP_MS, MAX_GLOBAL_SLOWDOWN_MS);
    },
    fail(ip, now = Date.now()) {
      if (byIp.size > 1_000) {
        for (const [key, times] of byIp) if (!prune(times, now).length) byIp.delete(key);
      }
      byIp.set(ip, [...(byIp.get(ip) ?? []), now]);
      global = [...prune(global, now), now];
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
