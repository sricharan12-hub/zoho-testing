"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Signs the user out, and also enforces the idle timeout in the browser so an
 * abandoned tab returns to the login screen instead of sitting on a stale
 * dashboard. The server enforces the same window independently.
 */
export function SignOutButton({ idleMinutes }: { idleMinutes: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signOut = useCallback(
    async (reason?: "idle") => {
      setBusy(true);
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      router.replace(reason === "idle" ? "/login?next=%2Fdashboard" : "/login");
      router.refresh();
    },
    [router]
  );

  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void signOut("idle"), idleMinutes * 60_000);
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [idleMinutes, signOut]);

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={busy}
      className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted disabled:opacity-60"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
