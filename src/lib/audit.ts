import { after } from "next/server";
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

type Client = { ip: string | null; userAgent: string | null };

/** Reads the caller's identity off the request while it is still in scope. */
function clientOf(request?: Request): Client {
  const headers = request?.headers;
  return {
    ip:
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers?.get("x-real-ip") ??
      null,
    userAgent: headers?.get("user-agent") ?? null,
  };
}

/**
 * Appends an audit row. Deliberately never throws: a logging failure must not
 * turn a successful login into a 500, so problems are reported to the server
 * console and swallowed.
 */
async function write(entry: AuditEntry, client: Client): Promise<void> {
  try {
    await db()
      .from("audit_logs")
      .insert({
        user_id: entry.userId ?? null,
        actor_email: entry.actorEmail ?? null,
        action: entry.action,
        resource: entry.resource ?? null,
        status: entry.status ?? "success",
        detail: entry.detail ?? {},
        ip: client.ip,
        user_agent: client.userAgent,
      });
  } catch (err) {
    console.error("[audit] failed to write entry", entry.action, err);
  }
}

/** Writes the row before the caller continues. */
export async function audit(entry: AuditEntry): Promise<void> {
  await write(entry, clientOf(entry.request));
}

/**
 * Writes the row after the response has been sent.
 *
 * An audit insert is a full round trip to the database, and for entries nobody
 * is waiting on — a successful sign-in, a Zoho read that already returned its
 * data — that round trip sits on the critical path for no benefit. The row is
 * still written, and with the same client identity, which is resolved here
 * rather than inside the deferred callback.
 *
 * Use `audit()` instead wherever a later request depends on the row already
 * being there. Failed sign-ins are the case that matters: `loginLockout()`
 * counts them, so deferring one would let a burst of attempts slip past the
 * throttle.
 */
export function auditAfter(entry: AuditEntry): void {
  const client = clientOf(entry.request);
  const run = () => write(entry, client);

  // `after()` only exists inside a request; anything else (a script, a test
  // harness) falls back to writing inline.
  try {
    after(run);
  } catch {
    void run();
  }
}
