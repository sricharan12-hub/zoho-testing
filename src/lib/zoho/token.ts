import { env } from "@/lib/env";
import "server-only";

/**
 * Zoho access tokens last an hour; the refresh token is permanent. We cache
 * the access token in module memory and refresh it slightly early, so a burst
 * of employee requests results in one token call rather than one per request.
 *
 * Zoho also caps a client at 20 refresh-token grants, which is another reason
 * never to exchange per request.
 */
let cache: { token: string; apiDomain: string; expiresAt: number } | null = null;

const EARLY_REFRESH_MS = 5 * 60_000;

export class ZohoAuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ZohoAuthError";
  }
}

export async function getAccessToken(): Promise<{ token: string; apiDomain: string }> {
  if (cache && cache.expiresAt - EARLY_REFRESH_MS > Date.now()) {
    return { token: cache.token, apiDomain: cache.apiDomain };
  }

  const res = await fetch(`${env.zohoAccountsUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.zohoClientId,
      client_secret: env.zohoClientSecret,
      refresh_token: env.zohoRefreshToken,
    }),
    cache: "no-store",
  });

  // Zoho answers 200 with an `error` field rather than a 4xx status.
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    api_domain?: string;
    error?: string;
  };

  if (!body.access_token) {
    throw new ZohoAuthError(
      body.error ?? "unknown_error",
      `Could not refresh the Zoho access token (${body.error ?? res.status}). ` +
        `Check ZOHO_REFRESH_TOKEN, ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.`
    );
  }

  cache = {
    token: body.access_token,
    apiDomain: body.api_domain ?? env.zohoApiDomain,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return { token: cache.token, apiDomain: cache.apiDomain };
}

/** Used by tests and by the admin "reconnect Zoho" action. */
export function clearTokenCache() {
  cache = null;
}
