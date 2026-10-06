"use client";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { dateTime, peso } from "@/lib/format";
import { LoadState, StatusBadge } from "@/components/ui";
import type { OrderStatus } from "@/lib/config";

interface O { id: number; order_number: number; status: OrderStatus; total: number; created_at: string; items: { name: string; qty: number }[] }

export default function OrdersPage() {
  const { data, error, reload } = useLive(() => api<{ orders: O[] }>("/api/orders"));
  if (!data) return <LoadState error={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Orders</h1>
      {data.orders.length === 0 && (
        <p className="py-10 text-center text-muted">No orders yet. <Link href="/app/menu" className="font-semibold text-brand">Start one</Link></p>
      )}
      <ul className="space-y-3">
        {data.orders.map((o) => (
          <li key={o.id}>
            <Link href={`/app/orders/${o.id}`} className="card block p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">#{o.order_number}</p>
                <StatusBadge status={o.status} />
              </div>
              <p className="mt-1 line-clamp-1 text-sm text-muted">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-muted">{dateTime(o.created_at)}</span>
                <span className="font-semibold">{peso(o.total)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
