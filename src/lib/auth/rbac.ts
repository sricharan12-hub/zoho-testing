import { db } from "@/lib/supabase";
import "server-only";

type NestedRoleRow = {
  roles: {
    name: string;
    role_permissions: { permissions: { key: string } | null }[] | null;
  } | null;
};

/**
 * Resolves a user's effective roles and the union of their permissions.
 * A user with several roles gets every permission any of those roles grants.
 *
 * This is one nested read rather than two sequential ones. The previous shape
 * fetched user_roles, waited for the role ids, then fetched role_permissions —
 * two round trips to Supabase on the critical path of every authenticated
 * request. PostgREST can walk both foreign keys in a single query.
 */
export async function permissionsForUser(
  userId: string
): Promise<{ roles: string[]; permissions: string[] }> {
  const { data } = await db()
    .from("user_roles")
    .select("roles ( name, role_permissions ( permissions ( key ) ) )")
    .eq("user_id", userId);

  const rows = (data ?? []) as unknown as NestedRoleRow[];

  const roles = rows
    .map((r) => r.roles?.name)
    .filter((n): n is string => Boolean(n))
    .sort();

  const permissions = [
    ...new Set(
      rows
        .flatMap((r) => r.roles?.role_permissions ?? [])
        .map((rp) => rp.permissions?.key)
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
