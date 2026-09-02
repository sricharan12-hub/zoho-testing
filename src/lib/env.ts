/**
 * Validated environment access.
 *
 * Reading through these helpers (instead of process.env directly) means a
 * missing variable fails loudly at the call site rather than surfacing later
 * as a confusing "invalid_client" or "401" from a third party.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith("REPLACE_ME")) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return !value || value.startsWith("REPLACE_ME") ? fallback : value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get jwtSecret() {
    return required("JWT_SECRET");
  },
  get jwtExpiresIn() {
    return optional("JWT_EXPIRES_IN", "1h");
  },
  get zohoAccountsUrl() {
    return optional("ZOHO_ACCOUNTS_URL", "https://accounts.zoho.in");
  },
  get zohoApiDomain() {
    return optional("ZOHO_API_DOMAIN", "https://www.zohoapis.in");
  },
  get zohoClientId() {
    return required("ZOHO_CLIENT_ID");
  },
  get zohoClientSecret() {
    return required("ZOHO_CLIENT_SECRET");
  },
  get zohoRefreshToken() {
    return required("ZOHO_REFRESH_TOKEN");
  },
  /** Optional: the Zoho apps that need them report a clear error when unset. */
  get zohoBooksOrgId() {
    return process.env.ZOHO_BOOKS_ORGANIZATION_ID ?? "";
  },
  get zohoDeskOrgId() {
    return process.env.ZOHO_DESK_ORG_ID ?? "";
  },
  /** Desk lives on desk.zoho.<tld>, not the zohoapis.<tld> domain. */
  get zohoDeskDomain() {
    return `https://desk.zoho.${this.zohoTld}`;
  },
  /** People likewise has its own host rather than the shared API domain. */
  get zohoPeopleDomain() {
    return `https://people.zoho.${this.zohoTld}`;
  },
  get zohoTld() {
    return new URL(this.zohoAccountsUrl).hostname.split(".").pop();
  },
};
