"use client";

import { Box, type BoxProps } from "@chakra-ui/react";
import { useId } from "react";
import type { SeriesPoint } from "@/lib/view-models";

type Props = {
  points: SeriesPoint[];
  height?: number;
  /** Fixed y-domain, e.g. [0, 100] for scores. Defaults to data min/max with padding. */
  domain?: [number, number];
  /** Optional horizontal reference line (e.g. a threshold). */
  threshold?: number;
  color?: BoxProps["color"];
  label: string;
};

const W = 300;

export function Sparkline({ points, height = 56, domain, threshold, color = "blue.solid", label }: Props) {
  const gradientId = useId();
  const values = points.map((p) => p.v).filter((v): v is number => v != null);

  if (values.length < 2) {
    return (
      <Box h={`${height}px`} display="flex" alignItems="center" justifyContent="center" color="fg.subtle" fontSize="xs" borderWidth="1px" borderStyle="dashed" rounded="md">
        Not enough data yet
      </Box>
    );
  }

  let [min, max] = domain ?? [Math.min(...values), Math.max(...values)];
  if (!domain) {
    const pad = (max - min) * 0.15 || max * 0.1 || 1;
    min = Math.max(0, min - pad);
    max = max + pad;
  }
  const H = height;
  const n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - 2 - ((v - min) / (max - min || 1)) * (H - 4);

  // Gaps (null values) split the line into segments instead of interpolating.
  const segments: string[] = [];
  let current = "";
  points.forEach((p, i) => {
    if (p.v == null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`;
  });
  if (current) segments.push(current);

  const firstIdx = points.findIndex((p) => p.v != null);
  let lastIdx = n - 1;
  while (lastIdx > 0 && points[lastIdx].v == null) lastIdx--;
  const area = `M${x(firstIdx).toFixed(1)},${H} ${points
    .map((p, i) => (p.v == null ? "" : `L${x(i).toFixed(1)},${y(p.v).toFixed(1)}`))
    .join(" ")} L${x(lastIdx).toFixed(1)},${H} Z`;

  return (
    <Box color={color} w="full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {threshold != null && threshold > min && threshold < max && (
          <line
            x1="0"
            x2={W}
            y1={y(threshold)}
            y2={y(threshold)}
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={area} fill={`url(#${gradientId})`} />
        {segments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </Box>
  );
}
