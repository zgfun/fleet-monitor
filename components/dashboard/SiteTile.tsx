"use client";

import { Badge, Box, Card, Flex, HStack, LinkBox, LinkOverlay, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import type { SiteSummary } from "@/lib/view-models";
import { formatMs, formatRelative, KIND_ORDER, KIND_SHORT, KIND_LABELS, STATUS_LABELS, STATUS_PALETTE } from "./format";
import { EnableSwitch } from "./SiteAdminControls";
import { StatusBadge, StatusDot } from "./StatusBadge";
import { Tip } from "./Tip";

export function KindDots({ site }: { site: SiteSummary }) {
  return (
    <HStack gap="1.5" wrap="wrap" position="relative" zIndex="1">
      {KIND_ORDER.map((kind) => {
        const snap = site.checks[kind];
        const status = snap?.status ?? "unknown";
        return (
          <Tip
            key={kind}
            content={
              <>
                <Text fontWeight="semibold">{KIND_LABELS[kind]}</Text>
                <Text>{snap ? snap.summary : kind === "pagespeed" ? "Skipped (no API key)" : "Not checked yet"}</Text>
              </>
            }
          >
            <HStack
              as="span"
              gap="1"
              px="1.5"
              py="0.5"
              rounded="md"
              bg="bg.muted"
              fontSize="2xs"
              fontWeight="medium"
              color="fg.muted"
              cursor="default"
              tabIndex={0}
              aria-label={`${KIND_LABELS[kind]}: ${snap?.summary ?? STATUS_LABELS[status]}`}
            >
              <Box as="span" w="6px" h="6px" rounded="full" bg={status === "unknown" ? "gray.400" : `${STATUS_PALETTE[status]}.solid`} />
              {KIND_SHORT[kind]}
            </HStack>
          </Tip>
        );
      })}
    </HStack>
  );
}

export function SiteTile({
  site,
  href,
  now,
  mode,
}: {
  site: SiteSummary;
  href: string;
  now: string;
  mode: "admin" | "demo";
}) {
  const http = site.checks.http;
  const perf = site.checks.pagespeed?.data?.score;
  const lastRan = Object.values(site.checks).reduce<string | null>(
    (acc, s) => (s && (!acc || s.ranAt > acc) ? s.ranAt : acc),
    null,
  );
  const accent = site.enabled ? `${STATUS_PALETTE[site.status]}.solid` : "border";

  return (
    <LinkBox asChild>
      <Card.Root
        size="sm"
        variant="outline"
        bg="bg.panel"
        overflow="hidden"
        transition="border-color 0.15s, box-shadow 0.15s, transform 0.15s"
        _hover={{ borderColor: "border.emphasized", shadow: "md", transform: "translateY(-1px)" }}
        opacity={site.enabled ? 1 : 0.65}
      >
        <Box h="3px" bg={accent} />
        <Card.Body gap="3">
          <Flex align="flex-start" justify="space-between" gap="3">
            <Box minW="0">
              <HStack gap="2">
                <StatusDot status={site.enabled ? site.status : "unknown"} pulse />
                <LinkOverlay asChild>
                  <NextLink href={href}>
                    <Text fontWeight="semibold" truncate>
                      {site.name}
                    </Text>
                  </NextLink>
                </LinkOverlay>
              </HStack>
              <Text fontSize="sm" color="fg.muted" fontFamily="mono" truncate mt="0.5">
                {site.host}
              </Text>
            </Box>
            {site.enabled ? (
              <StatusBadge status={site.status} size="xs" />
            ) : (
              <Badge size="xs" variant="outline" rounded="full">
                Paused
              </Badge>
            )}
          </Flex>

          <KindDots site={site} />

          <Flex justify="space-between" align="center" fontSize="xs" color="fg.muted" gap="2" wrap="wrap">
            <HStack gap="3">
              <Text fontVariantNumeric="tabular-nums">
                <Text as="span" color="fg.subtle">
                  Resp{" "}
                </Text>
                {formatMs(http?.latencyMs)}
              </Text>
              {typeof perf === "number" && (
                <Text fontVariantNumeric="tabular-nums">
                  <Text as="span" color="fg.subtle">
                    Perf{" "}
                  </Text>
                  {perf}
                </Text>
              )}
              {site.openIncidents > 0 && (
                <Badge size="xs" colorPalette="red" variant="solid" rounded="full">
                  {site.openIncidents} open
                </Badge>
              )}
            </HStack>
            <HStack gap="2">
              <Text title={lastRan ?? undefined}>{lastRan ? formatRelative(lastRan, now) : "never checked"}</Text>
              {mode === "admin" && (
                <Box position="relative" zIndex="1">
                  <EnableSwitch id={site.id} enabled={site.enabled} size="xs" />
                </Box>
              )}
            </HStack>
          </Flex>
        </Card.Body>
      </Card.Root>
    </LinkBox>
  );
}
