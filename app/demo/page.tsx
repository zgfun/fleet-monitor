import type { Metadata } from "next";
import { FleetDashboard } from "@/components/dashboard/FleetDashboard";
import { DEMO_NOW, demoFleet, demoStats } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Demo · Fleet Monitor",
  description: "Fleet Monitor demo with 30 fake sites and 30 days of generated history.",
};

export default function DemoPage() {
  return <FleetDashboard sites={demoFleet()} stats={demoStats()} mode="demo" now={DEMO_NOW} />;
}
