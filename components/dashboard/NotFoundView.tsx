"use client";

import { Box, Button, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { PulseIcon } from "./Icons";

export function NotFoundView() {
  return (
    <Flex minH="100dvh" align="center" justify="center" bg="bg.subtle" px="4">
      <Stack gap="5" align="center" textAlign="center" maxW="md">
        <Flex w="12" h="12" rounded="xl" align="center" justify="center" bg="bg.muted" color="fg.muted">
          <PulseIcon size={24} />
        </Flex>
        <Box>
          <Text fontFamily="mono" fontSize="sm" color="fg.subtle">
            404
          </Text>
          <Heading as="h1" size="2xl" letterSpacing="-0.02em" mt="1">
            Nothing to monitor here
          </Heading>
          <Text color="fg.muted" mt="2">
            This page does not exist, or the status page you are looking for is not public.
          </Text>
        </Box>
        <HStack gap="2">
          <Button asChild size="sm" colorPalette="teal">
            <NextLink href="/demo">Open the demo</NextLink>
          </Button>
          <Button asChild size="sm" variant="outline">
            <NextLink href="/">Dashboard</NextLink>
          </Button>
        </HStack>
      </Stack>
    </Flex>
  );
}
