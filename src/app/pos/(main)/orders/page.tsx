"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { peso, timeAgo } from "@/lib/format";
import type { OrderStatus } from "@/lib/config";
import { OrderDetailModal, useOrderActions, type PosOrder } from "@/components/OrderDetail";
import { PaymentModal } from "@/components/PaymentModal";
import { ErrorNote, LoadState } from "@/components/ui";

type O = PosOrder & { payment_method: string };

const COLUMNS: { status: OrderStatus; title: string; next?: { to: "accepted" | "preparing" | "ready" | "completed"; label: string } }[] = [
  { status: "new", title: "New", next: { to: "accepted", label: "Accept" } },
  { status: "accepted", title: "Accepted", next: { to: "preparing", label: "Start preparing" } },
  { status: "preparing", title: "Preparing", next: { to: "ready", label: "Mark ready" } },
  { status: "ready", title: "Ready", next: { to: "completed", label: "Complete" } },
];

export default function OrdersBoard() {
  const { data, error, reload } = useLive(() => api<{ orders: O[] }>("/api/orders?status=new,accepted,preparing,ready&limit=100"), ["orders"], 8000);
  const [open, setOpen] = useState<O | null>(null);
  const [payFor, setPayFor] = useState<O | null>(null);
  const act = useOrderActions(reload);
  if (!data) return <LoadState error={error} onRetry={reload} />;
  const live = open ? data.orders.find((o) => o.id === open.id) ?? open : null;

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = data.orders.filter((o) => o.status === col.status).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
        return (
          <section key={col.status} className="flex min-h-40 flex-col rounded-2xl bg-line/40 p-3">
            <h2 className="mb-2 flex items-center justify-between text-sm font-bold uppercase tracking-wide text-muted">
              {col.title}
              <span className="rounded-full bg-card px-2 py-0.5 text-xs">{items.length}</span>
            </h2>
            <div className="space-y-2">
              {items.length === 0 && <p className="py-6 text-center text-xs text-muted">Nothing here</p>}
              {items.map((o) => {
                const unpaid = o.payment_status === "unpaid";
                const completing = col.next?.to === "completed";
                return (
                  <article key={o.id} className={`card p-3 ${col.status === "new" ? "border-info" : ""}`}>
                    <button className="block w-full text-left" onClick={() => setOpen(o)}>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold">#{o.order_number}</span>
                        <span className="text-xs text-muted">{timeAgo(o.created_at)}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded bg-ink px-1.5 py-0.5 font-bold uppercase text-white">{o.source === "app" ? "App" : "POS"}</span>
                        {o.customer_name && <span className="text-muted">{o.customer_name}</span>}
                        {unpaid && <span className="rounded bg-warn-soft px-1.5 py-0.5 font-bold text-warn">UNPAID</span>}
                      </div>
                      <ul className="mt-2 space-y-1 text-sm">
                        {o.items.map((i, idx) => (
                          <li key={idx}>
                            <b>{i.qty}×</b> {i.name}{i.variant_name ? ` (${i.variant_name})` : ""}
                            {i.addons.length > 0 && <span className="block pl-5 text-xs text-muted">{i.addons.map((a) => a.name).join(", ")}</span>}
                            {i.notes && <span className="block pl-5 text-xs italic text-muted">“{i.notes}”</span>}
                          </li>
                        ))}
                      </ul>
                      {o.notes && <p className="mt-2 rounded-lg bg-warn-soft px-2 py-1 text-xs">Note: {o.notes}</p>}
                      <p className="mt-2 text-sm font-semibold">{peso(o.total)}</p>
                    </button>
                    {col.next && (
                      <button className="btn-primary mt-3 w-full" disabled={act.busy} onClick={() => (completing && unpaid ? setPayFor(o) : act.advance(o, col.next!.to))}>
                        {completing && unpaid ? `Collect ${peso(o.total)}` : col.next.label}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      {act.error && !payFor && <div className="col-span-full"><ErrorNote message={act.error} /></div>}
      <OrderDetailModal order={live} onClose={() => setOpen(null)} onChanged={reload} />
      {payFor && (
        <PaymentModal
          open
          total={payFor.total}
          busy={act.busy}
          error={act.error}
          confirmLabel="Record payment & complete"
          initialMethod={payFor.payment_method as "cash"}
          onClose={() => { setPayFor(null); act.setError(null); }}
          onConfirm={async (method, tendered) => {
            if (await act.pay(payFor, method, tendered)) {
              await act.advance(payFor, "completed");
              setPayFor(null);
            }
          }}
        />
      )}
    </div>
  );
}
