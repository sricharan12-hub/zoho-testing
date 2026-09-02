import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SignupForm } from "@/components/signup-form";

export const metadata = { title: "Create account · Employee Portal" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
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
          <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-muted">
            Register for portal access in a few seconds
          </p>
        </div>

        <SignupForm next={target} />

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link
            href={{ pathname: "/login", query: { next: target } }}
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted">
          New accounts start with baseline access. An administrator assigns the
          Zoho applications your role needs.
        </p>
      </div>
    </main>
  );
}
