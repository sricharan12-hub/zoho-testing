import { db } from "@/lib/supabase";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { listUsers } from "@/lib/admin/queries";
import { fail, guard, json, requirePermission } from "@/lib/api";

export async function GET(request: Request) {
  return guard(async () => {
    await requirePermission("admin.users.read", request);

    const url = new URL(request.url);
    return json(
      await listUsers({
        search: url.searchParams.get("q"),
        page: Number(url.searchParams.get("page") ?? 0) || 0,
      })
    );
  });
}

export async function POST(request: Request) {
  return guard(async () => {
    const admin = await requirePermission("admin.users.write", request);

    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      fullName?: string;
      password?: string;
      department?: string;
      roleIds?: string[];
    };

    if (!body.email || !body.fullName || !body.password) {
      return fail("Email, full name and password are required.", 400);
    }

    const problem = passwordProblem(body.password);
    if (problem) return fail(problem, 400);

    const supabase = db();
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .ilike("email", body.email.trim())
      .maybeSingle();
    if (existing) return fail("A user with that email already exists.", 409);

    const { data: created, error } = await supabase
      .from("users")
      .insert({
        email: body.email.trim().toLowerCase(),
        full_name: body.fullName.trim(),
        password_hash: await hashPassword(body.password),
        department: body.department?.trim() || null,
      })
      .select("id, email, full_name")
      .single();

    if (error || !created) return fail(error?.message ?? "Could not create user.", 500);

    if (body.roleIds?.length) {
      await supabase
        .from("user_roles")
        .insert(
          body.roleIds.map((role_id) => ({
            user_id: created.id,
            role_id,
            assigned_by: admin.id,
          }))
        );
    }

    await audit({
      userId: admin.id,
      actorEmail: admin.email,
      action: "user.create",
      resource: created.id,
      detail: { email: created.email, roleIds: body.roleIds ?? [] },
      request,
    });

    return json({ user: { id: created.id, email: created.email } }, 201);
  });
}
