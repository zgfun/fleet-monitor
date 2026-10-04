import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { FleetDashboard } from "@/components/dashboard/FleetDashboard";
import { getFleet, getFleetStats } from "@/lib/queries";
import { isAuthed } from "@/lib/session";

export const metadata: Metadata = {
  title: "Fleet overview · Fleet Monitor",
};

export default async function Home() {
  await connection();
  // proxy.ts already guards this route; the check here keeps the page safe if the matcher changes.
  if (!(await isAuthed())) redirect("/login?next=/");
  const [sites, stats] = await Promise.all([getFleet(), getFleetStats()]);
  return <FleetDashboard sites={sites} stats={stats} mode="admin" now={new Date().toISOString()} />;
}
