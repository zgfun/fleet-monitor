import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

export type MockFetch = typeof fetch & { calls: { url: string; init?: RequestInit }[] };

export function mockFetch(handler: Handler): MockFetch {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return handler(url, init);
  };
  return Object.assign(fn, { calls }) as MockFetch;
}

/** Response whose .url reports the post-redirect location, as real fetch does. */
export function responseAt(url: string, body: BodyInit | null, init?: ResponseInit): Response {
  const res = new Response(body, init);
  Object.defineProperty(res, "url", { value: url });
  Object.defineProperty(res, "redirected", { value: true });
  return res;
}

/** Never resolves on its own; rejects like real fetch when the signal fires. */
export function hangingFetch(): MockFetch {
  return mockFetch(
    (_url, init) =>
      new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
  );
}
