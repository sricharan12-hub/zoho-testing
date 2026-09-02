import { db } from "@/lib/supabase";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import { setSessionCookie } from "@/lib/auth/session";
import { permissionsForUser } from "@/lib/auth/rbac";
import { audit } from "@/lib/audit";
import { fail, guard, json } from "@/lib/api";

/** Self-registration lands here. Anything beyond it is an admin's grant. */
const DEFAULT_ROLE = "Employee";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  return guard(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      fullName?: string;
      password?: string;
      department?: string;
    };

    const email = body.email?.trim().toLowerCase() ?? "";
    const fullName = body.fullName?.trim() ?? "";
    const password = body.password ?? "";

    if (!email || !fullName || !password) {
      return fail("Email, full name and password are required.", 400);
    }
    if (!EMAIL_RE.test(email)) return fail("Enter a valid email address.", 400);

    const problem = passwordProblem(password);
    if (problem) return fail(problem, 400);

    const supabase = db();
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existing) return fail("An account with that email already exists.", 409);

    const { data: created, error } = await supabase
      .from("users")
      .insert({
        email,
        full_name: fullName,
        password_hash: await hashPassword(password),
        department: body.department?.trim() || null,
      })
      .select("id, email, full_name")
      .single();

    if (error || !created) {
      return fail(error?.message ?? "Could not create the account.", 500);
    }

    // Baseline role only — a new account can sign in and see the portal shell,
    // but reaches no Zoho application until an admin assigns one.
    const { data: role } = await supabase
      .from("roles")
      .select("id")
      .eq("name", DEFAULT_ROLE)
      .maybeSingle();

    if (role) {
      await supabase
        .from("user_roles")
        .insert({ user_id: created.id, role_id: role.id as string });
    }

    await audit({
      userId: created.id,
      actorEmail: created.email,
      action: "auth.signup",
      resource: created.id,
      detail: { role: role ? DEFAULT_ROLE : null },
      request,
    });

    // Sign the new account straight in, exactly the way /api/auth/login does.
    const { token, jti, expiresAt } = signToken({ id: created.id, email: created.email });

    await supabase.from("sessions").insert({
      jti,
      user_id: created.id,
      expires_at: expiresAt.toISOString(),
      ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip"),
      user_agent: request.headers.get("user-agent"),
    });

    await supabase
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", created.id);

    await setSessionCookie(token, expiresAt);

    await audit({
      userId: created.id,
      actorEmail: created.email,
      action: "auth.login",
      status: "success",
      detail: { via: "signup" },
      request,
    });

    const { roles, permissions } = await permissionsForUser(created.id);
    return json(
      {
        user: {
          id: created.id,
          email: created.email,
          fullName: created.full_name,
          roles,
          permissions,
        },
      },
      201
    );
  });
}
