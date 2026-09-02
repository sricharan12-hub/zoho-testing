import { cache } from "react";
import { cookies } from "next/headers";
import { after } from "next/server";
import { db } from "@/lib/supabase";
import { verifyToken } from "@/lib/auth/jwt";
import { permissionsForUser } from "@/lib/auth/rbac";
import { SESSION_COOKIE, IDLE_TIMEOUT_MINUTES } from "@/lib/auth/cookie";
import "server-only";

export { SESSION_COOKIE, IDLE_TIMEOUT_MINUTES } from "@/lib/auth/cookie";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  department: string | null;
  roles: string[];
  permissions: string[];
  jti: string;
};

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // HTTPS-only in production; plain http://localhost still works in dev.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Resolves the caller from the session cookie: verifies the JWT, confirms the
 * session row is still live (not revoked, not expired, not idle), then reads
 * roles and permissions fresh from the database.
 *
 * Permissions are deliberately NOT read from the token — an admin revoking a
 * role takes effect on the user's very next request instead of an hour later.
 *
 * Wrapped in React's cache() so it runs at most once per request. The portal
 * layout and the page inside it both need the caller, and every admin page
 * asks again; without this, one navigation re-ran the whole lookup for each.
 *
 * The session row (with its user embedded) and the permission set are fetched
 * concurrently — both are keyed off claims we already hold, so neither has to
 * wait for the other.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = verifyToken(token);
  if (!claims) return null;

  const supabase = db();

  const [sessionResult, access] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        "id, jti, user_id, expires_at, revoked_at, last_seen_at, " +
          "users ( id, email, full_name, department, is_active )"
      )
      .eq("jti", claims.jti)
      .maybeSingle(),
    permissionsForUser(claims.sub),
  ]);

  // The generated types do not describe embedded rows, so the shape is named
  // here rather than inferred.
  const session = sessionResult.data as unknown as SessionWithUser | null;

  if (!session || session.revoked_at) return null;
  if (new Date(session.expires_at) < new Date()) return null;

  const idleMs = Date.now() - new Date(session.last_seen_at).getTime();
  if (idleMs > IDLE_TIMEOUT_MINUTES * 60_000) {
    await supabase
      .from("sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", session.id);
    return null;
  }

  const user = session.users;
  if (!user || !user.is_active) return null;

  // The embed is scoped by the session's own foreign key, but a token whose
  // subject does not match the session it names has no business being honoured.
  if (user.id !== claims.sub) return null;

  // Touch activity so the idle window slides forward. This is a write nobody
  // is waiting on, so it runs after the response is sent rather than adding a
  // round trip to every authenticated page load.
  scheduleActivityTouch(session.id);

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    department: user.department ?? null,
    roles: access.roles,
    permissions: access.permissions,
    jti: claims.jti,
  };
});

type SessionWithUser = {
  id: string;
  jti: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string;
  users: {
    id: string;
    email: string;
    full_name: string;
    department: string | null;
    is_active: boolean;
  } | null;
};

/**
 * Slides the idle window forward without blocking the response. `after()` only
 * exists inside a request, so anything else (a script, a test harness) falls
 * back to awaiting nothing and simply skips the touch.
 */
function scheduleActivityTouch(sessionId: string) {
  const touch = async () => {
    await db()
      .from("sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", sessionId);
  };

  try {
    after(touch);
  } catch {
    void touch();
  }
}
