import { describe, expect, it } from "vitest";
import {
  GLOBAL_SLOWDOWN_AFTER,
  LOGIN_WINDOW_MS,
  MAX_FAILURES_PER_IP,
  MAX_GLOBAL_SLOWDOWN_MS,
  clientIp,
  createLoginLimiter,
} from "@/lib/login-limiter";

const T0 = 1_000_000;

describe("login limiter", () => {
  it("locks an IP after too many failures until the window passes", () => {
    const l = createLoginLimiter();
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) {
      expect(l.retryAfter("1.1.1.1", T0 + i)).toBe(0);
      l.fail("1.1.1.1", T0 + i);
    }
    expect(l.retryAfter("1.1.1.1", T0 + 10)).toBe(LOGIN_WINDOW_MS - 10);
    expect(l.retryAfter("2.2.2.2", T0 + 10)).toBe(0);
    expect(l.retryAfter("1.1.1.1", T0 + LOGIN_WINDOW_MS)).toBe(0);
  });

  it("slows down, but never locks out, everyone while many IPs are failing", () => {
    const l = createLoginLimiter();
    for (let i = 0; i < GLOBAL_SLOWDOWN_AFTER - 1; i++) l.fail(`10.0.0.${i}`, T0);
    expect(l.slowdown(T0 + 1)).toBe(0);
    l.fail("10.0.1.1", T0);
    expect(l.slowdown(T0 + 1)).toBeGreaterThan(0);
    for (let i = 0; i < 500; i++) l.fail(`10.1.${i >> 8}.${i & 255}`, T0);
    expect(l.slowdown(T0 + 1)).toBe(MAX_GLOBAL_SLOWDOWN_MS);
    // A fresh IP (the admin) is still allowed to try.
    expect(l.retryAfter("9.9.9.9", T0 + 1)).toBe(0);
    expect(l.slowdown(T0 + LOGIN_WINDOW_MS)).toBe(0);
  });

  it("clears an IP's failures after a successful login", () => {
    const l = createLoginLimiter();
    for (let i = 0; i < MAX_FAILURES_PER_IP - 1; i++) l.fail("1.1.1.1", T0);
    l.succeed("1.1.1.1");
    l.fail("1.1.1.1", T0);
    expect(l.retryAfter("1.1.1.1", T0)).toBe(0);
  });

  it("takes the client address from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
