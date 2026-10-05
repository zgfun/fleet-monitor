"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  isAuthConfigured,
  safeNextPath,
  verifyPassword,
} from "@/lib/session";
import { clientIp, loginLimiter } from "@/lib/login-limiter";

export type LoginState = { error: string | null };

const FAILED_LOGIN_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  if (!isAuthConfigured()) {
    return { error: "Admin login is not configured." };
  }

  const ip = clientIp(await headers());
  const wait = loginLimiter.retryAfter(ip);
  if (wait > 0) {
    return { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60_000)} min.` };
  }
  // Runs before the password check: slows every attempt, the admin's included, instead of locking out.
  const slowdown = loginLimiter.slowdown();
  if (slowdown > 0) await sleep(slowdown);

  const password = formData.get("password");
  if (typeof password !== "string" || !(await verifyPassword(password))) {
    loginLimiter.fail(ip);
    await sleep(FAILED_LOGIN_DELAY_MS);
    return { error: "Incorrect password." };
  }
  loginLimiter.succeed(ip);

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect(safeNextPath(formData.get("next")));
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
