import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAuthConfigured, isAuthed, safeNextPath } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in · Fleet Monitor",
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(Array.isArray(next) ? next[0] : next);

  if (await isAuthed()) redirect(nextPath);

  return <LoginForm next={nextPath} configured={isAuthConfigured()} />;
}
