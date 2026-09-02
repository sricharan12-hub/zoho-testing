import { db } from "@/lib/supabase";
import type { UserRow } from "@/lib/database.types";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { missingIds, wouldRemoveLastAdmin } from "@/lib/admin/guards";
import { fail, guard, json, requirePermission } from "@/lib/api";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const admin = await requirePermission("admin.users.write", request);
    const { id } = await ctx.params;

    const body = (await request.json().catch(() => ({}))) as {
      fullName?: string;
      department?: string | null;
      isActive?: boolean;
      password?: string;
      roleIds?: string[];
    };

    // The portal must never be left without a way in.
    if (
      await wouldRemoveLastAdmin(id, {
        deactivating: body.isActive === false,
        nextRoleIds: body.roleIds,
      })
    ) {
      return fail(
        "This is the last active administrator. Grant the Admin role to " +
          "someone else before changing this account.",
        409
      );
    }

    // Verify every role exists before touching anything: assignment replaces
    // the old set, so an unknown id would otherwise leave the user with none.
    if (body.roleIds?.length) {
      const unknown = await missingIds("roles", body.roleIds);
      if (unknown.length) {
        return fail(`Unknown role: ${unknown.join(", ")}.`, 400);
      }
    }

    const supabase = db();
    const patch: Partial<UserRow> = {};
    if (body.fullName !== undefined) patch.full_name = body.fullName.trim();
    if (body.department !== undefined) patch.department = body.department || null;
    if (body.isActive !== undefined) patch.is_active = body.isActive;

    if (body.password) {
      const problem = passwordProblem(body.password);
      if (problem) return fail(problem, 400);
      patch.password_hash = await hashPassword(body.password);
    }

    if (Object.keys(patch).length) {
      const { error } = await supabase.from("users").update(patch).eq("id", id);
      if (error) return fail(error.message, 500);
    }

    // Role assignment is a full replace, which is simpler to reason about
    // than diffing and matches how the admin UI submits the form.
    if (body.roleIds) {
      await supabase.from("user_roles").delete().eq("user_id", id);
      if (body.roleIds.length) {
        const { error } = await supabase
          .from("user_roles")
          .insert(
            [...new Set(body.roleIds)].map((role_id) => ({
              user_id: id,
              role_id,
              assigned_by: admin.id,
            }))
          );
        // Reporting success here would tell an admin the user kept access they
        // no longer have.
        if (error) return fail(`Could not assign roles: ${error.message}`, 500);
      }
    }

    // Deactivating or re-scoping a user must not leave a live session behind.
    if (body.isActive === false || body.roleIds || body.password) {
      await supabase
        .from("sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", id)
        .is("revoked_at", null);
    }

    await audit({
      userId: admin.id,
      actorEmail: admin.email,
      action: "user.update",
      resource: id,
      detail: { fields: Object.keys(patch), roleIds: body.roleIds },
      request,
    });

    return json({ ok: true });
  });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return guard(async () => {
    const admin = await requirePermission("admin.users.write", request);
    const { id } = await ctx.params;

    if (id === admin.id) return fail("You cannot delete your own account.", 400);

    if (await wouldRemoveLastAdmin(id, { deleting: true })) {
      return fail(
        "This is the last active administrator and cannot be deleted.",
        409
      );
    }

    const { error } = await db().from("users").delete().eq("id", id);
    if (error) return fail(error.message, 500);

    await audit({
      userId: admin.id,
      actorEmail: admin.email,
      action: "user.delete",
      resource: id,
      request,
    });

    return json({ ok: true });
  });
}
