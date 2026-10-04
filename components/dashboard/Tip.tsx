"use client";

import { Portal, Tooltip } from "@chakra-ui/react";
import type { ReactElement, ReactNode } from "react";

export function Tip({ content, children }: { content: ReactNode; children: ReactElement }) {
  return (
    <Tooltip.Root openDelay={120} closeDelay={60} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content maxW="280px" fontSize="xs">
            <Tooltip.Arrow>
              <Tooltip.ArrowTip />
            </Tooltip.Arrow>
            {content}
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
