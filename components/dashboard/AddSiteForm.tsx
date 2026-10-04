"use client";

import { Button, Card, Field, Flex, HStack, Input, SimpleGrid, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { addSite } from "@/app/actions";
import { actionError } from "./format";
import { PlusIcon } from "./Icons";

type State = { error: string | null; added: string | null };

export function AddSiteForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<State>({ error: null, added: null });
  const [pending, startTransition] = useTransition();

  // onSubmit rather than a form action: React resets action forms, which would wipe input on errors.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await addSite(formData);
        formRef.current?.reset();
        setState({ error: null, added: String(formData.get("name") || formData.get("host") || "") });
        router.refresh();
      } catch (err) {
        setState({
          error: actionError(err, "Could not add the site. Check the host, or it may already be monitored."),
          added: null,
        });
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon size={14} />
        Add site
      </Button>
    );
  }

  return (
    <Card.Root variant="outline" bg="bg.panel" w="full">
      <Card.Body>
        <form ref={formRef} onSubmit={submit}>
          <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
            <Field.Root>
              <Field.Label>Name</Field.Label>
              <Input name="name" size="sm" placeholder="Next.js" autoComplete="off" maxLength={100} />
            </Field.Root>
            <Field.Root required>
              <Field.Label>
                Host <Field.RequiredIndicator />
              </Field.Label>
              <Input name="host" size="sm" required placeholder="nextjs.org" fontFamily="mono" autoComplete="off" />
            </Field.Root>
            <Field.Root>
              <Field.Label>URL to check</Field.Label>
              <Input name="url" size="sm" placeholder="https://nextjs.org/ (optional)" fontFamily="mono" autoComplete="off" />
            </Field.Root>
          </SimpleGrid>
          <Flex mt="4" justify="space-between" align="center" gap="3" wrap="wrap">
            <Text fontSize="sm" color={state.error ? "fg.error" : "fg.muted"} role="status" aria-live="polite">
              {state.error ?? (state.added ? `Added ${state.added}. It will be checked on the next run.` : "")}
            </Text>
            <HStack>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} type="button">
                Close
              </Button>
              <Button size="sm" type="submit" colorPalette="teal" loading={pending}>
                Add site
              </Button>
            </HStack>
          </Flex>
        </form>
      </Card.Body>
    </Card.Root>
  );
}
