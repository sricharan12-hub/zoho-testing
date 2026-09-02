/**
 * Standalone so the Proxy (edge) bundle can import the cookie name without
 * dragging in the Supabase client or any `server-only` module.
 */
export const SESSION_COOKIE = "portal_session";

/** Sessions die after this long without activity, independent of JWT expiry. */
export const IDLE_TIMEOUT_MINUTES = 30;
