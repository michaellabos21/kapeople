"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { dateTime, peso } from "@/lib/format";
import type { OrderStatus } from "@/lib/config";
import { ErrorNote, LoadState, Modal, StatusBadge, useDialog, useToast } from "./ui";

interface Detail {
  customer: { id: number; name: string; email: string; phone: string | null; points_balance: number; active: boolean; staff_notes: string | null; created_at: string };
  stats: { orders: number; spent: number; cancelled: number; refunded: number; last_order: string | null };
  orders: { id: number; order_number: number; status: OrderStatus; total: number; payment_method: string; source: string; created_at: string }[];
  loyalty: { id: number; type: string; points: number; balance_after: number; note: string; created_at: string }[];
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-card p-3">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
    <p className="font-display text-xl font-bold tabular-nums">{value}</p>
  </div>
);

export function CustomerDetailModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const dialog = useDialog();
  const { data, error: loadError, reload } = useLive(() => api<Detail>(`/api/admin/customers/${id}`), [], 60000);
  const [notes, setNotes] = useState<string | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast(ok, "ok");
      await reload();
      onChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const c = data?.customer;
  return (
    <Modal open onClose={onClose} title={c?.name ?? "Customer"} wide>
      {!data || !c ? <LoadState error={loadError} onRetry={reload} /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <p>{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
              <p className="text-muted">Joined {new Date(c.created_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}</p>
            </div>
            <button className={c.active ? "btn-secondary text-bad" : "btn-primary"} disabled={busy}
              onClick={async () => {
                if (c.active && !(await dialog.confirm({ title: `Block ${c.name}?`, message: "They will be signed out and unable to sign in. Their orders and points are kept.", confirmLabel: "Block account", danger: true }))) return;
                void run(() => api(`/api/admin/customers/${id}`, { active: !c.active }, "PATCH"), c.active ? "Customer blocked" : "Customer restored");
              }}>
              {c.active ? "Block account" : "Restore account"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Completed orders" value={String(data.stats.orders)} />
            <Stat label="Total spent" value={peso(data.stats.spent)} />
            <Stat label="Points" value={String(c.points_balance)} />
            <Stat label="Cancelled / refunded" value={`${data.stats.cancelled} / ${data.stats.refunded}`} />
          </div>

          <section>
            <label className="label" htmlFor="cd-notes">Internal notes (admins only)</label>
            <textarea id="cd-notes" className="input min-h-20" maxLength={2000} value={notes ?? c.staff_notes ?? ""} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, preferences, anything staff should know" />
            {notes !== null && notes !== (c.staff_notes ?? "") && (
              <button className="btn-secondary mt-2" disabled={busy} onClick={async () => (await run(() => api(`/api/admin/customers/${id}`, { notes }, "PATCH"), "Notes saved")) && setNotes(null)}>Save notes</button>
            )}
          </section>

          <section className="rounded-xl border border-line p-3">
            <h3 className="mb-2 text-sm font-semibold">Adjust points</h3>
            <div className="flex flex-wrap gap-2">
              <input className="input !w-28" inputMode="numeric" placeholder="+50 or −20" aria-label="Points change" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d+-]/g, ""))} />
              <input className="input flex-1" placeholder="Reason (required, kept in the history)" aria-label="Reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn-primary" disabled={busy || !delta || !reason.trim()} onClick={async () => (await run(() => api(`/api/admin/customers/${id}/points`, { points: Number(delta), reason }), "Points updated")) && (setDelta(""), setReason(""))}>Apply</button>
            </div>
          </section>
          <ErrorNote message={error} />

          <div className="grid gap-5 md:grid-cols-2">
            <section>
              <h3 className="mb-2 text-sm font-semibold">Recent orders</h3>
              {data.orders.length === 0 ? <p className="text-sm text-muted">No orders yet.</p> : (
                <ul className="divide-y divide-line rounded-xl border border-line bg-card text-sm">
                  {data.orders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div><p className="font-semibold">#{o.order_number} <span className="font-normal text-muted">· {o.source === "app" ? "App" : "POS"}</span></p><p className="text-xs text-muted">{dateTime(o.created_at)}</p></div>
                      <div className="text-right"><StatusBadge status={o.status} /><p className="mt-0.5 tabular-nums">{peso(o.total)}</p></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Points history</h3>
              {data.loyalty.length === 0 ? <p className="text-sm text-muted">No points activity.</p> : (
                <ul className="divide-y divide-line rounded-xl border border-line bg-card text-sm">
                  {data.loyalty.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0"><p className="truncate">{l.note}</p><p className="text-xs text-muted">{dateTime(l.created_at)} · balance {l.balance_after}</p></div>
                      <span className={`font-bold tabular-nums ${l.points >= 0 ? "text-ok" : "text-bad"}`}>{l.points > 0 ? "+" : ""}{l.points}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </Modal>
  );
}
