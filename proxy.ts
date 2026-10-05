import { NextResponse, type NextRequest } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";

// Only admin routes run through the proxy; /demo, /status, /login, /api/cron and static assets never match.
export const config = {
  matcher: ["/", "/sites/:path*", "/api/run"],
};

export async function proxy(request: NextRequest) {
  if (await verifySessionFromRequest(request)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}
