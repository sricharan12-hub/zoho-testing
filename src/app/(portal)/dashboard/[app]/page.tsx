import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isZohoAppKey, ZOHO_APPS } from "@/lib/zoho/apps";
import { loadAppForUser } from "@/lib/zoho/access";

export default async function ZohoAppPage({ params }: PageProps<"/dashboard/[app]">) {
  const { app: key } = await params;
  if (!isZohoAppKey(key)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const app = ZOHO_APPS[key];
  const result = await loadAppForUser(user, key);

  // Not "notFound" — the app exists, this user simply may not see it.
  if (result === "denied") {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-xl font-semibold tracking-tight">{app.name}</h1>
        <div className="mt-5 rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium">Access denied</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
            Your role does not include the{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
              {app.permission}
            </code>{" "}
            permission. This attempt has been recorded in the audit log.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{app.name}</h1>
          <p className="mt-1 text-sm text-muted">{app.purpose}</p>
        </div>

        <a
          href={result.deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-surface-muted"
        >
          Open in {app.name} ↗
        </a>
      </div>

      {result.ok ? (
        <>
          {result.data.stats.length > 0 && (
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {result.data.stats.map((stat) => (
                <li
                  key={stat.label}
                  className="rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 rounded-xl border border-border bg-surface">
            <div className="table-scroll">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {result.data.columns.map((col) => (
                      <th
                        key={col.key}
                        scope="col"
                        className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {result.data.columns.map((col) => (
                        <td key={col.key} className="px-4 py-2.5">
                          {row[col.key] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.data.rows.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted">
                {app.name} returned no records yet.
              </p>
            )}
          </div>

          <p className="mt-3 text-xs text-muted">
            Fetched live through the portal&rsquo;s Zoho service account. No Zoho
            credentials are exposed to your browser.
          </p>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-warning/30 bg-warning/10 p-5">
          <p className="text-sm font-medium text-warning">
            {app.name} could not be reached
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">{result.error}</p>
          {result.remedy ? (
            <p className="mt-2 text-sm leading-relaxed text-muted">{result.remedy}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
