"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { Receipt, PrintButton, type ReceiptOrder } from "@/components/Receipt";
import { ErrorNote, Spinner, StatusBadge } from "@/components/ui";
import { ORDER_FLOW, STATUS_LABEL } from "@/lib/config";

const BLURB: Record<string, string> = {
  new: "We've sent your order to the store.",
  accepted: "The store has accepted your order.",
  preparing: "Your order is being made.",
  ready: "Your order is ready — come pick it up!",
  completed: "Enjoy! Thanks for ordering.",
  cancelled: "This order was cancelled.",
  refunded: "This order was refunded.",
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useLive(() => api<{ order: ReceiptOrder & { id: number; cancel_reason: string | null; payment_status: string; reward_discount: number } }>(`/api/orders/${id}`));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Spinner />;
  const o = data.order;
  const step = ORDER_FLOW.indexOf(o.status as (typeof ORDER_FLOW)[number]);
  const closed = o.status === "cancelled" || o.status === "refunded";

  async function cancel() {
    if (!confirm("Cancel this order?")) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/orders/${id}/cancel`, {});
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <Link href="/app/orders" className="text-sm font-semibold text-muted">← Orders</Link>
      <div className={`rounded-2xl p-5 ${o.status === "ready" ? "bg-ok text-white" : "bg-ink text-white"}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Order</p>
            <p className="font-display text-4xl font-bold">#{o.order_number}</p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">{STATUS_LABEL[o.status]}</span>
        </div>
        <p className="mt-3 text-sm text-white/85">{o.status === "ready" ? `Order #${o.order_number} is ready!` : BLURB[o.status]}</p>
        {o.status === "completed" && o.points_earned > 0 && <p className="mt-2 text-sm font-semibold">⭐ +{o.points_earned} points added</p>}
      </div>

      {!closed && (
        <ol className="flex items-center justify-between px-1" aria-label="Order progress">
          {ORDER_FLOW.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col items-center gap-1 text-center">
              <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${i <= step ? "bg-brand text-white" : "bg-line text-muted"}`}>{i < step ? "✓" : i + 1}</span>
              <span className={`text-[11px] ${i === step ? "font-bold" : "text-muted"}`}>{STATUS_LABEL[s]}</span>
            </li>
          ))}
        </ol>
      )}
      {closed && <div className="flex justify-center"><StatusBadge status={o.status} /></div>}
      {o.cancel_reason && <p className="text-center text-sm text-muted">Reason: {o.cancel_reason}</p>}
      {o.payment_status === "unpaid" && !closed && <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Please pay at the counter when you pick up.</p>}

      <ErrorNote message={err} />
      {o.status === "new" && <button className="btn-secondary w-full" disabled={busy} onClick={cancel}>Cancel order</button>}

      <Receipt order={o} />
      <div className="flex justify-center"><PrintButton /></div>
    </div>
  );
}
