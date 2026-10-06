"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui";

interface Me { name: string; email: string; phone: string | null }

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [perm, setPerm] = useState<string>("default");
  useEffect(() => {
    api<{ user: Me }>("/api/auth/me").then((r) => setMe(r.user));
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, []);
  if (!me) return <Spinner />;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">Profile</h1>
      <div className="card divide-y divide-line">
        {[["Name", me.name], ["Email", me.email], ["Mobile", me.phone ?? "—"]].map(([k, v]) => (
          <div key={k} className="flex justify-between px-4 py-3 text-sm"><span className="text-muted">{k}</span><span className="font-medium">{v}</span></div>
        ))}
      </div>
      {typeof Notification !== "undefined" && perm !== "granted" && (
        <button className="btn-secondary w-full" onClick={async () => setPerm(await Notification.requestPermission())}>
          Turn on order alerts
        </button>
      )}
      <button
        className="btn-secondary w-full"
        onClick={async () => {
          await api("/api/auth/logout", {});
          try { localStorage.removeItem("kapeople.cart.v1"); } catch {}
          router.replace("/app/login");
          router.refresh();
        }}
      >
        Sign out
      </button>
    </div>
  );
}
