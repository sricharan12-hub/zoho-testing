"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminPermission, AdminRole } from "@/lib/admin/queries";

/**
 * Data arrives pre-rendered from the server page; this component only
 * mutates, then calls router.refresh() so the server re-renders the list.
 */
export function RolesManager({
  roles,
  permissions,
  canWrite,
}: {
  roles: AdminRole[];
  permissions: AdminPermission[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [newRole, setNewRole] = useState({ name: "", description: "" });

  async function send(url: string, method: string, body?: unknown) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const parsed = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(parsed.error ?? `Request failed (${res.status}).`);
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {notice}
        </p>
      ) : null}

      {canWrite && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send("/api/admin/roles", "POST", newRole)) {
              setNewRole({ name: "", description: "" });
              setNotice("Role created. Assign its permissions below.");
            }
          }}
          className="rounded-xl border border-border bg-surface p-5"
        >
          <h2 className="text-sm font-medium">Create a role</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Role name"
              value={newRole.name}
              onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              placeholder="Description (optional)"
              value={newRole.description}
              onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Working…" : "Create role"}
          </button>
        </form>
      )}

      <ul className="space-y-4">
        {roles.map((role) => {
          const isEditing = editing === role.id;
          const held = new Set(role.permissions.map((p) => p.key));

          return (
            <li key={role.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-medium">
                    {role.name}
                    {role.isSystem && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-normal text-muted">
                        system
                      </span>
                    )}
                  </h3>
                  {role.description ? (
                    <p className="mt-1 text-sm text-muted">{role.description}</p>
                  ) : null}
                </div>

                {canWrite && (
                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            const ids = permissions
                              .filter((p) => selected.includes(p.key))
                              .map((p) => p.id);
                            const ok = await send(`/api/admin/roles/${role.id}`, "PATCH", {
                              permissionIds: ids,
                            });
                            if (ok) {
                              setEditing(null);
                              setNotice(
                                "Permissions updated. Sessions holding this role were ended."
                              );
                            }
                          }}
                          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(role.id);
                            setSelected(role.permissions.map((p) => p.key));
                          }}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-surface-muted"
                        >
                          Edit permissions
                        </button>
                        {!role.isSystem && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`Delete the ${role.name} role?`)) {
                                void send(`/api/admin/roles/${role.id}`, "DELETE");
                              }
                            }}
                            className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-60"
                          >
                            Delete
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {permissions.map((permission) => {
                  const active = isEditing
                    ? selected.includes(permission.key)
                    : held.has(permission.key);

                  // Outside edit mode only the granted permissions are shown.
                  if (!isEditing && !active) return null;

                  return (
                    <label
                      key={permission.id}
                      title={permission.description}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        isEditing ? "cursor-pointer" : ""
                      } ${
                        active
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-muted hover:bg-surface-muted"
                      }`}
                    >
                      {isEditing && (
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={active}
                          onChange={() =>
                            setSelected(
                              active
                                ? selected.filter((k) => k !== permission.key)
                                : [...selected, permission.key]
                            )
                          }
                        />
                      )}
                      {permission.key}
                    </label>
                  );
                })}

                {!isEditing && role.permissions.length === 0 && (
                  <p className="text-sm text-muted">No permissions assigned.</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
