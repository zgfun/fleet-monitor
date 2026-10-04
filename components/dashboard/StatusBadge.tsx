"use client";

import { Badge, Box, type BoxProps } from "@chakra-ui/react";
import type { Status } from "@/lib/status";
import { STATUS_LABELS, STATUS_PALETTE } from "./format";

export function StatusDot({
  status,
  size = "10px",
  pulse = false,
  ...rest
}: { status: Status; size?: string; pulse?: boolean } & BoxProps) {
  const palette = STATUS_PALETTE[status];
  return (
    <Box
      as="span"
      display="inline-block"
      flexShrink={0}
      w={size}
      h={size}
      rounded="full"
      // gray.solid is near-black/white; "no data" should read as absent, matching KindDots.
      bg={status === "unknown" ? "gray.400" : `${palette}.solid`}
      boxShadow={`0 0 0 3px var(--chakra-colors-${palette}-subtle)`}
      animation={pulse && status === "down" ? "pulse" : undefined}
      role="img"
      aria-label={STATUS_LABELS[status]}
      {...rest}
    />
  );
}

export function StatusBadge({
  status,
  label,
  size = "sm",
}: {
  status: Status;
  label?: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  return (
    <Badge colorPalette={STATUS_PALETTE[status]} variant="subtle" size={size} rounded="full" px="2" gap="1.5">
      <Box as="span" w="6px" h="6px" rounded="full" bg="colorPalette.solid" />
      {label ?? STATUS_LABELS[status]}
    </Badge>
  );
}
