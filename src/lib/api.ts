import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { audit } from "@/lib/audit";
import "server-only";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status });
}

/**
 * Thrown to short-circuit a handler. `guard` turns it back into a response.
 */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Every authenticated route goes through here, which is what makes "role and
 * permission validation on every API request" true by construction rather
 * than by remembering to add a check.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Not authenticated.");
  return user;
}

export async function requirePermission(
  permission: string,
  request?: Request
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) {
    // A denied attempt is exactly what an access log needs to record.
    await audit({
      userId: user.id,
      actorEmail: user.email,
      action: "access.denied",
      resource: permission,
      status: "denied",
      request,
    });
    throw new HttpError(403, `You do not have the ${permission} permission.`);
  }
  return user;
}

/** Wraps a handler so thrown HttpErrors and crashes become clean JSON. */
export async function guard(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof HttpError) return fail(err.message, err.status);
    console.error("[api] unhandled error", err);
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    return fail(message, 500);
  }
}
