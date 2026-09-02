"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PasswordField } from "@/components/password-field";

const field =
  "mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

/** Mirrors passwordProblem() on the server so mistakes surface before a round trip. */
function passwordProblem(plain: string): string | null {
  if (plain.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/i.test(plain)) return "Password must contain a letter.";
  if (!/[0-9]/.test(plain)) return "Password must contain a number.";
  return null;
}

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("Passwords do not match.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, password, department }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? "Could not create the account. Try again.");
        return;
      }

      // The signup response already set the session cookie, so refresh() lets
      // the server components pick it up before we navigate.
      startTransition(() => {
        router.replace(next);
        router.refresh();
      });
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || pending;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-border bg-surface p-6 shadow-sm"
    >
      <label className="block text-sm font-medium" htmlFor="fullName">
        Full name
      </label>
      <input
        id="fullName"
        type="text"
        autoComplete="name"
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className={field}
        placeholder="Asha Menon"
      />

      <label className="mt-4 block text-sm font-medium" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={field}
        placeholder="you@company.com"
      />

      <label className="mt-4 block text-sm font-medium" htmlFor="department">
        Department <span className="font-normal text-muted">(optional)</span>
      </label>
      <input
        id="department"
        type="text"
        autoComplete="organization-title"
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
        className={field}
        placeholder="Sales"
      />

      <PasswordField
        id="password"
        label="Password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        hint="At least 8 characters, including a letter and a number."
        className="mt-4"
      />

      <PasswordField
        id="confirm"
        label="Confirm password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
        className="mt-4"
      />

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-accent-contrast transition hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
