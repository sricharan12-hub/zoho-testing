import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/** The portal has no marketing page: land people where they belong. */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
