import type { Metadata } from "next";
import { NotFoundView } from "@/components/dashboard/NotFoundView";

export const metadata: Metadata = {
  title: "Not found · Fleet Monitor",
};

export default function NotFound() {
  return <NotFoundView />;
}
