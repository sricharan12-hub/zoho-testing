import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/rbac";
import type { CurrentUser } from "@/lib/auth/session";
import { ZOHO_APPS, type ZohoAppKey, type ModuleData } from "@/lib/zoho/apps";
import { ZohoApiError } from "@/lib/zoho/client";
import { ZohoAuthError } from "@/lib/zoho/token";
import "server-only";

export type AppResult =
  | { ok: true; name: string; deepLink: string; data: ModuleData }
  | { ok: false; name: string; deepLink: string; error: string; remedy?: string };

/**
 * Single implementation of "fetch a Zoho module on behalf of a user", shared
 * by the API route and the server-rendered page so the permission check and
 * the audit entry cannot drift apart between the two entry points.
 *
 * Returns `denied` rather than throwing so callers choose their own response.
 */
export async function loadAppForUser(
  user: CurrentUser,
  key: ZohoAppKey,
  request?: Request
): Promise<AppResult | "denied"> {
  const app = ZOHO_APPS[key];

  if (!hasPermission(user, app.permission)) {
    await audit({
      userId: user.id,
      actorEmail: user.email,
      action: "access.denied",
      resource: app.permission,
      status: "denied",
      request,
    });
    return "denied";
  }

  const deepLink = app.deepLink();

  try {
    const data = await app.load();

    await audit({
      userId: user.id,
      actorEmail: user.email,
      action: "zoho.access",
      resource: app.key,
      detail: { rows: data.rows.length },
      request,
    });

    return { ok: true, name: app.name, deepLink, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zoho request failed.";

    await audit({
      userId: user.id,
      actorEmail: user.email,
      action: "zoho.access",
      resource: app.key,
      status: "failure",
      detail: { message },
      request,
    });

    if (err instanceof ZohoApiError) {
      return { ok: false, name: app.name, deepLink, error: message, remedy: err.remedy };
    }
    if (err instanceof ZohoAuthError) {
      return { ok: false, name: app.name, deepLink, error: message };
    }
    throw err;
  }
}
