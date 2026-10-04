CREATE TABLE "checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"kind" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"latency_ms" integer,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"kind" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"host" text NOT NULL,
	"url" text,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"public_slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_host_unique" UNIQUE("host"),
	CONSTRAINT "sites_public_slug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checks_site_kind_ran_idx" ON "checks" USING btree ("site_id","kind","ran_at");--> statement-breakpoint
CREATE INDEX "incidents_site_open_idx" ON "incidents" USING btree ("site_id","kind","closed_at");