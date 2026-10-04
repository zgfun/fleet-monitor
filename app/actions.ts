"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, sites } from "@/db";
import { isAuthed } from "@/lib/session";
import { addSiteSchema, normaliseHost, slugSchema } from "@/lib/site-input";

async function requireAuth() {
  if (!(await isAuthed())) throw new Error("Not authorised");
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

const idSchema = z.number().int().positive();

function revalidate(id?: number) {
  revalidatePath("/");
  if (id !== undefined) revalidatePath(`/sites/${id}`);
}

export async function addSite(formData: FormData): Promise<void> {
  await requireAuth();
  const rawUrl = String(formData.get("url") ?? "").trim();
  const parsed = addSiteSchema.safeParse({
    host: normaliseHost(String(formData.get("host") ?? "")),
    url: rawUrl || null,
    name: String(formData.get("name") ?? ""),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const { host, url, name } = parsed.data;
  const inserted = await db
    .insert(sites)
    .values({ host, url, name: name || host })
    .onConflictDoNothing({ target: sites.host })
    .returning({ id: sites.id });
  if (inserted.length === 0) throw new Error(`${host} is already monitored`);
  revalidate();
}

export async function toggleSite(id: number): Promise<void> {
  await requireAuth();
  const siteId = idSchema.parse(id);
  const [site] = await db.select({ enabled: sites.enabled }).from(sites).where(eq(sites.id, siteId));
  if (!site) throw new Error("Site not found");
  await db.update(sites).set({ enabled: !site.enabled }).where(eq(sites.id, siteId));
  revalidate(siteId);
}

export async function setPublicSlug(id: number, slug: string | null): Promise<void> {
  await requireAuth();
  const siteId = idSchema.parse(id);
  const trimmed = slug?.trim().toLowerCase() ?? "";
  let value: string | null = null;
  if (trimmed) {
    const parsed = slugSchema.safeParse(trimmed);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid slug");
    value = parsed.data;
    const [taken] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.publicSlug, value), ne(sites.id, siteId)))
      .limit(1);
    if (taken) throw new Error(`Slug "${value}" is already in use`);
  }
  try {
    const updated = await db
      .update(sites)
      .set({ publicSlug: value })
      .where(eq(sites.id, siteId))
      .returning({ id: sites.id });
    if (updated.length === 0) throw new Error("Site not found");
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error(`Slug "${value}" is already in use`);
    throw err;
  }
  revalidate(siteId);
  if (value) revalidatePath(`/status/${value}`);
}

export async function deleteSite(id: number): Promise<void> {
  await requireAuth();
  const siteId = idSchema.parse(id);
  await db.delete(sites).where(eq(sites.id, siteId));
  revalidate(siteId);
}
