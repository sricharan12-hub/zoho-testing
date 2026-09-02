"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const ACTIONS = [
  "auth.login",
  "auth.logout",
  "zoho.access",
  "access.denied",
  "user.create",
  "user.update",
  "user.delete",
  "role.create",
  "role.update",
  "role.delete",
];

/**
 * Filters live in the URL, so the server page can render the filtered list
 * directly and a filtered view stays shareable and bookmarkable.
 */
export function AuditFilters({ total }: { total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [actor, setActor] = useState(params.get("actor") ?? "");

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page"); // a new filter always starts at the first page
    router.push(`${pathname}?${next}`);
  }

  const selectClass =
    "rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        aria-label="Filter by action"
        value={params.get("action") ?? ""}
        onChange={(e) => update("action", e.target.value)}
        className={selectClass}
      >
        <option value="">All actions</option>
        {ACTIONS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by outcome"
        value={params.get("status") ?? ""}
        onChange={(e) => update("status", e.target.value)}
        className={selectClass}
      >
        <option value="">Any outcome</option>
        <option value="success">Success</option>
        <option value="failure">Failure</option>
        <option value="denied">Denied</option>
      </select>

      <input
        type="date"
        aria-label="From date"
        value={params.get("from") ?? ""}
        onChange={(e) => update("from", e.target.value)}
        className={selectClass}
      />
      <input
        type="date"
        aria-label="To date"
        value={params.get("to") ?? ""}
        onChange={(e) => update("to", e.target.value)}
        className={selectClass}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          update("actor", actor.trim());
        }}
      >
        <input
          type="search"
          aria-label="Filter by actor email"
          placeholder="Actor email"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          className={selectClass}
        />
      </form>

      <span className="text-sm text-muted">{total} entries</span>
    </div>
  );
}
