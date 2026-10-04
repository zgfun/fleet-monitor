import { z } from "zod";

/** "HTTPS://WWW.Example.com:443/path?q" -> "www.example.com" */
export function normaliseHost(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

// The checks fetch whatever is stored, so names that only resolve inside a network are refused.
const PRIVATE_SUFFIXES = ["localhost", "local", "internal", "intranet", "lan", "home.arpa"];

const isPrivateName = (host: string) =>
  PRIVATE_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));

const stripWww = (host: string) => host.replace(/^www\./, "");

export const hostSchema = z
  .string()
  .min(1, "Host is required")
  .max(253)
  .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Invalid host")
  .refine((h) => !isPrivateName(h), "Private or local hosts can't be monitored");

export const addSiteSchema = z
  .object({
    host: hostSchema,
    url: z
      .url({ protocol: /^https?$/, error: "URL must start with http:// or https://" })
      .max(2048)
      .nullable(),
    name: z.string().trim().max(100),
  })
  .superRefine(({ host, url }, ctx) => {
    if (!url) return;
    const u = new URL(url);
    // Host already rules out IP literals and local names; tying the URL to it covers the URL too.
    if (stripWww(u.hostname) !== stripWww(host)) {
      ctx.addIssue({ code: "custom", path: ["url"], message: `URL must be on ${host}` });
    } else if (u.port || u.username || u.password) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "URL can't contain a port or credentials" });
    }
  });

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain a-z, 0-9 and single dashes");
