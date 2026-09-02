"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/** Search lives in the URL so a filtered list is shareable and bookmarkable. */
export function UserSearch({ total }: { total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (value.trim()) next.set("q", value.trim());
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        aria-label="Search users"
        placeholder="Search name, email or department"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-w-56 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
      >
        Search
      </button>
      {params.get("q") ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            router.push(pathname);
          }}
          className="rounded-lg px-2 py-1.5 text-sm text-muted transition hover:text-foreground"
        >
          Clear
        </button>
      ) : null}
      <span className="text-sm text-muted">{total} users</span>
    </form>
  );
}
