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

/**
 * Ids in `ids` that do not exist in `table`. An empty result means every id is
 * real and safe to insert.
 *
 * Role and permission assignment is a delete-then-insert: the old set is
 * removed before the new one is written. If the insert then fails a foreign
 * key, the user or role is left with nothing at all. Checking first turns that
 * silent access loss into a 400 with the old set still intact.
 */
export async function missingIds(
  table: "roles" | "permissions",
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];

  const { data, error } = await db().from(table).select("id").in("id", unique);
  // A malformed id makes Postgres reject the whole comparison; treat every id
  // as unverified rather than assuming they are fine.
  if (error) return unique;

  const found = new Set((data ?? []).map((r) => r.id as string));
  return unique.filter((id) => !found.has(id));
}

/**
 * Permissions the Admin role can never be left without. Removing these is not
 * a mistake an admin can undo: with no way to read or edit roles, nobody can
 * ever grant a permission again, and the portal has no administration at all.
 * Everything else on the Admin role stays tunable.
 */
const UNREMOVABLE_ADMIN_PERMISSIONS = ["admin.roles.read", "admin.roles.write"];

/**
 * True when the requested permission set would strip the Admin role of the
 * permissions needed to administer roles — an irreversible lockout.
 */
export async function wouldDisarmAdminRole(
  roleId: string,
  nextPermissionIds: string[]
): Promise<boolean> {
  const supabase = db();

  const { data: role } = await supabase
    .from("roles")
    .select("name")
    .eq("id", roleId)
    .maybeSingle();
  if (role?.name !== ADMIN_ROLE) return false;

  if (nextPermissionIds.length === 0) return true;

  const { data: perms } = await supabase
    .from("permissions")
    .select("key")
    .in("id", [...new Set(nextPermissionIds)]);

  const keys = new Set((perms ?? []).map((p) => p.key as string));
  return !UNREMOVABLE_ADMIN_PERMISSIONS.every((k) => keys.has(k));
}

/** How many users still hold a role, used to block deleting one in use. */
export async function countRoleHolders(roleId: string): Promise<number> {
  const { count } = await db()
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role_id", roleId);
  return count ?? 0;
}
