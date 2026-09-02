export function Forbidden({ permission }: { permission: string }) {
  return (
    <div className="mx-auto w-full max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Access denied</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        This page requires the{" "}
        <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">
          {permission}
        </code>{" "}
        permission, which your role does not grant.
      </p>
    </div>
  );
}
