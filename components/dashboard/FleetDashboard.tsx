"use client";

import { Box, Button, Container, EmptyState, Flex, HStack, Input, InputGroup, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { STATUS_RANK, type Status } from "@/lib/status";
import type { FleetStats, SiteSummary } from "@/lib/view-models";
import { AddSiteForm } from "./AddSiteForm";
import { AppHeader, DemoBanner } from "./AppHeader";
import { latestRanAt, STATUS_LABELS, STATUS_PALETTE } from "./format";
import { GlobeIcon, SearchIcon } from "./Icons";
import { PageFooter } from "./PageFooter";
import { RunNowButton } from "./RunNowButton";
import { SiteTile } from "./SiteTile";
import { StatsHeader } from "./StatsHeader";

type Filter = "all" | Status;
const FILTERS: Filter[] = ["all", "down", "warn", "up", "unknown"];

const effective = (s: SiteSummary): Status => (s.enabled ? s.status : "unknown");

export function FleetDashboard({
  sites,
  stats,
  mode,
  now,
}: {
  sites: SiteSummary[];
  stats: FleetStats;
  mode: "admin" | "demo";
  /** Reference time for relative labels; passed from the server so SSR and hydration agree. */
  now?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const ref = now ?? latestRanAt(sites) ?? "1970-01-01T00:00:00Z";

  const counts = useMemo(() => {
    const c: Record<Status, number> = { up: 0, warn: 0, down: 0, unknown: 0 };
    for (const s of sites) c[effective(s)]++;
    return c;
  }, [sites]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites
      .filter((s) => filter === "all" || effective(s) === filter)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.host.includes(q))
      .sort(
        (a, b) =>
          Number(b.enabled) - Number(a.enabled) ||
          STATUS_RANK[effective(b)] - STATUS_RANK[effective(a)] ||
          a.name.localeCompare(b.name, "en"),
      );
  }, [sites, filter, query]);

  const hrefFor = (s: SiteSummary) => (mode === "demo" ? `/demo/sites/${s.id}` : `/sites/${s.id}`);

  return (
    <Box minH="100dvh" bg="bg.subtle" display="flex" flexDirection="column">
      <AppHeader mode={mode} />
      {mode === "demo" && <DemoBanner />}
      <Container maxW="7xl" px={{ base: "4", md: "6" }} py={{ base: "6", md: "10" }} flex="1">
        <Stack gap={{ base: "6", md: "8" }}>
          <StatsHeader stats={stats} counts={counts} title={mode === "demo" ? "Demo fleet" : "Fleet overview"} />

          <Stack gap="3">
            <Flex justify="space-between" align={{ base: "stretch", lg: "center" }} gap="3" direction={{ base: "column", lg: "row" }}>
              <HStack gap="1.5" wrap="wrap" role="group" aria-label="Filter by status">
                {FILTERS.map((f) => {
                  const active = filter === f;
                  const count = f === "all" ? sites.length : counts[f];
                  return (
                    <Button
                      key={f}
                      size="xs"
                      rounded="full"
                      variant={active ? "solid" : "outline"}
                      colorPalette={f === "all" ? "gray" : STATUS_PALETTE[f]}
                      onClick={() => setFilter(f)}
                      aria-pressed={active}
                      bg={active ? undefined : "bg.panel"}
                    >
                      {f === "all" ? "All" : STATUS_LABELS[f]}
                      <Box as="span" opacity={0.7} fontVariantNumeric="tabular-nums">
                        {count}
                      </Box>
                    </Button>
                  );
                })}
              </HStack>
              <HStack gap="2" align="center" wrap={{ base: "wrap", sm: "nowrap" }}>
                <InputGroup startElement={<SearchIcon size={14} />} flex="1" minW={{ base: "full", sm: "220px" }}>
                  <Input
                    size="sm"
                    bg="bg.panel"
                    placeholder="Search sites"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search sites"
                  />
                </InputGroup>
                {mode === "admin" && <RunNowButton />}
              </HStack>
            </Flex>
            {mode === "admin" && (
              <Box>
                <AddSiteForm />
              </Box>
            )}
          </Stack>

          {visible.length === 0 ? (
            <EmptyState.Root borderWidth="1px" borderStyle="dashed" rounded="xl" bg="bg.panel">
              <EmptyState.Content>
                <EmptyState.Indicator>
                  <GlobeIcon size={32} />
                </EmptyState.Indicator>
                <EmptyState.Title>{sites.length === 0 ? "No sites yet" : "No sites match"}</EmptyState.Title>
                <EmptyState.Description>
                  {sites.length === 0
                    ? "Add a site above, then run the checks to see its status here."
                    : "Try another status filter or search term."}
                </EmptyState.Description>
              </EmptyState.Content>
            </EmptyState.Root>
          ) : (
            <SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 4 }} gap="4">
              {visible.map((s) => (
                <SiteTile key={s.id} site={s} href={hrefFor(s)} now={ref} mode={mode} />
              ))}
            </SimpleGrid>
          )}
          {visible.length > 0 && (
            <Text fontSize="xs" color="fg.subtle" textAlign="center">
              Showing {visible.length} of {sites.length} sites
              {mode === "demo" ? " · times relative to the latest demo run" : ""}
            </Text>
          )}
        </Stack>
      </Container>
      <PageFooter mode={mode} />
    </Box>
  );
}
