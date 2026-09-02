import { db } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { listRoles } from "@/lib/admin/queries";
import { missingIds } from "@/lib/admin/guards";
import { fail, guard, json, requirePermission } from "@/lib/api";

export async function GET(request: Request) {
  return guard(async () => {
    await requirePermission("admin.roles.read", request);
    return json({ roles: await listRoles() });
  });
}

export async function POST(request: Request) {
  return guard(async () => {
    const admin = await requirePermission("admin.roles.write", request);

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
      permissionIds?: string[];
    };

    if (!body.name?.trim()) return fail("Role name is required.", 400);

    if (body.permissionIds?.length) {
      const unknown = await missingIds("permissions", body.permissionIds);
      if (unknown.length) {
        return fail(`Unknown permission: ${unknown.join(", ")}.`, 400);
      }
    }

    const supabase = db();
    const { data: existing } = await supabase
      .from("roles")
      .select("id")
      .ilike("name", body.name.trim())
      .maybeSingle();
    if (existing) return fail("A role with that name already exists.", 409);

    const { data: created, error } = await supabase
      .from("roles")
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        is_system: false,
      })
      .select("id, name")
      .single();

    if (error || !created) return fail(error?.message ?? "Could not create role.", 500);

    if (body.permissionIds?.length) {
      const { error: permErr } = await supabase
        .from("role_permissions")
        .insert(
          [...new Set(body.permissionIds)].map((permission_id) => ({
            role_id: created.id,
            permission_id,
          }))
        );
      if (permErr) {
        return fail(
          `Role created, but permissions could not be assigned: ${permErr.message}`,
          500
        );
      }
    }

    await audit({
      userId: admin.id,
      actorEmail: admin.email,
      action: "role.create",
      resource: created.id,
      detail: { name: created.name, permissionIds: body.permissionIds ?? [] },
      request,
    });

    return json({ role: { id: created.id, name: created.name } }, 201);
  });
}
