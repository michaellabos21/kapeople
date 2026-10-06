"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { Modal, ToastProvider, useToast } from "./ui";
import { ChangePasswordButton } from "./ChangePasswordModal";
import { PushToggle } from "./PushToggle";
import { detachDevice, usePushSync } from "@/lib/client/push";

const TABS = [
  { href: "/pos", label: "Sales" },
  { href: "/pos/orders", label: "Orders" },
  { href: "/pos/inventory", label: "Inventory" },
  { href: "/pos/history", label: "History" },
  { href: "/pos/reports", label: "Reports" },
];

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
  } catch {}
}

function Inner({ name, role, children }: { name: string; role: string; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [online, setOnline] = useState(true);
  const [alertsOpen, setAlertsOpen] = useState(false);
  usePushSync(); // re-attach this device to the signed-in user
  const seen = useRef<Set<number> | null>(null);

  const { data, error } = useLive(() => api<{ orders: { id: number; order_number: number; source: string }[] }>("/api/orders?status=new"), ["orders"], 10000);
  const fresh = data?.orders ?? [];

  useEffect(() => {
    if (!data) return;
    if (seen.current) {
      for (const o of data.orders.filter((o) => !seen.current!.has(o.id) && o.source === "app")) {
        toast(`🔔 New order #${o.order_number}`, "ok");
        beep();
      }
    }
    seen.current = new Set(data.orders.map((o) => o.id));
  }, [data, toast]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  const disconnected = !online || !!error;

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line bg-card px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <span className="font-display text-lg font-bold">Kapeople <span className="text-sm font-semibold text-brand">POS</span></span>
        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const active = t.href === "/pos" ? path === "/pos" : path.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} className={`relative shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold ${active ? "bg-ink text-white" : "text-muted hover:bg-brand-soft"}`}>
                {t.label}
                {t.label === "Orders" && fresh.length > 0 && <span className="ml-1.5 rounded-full bg-bad px-1.5 py-0.5 text-[10px] font-bold text-white">{fresh.length}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${disconnected ? "text-bad" : "text-ok"}`}>
            <span className={`h-2 w-2 rounded-full ${disconnected ? "bg-bad" : "bg-ok"}`} />
            {disconnected ? "Offline" : "Live"}
          </span>
          {role === "admin" && <Link href="/admin" className="font-semibold text-brand">Admin</Link>}
          <span className="text-muted">{name}</span>
          <button className="font-semibold text-muted hover:text-ink" onClick={() => setAlertsOpen(true)}>Alerts</button>
          <ChangePasswordButton />
          <button
            className="font-semibold text-muted hover:text-ink"
            onClick={async () => {
              await detachDevice(); // this account stops getting alerts on this device; the next login resumes them
              await api("/api/auth/logout", {});
              router.replace("/pos/login");
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      {disconnected && (
        <div role="alert" className="bg-bad px-4 py-2 text-center text-sm font-semibold text-white">
          Connection lost — changes can&apos;t be saved until you&apos;re back online. Don&apos;t take payments you can&apos;t record.
        </div>
      )}
      <Modal open={alertsOpen} onClose={() => setAlertsOpen(false)} title="Alerts on this device">
        <PushToggle audience="staff" />
      </Modal>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export function PosShell(props: { name: string; role: string; children: ReactNode }) {
  return (
    <ToastProvider>
      <Inner {...props} />
    </ToastProvider>
  );
}
