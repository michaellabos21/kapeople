"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/customers", label: "Customers" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1">
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${active ? "bg-ink text-white" : "text-muted hover:bg-brand-soft"}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
