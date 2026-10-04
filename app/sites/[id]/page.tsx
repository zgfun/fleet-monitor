import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { SiteDetailView } from "@/components/dashboard/SiteDetailView";
import { getSite } from "@/lib/queries";
import { isAuthed } from "@/lib/session";

type Props = { params: Promise<{ id: string }> };

const load = cache(async (raw: string) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return getSite(id);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!(await isAuthed())) return { title: "Fleet Monitor" };
  const site = await load((await params).id);
  return { title: site ? `${site.name} · Fleet Monitor` : "Site not found · Fleet Monitor" };
}

export default async function SitePage({ params }: Props) {
  await connection();
  const { id } = await params;
  if (!(await isAuthed())) redirect(`/login?next=/sites/${encodeURIComponent(id)}`);
  const site = await load(id);
  if (!site) notFound();
  return <SiteDetailView site={site} mode="admin" now={new Date().toISOString()} />;
}
