import { db } from "@/lib/supabase";
import "server-only";

export type AuditEntry = {
  userId?: string | null;
  actorEmail?: string | null;
  action: string;
  resource?: string | null;
  status?: "success" | "failure" | "denied";
  detail?: Record<string, unknown>;
  request?: Request;
};

/**
 * Appends an audit row. Deliberately never throws: a logging failure must not
 * turn a successful login into a 500, so problems are reported to the server
 * console and swallowed.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const headers = entry.request?.headers;
    await db()
      .from("audit_logs")
      .insert({
        user_id: entry.userId ?? null,
        actor_email: entry.actorEmail ?? null,
        action: entry.action,
        resource: entry.resource ?? null,
        status: entry.status ?? "success",
        detail: entry.detail ?? {},
        ip:
          headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          headers?.get("x-real-ip") ??
          null,
        user_agent: headers?.get("user-agent") ?? null,
      });
  } catch (err) {
    console.error("[audit] failed to write entry", entry.action, err);
  }
}
