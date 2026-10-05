import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Well-known public sites only: this is a portfolio demo, never client data.
const SEED: { host: string; name: string }[] = [
  { host: "nextjs.org", name: "Next.js" },
  { host: "vercel.com", name: "Vercel" },
  { host: "chakra-ui.com", name: "Chakra UI" },
  { host: "react.dev", name: "React" },
  { host: "nodejs.org", name: "Node.js" },
  { host: "developer.mozilla.org", name: "MDN Web Docs" },
  { host: "github.com", name: "GitHub" },
  { host: "gitlab.com", name: "GitLab" },
  { host: "www.wikipedia.org", name: "Wikipedia" },
  { host: "www.python.org", name: "Python" },
  { host: "www.rust-lang.org", name: "Rust" },
  { host: "go.dev", name: "Go" },
  { host: "www.typescriptlang.org", name: "TypeScript" },
  { host: "deno.com", name: "Deno" },
  { host: "bun.sh", name: "Bun" },
  { host: "svelte.dev", name: "Svelte" },
  { host: "vuejs.org", name: "Vue.js" },
  { host: "astro.build", name: "Astro" },
  { host: "tailwindcss.com", name: "Tailwind CSS" },
  { host: "www.postgresql.org", name: "PostgreSQL" },
  { host: "neon.com", name: "Neon" },
  { host: "resend.com", name: "Resend" },
  { host: "stripe.com", name: "Stripe" },
  { host: "www.cloudflare.com", name: "Cloudflare" },
  { host: "www.mozilla.org", name: "Mozilla" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  // Imported after dotenv so DATABASE_URL is set when the client is created.
  const { db, sites } = await import("@/db");
  // --if-empty: used by the Vercel build so sites deleted in the UI don't come back on deploy.
  if (process.argv.includes("--if-empty")) {
    const existing = await db.select({ id: sites.id }).from(sites).limit(1);
    if (existing.length) {
      console.log("Sites table not empty, skipping seed.");
      return;
    }
  }
  const rows = SEED.map((s) => ({ ...s, publicSlug: slugify(s.name) }));
  const inserted = await db
    .insert(sites)
    .values(rows)
    // No target: skip on host or public_slug clash so re-runs never fail.
    .onConflictDoNothing()
    .returning({ host: sites.host });
  console.log(`Seeded ${inserted.length} new site(s), ${rows.length - inserted.length} already present.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
