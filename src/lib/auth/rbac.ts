import { db } from "@/lib/supabase";
import "server-only";

type RoleRow = { roles: { name: string } | null };
type PermRow = { permissions: { key: string } | null };

/**
 * Resolves a user's effective roles and the union of their permissions.
 * A user with several roles gets every permission any of those roles grants.
 */
export async function permissionsForUser(
  userId: string
): Promise<{ roles: string[]; permissions: string[] }> {
  const supabase = db();

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role_id, roles ( name )")
    .eq("user_id", userId);

  const roleIds = (roleRows ?? []).map((r) => (r as { role_id: string }).role_id);
  const roles = (roleRows ?? [])
    .map((r) => (r as unknown as RoleRow).roles?.name)
    .filter((n): n is string => Boolean(n))
    .sort();

  if (roleIds.length === 0) return { roles, permissions: [] };

  const { data: permRows } = await supabase
    .from("role_permissions")
    .select("permissions ( key )")
    .in("role_id", roleIds);

  const permissions = [
    ...new Set(
      (permRows ?? [])
        .map((r) => (r as unknown as PermRow).permissions?.key)
        .filter((k): k is string => Boolean(k))
    ),
  ].sort();

  return { roles, permissions };
}

export function hasPermission(
  user: { permissions: string[] } | null,
  key: string
): boolean {
  return Boolean(user?.permissions.includes(key));
}

export function hasAnyPermission(
  user: { permissions: string[] } | null,
  keys: string[]
): boolean {
  return keys.some((k) => hasPermission(user, k));
}
