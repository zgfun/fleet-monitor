import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "fm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

export function isAuthConfigured(): boolean {
  return Boolean(getSecret() && process.env.ADMIN_PASSWORD);
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// The admin password is part of the key, so rotating ADMIN_PASSWORD (or SESSION_SECRET) revokes
// every issued session.
function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`${secret}\u0000${process.env.ADMIN_PASSWORD ?? ""}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(now: number = Date.now()): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const expiry = String(Math.floor(now / 1000) + SESSION_MAX_AGE);
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(expiry));
  return `${expiry}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  const secret = getSecret();
  if (!secret || !token) return false;
  const [expiry, sig, ...rest] = token.split(".");
  if (rest.length > 0 || !expiry || !sig || !/^\d{1,12}$/.test(expiry)) return false;
  if (Number(expiry) * 1000 <= now) return false;
  const signature = fromBase64Url(sig);
  if (!signature) return false;
  const key = await importKey(secret);
  // subtle.verify compares in constant time
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(expiry));
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export async function verifySessionFromRequest(req: Request | NextRequest): Promise<boolean> {
  const token =
    "cookies" in req && typeof req.cookies?.get === "function"
      ? req.cookies.get(SESSION_COOKIE)?.value
      : readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  return verifySessionToken(token);
}

export async function isAuthed(): Promise<boolean> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/** Hashing both sides first gives equal-length inputs, so the compare leaks neither content nor length. */
export async function verifyPassword(input: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const [a, b] = await Promise.all([sha256(input), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function safeNextPath(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(next)) return "/";
  return next;
}
