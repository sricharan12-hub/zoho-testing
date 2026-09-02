import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { listAudit } from "@/lib/admin/queries";
import { AuditFilters } from "@/components/admin/audit-filters";
import { Forbidden } from "@/components/forbidden";

export const metadata = { title: "Audit log · Employee Portal" };

const STATUS_STYLE: Record<string, string> = {
  success: "bg-success/10 text-success",
  failure: "bg-danger/10 text-danger",
  denied: "bg-warning/10 text-warning",
};

export default async function AdminAuditPage({
  searchParams,
}: PageProps<"/admin/audit">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "admin.audit.read")) {
    return <Forbidden permission="admin.audit.read" />;
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const action = one(sp.action) ?? null;
  const status = one(sp.status) ?? null;
  const actor = one(sp.actor) ?? null;
  const from = one(sp.from) ?? null;
  const to = one(sp.to) ?? null;
  const page = Number(one(sp.page) ?? 0) || 0;

  const { entries, total, pageSize } = await listAudit({
    page,
    action,
    status,
    actor,
    from,
    to,
  });
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (status) params.set("status", status);
    if (actor) params.set("actor", actor);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (target > 0) params.set("page", String(target));
    const query = params.toString();
    return query ? `/admin/audit?${query}` : "/admin/audit";
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Every sign-in, Zoho access and administrative change, including denied
        attempts.
      </p>

      <div className="space-y-4">
        <AuditFilters total={total} />

        <div className="rounded-xl border border-border bg-surface">
          <div className="table-scroll">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["When", "Actor", "Action", "Resource", "Outcome", "IP"].map((h) => (
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
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">{entry.actorEmail ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{entry.action}</td>
                    <td className="px-4 py-2.5 text-xs">{entry.resource ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLE[entry.status] ?? "bg-surface-muted text-muted"
                        }`}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">{entry.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {entries.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No matching activity.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
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
      </div>
    </div>
  );
}
