import { vi } from "vitest";

// Check tests use example hostnames that never resolve. Answer every lookup with a public
// address so the outbound guard lets mocked fetches through; guard tests inject their own resolver.
vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  const lookup = async () => [{ address: "93.184.215.14", family: 4 }];
  return { ...actual, default: { ...actual, lookup }, lookup };
});
