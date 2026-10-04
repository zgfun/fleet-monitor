// Runs a real Postgres locally without Docker (data in .pgdata/).
// Same port and credentials as docker-compose.yml, so DATABASE_URL is identical.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const pg = new EmbeddedPostgres({
  databaseDir: ".pgdata",
  user: "fleet",
  password: "fleet",
  port: 5433,
  persistent: true,
});

const fresh = !existsSync(".pgdata/PG_VERSION");
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("fleet");
console.log("Postgres ready on postgres://fleet:fleet@localhost:5433/fleet (Ctrl+C to stop)");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
