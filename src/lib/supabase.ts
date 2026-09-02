import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";
import "server-only";

/**
 * Service-role Supabase client. Bypasses RLS, so this module must never be
 * imported into a Client Component — `server-only` turns that into a build
 * error rather than a leaked key.
 */
let cached: ReturnType<typeof createClient<Database>> | null = null;

export function db() {
  if (!cached) {
    cached = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
