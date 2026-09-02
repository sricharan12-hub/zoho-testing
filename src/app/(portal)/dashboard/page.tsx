import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { ALL_APPS } from "@/lib/zoho/apps";

export const metadata = { title: "Dashboard · Employee Portal" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const authorised = ALL_APPS.filter((app) => hasPermission(user, app.permission));
  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-xl font-semibold tracking-tight">
        Welcome back, {firstName}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {authorised.length > 0
          ? "These are the Zoho services your role authorises."
          : "Your account is active but no Zoho service is assigned to your role yet."}
      </p>

      {authorised.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {authorised.map((app) => (
            <li key={app.key}>
              <Link
                href={`/dashboard/${app.key}`}
                className="group block h-full rounded-xl border border-border bg-surface p-5 transition hover:border-accent/50 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    aria-hidden
                    className="h-9 w-9 shrink-0 rounded-lg"
                    style={{ backgroundColor: `${app.accent}1a`, border: `1px solid ${app.accent}55` }}
                  />
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted">
                    {app.role}
                  </span>
                </div>

                <h2 className="mt-3.5 font-medium group-hover:text-accent">
                  {app.name}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{app.purpose}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium">No services assigned</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
            Ask an administrator to assign you a role such as HR, Sales, Support
            or Finance. Services appear here the moment a role grants them.
          </p>
        </div>
      )}

      <section className="mt-8 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-medium">Your access</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b border-border pb-2">
            <dt className="text-muted">Signed in as</dt>
            <dd className="truncate font-medium">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border pb-2">
            <dt className="text-muted">Department</dt>
            <dd className="font-medium">{user.department ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border pb-2">
            <dt className="text-muted">Roles</dt>
            <dd className="font-medium">{user.roles.join(", ") || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border pb-2">
            <dt className="text-muted">Permissions</dt>
            <dd className="font-medium">{user.permissions.length}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
