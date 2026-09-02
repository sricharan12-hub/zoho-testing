import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * Next.js 16 renamed Middleware to Proxy; this is the same edge hook.
 *
 * This is an OPTIMISTIC check only: it looks for the presence of a session
 * cookie to keep signed-out visitors from seeing a protected shell flash
 * before redirecting. It deliberately does not verify the JWT or read
 * permissions — the Proxy runtime is the wrong place for database work, and
 * every page and API route independently enforces the real check through
 * getCurrentUser() / requirePermission().
 */
const PUBLIC_PATHS = ["/login", "/signup"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasCookie && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were headed so login can bounce them back.
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (hasCookie && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Pages only. /api is excluded on purpose: an unauthenticated API call must
  // get a 401 JSON body from requireUser(), never an HTML redirect to /login.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
