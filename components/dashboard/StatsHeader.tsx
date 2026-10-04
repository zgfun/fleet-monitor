"use client";

import { Box, Heading, SimpleGrid, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { Status } from "@/lib/status";
import type { FleetStats } from "@/lib/view-models";
import { formatDate, formatNumber } from "./format";
import { StatusDot } from "./StatusBadge";

function Num({ children }: { children: ReactNode }) {
  return (
    <Text as="span" fontWeight="semibold" color="fg" fontVariantNumeric="tabular-nums">
      {children}
    </Text>
  );
}

export function StatsSentence({ stats }: { stats: FleetStats }) {
  const k = stats.incidentsAndCertWarnings;
  return (
    <Text fontSize={{ base: "md", md: "lg" }} color="fg.muted" lineHeight="tall" maxW="3xl">
      Monitors <Num>{formatNumber(stats.sites)}</Num> {stats.sites === 1 ? "site" : "sites"}, runs{" "}
      <Num>{formatNumber(stats.checksPerDay)}</Num> checks a day, has logged <Num>{formatNumber(k)}</Num>{" "}
      {k === 1 ? "incident and certificate warning" : "incidents and certificate warnings"}
      {stats.since ? (
        <>
          {" "}
          since <Num>{formatDate(stats.since)}</Num>.
        </>
      ) : (
        " so far."
      )}
    </Text>
  );
}

function Kpi({ label, value, status, hint }: { label: string; value: number; status?: Status; hint?: string }) {
  return (
    <Box borderWidth="1px" rounded="xl" bg="bg.panel" px="4" py="3" shadow="xs">
      <Text fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wider" fontWeight="medium" display="flex" alignItems="center" gap="2">
        {status && <StatusDot status={status} size="8px" />}
        {label}
      </Text>
      <Text fontSize="2xl" fontWeight="semibold" mt="1" fontVariantNumeric="tabular-nums" letterSpacing="-0.02em">
        {formatNumber(value)}
      </Text>
      {hint && (
        <Text fontSize="xs" color="fg.subtle">
          {hint}
        </Text>
      )}
    </Box>
  );
}

export function StatsHeader({
  stats,
  counts,
  title,
}: {
  stats: FleetStats;
  counts: Record<Status, number>;
  title: string;
}) {
  return (
    <Box>
      <Heading as="h1" size={{ base: "2xl", md: "3xl" }} letterSpacing="-0.02em">
        {title}
      </Heading>
      <Box mt="2">
        <StatsSentence stats={stats} />
      </Box>
      <SimpleGrid columns={{ base: 2, md: 4 }} gap="3" mt="6">
        <Kpi label="Healthy" value={counts.up} status="up" />
        <Kpi label="Warnings" value={counts.warn} status="warn" />
        <Kpi label="Down" value={counts.down} status="down" />
        <Kpi label="No data" value={counts.unknown} status="unknown" />
      </SimpleGrid>
    </Box>
  );
}
