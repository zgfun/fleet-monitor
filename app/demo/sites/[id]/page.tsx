import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteDetailView } from "@/components/dashboard/SiteDetailView";
import { DEMO_NOW, demoFleet, demoSite } from "@/lib/demo";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return demoFleet().map((s) => ({ id: String(s.id) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = demoSite(Number((await params).id));
  return { title: site ? `${site.name} · Demo · Fleet Monitor` : "Demo · Fleet Monitor" };
}

export default async function DemoSitePage({ params }: Props) {
  const site = demoSite(Number((await params).id));
  if (!site) notFound();
  return <SiteDetailView site={site} mode="demo" now={DEMO_NOW} />;
}
