"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import type { CartLine } from "@/lib/client/cart";
import { peso } from "@/lib/format";
import type { MenuProduct } from "@/lib/services/catalog";
import type { PaymentMethod } from "@/lib/config";
import { ProductConfigurator } from "@/components/ProductConfigurator";
import { PaymentModal } from "@/components/PaymentModal";
import { PrintButton, Receipt, type ReceiptOrder } from "@/components/Receipt";
import { ErrorNote, Modal, Spinner, Stepper, useToast } from "@/components/ui";

interface Customer { id: number; name: string; email: string; phone: string | null; points_balance: number }
type Line = CartLine & { key: string };

export default function SalesPage() {
  const toast = useToast();
  const { data: menu, reload } = useLive(() => api<{ categories: { id: number; name: string }[]; products: MenuProduct[] }>("/api/menu"), ["inventory", "orders"], 30000);
  const [cat, setCat] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [config, setConfig] = useState<MenuProduct | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [discount, setDiscount] = useState<{ kind: "percent" | "amount"; value: string }>({ kind: "percent", value: "" });
  const [useReward, setUseReward] = useState(false);
  const [completeNow, setCompleteNow] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(ReceiptOrder & { id: number }) | null>(null);
  const attempt = useRef(crypto.randomUUID());

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discValue = Number(discount.value) || 0;
  const disc = Math.min(subtotal, discount.kind === "percent" ? subtotal * (Math.min(discValue, 100) / 100) : discValue);
  const canReward = !!customer && customer.points_balance >= 100;
  const rew = useReward && canReward ? Math.min(50, subtotal - disc) : 0;
  const total = Math.max(0, subtotal - disc - rew);

  function addLine(l: Omit<CartLine, "key">) {
    const key = [l.productId, l.variantId, l.addons.map((a) => a.id).sort().join("."), l.notes ?? ""].join("|");
    setLines((cur) => {
      const hit = cur.find((x) => x.key === key);
      return hit ? cur.map((x) => (x.key === key ? { ...x, qty: x.qty + l.qty } : x)) : [...cur, { ...l, key }];
    });
  }
  function tap(p: MenuProduct) {
    if (p.sold_out) return toast(`${p.name}: ${p.sold_out_reason ?? "sold out"}`, "bad");
    if (p.variants.length || p.addons.length) setConfig(p);
    else addLine({ productId: p.id, name: p.name, emoji: p.emoji, variantId: null, variantName: null, addons: [], unitPrice: p.base_price, qty: 1 });
  }

  async function charge(method: PaymentMethod, tendered?: number) {
    setBusy(true);
    setError(null);
    try {
      const { order } = await api<{ order: ReceiptOrder & { id: number } }>("/api/orders", {
        items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, addonIds: l.addons.map((a) => a.id), qty: l.qty, notes: l.notes })),
        paymentMethod: method,
        tendered,
        customerId: customer?.id,
        manualDiscount: disc > 0 ? { kind: discount.kind, value: discValue } : undefined,
        rewardId: useReward && canReward ? 1 : undefined,
        completeNow,
        idempotencyKey: attempt.current,
      });
      attempt.current = crypto.randomUUID();
      setPayOpen(false);
      setDone(order);
      setLines([]);
      setCustomer(null);
      setDiscount({ kind: "percent", value: "" });
      setUseReward(false);
      void reload();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (!menu) return <Spinner />;
  const shown = menu.products.filter((p) => cat === null || p.category_id === cat);

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[1fr_340px] grid-rows-[minmax(0,1fr)_auto] md:grid-rows-1">
      <section className="flex min-h-0 flex-col">
        <div className="flex gap-2 overflow-x-auto border-b border-line px-4 py-3">
          {[{ id: null, name: "All" }, ...menu.categories].map((c) => (
            <button key={c.id ?? "all"} onClick={() => setCat(c.id)} className={`shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold ${cat === c.id ? "bg-ink text-white" : "bg-card border border-line"}`}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => (
            <button key={p.id} onClick={() => tap(p)} className={`card flex flex-col items-start p-4 text-left transition active:scale-[0.98] ${p.sold_out ? "opacity-50" : "hover:border-brand"}`}>
              <span className="text-3xl">{p.emoji}</span>
              <span className="mt-2 text-sm font-bold leading-tight">{p.name}</span>
              <span className="mt-1 text-sm text-muted">{p.sold_out ? <span className="font-semibold text-bad">{p.sold_out_reason}</span> : `${p.variants.length ? "from " : ""}${peso(p.base_price)}`}</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col border-t border-line bg-card md:border-l md:border-t-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display text-lg font-bold">New sale</h2>
          {lines.length > 0 && <button className="text-sm font-semibold text-muted" onClick={() => setLines([])}>Clear</button>}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {lines.length === 0 && <p className="py-10 text-center text-sm text-muted">Tap an item to start a sale.</p>}
          {lines.map((l) => (
            <div key={l.key} className="rounded-xl border border-line p-3">
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{l.name}{l.variantName ? ` · ${l.variantName}` : ""}</p>
                  {l.addons.map((a) => <p key={a.id} className="text-xs text-muted">+ {a.name}</p>)}
                  {l.notes && <p className="text-xs text-muted">“{l.notes}”</p>}
                </div>
                <span className="text-sm font-semibold">{peso(l.unitPrice * l.qty)}</span>
              </div>
              <div className="mt-2">
                <Stepper value={l.qty} min={1} onChange={(n) => setLines((cur) => (n <= 0 ? cur.filter((x) => x.key !== l.key) : cur.map((x) => (x.key === l.key ? { ...x, qty: n } : x))))} />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-line p-4">
          <CustomerPicker customer={customer} onPick={(c) => { setCustomer(c); setUseReward(false); }} />
          {canReward && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} className="accent-[var(--color-brand)]" />
              Redeem 100 pts for ₱50 off
            </label>
          )}
          <div className="flex items-center gap-2">
            <span className="label !mb-0 w-20">Discount</span>
            <select className="input !w-auto !py-1.5" value={discount.kind} onChange={(e) => setDiscount({ ...discount, kind: e.target.value as "percent" | "amount" })} aria-label="Discount type">
              <option value="percent">%</option>
              <option value="amount">₱</option>
            </select>
            <input className="input !py-1.5" inputMode="decimal" placeholder="0" aria-label="Discount value" value={discount.value} onChange={(e) => setDiscount({ ...discount, value: e.target.value.replace(/[^\d.]/g, "") })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={completeNow} onChange={(e) => setCompleteNow(e.target.checked)} className="accent-[var(--color-brand)]" />
            Hand over now (skip the queue)
          </label>
          <div className="space-y-0.5 text-sm">
            <div className="flex justify-between text-muted"><span>Subtotal</span><span>{peso(subtotal)}</span></div>
            {disc > 0 && <div className="flex justify-between text-ok"><span>Discount</span><span>−{peso(disc)}</span></div>}
            {rew > 0 && <div className="flex justify-between text-ok"><span>Reward</span><span>−{peso(rew)}</span></div>}
            <div className="flex justify-between pt-1 text-2xl font-bold"><span>Total</span><span>{peso(total)}</span></div>
          </div>
          <ErrorNote message={error && !payOpen ? error : null} />
          <button className="btn-primary w-full py-4 text-base" disabled={!lines.length} onClick={() => { setError(null); setPayOpen(true); }}>
            Charge {peso(total)}
          </button>
        </div>
      </aside>

      <Modal open={!!config} onClose={() => setConfig(null)} title={config?.name}>
        {config && (
          <ProductConfigurator product={config} onSubmit={(l) => { addLine(l); setConfig(null); }} />
        )}
      </Modal>
      <PaymentModal key={payOpen ? "open" : "closed"} open={payOpen} total={total} busy={busy} error={error} onClose={() => setPayOpen(false)} onConfirm={charge} />
      <Modal open={!!done} onClose={() => setDone(null)} title={done ? `Sale complete · #${done.order_number}` : ""}>
        {done && (
          <div className="space-y-4">
            {done.payments[0]?.change_given != null && done.payments[0].change_given > 0 && (
              <p className="rounded-2xl bg-ok-soft py-3 text-center text-xl font-bold text-ok">Change: {peso(done.payments[0].change_given)}</p>
            )}
            <Receipt order={done} />
            <div className="flex gap-2">
              <PrintButton />
              <button className="btn-primary flex-1" onClick={() => setDone(null)}>New sale</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CustomerPicker({ customer, onPick }: { customer: Customer | null; onPick: (c: Customer | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => api<{ customers: Customer[] }>(`/api/customers?q=${encodeURIComponent(q)}`).then((r) => setResults(r.customers)).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);
  const mem = useMemo(() => results, [results]);

  if (customer) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-brand-soft px-3 py-2 text-sm">
        <span><b>{customer.name}</b> · {customer.points_balance} pts</span>
        <button className="font-semibold text-muted" onClick={() => onPick(null)}>Remove</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input className="input !py-2" placeholder="Attach customer for points (name, email, phone)" value={q} onChange={(e) => setQ(e.target.value)} />
      {mem.length > 0 && (
        <ul className="absolute bottom-full z-10 mb-1 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg">
          {mem.map((c) => (
            <li key={c.id}>
              <button className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-soft" onClick={() => { onPick(c); setQ(""); }}>
                <b>{c.name}</b> <span className="text-muted">{c.email} · {c.points_balance} pts</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
