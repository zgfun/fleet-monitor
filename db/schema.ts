import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const CHECK_KINDS = [
  "http",
  "ssl",
  "links",
  "pagespeed",
  "noindex",
  "cookie",
] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  host: text("host").notNull().unique(),
  // Optional explicit URL to check; falls back to https://{host}
  url: text("url"),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  // Slug for the public status page, /status/{slug}. Null = no public page.
  publicSlug: text("public_slug").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checks = pgTable(
  "checks",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").$type<CheckKind>().notNull(),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    ok: boolean("ok").notNull(),
    latencyMs: integer("latency_ms"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("checks_site_kind_ran_idx").on(t.siteId, t.kind, t.ranAt)],
);

export const incidents = pgTable(
  "incidents",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").$type<CheckKind>().notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    note: text("note"),
  },
  (t) => [index("incidents_site_open_idx").on(t.siteId, t.kind, t.closedAt)],
);

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Check = typeof checks.$inferSelect;
export type NewCheck = typeof checks.$inferInsert;
export type Incident = typeof incidents.$inferSelect;
