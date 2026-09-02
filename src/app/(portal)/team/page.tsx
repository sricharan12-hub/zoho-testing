import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { listTeamMembers, teamActivity } from "@/lib/admin/queries";
import { ALL_APPS } from "@/lib/zoho/apps";
import { Forbidden } from "@/components/forbidden";

export const metadata = { title: "My team · Employee Portal" };

/**
 * The Manager view. Scoped to the manager's own department — a manager sees
 * their team, never the whole organisation, which is what "access to assigned
 * departments/functions" means in the brief.
 */
export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "team.reports.read")) {
    return <Forbidden permission="team.reports.read" />;
  }

  if (!user.department) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-xl font-semibold tracking-tight">My team</h1>
        <div className="mt-6 rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium">No department assigned</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
            Team reports are scoped to your department. Ask an administrator to
            set yours on your user record.
          </p>
        </div>
      </div>
    );
  }

  const members = await listTeamMembers(user.department);
  const activity = await teamActivity(members.map((m) => m.id));

  const active = members.filter((m) => m.isActive).length;
  const withService = members.filter((m) =>
    m.roles.some((r) => ["HR", "Sales", "Support", "Finance"].includes(r.name))
  ).length;

  // Which Zoho services the department collectively reaches, from its roles.
  const roleNames = new Set(members.flatMap((m) => m.roles.map((r) => r.name)));
  const services = ALL_APPS.filter((app) => roleNames.has(app.role));

  const stats = [
    { label: "Team members", value: String(members.length) },
    { label: "Active", value: String(active) },
    { label: "With a Zoho service", value: String(withService) },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-xl font-semibold tracking-tight">My team</h1>
      <p className="mt-1 text-sm text-muted">
        {user.department} department. Read-only: managers do not create users or
        change permissions.
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <li key={stat.label} className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted">{stat.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</p>
          </li>
        ))}
      </ul>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium">Members</h2>
        <div className="rounded-xl border border-border bg-surface">
          <div className="table-scroll">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Name", "Roles", "Status", "Last login"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{member.fullName}</p>
                      <p className="text-xs text-muted">{member.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {member.roles.map((r) => r.name).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          member.isActive
                            ? "bg-success/10 text-success"
                            : "bg-danger/10 text-danger"
                        }`}
                      >
                        {member.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {member.lastLoginAt
                        ? new Date(member.lastLoginAt).toLocaleString()
                        : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {members.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No one else is assigned to {user.department} yet.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium">Services the team can reach</h2>
        {services.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {services.map((app) => (
              <li
                key={app.key}
                className="rounded-full border border-border px-3 py-1 text-sm"
              >
                <span
                  aria-hidden
                  className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: app.accent }}
                />
                {app.name}
                <span className="ml-2 text-xs text-muted">via {app.role}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            No team member holds a role that grants a Zoho service.
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium">Recent team activity</h2>
        <div className="rounded-xl border border-border bg-surface">
          <div className="table-scroll">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["When", "Member", "Action", "Resource"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activity.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{entry.actorEmail ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{entry.action}</td>
                    <td className="px-4 py-2.5 text-xs">{entry.resource ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activity.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No recorded activity for this team yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
