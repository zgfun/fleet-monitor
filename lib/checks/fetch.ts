import { USER_AGENT } from "./types";

export const DEFAULT_TIMEOUT_MS = 8_000;

export function requestInit(timeoutMs: number = DEFAULT_TIMEOUT_MS): RequestInit {
  return {
    method: "GET",
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(timeoutMs),
  };
}

export function describeError(err: unknown, timeoutMs: number = DEFAULT_TIMEOUT_MS): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return `timeout after ${timeoutMs} ms`;
    }
    // undici wraps the real reason (ENOTFOUND, ECONNREFUSED, ...) in `cause`.
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    if (cause?.code) return cause.code;
    if (cause?.message) return cause.message;
    return err.message;
  }
  return String(err);
}

/** Release the connection without downloading a body we don't need. */
export async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // already consumed or closed
  }
}
