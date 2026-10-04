import { EventEmitter } from "node:events";
import type tls from "node:tls";
import { describe, expect, it } from "vitest";
import { checkSsl } from "../ssl";

const NOW = new Date("2026-10-01T06:00:00Z");
const target = { host: "www.site-01.example", url: "https://www.site-01.example/" };

type FakeSocket = EventEmitter & { destroyed: boolean };

function fakeConnect(
  behave: (socket: FakeSocket) => void,
  cert: Partial<tls.PeerCertificate> = {},
  auth: { authorized: boolean; authorizationError?: string } = { authorized: true },
) {
  const seen: tls.ConnectionOptions[] = [];
  const connect = (options: tls.ConnectionOptions) => {
    seen.push(options);
    const socket = Object.assign(new EventEmitter(), {
      destroyed: false,
      ...auth,
      getPeerCertificate: () => cert,
      destroy() {
        socket.destroyed = true;
      },
    });
    queueMicrotask(() => behave(socket));
    return socket as unknown as tls.TLSSocket;
  };
  return { connect, seen };
}

const secure = (s: FakeSocket) => s.emit("secureConnect");

describe("checkSsl", () => {
  it("computes days left and connects with SNI for the URL hostname", async () => {
    const { connect, seen } = fakeConnect(secure, {
      valid_to: "Nov 10 12:00:00 2026 GMT",
      issuer: { O: "Let's Encrypt", CN: "R11" } as tls.Certificate,
    });
    const r = await checkSsl(target, { connect, now: NOW });
    expect(seen[0]).toMatchObject({ host: "www.site-01.example", port: 443, servername: "www.site-01.example" });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({
      validTo: "2026-11-10T12:00:00.000Z",
      daysLeft: 40,
      issuer: "Let's Encrypt",
    });
  });

  it("is ok between the alert and warn thresholds", async () => {
    const { connect } = fakeConnect(secure, { valid_to: "Oct 21 06:00:00 2026 GMT" });
    const r = await checkSsl(target, { connect, now: NOW });
    expect(r.data.daysLeft).toBe(20);
    expect(r.ok).toBe(true);
  });

  it("fails below the alert threshold", async () => {
    const { connect } = fakeConnect(secure, { valid_to: "Oct 10 06:00:00 2026 GMT" });
    const r = await checkSsl(target, { connect, now: NOW });
    expect(r.data.daysLeft).toBe(9);
    expect(r.ok).toBe(false);
  });

  it("gives negative days for an expired certificate", async () => {
    const { connect } = fakeConnect(secure, { valid_to: "Sep 28 06:00:00 2026 GMT" });
    const r = await checkSsl(target, { connect, now: NOW });
    expect(r.data.daysLeft).toBe(-3);
    expect(r.ok).toBe(false);
  });

  it("reports an expired certificate by days, not as a trust error", async () => {
    const { connect } = fakeConnect(secure, { valid_to: "Sep 28 06:00:00 2026 GMT" }, {
      authorized: false,
      authorizationError: "CERT_HAS_EXPIRED",
    });
    const r = await checkSsl(target, { connect, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.data.daysLeft).toBe(-3);
    expect(r.data.error).toBeUndefined();
  });

  it.each(["ERR_TLS_CERT_ALTNAME_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN"])(
    "fails an untrusted certificate (%s) even with plenty of days left",
    async (code) => {
      const { connect } = fakeConnect(secure, { valid_to: "Nov 10 12:00:00 2026 GMT" }, {
        authorized: false,
        authorizationError: code,
      });
      const r = await checkSsl(target, { connect, now: NOW });
      expect(r.ok).toBe(false);
      expect(r.data).toMatchObject({ daysLeft: 40, error: code });
    },
  );

  it("times out and destroys the socket", async () => {
    let socket: FakeSocket | undefined;
    const { connect } = fakeConnect((s) => {
      socket = s;
    });
    const r = await checkSsl(target, { connect, timeoutMs: 20 });
    expect(r.ok).toBe(false);
    expect(r.data).toEqual({ validTo: null, daysLeft: null, issuer: null, error: "timeout after 20 ms" });
    expect(socket?.destroyed).toBe(true);
  });

  it("reports connection errors", async () => {
    const { connect } = fakeConnect((s) =>
      s.emit("error", Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })),
    );
    const r = await checkSsl(target, { connect });
    expect(r.ok).toBe(false);
    expect(r.data.error).toBe("ECONNREFUSED");
  });

  it("reports a missing certificate", async () => {
    const { connect } = fakeConnect(secure, {});
    const r = await checkSsl(target, { connect });
    expect(r.ok).toBe(false);
    expect(r.data.error).toBe("no certificate");
  });
});
