import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

/**
 * DB-backed tests run against TEST_DATABASE_URL only, never the dev database the dashboard reads.
 * Import this before "@/db": it points DATABASE_URL at the test database (or at a dummy URL, since
 * postgres-js connects lazily) and migrates it. Suites use describe.skipIf(!hasTestDb).
 */
async function prepare(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const sql = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    // Test files run in parallel workers; serialise the migration.
    await sql`select pg_advisory_lock(hashtext('fleet-monitor:test-migrate'))`;
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    return true;
  } catch (err) {
    console.warn(`[test-db] skipping DB tests: ${err instanceof Error ? err.message : err}`);
    return false;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

export const hasTestDb = await prepare(process.env.TEST_DATABASE_URL);

process.env.DATABASE_URL = hasTestDb
  ? process.env.TEST_DATABASE_URL
  : "postgres://unused:unused@127.0.0.1:1/unused";
