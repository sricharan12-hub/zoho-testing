"use client";

import { useId, useState } from "react";

/**
 * A password input with a reveal toggle.
 *
 * Shared by sign-in and sign-up so the two cannot drift in behaviour or in
 * appearance, and so the accessibility details are written once: the toggle is
 * a real button (not a div), it is `type="button"` so it never submits the form
 * around it, and its label states what pressing it will do rather than what the
 * icon looks like.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  className,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  /** Extra classes for the wrapping block, e.g. top margin. */
  className?: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const [visible, setVisible] = useState(false);

  return (
    <div className={className}>
      <label className="block text-sm font-medium" htmlFor={fieldId}>
        {label}
      </label>

      <div className="relative mt-1.5">
        <input
          id={fieldId}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? hintId : undefined}
          // Room on the right so long values do not run under the button.
          className="w-full rounded-lg border border-border bg-background py-2 pl-3 pr-11 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          placeholder="••••••••"
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={fieldId}
          title={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* The icons are inline SVG rather than an icon package: two shapes do not
   justify a dependency, and inlining keeps them themeable via currentColor. */

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M9.9 5.7A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.75 3.65M6.3 6.35A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.5 9.5 0 0 0 3.9-.82" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3.5 3.5 17 17" />
    </svg>
  );
}
