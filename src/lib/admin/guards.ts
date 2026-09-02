import { db } from "@/lib/supabase";
import "server-only";

const ADMIN_ROLE = "Admin";

/**
 * Guards that stop an admin from locking everyone out of the portal, or from
 * silently stripping access by deleting a role people still hold.
 */

async function adminRoleId(): Promise<string | null> {
  const { data } = await db()
    .from("roles")
    .select("id")
    .eq("name", ADMIN_ROLE)
    .maybeSingle();
  return data?.id ?? null;
}

/** Ids of every active user currently holding the Admin role. */
async function activeAdminIds(): Promise<string[]> {
  const roleId = await adminRoleId();
  if (!roleId) return [];

  const { data: holders } = await db()
    .from("user_roles")
    .select("user_id")
    .eq("role_id", roleId);

  const ids = (holders ?? []).map((h) => h.user_id);
  if (ids.length === 0) return [];

  const { data: active } = await db()
    .from("users")
    .select("id")
    .in("id", ids)
    .eq("is_active", true);

  return (active ?? []).map((u) => u.id);
}

/**
 * True when the requested change would leave the portal with no active admin.
 * `nextRoleIds` is the full replacement set, matching how PATCH submits roles.
 */
export async function wouldRemoveLastAdmin(
  userId: string,
  change: { deactivating?: boolean; deleting?: boolean; nextRoleIds?: string[] }
): Promise<boolean> {
  const admins = await activeAdminIds();
  if (!admins.includes(userId)) return false; // not an admin: nothing to protect
  if (admins.length > 1) return false; // someone else can still administer

  if (change.deleting || change.deactivating) return true;

  if (change.nextRoleIds) {
    const roleId = await adminRoleId();
    return roleId ? !change.nextRoleIds.includes(roleId) : false;
  }

  return false;
}

/** How many users still hold a role, used to block deleting one in use. */
export async function countRoleHolders(roleId: string): Promise<number> {
  const { count } = await db()
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role_id", roleId);
  return count ?? 0;
}
