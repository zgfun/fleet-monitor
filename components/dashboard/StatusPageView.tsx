"use client";

import { Box, Card, Container, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import type { PublicStatus } from "@/lib/public-status";
import type { Status } from "@/lib/status";
import { ColorModeToggle } from "./AppHeader";
import { DayBars } from "./DayBars";
import { formatDateTime, formatDuration, formatPercent, formatRelative, STATUS_PALETTE } from "./format";
import { PulseIcon } from "./Icons";
import { StatusBadge, StatusDot } from "./StatusBadge";

const OVERALL: Record<Status, string> = {
  up: "All systems operational",
  warn: "Degraded performance",
  down: "Service disruption",
  unknown: "Status unknown",
};

const COMPONENT_LABELS = { http: "Website", ssl: "SSL certificate" } as const;

export function StatusPageView({ status }: { status: PublicStatus }) {
  const { overall, components, days, incidents, lastChecked, now: ref } = status;
  const palette = STATUS_PALETTE[overall];

  return (
    <Box minH="100dvh" bg="bg.subtle" display="flex" flexDirection="column">
      <Container maxW="3xl" px={{ base: "4", md: "6" }} py={{ base: "8", md: "14" }} flex="1">
        <Stack gap="6">
          <Flex justify="space-between" align="center" gap="3">
            <Box minW="0">
              <Heading as="h1" size={{ base: "xl", md: "2xl" }} letterSpacing="-0.02em" truncate>
                {status.name}
              </Heading>
              <Text color="fg.muted" fontFamily="mono" fontSize="sm" truncate>
                {status.host}
              </Text>
            </Box>
            <ColorModeToggle />
          </Flex>

          <Card.Root variant="outline" bg={`${palette}.subtle`} borderColor={`${palette}.muted`}>
            <Card.Body>
              <HStack gap="3">
                <StatusDot status={overall} size="14px" pulse />
                <Box>
                  <Text fontWeight="semibold" fontSize={{ base: "lg", md: "xl" }} color={`${palette}.fg`}>
                    {OVERALL[overall]}
                  </Text>
                  {lastChecked && (
                    <Text fontSize="xs" color="fg.muted" title={formatDateTime(lastChecked)}>
                      Last checked {formatRelative(lastChecked, ref)}
                    </Text>
                  )}
                </Box>
              </HStack>
            </Card.Body>
          </Card.Root>

          <Card.Root variant="outline" bg="bg.panel">
            <Card.Body gap="4">
              <Flex justify="space-between" align="baseline" gap="3" wrap="wrap">
                <Text fontWeight="semibold">Uptime</Text>
                <Text fontSize="sm" color="fg.muted">
                  <Text as="span" fontWeight="semibold" color="fg" fontVariantNumeric="tabular-nums">
                    {formatPercent(status.uptime30d)}
                  </Text>{" "}
                  over the last 30 days
                </Text>
              </Flex>
              <DayBars days={days} height={40} />
              <Stack gap="0" borderTopWidth="1px" pt="2">
                {components.map((c) => (
                  <Flex key={c.kind} justify="space-between" align="center" py="2" gap="3">
                    <Text fontSize="sm">{COMPONENT_LABELS[c.kind]}</Text>
                    <StatusBadge
                      status={c.status}
                      size="sm"
                      label={c.status === "up" ? "Operational" : c.status === "warn" ? "Degraded" : c.status === "down" ? "Down" : "No data"}
                    />
                  </Flex>
                ))}
              </Stack>
            </Card.Body>
          </Card.Root>

          <Box>
            <Heading as="h2" size="md" mb="3">
              Recent incidents
            </Heading>
            {incidents.length === 0 ? (
              <Text fontSize="sm" color="fg.muted">
                No incidents reported.
              </Text>
            ) : (
              <Stack gap="3">
                {incidents.map((inc) => (
                  <Card.Root key={`${inc.kind}-${inc.openedAt}`} variant="outline" bg="bg.panel" size="sm">
                    <Card.Body>
                      <Flex justify="space-between" gap="3" align="flex-start" wrap="wrap">
                        <Box>
                          <Text fontWeight="medium" fontSize="sm">
                            {inc.kind === "http" ? "Website unavailable" : "SSL certificate problem"}
                          </Text>
                          <Text fontSize="xs" color="fg.muted">
                            {formatDateTime(inc.openedAt)} ·{" "}
                            {inc.closedAt
                              ? `resolved after ${formatDuration(inc.openedAt, inc.closedAt)}`
                              : `ongoing for ${formatDuration(inc.openedAt, ref)}`}
                          </Text>
                        </Box>
                        <StatusBadge status={inc.closedAt ? "up" : "down"} size="xs" label={inc.closedAt ? "Resolved" : "Investigating"} />
                      </Flex>
                    </Card.Body>
                  </Card.Root>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Container>
      <Box as="footer" py="6">
        <HStack justify="center" gap="1.5" fontSize="xs" color="fg.subtle">
          <PulseIcon size={12} />
          <Text>Powered by Fleet Monitor</Text>
        </HStack>
      </Box>
    </Box>
  );
}
