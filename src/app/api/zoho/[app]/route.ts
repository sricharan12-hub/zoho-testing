import { guard, json, fail, requireUser } from "@/lib/api";
import { isZohoAppKey } from "@/lib/zoho/apps";
import { loadAppForUser } from "@/lib/zoho/access";

/**
 * The only path employee data takes out of Zoho. The caller's permission is
 * checked first, the service account's token is attached server-side, and the
 * employee never learns any Zoho credential.
 */
export async function GET(request: Request, ctx: { params: Promise<{ app: string }> }) {
  return guard(async () => {
    const { app: key } = await ctx.params;
    if (!isZohoAppKey(key)) return fail("Unknown Zoho application.", 404);

    const user = await requireUser();
    const result = await loadAppForUser(user, key, request);

    if (result === "denied") {
      return fail("You do not have access to this Zoho application.", 403);
    }

    if (!result.ok) {
      // A Zoho-side problem is a 502 with a remedy, not a portal crash.
      return fail(result.error, 502, { remedy: result.remedy });
    }

    return json({
      app: { key, name: result.name, deepLink: result.deepLink },
      data: result.data,
    });
  });
}
