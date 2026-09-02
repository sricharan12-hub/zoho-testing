import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in · Employee Portal" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/dashboard");

  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") ? next : "/dashboard";

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-accent-contrast">
            EP
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Employee Portal</h1>
          <p className="mt-1 text-sm text-muted">
            Sign in with your portal credentials
          </p>
        </div>

        <LoginForm next={target} />

        <p className="mt-6 text-center text-sm text-muted">
          Accounts are created by your administrator. If you do not have one
          yet, contact your IT or HR team.
        </p>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted">
          Your Zoho services are reached through this portal. You never need a
          Zoho username or password.
        </p>
      </div>
    </main>
  );
}
