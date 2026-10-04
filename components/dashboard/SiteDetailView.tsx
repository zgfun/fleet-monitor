"use client";

import {
  Badge,
  Box,
  Card,
  Container,
  Flex,
  Grid,
  Heading,
  HStack,
  Link,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import NextLink from "next/link";
import type { ReactNode } from "react";
import type { CheckKind } from "@/db/schema";
import { THRESHOLDS } from "@/lib/status";
import type { CheckSnapshot, SeriesPoint, SiteDetail } from "@/lib/view-models";
import { AppHeader, DemoBanner } from "./AppHeader";
import { DayBars } from "./DayBars";
import { dailyHttpStatus } from "./days";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMs,
  formatPercent,
  formatRelative,
  KIND_LABELS,
  KIND_ORDER,
  latestRanAt,
  STATUS_PALETTE,
} from "./format";
import { ArrowLeftIcon, ExternalIcon } from "./Icons";
import { PageFooter } from "./PageFooter";
import { RunNowButton } from "./RunNowButton";
import { SiteAdminControls } from "./SiteAdminControls";
import { Sparkline } from "./Sparkline";
import { StatusBadge, StatusDot } from "./StatusBadge";

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function detailLines(snap: CheckSnapshot): [string, string][] {
  const d = snap.data ?? {};
  const lines: [string, string | null][] = [];
  switch (snap.kind) {
    case "http":
      lines.push(["Status", str(d.status)], ["Response", formatMs(snap.latencyMs)], ["Final URL", str(d.finalUrl)]);
      break;
    case "ssl":
      lines.push(["Expires", d.validTo ? formatDate(String(d.validTo)) : null], ["Issuer", str(d.issuer)]);
      break;
    case "links":
      lines.push(["Checked", num(d.checked) != null ? `${d.checked} of ${d.total}` : null]);
      break;
    case "pagespeed": {
      const lcp = num(d.lcpMs);
      const cls = num(d.cls);
      const tbt = num(d.tbtMs);
      lines.push(
        ["LCP", lcp != null ? formatMs(lcp) : null],
        ["CLS", cls != null ? cls.toFixed(3) : null],
        ["TBT", tbt != null ? formatMs(tbt) : null],
        ["Strategy", str(d.strategy)],
      );
      break;
    }
    case "noindex":
      lines.push(["Source", d.source ? (d.source === "meta" ? "meta robots tag" : "X-Robots-Tag header") : null]);
      break;
    case "cookie":
      lines.push(["Vendor", str(d.vendor)]);
      break;
  }
  if (typeof d.error === "string" && d.error) lines.push(["Error", d.error]);
  return lines.filter((l): l is [string, string] => l[1] != null);
}

function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <Card.Root variant="outline" bg="bg.panel">
      <Card.Header pb="0">
        <Flex justify="space-between" align="center" gap="3" wrap="wrap">
          <Heading size="sm">{title}</Heading>
          {extra}
        </Flex>
      </Card.Header>
      <Card.Body>{children}</Card.Body>
    </Card.Root>
  );
}

function KindCard({ kind, snap, now }: { kind: CheckKind; snap: CheckSnapshot | undefined; now: string }) {
  const status = snap?.status ?? "unknown";
  return (
    <Card.Root variant="outline" bg="bg.panel" size="sm" overflow="hidden">
      <Box h="3px" bg={status === "unknown" ? "border" : `${STATUS_PALETTE[status]}.solid`} />
      <Card.Body gap="2">
        <Flex justify="space-between" align="center" gap="2">
          <Text fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wider" fontWeight="medium">
            {KIND_LABELS[kind]}
          </Text>
          <StatusDot status={status} size="8px" />
        </Flex>
        <Text fontWeight="semibold" fontSize="lg" lineHeight="short">
          {snap ? snap.summary : kind === "pagespeed" ? "Skipped" : "Not checked"}
        </Text>
        {snap ? (
          <Stack gap="0.5" fontSize="xs" color="fg.muted">
            {detailLines(snap).map(([k, v]) => (
              <Flex key={k} gap="2" minW="0">
                <Text color="fg.subtle" flexShrink={0}>
                  {k}
                </Text>
                <Text truncate title={v}>
                  {v}
                </Text>
              </Flex>
            ))}
            <Text color="fg.subtle" mt="1" title={formatDateTime(snap.ranAt)}>
              {formatRelative(snap.ranAt, now)}
            </Text>
          </Stack>
        ) : (
          <Text fontSize="xs" color="fg.subtle">
            {kind === "pagespeed" ? "Needs a PageSpeed API key." : "Runs on the next check."}
          </Text>
        )}
      </Card.Body>
    </Card.Root>
  );
}

function seriesStats(points: SeriesPoint[]) {
  const vs = points.map((p) => p.v).filter((v): v is number => v != null);
  if (!vs.length) return null;
  return {
    min: Math.min(...vs),
    max: Math.max(...vs),
    avg: vs.reduce((a, b) => a + b, 0) / vs.length,
    last: vs[vs.length - 1],
  };
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Box>
      <Text fontSize="xs" color="fg.muted">
        {label}
      </Text>
      <Text fontSize="xl" fontWeight="semibold" fontVariantNumeric="tabular-nums" letterSpacing="-0.02em">
        {value}
      </Text>
      {hint && (
        <Text fontSize="xs" color="fg.subtle">
          {hint}
        </Text>
      )}
    </Box>
  );
}

export function SiteDetailView({ site, mode, now }: { site: SiteDetail; mode: "admin" | "demo"; now?: string }) {
  const ref = now ?? latestRanAt([site]) ?? site.history[0]?.ranAt ?? "1970-01-01T00:00:00Z";
  const rt = seriesStats(site.responseTime);
  const perf = seriesStats(site.perfScore);
  const days = dailyHttpStatus(site, ref);
  const openIncidents = site.incidents.filter((i) => !i.closedAt);
  const backHref = mode === "demo" ? "/demo" : "/";

  return (
    <Box minH="100dvh" bg="bg.subtle" display="flex" flexDirection="column">
      <AppHeader mode={mode} />
      {mode === "demo" && <DemoBanner />}
      <Container maxW="7xl" px={{ base: "4", md: "6" }} py={{ base: "6", md: "8" }} flex="1">
        <Stack gap="6">
          <Link asChild fontSize="sm" color="fg.muted" w="fit-content">
            <NextLink href={backHref}>
              <ArrowLeftIcon size={14} />
              All sites
            </NextLink>
          </Link>

          <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap="4" direction={{ base: "column", md: "row" }}>
            <Box minW="0">
              <HStack gap="3" wrap="wrap">
                <Heading as="h1" size={{ base: "2xl", md: "3xl" }} letterSpacing="-0.02em">
                  {site.name}
                </Heading>
                {site.enabled ? (
                  <StatusBadge status={site.status} />
                ) : (
                  <Badge variant="outline" rounded="full">
                    Paused
                  </Badge>
                )}
              </HStack>
              <HStack gap="3" mt="1" wrap="wrap" fontSize="sm">
                {mode === "demo" ? (
                  <Text fontFamily="mono" color="fg.muted">
                    {site.host}
                  </Text>
                ) : (
                  <Link href={site.url} target="_blank" rel="noreferrer" fontFamily="mono" color="fg.muted">
                    {site.host}
                    <ExternalIcon size={12} />
                  </Link>
                )}
                {mode === "admin" && site.enabled && site.publicSlug && (
                  <Link asChild color="teal.fg">
                    <NextLink href={`/status/${site.publicSlug}`} target="_blank">
                      Public status page
                      <ExternalIcon size={12} />
                    </NextLink>
                  </Link>
                )}
              </HStack>
            </Box>
            {mode === "admin" && <RunNowButton siteId={site.id} />}
          </Flex>

          <Grid templateColumns={{ base: "1fr", lg: mode === "admin" ? "minmax(0,1fr) 320px" : "1fr" }} gap="6" alignItems="start">
            <Stack gap="6" minW="0">
              <Card.Root variant="outline" bg="bg.panel">
                <Card.Body>
                  <SimpleGrid columns={{ base: 2, md: 4 }} gap="4">
                    <Metric label="Uptime (30 days)" value={formatPercent(site.uptime30d)} />
                    <Metric label="Avg response" value={formatMs(rt?.avg)} hint={rt ? `${formatMs(rt.min)} – ${formatMs(rt.max)}` : undefined} />
                    <Metric label="Performance" value={perf ? String(Math.round(perf.last)) : "—"} hint={perf ? `avg ${Math.round(perf.avg)}` : "mobile, Lighthouse"} />
                    <Metric
                      label="Open incidents"
                      value={String(openIncidents.length)}
                      hint={`${site.incidents.length} in total`}
                    />
                  </SimpleGrid>
                  <Box mt="6">
                    <Text fontSize="xs" color="fg.muted" mb="2">
                      Availability, last 30 days
                    </Text>
                    <DayBars days={days} />
                  </Box>
                </Card.Body>
              </Card.Root>

              <SimpleGrid columns={{ base: 1, sm: 2, xl: 3 }} gap="3">
                {KIND_ORDER.map((k) => (
                  <KindCard key={k} kind={k} snap={site.checks[k]} now={ref} />
                ))}
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
                <Section
                  title="Response time"
                  extra={<Text fontSize="xs" color="fg.muted">{rt ? `latest ${formatMs(rt.last)}` : ""}</Text>}
                >
                  <Sparkline points={site.responseTime} threshold={THRESHOLDS.slowMs} color="blue.solid" label="Response time, last 30 days" />
                  <Text fontSize="xs" color="fg.subtle" mt="2">
                    30 days · dashed line = slow threshold ({formatMs(THRESHOLDS.slowMs)})
                  </Text>
                </Section>
                <Section
                  title="Performance score"
                  extra={<Text fontSize="xs" color="fg.muted">{perf ? `latest ${Math.round(perf.last)}` : ""}</Text>}
                >
                  <Sparkline points={site.perfScore} domain={[0, 100]} threshold={THRESHOLDS.perfWarnScore} color="purple.solid" label="PageSpeed performance score, last 30 days" />
                  <Text fontSize="xs" color="fg.subtle" mt="2">
                    PageSpeed mobile, 0–100 · dashed line = warning threshold ({THRESHOLDS.perfWarnScore})
                  </Text>
                </Section>
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
                <Section title="Broken links" extra={<Badge colorPalette={site.brokenLinks.length ? "orange" : "green"} variant="subtle">{site.brokenLinks.length}</Badge>}>
                  {site.brokenLinks.length === 0 ? (
                    <Text fontSize="sm" color="fg.muted">
                      No broken links on the homepage.
                    </Text>
                  ) : (
                    <Table.ScrollArea>
                      <Table.Root size="sm" variant="line">
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeader>URL</Table.ColumnHeader>
                            <Table.ColumnHeader textAlign="end">Status</Table.ColumnHeader>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {site.brokenLinks.map((l) => (
                            <Table.Row key={l.url}>
                              <Table.Cell maxW="0" w="full">
                                <Text truncate fontFamily="mono" fontSize="xs" title={l.url}>
                                  {l.url}
                                </Text>
                              </Table.Cell>
                              <Table.Cell textAlign="end">
                                <Badge colorPalette="red" variant="subtle" size="xs">
                                  {l.status}
                                </Badge>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    </Table.ScrollArea>
                  )}
                </Section>

                <Section title="Incidents">
                  {site.incidents.length === 0 ? (
                    <Text fontSize="sm" color="fg.muted">
                      No incidents recorded.
                    </Text>
                  ) : (
                    <Stack gap="3">
                      {site.incidents.map((inc) => (
                        <Flex key={inc.id} gap="3" align="flex-start">
                          <StatusDot status={inc.closedAt ? "up" : "down"} size="8px" mt="1.5" />
                          <Box minW="0" flex="1">
                            <HStack gap="2" wrap="wrap">
                              <Text fontSize="sm" fontWeight="medium">
                                {KIND_LABELS[inc.kind]}
                              </Text>
                              <Badge size="xs" variant="subtle" colorPalette={inc.closedAt ? "gray" : "red"}>
                                {inc.closedAt ? "Resolved" : "Open"}
                              </Badge>
                            </HStack>
                            <Text fontSize="xs" color="fg.muted">
                              {formatDateTime(inc.openedAt)} · {inc.closedAt ? `lasted ${formatDuration(inc.openedAt, inc.closedAt)}` : `ongoing for ${formatDuration(inc.openedAt, ref)}`}
                            </Text>
                            {inc.note && (
                              <Text fontSize="xs" color="fg.subtle" mt="0.5">
                                {inc.note}
                              </Text>
                            )}
                          </Box>
                        </Flex>
                      ))}
                    </Stack>
                  )}
                </Section>
              </SimpleGrid>

              <Section title="Recent checks">
                {site.history.length === 0 ? (
                  <Text fontSize="sm" color="fg.muted">
                    No checks have run yet.
                  </Text>
                ) : (
                  <Table.ScrollArea>
                    <Table.Root size="sm" variant="line" minW="480px">
                      <Table.Header>
                        <Table.Row>
                          <Table.ColumnHeader>When</Table.ColumnHeader>
                          <Table.ColumnHeader>Check</Table.ColumnHeader>
                          <Table.ColumnHeader>Result</Table.ColumnHeader>
                          <Table.ColumnHeader textAlign="end">Latency</Table.ColumnHeader>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {site.history.slice(0, 50).map((h, i) => (
                          <Table.Row key={`${h.kind}-${h.ranAt}-${i}`}>
                            <Table.Cell whiteSpace="nowrap" color="fg.muted" fontSize="xs">
                              {formatDateTime(h.ranAt)}
                            </Table.Cell>
                            <Table.Cell whiteSpace="nowrap">{KIND_LABELS[h.kind]}</Table.Cell>
                            <Table.Cell>
                              <HStack gap="2">
                                <StatusDot status={h.status} size="7px" />
                                <Text fontSize="sm">{h.summary}</Text>
                              </HStack>
                            </Table.Cell>
                            <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums" color="fg.muted" whiteSpace="nowrap">
                              {formatMs(h.latencyMs)}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Root>
                  </Table.ScrollArea>
                )}
              </Section>
            </Stack>

            {mode === "admin" && (
              <Box position={{ lg: "sticky" }} top={{ lg: "20" }}>
                <SiteAdminControls id={site.id} name={site.name} enabled={site.enabled} publicSlug={site.publicSlug} />
              </Box>
            )}
          </Grid>
        </Stack>
      </Container>
      <PageFooter mode={mode} />
    </Box>
  );
}
