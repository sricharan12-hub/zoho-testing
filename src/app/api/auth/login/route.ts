import { after } from "next/server";
import { db } from "@/lib/supabase";
import { verifyPassword } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import { setSessionCookie } from "@/lib/auth/session";
import { permissionsForUser } from "@/lib/auth/rbac";
import { audit, auditAfter } from "@/lib/audit";
import { loginLockout, MAX_ATTEMPTS } from "@/lib/auth/throttle";
import { fail, guard, json } from "@/lib/api";

export async function POST(request: Request) {
  return guard(async () => {
    const { email, password } = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };

    if (!email || !password) return fail("Email and password are required.", 400);

    const supabase = db();

    // The throttle count and the user row are both keyed off the email alone,
    // so they are read together rather than one after the other. bcrypt still
    // runs only after the lockout verdict is known, which is the point of
    // checking the throttle first: a locked account never costs a comparison.
    const [lockout, { data: user }] = await Promise.all([
      loginLockout(email),
      supabase
        .from("users")
        .select("id, email, full_name, password_hash, is_active")
        .ilike("email", email.trim())
        .maybeSingle(),
    ]);

    if (lockout.locked) {
      await audit({
        actorEmail: email,
        action: "auth.login",
        status: "denied",
        detail: { reason: "rate_limited", attempts: lockout.attempts },
        request,
      });
      return fail(
        `Too many failed attempts. Try again in ${lockout.retryAfterMinutes} minutes.`,
        429
      );
    }

    // The same message for "no such user" and "wrong password" — telling them
    // apart would let anyone enumerate valid portal accounts.
    const remaining = MAX_ATTEMPTS - lockout.attempts - 1;
    const invalid = () =>
      fail(
        remaining > 0
          ? `Invalid email or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Invalid email or password.",
        401
      );

    if (!user) {
      await audit({
        actorEmail: email,
        action: "auth.login",
        status: "failure",
        detail: { reason: "unknown_email" },
        request,
      });
      return invalid();
    }

    if (!user.is_active) {
      await audit({
        userId: user.id,
        actorEmail: user.email,
        action: "auth.login",
        status: "failure",
        detail: { reason: "account_disabled" },
        request,
      });
      return fail("This account has been deactivated. Contact your administrator.", 403);
    }

    if (!(await verifyPassword(password, user.password_hash))) {
      await audit({
        userId: user.id,
        actorEmail: user.email,
        action: "auth.login",
        status: "failure",
        detail: { reason: "bad_password" },
        request,
      });
      return invalid();
    }

    const { token, jti, expiresAt } = signToken({ id: user.id, email: user.email });

    // The session row has to exist before the cookie is handed out — the very
    // next request looks it up — but the caller's roles do not depend on it,
    // so the two reads share one round trip instead of taking two.
    const [, { roles, permissions }] = await Promise.all([
      supabase.from("sessions").insert({
        jti,
        user_id: user.id,
        expires_at: expiresAt.toISOString(),
        ip:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip"),
        user_agent: request.headers.get("user-agent"),
      }),
      permissionsForUser(user.id),
    ]);

    await setSessionCookie(token, expiresAt);

    // Nobody is waiting on either of these, so they run once the response has
    // gone out rather than adding two round trips to every sign-in.
    after(async () => {
      await supabase
        .from("users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", user.id);
    });

    auditAfter({
      userId: user.id,
      actorEmail: user.email,
      action: "auth.login",
      status: "success",
      request,
    });

    return json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        roles,
        permissions,
      },
    });
  });
}
