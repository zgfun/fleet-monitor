"use client";

import { Badge, Box, Button, Container, Flex, HStack, IconButton, Link, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useTheme } from "next-themes";
import { useSyncExternalStore, type ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { LogoutIcon, MoonIcon, PulseIcon, SunIcon } from "./Icons";

const noop = () => () => {};

function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function ColorModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === "dark";
  return (
    <IconButton
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      variant="ghost"
      size="sm"
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {mounted ? dark ? <SunIcon /> : <MoonIcon /> : <Box w="16px" />}
    </IconButton>
  );
}

export function Brand({ href }: { href: string }) {
  return (
    <Link asChild _hover={{ textDecoration: "none" }} color="fg">
      <NextLink href={href}>
        <HStack gap="2.5">
          <Flex
            w="8"
            h="8"
            rounded="lg"
            align="center"
            justify="center"
            bgGradient="to-br"
            gradientFrom="teal.500"
            gradientTo="blue.600"
            color="white"
            shadow="sm"
          >
            <PulseIcon size={18} strokeWidth={2.5} />
          </Flex>
          <Text fontWeight="semibold" letterSpacing="-0.01em" fontSize="md">
            Fleet Monitor
          </Text>
        </HStack>
      </NextLink>
    </Link>
  );
}

export function AppHeader({ mode, actions }: { mode: "admin" | "demo"; actions?: ReactNode }) {
  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex="docked"
      borderBottomWidth="1px"
      bg="bg/80"
      backdropFilter="saturate(180%) blur(10px)"
    >
      <Container maxW="7xl" px={{ base: "4", md: "6" }}>
        <Flex h="14" align="center" justify="space-between" gap="3">
          <HStack gap="3" minW="0">
            <Brand href={mode === "demo" ? "/demo" : "/"} />
            {mode === "demo" && (
              <Badge colorPalette="purple" variant="subtle" rounded="full" display={{ base: "none", sm: "inline-flex" }}>
                Demo
              </Badge>
            )}
          </HStack>
          <HStack gap="1">
            {actions}
            <ColorModeToggle />
            {mode === "admin" ? (
              <form action={logout}>
                <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
                  <LogoutIcon />
                  <Box as="span" display={{ base: "none", sm: "inline" }}>
                    Sign out
                  </Box>
                </Button>
              </form>
            ) : (
              <Button asChild variant="outline" size="sm">
                <NextLink href="/login">Sign in</NextLink>
              </Button>
            )}
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
}

export function DemoBanner() {
  return (
    <Box bg="purple.subtle" color="purple.fg" borderBottomWidth="1px" borderColor="purple.muted">
      <Container maxW="7xl" px={{ base: "4", md: "6" }} py="2">
        <Text fontSize="sm" textAlign="center">
          <Text as="span" fontWeight="semibold">
            Demo mode — fake data, read-only.
          </Text>{" "}
          30 made-up sites on <Text as="span" fontFamily="mono">.example</Text> hosts, 30 days of generated history.
        </Text>
      </Container>
    </Box>
  );
}
