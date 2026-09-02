import { getAccessToken, clearTokenCache } from "@/lib/zoho/token";
import "server-only";

export class ZohoApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Actionable next step shown to an admin in the UI. */
    public remedy?: string
  ) {
    super(message);
    this.name = "ZohoApiError";
  }
}

type FetchOptions = {
  /** Absolute URL, or a path appended to the account's api_domain. */
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

/**
 * Single choke point for every outbound Zoho call. Employees never hold Zoho
 * credentials — the portal attaches the service account's token here, server
 * side, and returns only the data the caller is authorised to see.
 */
export async function zohoFetch<T>(options: FetchOptions): Promise<T> {
  let { token, apiDomain } = await getAccessToken();

  const send = (accessToken: string, domain: string) => {
    const base = options.url.startsWith("http") ? options.url : `${domain}${options.url}`;
    const url = new URL(base);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    return fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  };

  let res = await send(token, apiDomain);

  // A cached token can be revoked upstream before its recorded expiry. Retry
  // exactly once with a freshly minted token, never in a loop.
  if (res.status === 401) {
    clearTokenCache();
    ({ token, apiDomain } = await getAccessToken());
    res = await send(token, apiDomain);
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Zoho returns bare text for some 404s, e.g. "API endpoint not found".
    if (!res.ok) {
      throw new ZohoApiError(
        res.status,
        "non_json_response",
        text.slice(0, 200) || `Zoho returned ${res.status}`,
        res.status === 404
          ? "The application may not be provisioned on this Zoho account."
          : undefined
      );
    }
  }

  if (!res.ok) {
    const code =
      (parsed as { code?: string | number })?.code?.toString() ?? `http_${res.status}`;
    const message =
      (parsed as { message?: string })?.message ?? `Zoho returned ${res.status}`;

    throw new ZohoApiError(
      res.status,
      code,
      message,
      code === "OAUTH_SCOPE_MISMATCH" || res.status === 401
        ? "The Zoho refresh token was issued without this application's scope. " +
          "Regenerate it with the full scope list (see README)."
        : undefined
    );
  }

  return parsed as T;
}
