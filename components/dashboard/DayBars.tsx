"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import type { DayBucket } from "./days";
import { formatShortDay, STATUS_PALETTE } from "./format";
import { Tip } from "./Tip";

export function DayBars({ days, height = 34 }: { days: DayBucket[]; height?: number }) {
  return (
    <Box>
      <Flex gap={{ base: "2px", sm: "3px" }} h={`${height}px`} align="stretch" role="list" aria-label="Daily status, last 30 days">
        {days.map((d) => (
          <Tip
            key={d.day}
            content={
              <>
                <Text fontWeight="semibold">{formatShortDay(d.day)}</Text>
                <Text>{d.note}</Text>
              </>
            }
          >
            <Box
              role="listitem"
              aria-label={`${formatShortDay(d.day)}: ${d.note}`}
              flex="1"
              minW="0"
              rounded="sm"
              bg={d.status === "unknown" ? "bg.emphasized" : `${STATUS_PALETTE[d.status]}.solid`}
              opacity={d.status === "unknown" ? 1 : 0.9}
              transition="opacity 0.15s, transform 0.15s"
              _hover={{ opacity: 1, transform: "scaleY(1.08)" }}
            />
          </Tip>
        ))}
      </Flex>
      <Flex justify="space-between" mt="1.5" fontSize="xs" color="fg.muted">
        <Text>{days.length} days ago</Text>
        <Text>Today</Text>
      </Flex>
    </Box>
  );
}
