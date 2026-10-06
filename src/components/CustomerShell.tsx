"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CartProvider, useCart } from "@/lib/client/cart";
import { useEvents } from "@/lib/client/live";
import { api } from "@/lib/client/api";
import { peso } from "@/lib/format";
import { ToastProvider, useToast } from "./ui";

interface Note {
  id: number;
  title: string;
  body: string;
  read: boolean;
  order_id: number | null;
}

const TABS = [
  { href: "/app", label: "Home", icon: "🏠" },
  { href: "/app/menu", label: "Menu", icon: "☕" },
  { href: "/app/orders", label: "Orders", icon: "🧾" },
  { href: "/app/rewards", label: "Rewards", icon: "⭐" },
  { href: "/app/profile", label: "Me", icon: "👤" },
];

function Inner({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const toast = useToast();
  const cart = useCart();
  const [unread, setUnread] = useState(0);
  const seen = useRef<number | null>(null);

  const refreshNotes = useCallback(async () => {
    try {
      const { notifications } = await api<{ notifications: Note[] }>("/api/notifications");
      setUnread(notifications.filter((n) => !n.read).length);
      const newest = notifications[0]?.id ?? 0;
      if (seen.current !== null) {
        for (const n of notifications.filter((n) => n.id > seen.current! && !n.read).reverse()) {
          toast(`${n.title}${n.body ? " — " + n.body : ""}`, n.title.includes("ready") ? "ok" : "info");
          // Browser notification stands in for push until Firebase Cloud Messaging is wired up.
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(n.title, { body: n.body });
          }
        }
      }
      seen.current = Math.max(seen.current ?? 0, newest);
    } catch {}
  }, [toast]);

  useEffect(() => {
    void refreshNotes();
  }, [refreshNotes]);
  useEvents((e) => {
    if (e.type === "notification") {
      void refreshNotes();
      router.refresh();
    }
  });

  const showCartBar = cart.count > 0 && !path.startsWith("/app/cart") && !path.startsWith("/app/product");
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-paper pb-28 shadow-[0_0_60px_rgba(0,0,0,0.06)]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/90 px-5 py-3 backdrop-blur">
        <Link href="/app" className="font-display text-xl font-bold">Kapeople</Link>
        <Link href="/app/notifications" aria-label={`Notifications, ${unread} unread`} className="relative rounded-full p-2 text-lg">
          🔔
          {unread > 0 && <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">{unread}</span>}
        </Link>
      </header>
      <main className="px-5 py-5">{children}</main>

      {showCartBar && (
        <Link href="/app/cart" className="fixed inset-x-0 bottom-[68px] z-30 mx-auto flex max-w-md justify-center px-4">
          <span className="btn-primary w-full justify-between shadow-xl">
            <span>View cart · {cart.count} item{cart.count > 1 ? "s" : ""}</span>
            <span>{peso(cart.subtotal)}</span>
          </span>
        </Link>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = t.href === "/app" ? path === "/app" : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${active ? "text-brand" : "text-muted"}`}>
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function CustomerShell({ children }: { name: string; children: ReactNode }) {
  return (
    <ToastProvider>
      <CartProvider>
        <Inner>{children}</Inner>
      </CartProvider>
    </ToastProvider>
  );
}
