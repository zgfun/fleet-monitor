import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { StatusPageView } from "@/components/dashboard/StatusPageView";
import { toPublicStatus } from "@/lib/public-status";
import { getSiteBySlug } from "@/lib/queries";

type Props = { params: Promise<{ slug: string }> };

const load = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return getSiteBySlug(slug);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const site = await load((await params).slug);
  if (!site) return { title: "Status page not found" };
  return {
    title: `${site.name} status`,
    description: `Live availability and incident history for ${site.host}.`,
  };
}

export default async function StatusPage({ params }: Props) {
  await connection();
  const site = await load((await params).slug);
  if (!site) notFound();
  return <StatusPageView status={toPublicStatus(site, new Date().toISOString())} />;
}
