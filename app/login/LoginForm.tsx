"use client";

import { Alert, Box, Button, Card, Field, Heading, Input, Link, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm({ next, configured }: { next: string; configured: boolean }) {
  const [state, formAction, pending] = useActionState(login, initialState);
  const error = state.error ?? (configured ? null : "Admin login is not configured.");

  return (
    <Box
      as="main"
      minH="100dvh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px="4"
      py="10"
      bg="bg.subtle"
    >
      <Card.Root w="full" maxW="sm" variant="elevated">
        <Card.Header>
          <Stack gap="1">
            <Heading size="xl">Fleet Monitor</Heading>
            <Text color="fg.muted" textStyle="sm">
              Sign in to manage the monitored sites.
            </Text>
          </Stack>
        </Card.Header>
        <Card.Body>
          <form action={formAction}>
            <input type="hidden" name="next" value={next} />
            <Stack gap="4">
              {error && (
                <Alert.Root status="error" size="sm">
                  <Alert.Indicator />
                  <Alert.Title>{error}</Alert.Title>
                </Alert.Root>
              )}
              <Field.Root required invalid={Boolean(state.error)} disabled={!configured}>
                <Field.Label>Password</Field.Label>
                <Input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                />
              </Field.Root>
              <Button type="submit" colorPalette="blue" loading={pending} disabled={!configured}>
                Sign in
              </Button>
            </Stack>
          </form>
        </Card.Body>
        <Card.Footer justifyContent="center">
          <Link asChild colorPalette="blue" color="colorPalette.fg" textStyle="sm">
            <NextLink href="/demo">View the demo →</NextLink>
          </Link>
        </Card.Footer>
      </Card.Root>
    </Box>
  );
}
