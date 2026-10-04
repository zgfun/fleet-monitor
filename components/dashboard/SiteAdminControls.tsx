"use client";

import { Box, Button, Card, Field, Flex, Group, Heading, HStack, Input, InputAddon, Stack, Switch, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { deleteSite, setPublicSlug, toggleSite } from "@/app/actions";
import { actionError } from "./format";
import { TrashIcon } from "./Icons";

export function EnableSwitch({
  id,
  enabled,
  size = "sm",
  label,
}: {
  id: number;
  enabled: boolean;
  size?: "xs" | "sm" | "md";
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [error, setError] = useState<string | null>(null);

  return (
    <HStack gap="2">
      {error && (
        <Text fontSize="xs" color="fg.error" role="alert" maxW="40" lineClamp={2} title={error}>
          {error}
        </Text>
      )}
      <Switch.Root
        size={size}
        colorPalette="green"
        checked={optimistic}
        disabled={pending}
        onCheckedChange={(e) => {
          setError(null);
          startTransition(async () => {
            setOptimistic(e.checked);
            try {
              await toggleSite(id);
            } catch (err) {
              // Caught here: an error escaping a transition would replace the page with the error boundary.
              setError(actionError(err, "Could not change monitoring state"));
            } finally {
              router.refresh();
            }
          });
        }}
      >
        <Switch.HiddenInput aria-label={label ?? (optimistic ? "Pause monitoring" : "Resume monitoring")} />
        <Switch.Control />
        {label && <Switch.Label fontSize="sm">{label}</Switch.Label>}
      </Switch.Root>
    </HStack>
  );
}

function SlugEditor({ id, slug, enabled }: { id: number; slug: string | null; enabled: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const cleaned = value.trim().toLowerCase();
  const valid = cleaned === "" || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleaned);
  const dirty = cleaned !== (slug ?? "");

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await setPublicSlug(id, cleaned === "" ? null : cleaned);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(actionError(e, "Could not save slug (is it already taken?)"));
      }
    });
  }

  return (
    <Field.Root invalid={!valid || !!error}>
      <Field.Label>Public status page</Field.Label>
      <Flex gap="2" w="full" direction={{ base: "column", sm: "row" }}>
        <Group attached w="full" minW="0">
          <InputAddon fontFamily="mono" fontSize="xs" display={{ base: "none", sm: "flex" }}>
            /status/
          </InputAddon>
          <Input
            size="sm"
            fontFamily="mono"
            placeholder="my-site"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid && dirty) save();
            }}
          />
        </Group>
        <Button size="sm" variant="outline" onClick={save} disabled={!valid || !dirty} loading={pending}>
          {cleaned === "" && slug ? "Unpublish" : "Save"}
        </Button>
      </Flex>
      {!valid ? (
        <Field.ErrorText>Lowercase letters, digits and dashes only.</Field.ErrorText>
      ) : error ? (
        <Field.ErrorText>{error}</Field.ErrorText>
      ) : (
        <Field.HelperText>
          {saved ? "Saved. " : ""}
          {slug && !enabled
            ? "Hidden while monitoring is paused."
            : saved
              ? ""
              : "Leave empty to keep the status page private."}
        </Field.HelperText>
      )}
    </Field.Root>
  );
}

function DeleteSite({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button size="sm" variant="outline" colorPalette="red" onClick={() => setConfirming(true)}>
        <TrashIcon />
        Delete site
      </Button>
    );
  }
  return (
    <Stack gap="2">
      <Text fontSize="sm">
        Delete <strong>{name}</strong> and all its check history? This cannot be undone.
      </Text>
      <HStack>
        <Button
          size="sm"
          colorPalette="red"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await deleteSite(id);
                router.push("/");
                router.refresh();
              } catch (e) {
                setError(actionError(e, "Could not delete site"));
              }
            })
          }
        >
          Yes, delete
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </HStack>
      {error && (
        <Text fontSize="sm" color="fg.error">
          {error}
        </Text>
      )}
    </Stack>
  );
}

export function SiteAdminControls({
  id,
  name,
  enabled,
  publicSlug,
}: {
  id: number;
  name: string;
  enabled: boolean;
  publicSlug: string | null;
}) {
  return (
    <Card.Root variant="outline" bg="bg.panel">
      <Card.Header pb="0">
        <Heading size="sm">Settings</Heading>
      </Card.Header>
      <Card.Body gap="5">
        <Flex justify="space-between" align="center" gap="4">
          <Box>
            <Text fontSize="sm" fontWeight="medium">
              Monitoring
            </Text>
            <Text fontSize="xs" color="fg.muted">
              {enabled ? "Included in the daily run." : "Paused — skipped by the daily run."}
            </Text>
          </Box>
          <EnableSwitch id={id} enabled={enabled} />
        </Flex>
        <SlugEditor key={publicSlug ?? ""} id={id} slug={publicSlug} enabled={enabled} />
        <Box borderTopWidth="1px" pt="4">
          <DeleteSite id={id} name={name} />
        </Box>
      </Card.Body>
    </Card.Root>
  );
}
