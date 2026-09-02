"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-lg px-3 py-2 text-sm transition ${
        active
          ? "bg-accent/10 font-medium text-accent"
          : "text-foreground/80 hover:bg-surface-muted"
      }`}
    >
      {children}
    </Link>
  );
}
