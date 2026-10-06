"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { dateTime, peso } from "@/lib/format";
import { OrderDetailModal, type PosOrder } from "@/components/OrderDetail";
import { LoadState, StatusBadge } from "@/components/ui";

const FILTERS = [
  { label: "All", value: "" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
  { label: "Open", value: "new,accepted,preparing,ready" },
];

export default function HistoryPage() {
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [open, setOpen] = useState<PosOrder | null>(null);
  const qs = new URLSearchParams({ limit: "100" });
  if (filter) qs.set("status", filter);
  if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim());
  const { data, error, reload } = useLive(() => api<{ orders: PosOrder[] }>(`/api/orders?${qs}`), ["orders"], 15000, qs.toString());

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.label} onClick={() => setFilter(f.value)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${filter === f.value ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{f.label}</button>
        ))}
        <input className="input !w-56 !py-1.5" placeholder="Order # or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {!data ? <LoadState error={error} onRetry={reload} /> : (
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-3">Order</th><th>Time</th><th>Source</th><th>Customer</th><th>Payment</th><th>Status</th><th className="px-4 text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.orders.map((o) => (
                <tr key={o.id} onClick={() => setOpen(o)} className="cursor-pointer hover:bg-brand-soft/50">
                  <td className="px-4 py-3 font-bold">#{o.order_number}</td>
                  <td className="text-muted">{dateTime(o.created_at)}</td>
                  <td className="uppercase">{o.source}</td>
                  <td>{o.customer_name ?? "—"}</td>
                  <td className="uppercase">{o.payment_method} · {o.payment_status}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="px-4 text-right font-semibold">{peso(o.total)}</td>
                </tr>
              ))}
              {data.orders.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-muted">No orders found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <OrderDetailModal order={open} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}
