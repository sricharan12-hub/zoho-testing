import { db } from "@/lib/supabase";
import { clearSessionCookie } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { guard, json } from "@/lib/api";

export async function POST(request: Request) {
  return guard(async () => {
    const user = await getCurrentUser();

    if (user) {
      // Revoke the session row so the JWT is dead even if it is replayed.
      await db()
        .from("sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("jti", user.jti);

      await audit({
        userId: user.id,
        actorEmail: user.email,
        action: "auth.logout",
        request,
      });
    }

    await clearSessionCookie();
    return json({ ok: true });
  });
}
