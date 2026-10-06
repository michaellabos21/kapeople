"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { dateTime, peso } from "@/lib/format";
import { ACTIVE_STATUSES, type OrderStatus, type PaymentMethod } from "@/lib/config";
import { PaymentModal } from "./PaymentModal";
import { PrintButton, Receipt, type ReceiptOrder } from "./Receipt";
import { ErrorNote, Modal, StatusBadge, useDialog, useToast } from "./ui";

export type PosOrder = ReceiptOrder & {
  id: number;
  customer_name: string | null;
  customer_id: number | null;
  notes: string | null;
  cancel_reason: string | null;
};

const NEXT: Partial<Record<OrderStatus, { to: "accepted" | "preparing" | "ready" | "completed"; label: string }>> = {
  new: { to: "accepted", label: "Accept" },
  accepted: { to: "preparing", label: "Start preparing" },
  preparing: { to: "ready", label: "Mark ready" },
  ready: { to: "completed", label: "Complete" },
};

/** All staff actions for one order: advance, collect payment, cancel, refund, receipt. */
export function useOrderActions(onChanged: () => void) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (ok) toast(ok, "ok");
      onChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    setError,
    advance: (o: PosOrder, to: string) => run(() => api(`/api/orders/${o.id}/status`, { status: to }), `#${o.order_number} → ${to}`),
    pay: (o: PosOrder, method: PaymentMethod, tendered?: number) => run(() => api(`/api/orders/${o.id}/pay`, { method, tendered }), `Payment recorded for #${o.order_number}`),
    cancel: (o: PosOrder, reason?: string) => run(() => api(`/api/orders/${o.id}/cancel`, { reason }), `#${o.order_number} cancelled`),
    refund: (o: PosOrder, restock: boolean) => run(() => api(`/api/orders/${o.id}/refund`, { restock }), `#${o.order_number} refunded`),
  };
}

export function OrderDetailModal({ order, onClose, onChanged }: { order: PosOrder | null; onClose: () => void; onChanged: () => void }) {
  const act = useOrderActions(() => {
    onChanged();
    onClose();
  });
  const dialog = useDialog();
  const [payOpen, setPayOpen] = useState(false);
  const [restock, setRestock] = useState(false);
  if (!order) return null;
  const o = order;
  const active = (ACTIVE_STATUSES as readonly string[]).includes(o.status);
  const next = NEXT[o.status];
  const unpaid = o.payment_status === "unpaid";

  return (
    <>
      <Modal open onClose={onClose} title={`Order #${o.order_number}`} wide>
        <div className="grid gap-5 sm:grid-cols-2">
          <Receipt order={o} />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusBadge status={o.status} />
              <span className="text-xs uppercase text-muted">{o.source === "app" ? "App order" : "Walk-in"}</span>
              {unpaid && <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold text-warn">UNPAID</span>}
            </div>
            <p className="text-sm text-muted">{dateTime(o.created_at)}{o.customer_name ? ` · ${o.customer_name}` : ""}</p>
            {o.notes && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm">Note: {o.notes}</p>}
            {o.cancel_reason && <p className="text-sm text-muted">Reason: {o.cancel_reason}</p>}
            <ErrorNote message={act.error} />

            {active && next && (
              <button
                className="btn-primary w-full py-3"
                disabled={act.busy}
                onClick={() => (next.to === "completed" && unpaid ? setPayOpen(true) : act.advance(o, next.to))}
              >
                {next.to === "completed" && unpaid ? `Collect ${peso(o.total)} & complete` : next.label}
              </button>
            )}
            {active && unpaid && next?.to !== "completed" && (
              <button className="btn-secondary w-full" onClick={() => setPayOpen(true)}>Record payment</button>
            )}
            {active && (
              <button
                className="btn-secondary w-full text-bad"
                disabled={act.busy}
                onClick={async () => {
                  const reason = await dialog.ask({
                    title: `Cancel order #${o.order_number}?`,
                    message: o.payment_status === "paid" ? "The payment will be marked as refunded." : undefined,
                    confirmLabel: "Cancel order",
                    danger: true,
                    input: { label: "Reason (optional, shown to the customer)", placeholder: "Out of stock, customer request…" },
                  });
                  if (reason !== null) act.cancel(o, reason);
                }}
              >
                Cancel order
              </button>
            )}
            {o.status === "completed" && (
              <div className="space-y-2 rounded-xl border border-line p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="accent-[var(--color-brand)]" />
                  Return ingredients to stock
                </label>
                <button
                  className="btn-danger w-full"
                  disabled={act.busy}
                  onClick={async () => {
                    const ok = await dialog.confirm({
                      title: `Refund ${peso(o.total)}?`,
                      message: `Order #${o.order_number} will be marked refunded and any points earned will be taken back.${restock ? " Ingredients will be returned to stock." : ""}`,
                      confirmLabel: "Refund order",
                      danger: true,
                    });
                    if (ok) act.refund(o, restock);
                  }}
                >
                  Refund order
                </button>
              </div>
            )}
            <PrintButton />
          </div>
        </div>
      </Modal>
      <PaymentModal
        open={payOpen}
        total={o.total}
        busy={act.busy}
        error={act.error}
        confirmLabel={next?.to === "completed" ? "Record payment & complete" : "Record payment"}
        initialMethod={o.payment_method as PaymentMethod}
        onClose={() => setPayOpen(false)}
        onConfirm={async (method, tendered) => {
          const ok = await act.pay(o, method, tendered);
          if (ok && next?.to === "completed") await act.advance(o, "completed");
          if (ok) setPayOpen(false);
        }}
      />
    </>
  );
}
