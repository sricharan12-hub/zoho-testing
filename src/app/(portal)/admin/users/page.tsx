import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { UsersManager } from "@/components/admin/users-manager";
import { UserSearch } from "@/components/admin/user-search";
import { listRoles, listUsers } from "@/lib/admin/queries";
import { Forbidden } from "@/components/forbidden";

export const metadata = { title: "Users · Employee Portal" };

export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "admin.users.read")) {
    return <Forbidden permission="admin.users.read" />;
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const search = one(sp.q) ?? null;
  const page = Number(one(sp.page) ?? 0) || 0;

  const canWrite = hasPermission(user, "admin.users.write");
  const [result, roles] = await Promise.all([
    listUsers({ search, page }),
    // Managers may read users without seeing the role catalogue.
    hasPermission(user, "admin.roles.read") ? listRoles() : Promise.resolve([]),
  ]);

  const lastPage = Math.max(0, Math.ceil(result.total / result.pageSize) - 1);
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (target > 0) params.set("page", String(target));
    const query = params.toString();
    return query ? `/admin/users?${query}` : "/admin/users";
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-xl font-semibold tracking-tight">Users</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Create employees, assign roles, and disable access. Changing a
        user&rsquo;s roles ends their active sessions immediately.
      </p>

      <div className="mb-4">
        <UserSearch total={result.total} />
      </div>

      <UsersManager users={result.users} roles={roles} canWrite={canWrite} />

      {lastPage > 0 && (
        <div className="mt-4 flex items-center justify-between">
          {page > 0 ? (
            <Link
              href={pageHref(page - 1)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
            >
              Previous
            </Link>
          ) : (
            <span className="rounded-lg border border-border px-3 py-1.5 text-sm opacity-50">
              Previous
            </span>
          )}

          <span className="text-sm text-muted">
            Page {page + 1} of {lastPage + 1}
          </span>

          {page < lastPage ? (
            <Link
              href={pageHref(page + 1)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
            >
              Next
            </Link>
          ) : (
            <span className="rounded-lg border border-border px-3 py-1.5 text-sm opacity-50">
              Next
            </span>
          )}
        </div>
      )}
    </div>
  );
}
