"use client";

import { Box, Button, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useEffect } from "react";
import { PulseIcon } from "@/components/dashboard/Icons";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Flex minH="100dvh" align="center" justify="center" bg="bg.subtle" px="4">
      <Stack gap="5" align="center" textAlign="center" maxW="md">
        <Flex w="12" h="12" rounded="xl" align="center" justify="center" bg="red.subtle" color="red.fg">
          <PulseIcon size={24} />
        </Flex>
        <Box>
          <Heading as="h1" size="2xl" letterSpacing="-0.02em">
            Something went wrong
          </Heading>
          <Text color="fg.muted" mt="2">
            The page hit an unexpected error. Your data is safe; try again, or reload if it keeps happening.
          </Text>
          {error.digest && (
            <Text fontFamily="mono" fontSize="xs" color="fg.subtle" mt="2">
              Reference: {error.digest}
            </Text>
          )}
        </Box>
        <HStack gap="2">
          <Button size="sm" colorPalette="teal" onClick={() => retry()}>
            Try again
          </Button>
          <Button asChild size="sm" variant="outline">
            <NextLink href="/">Dashboard</NextLink>
          </Button>
        </HStack>
      </Stack>
    </Flex>
  );
}
