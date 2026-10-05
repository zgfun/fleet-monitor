import { describe, expect, it } from "vitest";
import { fetchHomepage, readCapped } from "../homepage";
import { mockFetch } from "./helpers";

const target = { host: "site-01.example", url: "https://site-01.example/" };

/** A body that never ends, like a hostile or broken server streaming forever. */
function endless(chunk = "<p>" + "x".repeat(1020) + "</p>") {
  const bytes = new TextEncoder().encode(chunk);
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(bytes);
    },
  });
  return { body, pulled: () => pulled };
}

describe("fetchHomepage", () => {
  it("returns the HTML, headers and final URL", async () => {
    const fetchImpl = mockFetch(
      () => new Response("<html>hi</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const page = await fetchHomepage(target, { fetchImpl });
    expect(page).toMatchObject({ html: "<html>hi</html>", finalUrl: target.url });
  });

  it("truncates an endless body at maxBytes instead of buffering it", async () => {
    const stream = endless();
    const fetchImpl = mockFetch(() => new Response(stream.body, { headers: { "content-type": "text/html" } }));
    const page = await fetchHomepage(target, { fetchImpl, maxBytes: 64 * 1024 });
    expect(page!.html.length).toBe(64 * 1024);
    expect(stream.pulled()).toBeLessThan(100);
  });

  it("skips non-HTML responses", async () => {
    const fetchImpl = mockFetch(
      () => new Response("\u0000binary", { status: 200, headers: { "content-type": "application/octet-stream" } }),
    );
    expect(await fetchHomepage(target, { fetchImpl })).toBeNull();
  });

  it("is null on non-2xx", async () => {
    const fetchImpl = mockFetch(() => new Response("nope", { status: 500 }));
    expect(await fetchHomepage(target, { fetchImpl })).toBeNull();
  });
});

describe("readCapped", () => {
  it("does not split multi-byte characters across chunks", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const bytes = new TextEncoder().encode("héllo");
        c.enqueue(bytes.subarray(0, 2));
        c.enqueue(bytes.subarray(2));
        c.close();
      },
    });
    expect(await readCapped(new Response(body), 1024)).toBe("héllo");
  });
});
