"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminUser } from "@/lib/admin/queries";

type Role = { id: string; name: string };

const emptyDraft = {
  email: "",
  fullName: "",
  department: "",
  password: "",
  roleIds: [] as string[],
};

/**
 * Data arrives pre-rendered from the server page; this component only
 * mutates, then calls router.refresh() so the server re-renders the list.
 */
export function UsersManager({
  users,
  roles,
  canWrite,
}: {
  users: AdminUser[];
  roles: Role[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);

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

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    const ok = await send("/api/admin/users", "POST", {
      ...draft,
      department: draft.department || undefined,
    });
    if (ok) {
      setDraft(emptyDraft);
      setNotice("User created.");
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
        <form onSubmit={createUser} className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Add a user</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              required
              type="email"
              placeholder="Email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              required
              placeholder="Full name"
              value={draft.fullName}
              onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              placeholder="Department (optional)"
              value={draft.department}
              onChange={(e) => setDraft({ ...draft, department: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              required
              type="password"
              placeholder="Temporary password"
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          <fieldset className="mt-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted">
              Roles
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {roles.map((role) => {
                const checked = draft.roleIds.includes(role.id);
                return (
                  <label
                    key={role.id}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition ${
                      checked
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border hover:bg-surface-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        setDraft({
                          ...draft,
                          roleIds: checked
                            ? draft.roleIds.filter((id) => id !== role.id)
                            : [...draft.roleIds, role.id],
                        })
                      }
                    />
                    {role.name}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Working…" : "Create user"}
          </button>
        </form>
      )}

      <div className="rounded-xl border border-border bg-surface">
        <div className="table-scroll">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {["User", "Department", "Roles", "Status", "Last login", ""].map((h, i) => (
                  <th
                    key={h || i}
                    scope="col"
                    className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{user.fullName}</p>
                    <p className="text-xs text-muted">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">{user.department ?? "—"}</td>
                  <td className="px-4 py-3">
                    {editing === user.id ? (
                      <div className="flex flex-wrap gap-1.5">
                        {roles.map((role) => {
                          const checked = editRoleIds.includes(role.id);
                          return (
                            <label
                              key={role.id}
                              className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition ${
                                checked
                                  ? "border-accent bg-accent/10 text-accent"
                                  : "border-border hover:bg-surface-muted"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() =>
                                  setEditRoleIds(
                                    checked
                                      ? editRoleIds.filter((id) => id !== role.id)
                                      : [...editRoleIds, role.id]
                                  )
                                }
                              />
                              {role.name}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      user.roles.map((r) => r.name).join(", ") || "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.isActive
                          ? "bg-success/10 text-success"
                          : "bg-danger/10 text-danger"
                      }`}
                    >
                      {user.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    {canWrite && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {editing === user.id ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                const ok = await send(`/api/admin/users/${user.id}`, "PATCH", {
                                  roleIds: editRoleIds,
                                });
                                if (ok) {
                                  setEditing(null);
                                  setNotice("Roles updated. That user's sessions were ended.");
                                }
                              }}
                              className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-accent-contrast disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              className="rounded-lg border border-border px-2.5 py-1 text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(user.id);
                                setEditRoleIds(user.roles.map((r) => r.id));
                              }}
                              className="rounded-lg border border-border px-2.5 py-1 text-xs transition hover:bg-surface-muted"
                            >
                              Edit roles
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void send(`/api/admin/users/${user.id}`, "PATCH", {
                                  isActive: !user.isActive,
                                })
                              }
                              className="rounded-lg border border-border px-2.5 py-1 text-xs transition hover:bg-surface-muted disabled:opacity-60"
                            >
                              {user.isActive ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (confirm(`Delete ${user.email}? This cannot be undone.`)) {
                                  void send(`/api/admin/users/${user.id}`, "DELETE");
                                }
                              }}
                              className="rounded-lg border border-danger/40 px-2.5 py-1 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-60"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted">No users yet.</p>
        )}
      </div>
    </div>
  );
}
