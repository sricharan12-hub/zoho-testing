import { cookies } from "next/headers";
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
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = verifyToken(token);
  if (!claims) return null;

  const supabase = db();
  const { data: session } = await supabase
    .from("sessions")
    .select("id, jti, user_id, expires_at, revoked_at, last_seen_at")
    .eq("jti", claims.jti)
    .maybeSingle();

  if (!session || session.revoked_at) return null;
  if (new Date(session.expires_at as string) < new Date()) return null;

  const idleMs = Date.now() - new Date(session.last_seen_at as string).getTime();
  if (idleMs > IDLE_TIMEOUT_MINUTES * 60_000) {
    await supabase
      .from("sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", session.id as string);
    return null;
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, email, full_name, department, is_active")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!user || !user.is_active) return null;

  // Touch activity so the idle window slides forward.
  await supabase
    .from("sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.id as string);

  const { roles, permissions } = await permissionsForUser(claims.sub);

  return {
    id: user.id as string,
    email: user.email as string,
    fullName: user.full_name as string,
    department: (user.department as string | null) ?? null,
    roles,
    permissions,
    jti: claims.jti,
  };
}
