"use client";

import { Box, Container, Flex, Link, Text } from "@chakra-ui/react";
import NextLink from "next/link";

export function PageFooter({ mode }: { mode: "admin" | "demo" }) {
  return (
    <Box as="footer" borderTopWidth="1px" mt="auto">
      <Container maxW="7xl" px={{ base: "4", md: "6" }} py="5">
        <Flex justify="space-between" gap="3" fontSize="xs" color="fg.subtle" direction={{ base: "column", sm: "row" }}>
          <Text>Fleet Monitor · daily checks for HTTP, SSL, links, performance, indexing and consent banners.</Text>
          {mode === "demo" && (
            <Link asChild color="fg.muted">
              <NextLink href="/login">Admin sign in</NextLink>
            </Link>
          )}
        </Flex>
      </Container>
    </Box>
  );
}
