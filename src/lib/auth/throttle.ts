import { db } from "@/lib/supabase";
import "server-only";

export const MAX_ATTEMPTS = 5;
export const WINDOW_MINUTES = 15;

/**
 * Counts recent failed sign-ins for an email address and reports whether the
 * account is temporarily locked.
 *
 * The audit log is already the record of failed attempts, so it doubles as the
 * throttle store — no extra table, and the lockout is visible to an admin in
 * the same place they investigate the attack.
 */
export async function loginLockout(email: string): Promise<{
  locked: boolean;
  attempts: number;
  retryAfterMinutes: number;
}> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const { count } = await db()
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "auth.login")
    .eq("status", "failure")
    .ilike("actor_email", email.trim())
    .gte("created_at", since);

  const attempts = count ?? 0;
  return {
    locked: attempts >= MAX_ATTEMPTS,
    attempts,
    retryAfterMinutes: WINDOW_MINUTES,
  };
}
