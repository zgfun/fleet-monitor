"use client";

import { Button, HStack, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatMs } from "./format";
import { PlayIcon } from "./Icons";

type RunResult = {
  sites: number;
  checks: number;
  opened: number;
  closed: number;
  skipped?: number;
  durationMs: number;
};

export function RunNowButton({ siteId, size = "sm" }: { siteId?: number; size?: "xs" | "sm" | "md" }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [refreshing, startTransition] = useTransition();

  async function run() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(siteId != null ? { siteId } : {}),
      });
      if (res.status === 401) {
        setMessage({ text: "Session expired — sign in again.", error: true });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = (await res.json()) as RunResult;
      const changes = [r.opened && `${r.opened} opened`, r.closed && `${r.closed} closed`].filter(Boolean).join(", ");
      setMessage({
        text: `${r.checks} checks on ${r.sites} ${r.sites === 1 ? "site" : "sites"} in ${formatMs(r.durationMs)}${changes ? ` · incidents ${changes}` : ""}${r.skipped ? ` · ${r.skipped} skipped (time limit)` : ""}`,
        error: Boolean(r.skipped),
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setMessage({ text: `Run failed: ${e instanceof Error ? e.message : "unknown error"}`, error: true });
    } finally {
      setRunning(false);
    }
  }

  return (
    <HStack gap="3" wrap="wrap" justify="flex-end">
      {message && (
        <Text fontSize="xs" color={message.error ? "fg.error" : "fg.muted"} role="status" aria-live="polite">
          {message.text}
        </Text>
      )}
      <Button
        size={size}
        colorPalette="teal"
        onClick={run}
        loading={running || refreshing}
        loadingText={running ? "Running…" : "Refreshing…"}
      >
        <PlayIcon size={14} />
        {siteId != null ? "Check now" : "Run checks now"}
      </Button>
    </HStack>
  );
}
