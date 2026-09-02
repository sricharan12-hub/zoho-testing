import { db } from "@/lib/supabase";
import type { RoleRow } from "@/lib/database.types";
import { audit } from "@/lib/audit";
import { countRoleHolders } from "@/lib/admin/guards";
import { fail, guard, json, requirePermission } from "@/lib/api";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const admin = await requirePermission("admin.roles.write", request);
    const { id } = await ctx.params;

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      description?: string | null;
      permissionIds?: string[];
    };

    const supabase = db();
    const { data: role } = await supabase
      .from("roles")
      .select("id, name, is_system")
      .eq("id", id)
      .maybeSingle();

    if (!role) return fail("Role not found.", 404);

    // System roles keep their identity, but their permissions stay editable
    // so an admin can still tune what each seeded role unlocks.
    if (role.is_system && body.name && body.name !== role.name) {
      return fail("System roles cannot be renamed.", 400);
    }

    const patch: Partial<RoleRow> = {};
    if (body.name !== undefined && !role.is_system) patch.name = body.name.trim();
    if (body.description !== undefined) patch.description = body.description || null;

    if (Object.keys(patch).length) {
      const { error } = await supabase.from("roles").update(patch).eq("id", id);
      if (error) return fail(error.message, 500);
    }

    if (body.permissionIds) {
      await supabase.from("role_permissions").delete().eq("role_id", id);
      if (body.permissionIds.length) {
        await supabase
          .from("role_permissions")
          .insert(body.permissionIds.map((permission_id) => ({ role_id: id, permission_id })));
      }

      // Anyone holding this role has a stale permission set until they
      // re-authenticate, so end their sessions now.
      const { data: holders } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role_id", id);

      const userIds = (holders ?? []).map((h) => h.user_id);
      if (userIds.length) {
        await supabase
          .from("sessions")
          .update({ revoked_at: new Date().toISOString() })
          .in("user_id", userIds)
          .is("revoked_at", null);
      }
    }

    await audit({
      userId: admin.id,
      actorEmail: admin.email,
      action: "role.update",
      resource: id,
      detail: { fields: Object.keys(patch), permissionIds: body.permissionIds },
      request,
    });

    return json({ ok: true });
  });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const admin = await requirePermission("admin.roles.write", request);
    const { id } = await ctx.params;

    const supabase = db();
    const { data: role } = await supabase
      .from("roles")
      .select("id, name, is_system")
      .eq("id", id)
      .maybeSingle();

    if (!role) return fail("Role not found.", 404);
    if (role.is_system) return fail("System roles cannot be deleted.", 400);

    // Deleting a role in use would silently strip access from its holders.
    const holders = await countRoleHolders(id);
    if (holders > 0) {
      return fail(
        `${holders} user${holders === 1 ? " still holds" : "s still hold"} this role. ` +
          "Reassign them before deleting it.",
        409
      );
    }

    const { error } = await supabase.from("roles").delete().eq("id", id);
    if (error) return fail(error.message, 500);

    await audit({
      userId: admin.id,
      actorEmail: admin.email,
      action: "role.delete",
      resource: id,
      detail: { name: role.name },
      request,
    });

    return json({ ok: true });
  });
}
