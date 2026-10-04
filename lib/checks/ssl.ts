import tls from "node:tls";
import { THRESHOLDS } from "@/lib/status";
import type { CheckResult, CheckTarget } from "./types";

export type SslData = {
  validTo: string | null;
  daysLeft: number | null;
  issuer: string | null;
  error?: string;
};

type Connect = (options: tls.ConnectionOptions) => tls.TLSSocket;

const DAY_MS = 86_400_000;

// Expiry is reported through daysLeft; every other verification error means browsers refuse the cert.
const EXPIRY_ERRORS = new Set(["CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID"]);

export async function checkSsl(
  t: CheckTarget,
  opts: { timeoutMs?: number; connect?: Connect; now?: Date } = {},
): Promise<CheckResult> {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const connect = opts.connect ?? tls.connect;
  const url = new URL(t.url);
  const host = url.hostname;
  const port = url.protocol === "https:" && url.port ? Number(url.port) : 443;
  const start = performance.now();

  const fail = (error: string): CheckResult => ({
    ok: false,
    latency_ms: null,
    data: { validTo: null, daysLeft: null, issuer: null, error } satisfies SslData,
  });

  return new Promise<CheckResult>((resolve) => {
    let settled = false;
    let socket: tls.TLSSocket | undefined;
    const finish = (result: CheckResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish(fail(`timeout after ${timeoutMs} ms`)), timeoutMs);

    try {
      // rejectUnauthorized: false so expired / untrusted certs can still be read; trust is checked below.
      socket = connect({ host, port, servername: host, rejectUnauthorized: false });
    } catch (err) {
      finish(fail(err instanceof Error ? err.message : String(err)));
      return;
    }

    socket.once("error", (err: Error & { code?: string }) => finish(fail(err.code ?? err.message)));
    socket.once("secureConnect", () => {
      const latency = Math.round(performance.now() - start);
      const cert = socket!.getPeerCertificate();
      if (!cert || !cert.valid_to) {
        finish(fail("no certificate"));
        return;
      }
      const validTo = new Date(cert.valid_to);
      if (Number.isNaN(validTo.getTime())) {
        finish(fail(`unparseable valid_to: ${cert.valid_to}`));
        return;
      }
      const now = opts.now ?? new Date();
      const daysLeft = Math.floor((validTo.getTime() - now.getTime()) / DAY_MS);
      const rawIssuer = cert.issuer?.O ?? cert.issuer?.CN ?? null;
      const issuer = Array.isArray(rawIssuer) ? rawIssuer.join(", ") : rawIssuer;
      const data: SslData = { validTo: validTo.toISOString(), daysLeft, issuer };
      const authError = socket!.authorized
        ? null
        : String(socket!.authorizationError ?? "certificate not trusted");
      if (authError && !EXPIRY_ERRORS.has(authError)) {
        finish({ ok: false, latency_ms: latency, data: { ...data, error: authError } });
        return;
      }
      finish({ ok: daysLeft >= THRESHOLDS.sslAlertDays, latency_ms: latency, data });
    });
  });
}
