import { z } from "zod";
import { runFleet } from "@/lib/runner";
import { verifySessionFromRequest } from "@/lib/session";

export const maxDuration = 300;

const Body = z.object({ siteId: z.number().int().positive().optional() });

export async function POST(request: Request) {
  if (!(await verifySessionFromRequest(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.text();
  let json: unknown = {};
  if (raw.trim()) {
    try {
      json = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const { siteId } = parsed.data;
  const result = await runFleet(siteId ? { siteIds: [siteId] } : {});
  return Response.json(result);
}
