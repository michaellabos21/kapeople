"use client";
import Link from "next/link";
import { useEffect } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { timeAgo } from "@/lib/format";
import { LoadState } from "@/components/ui";

interface N { id: number; title: string; body: string; read: boolean; order_id: number | null; created_at: string }

export default function NotificationsPage() {
  const { data, error, reload } = useLive(() => api<{ notifications: N[] }>("/api/notifications"));
  useEffect(() => {
    if (data?.notifications.some((n) => !n.read)) {
      // Tell the shell so the bell badge clears immediately.
      void api("/api/notifications", {}).then(() => window.dispatchEvent(new Event("kapeople:notifications-read"))).catch(() => {});
    }
  }, [data]);
  if (!data) return <LoadState error={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Notifications</h1>
      {data.notifications.length === 0 && <p className="py-10 text-center text-muted">Nothing yet.</p>}
      <ul className="space-y-2">
        {data.notifications.map((n) => {
          const inner = (
            <div className={`card p-4 ${n.read ? "" : "border-brand"}`}>
              <p className="font-semibold">{n.title}</p>
              {n.body && <p className="text-sm text-muted">{n.body}</p>}
              <p className="mt-1 text-xs text-muted">{timeAgo(n.created_at)}</p>
            </div>
          );
          return <li key={n.id}>{n.order_id ? <Link href={`/app/orders/${n.order_id}`}>{inner}</Link> : inner}</li>;
        })}
      </ul>
    </div>
  );
}
