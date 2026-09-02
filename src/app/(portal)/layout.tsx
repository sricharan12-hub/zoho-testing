import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { ALL_APPS } from "@/lib/zoho/apps";
import { SignOutButton } from "@/components/sign-out-button";
import { NavLink } from "@/components/nav-link";
import { IDLE_TIMEOUT_MINUTES } from "@/lib/auth/cookie";

export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  // The Proxy only checks for a cookie; this is the real gate.
  if (!user) redirect("/login");

  const apps = ALL_APPS.filter((app) => hasPermission(user, app.permission));

  const teamLinks = [
    { href: "/team", label: "My team", permission: "team.reports.read" },
  ].filter((l) => hasPermission(user, l.permission));

  const adminLinks = [
    { href: "/admin/users", label: "Users", permission: "admin.users.read" },
    { href: "/admin/roles", label: "Roles & permissions", permission: "admin.roles.read" },
    { href: "/admin/audit", label: "Audit log", permission: "admin.audit.read" },
  ].filter((l) => hasPermission(user, l.permission));

  const initials = user.fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <aside className="border-b border-border bg-surface lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-contrast">
            EP
          </div>
          <span className="text-sm font-semibold tracking-tight">Employee Portal</span>
        </div>

        <nav className="px-3 pb-4">
          <NavLink href="/dashboard">Dashboard</NavLink>

          {apps.length > 0 && (
            <p className="mt-5 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Zoho services
            </p>
          )}
          {apps.map((app) => (
            <NavLink key={app.key} href={`/dashboard/${app.key}`}>
              <span
                aria-hidden
                className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                style={{ backgroundColor: app.accent }}
              />
              {app.name}
            </NavLink>
          ))}

          {teamLinks.length > 0 && (
            <p className="mt-5 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Team
            </p>
          )}
          {teamLinks.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.label}
            </NavLink>
          ))}

          {adminLinks.length > 0 && (
            <p className="mt-5 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Administration
            </p>
          )}
          {adminLinks.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="truncate text-xs text-muted">
              {user.roles.length ? user.roles.join(", ") : "No role assigned"}
              {user.department ? ` · ${user.department}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold sm:flex"
              title={user.email}
            >
              {initials}
            </span>
            <SignOutButton idleMinutes={IDLE_TIMEOUT_MINUTES} />
          </div>
        </header>

        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>

        <footer className="border-t border-border px-5 py-3 text-xs text-muted lg:px-8">
          Zoho access is brokered by the portal&rsquo;s service account. Sessions
          end after {IDLE_TIMEOUT_MINUTES} minutes of inactivity.
        </footer>
      </div>
    </div>
  );
}
