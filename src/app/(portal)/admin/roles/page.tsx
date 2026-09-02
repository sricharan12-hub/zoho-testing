import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { RolesManager } from "@/components/admin/roles-manager";
import { listPermissions, listRoles } from "@/lib/admin/queries";
import { Forbidden } from "@/components/forbidden";

export const metadata = { title: "Roles & permissions · Employee Portal" };

export default async function AdminRolesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "admin.roles.read")) {
    return <Forbidden permission="admin.roles.read" />;
  }

  const [roles, permissions] = await Promise.all([listRoles(), listPermissions()]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-xl font-semibold tracking-tight">Roles &amp; permissions</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        A role is a bundle of permissions. The four Zoho permissions decide which
        service tiles appear on a user&rsquo;s dashboard.
      </p>

      <RolesManager
        roles={roles}
        permissions={permissions}
        canWrite={hasPermission(user, "admin.roles.write")}
      />
    </div>
  );
}
