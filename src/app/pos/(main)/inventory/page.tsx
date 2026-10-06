"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { dateTime, qty } from "@/lib/format";
import { ErrorNote, Modal, Spinner, useToast } from "@/components/ui";

interface Ing { id: number; name: string; unit: string; current_qty: number; reserved_qty: number; available_qty: number; low_stock_threshold: number; low: boolean }
interface Move { id: number; ingredient_name: string; unit: string; type: string; qty_change: number; balance_after: number; note: string | null; user_name: string | null; created_at: string }
type Kind = "stock_in" | "stock_out" | "waste" | "adjustment";

const KIND: Record<Kind, { label: string; field: string; hint: string }> = {
  stock_in: { label: "Stock in", field: "Quantity received", hint: "Delivery, purchase…" },
  stock_out: { label: "Stock out", field: "Quantity removed", hint: "Transfer, staff use…" },
  waste: { label: "Waste / spoilage", field: "Quantity wasted", hint: "Expired, spilled…" },
  adjustment: { label: "Adjust (recount)", field: "Counted quantity on hand", hint: "Result of a stock count" },
};

export default function InventoryPage() {
  const toast = useToast();
  const { data, reload } = useLive(async () => {
    const [i, m, me] = await Promise.all([
      api<{ ingredients: Ing[] }>("/api/inventory"),
      api<{ movements: Move[] }>("/api/inventory/movements"),
      api<{ user: { role: string } }>("/api/auth/me"),
    ]);
    return { ingredients: i.ingredients, movements: m.movements, admin: me.user.role === "admin" };
  }, ["inventory", "orders"], 20000);
  const [action, setAction] = useState<{ ing: Ing; kind: Kind } | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"stock" | "log">("stock");
  if (!data) return <Spinner />;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        {(["stock", "log"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${view === v ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{v === "stock" ? "Stock levels" : "Movement log"}</button>
        ))}
        {data.ingredients.some((i) => i.low) && <span className="rounded-full bg-bad-soft px-3 py-1 text-xs font-bold text-bad">{data.ingredients.filter((i) => i.low).length} low</span>}
        <span className="flex-1" />
        {data.admin && <button className="btn-secondary" onClick={() => setAdding(true)}>+ Ingredient</button>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-line bg-card">
        {view === "stock" ? (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-3">Ingredient</th><th className="text-right">On hand</th><th className="text-right">Reserved</th><th className="text-right">Low at</th><th className="pl-6">Status</th><th className="px-4 text-right">Update</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.ingredients.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-3 font-semibold">{i.name}</td>
                  <td className="text-right tabular-nums">{qty(i.current_qty, i.unit)}</td>
                  <td className="text-right tabular-nums text-muted">{i.reserved_qty > 0 ? qty(i.reserved_qty, i.unit) : "—"}</td>
                  <td className="text-right tabular-nums text-muted">{qty(i.low_stock_threshold, i.unit)}</td>
                  <td className="pl-6">{i.current_qty <= 0 ? <span className="rounded-full bg-bad px-2.5 py-0.5 text-xs font-bold text-white">Out</span> : i.low ? <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold text-warn">Low</span> : <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-bold text-ok">OK</span>}</td>
                  <td className="space-x-1 px-4 py-2 text-right">
                    {(["stock_in", "stock_out", "waste", "adjustment"] as const).map((k) => (
                      <button key={k} className="btn-secondary !px-2.5 !py-1 !text-xs" onClick={() => setAction({ ing: i, kind: k })}>
                        {k === "stock_in" ? "+ In" : k === "stock_out" ? "− Out" : k === "waste" ? "Waste" : "Count"}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-3">When</th><th>Ingredient</th><th>Type</th><th className="text-right">Change</th><th className="text-right">Balance</th><th className="px-4">Note</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.movements.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 text-muted">{dateTime(m.created_at)}</td>
                  <td className="font-semibold">{m.ingredient_name}</td>
                  <td className="capitalize">{m.type.replace("_", " ")}</td>
                  <td className={`text-right tabular-nums font-semibold ${m.qty_change >= 0 ? "text-ok" : "text-bad"}`}>{m.qty_change > 0 ? "+" : ""}{qty(m.qty_change)} {m.unit}</td>
                  <td className="text-right tabular-nums">{qty(m.balance_after)}</td>
                  <td className="px-4 text-muted">{m.note ?? ""}{m.user_name ? ` · ${m.user_name}` : ""}</td>
                </tr>
              ))}
              {data.movements.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted">No movements yet. Completed orders will appear here.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {action && <MovementModal key={action.ing.id + action.kind} {...action} onClose={() => setAction(null)} onDone={() => { setAction(null); toast("Stock updated", "ok"); void reload(); }} />}
      {adding && <AddIngredientModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast("Ingredient added", "ok"); void reload(); }} />}
    </div>
  );
}

function MovementModal({ ing, kind, onClose, onDone }: { ing: Ing; kind: Kind; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const k = KIND[kind];
  useEffect(() => setError(null), [value]);
  return (
    <Modal open onClose={onClose} title={`${k.label} · ${ing.name}`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(`/api/inventory/${ing.id}/movement`, { type: kind, qty: Number(value), note });
            onDone();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-muted">On hand: {qty(ing.current_qty, ing.unit)}</p>
        <div>
          <label className="label" htmlFor="mv-qty">{k.field} ({ing.unit})</label>
          <input id="mv-qty" className="input text-lg" inputMode="decimal" autoFocus required value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        <div>
          <label className="label" htmlFor="mv-note">Note</label>
          <input id="mv-note" className="input" placeholder={k.hint} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <ErrorNote message={error} />
        <button className="btn-primary w-full" disabled={busy || value === ""}>{busy ? "Saving…" : "Save"}</button>
      </form>
    </Modal>
  );
}

function AddIngredientModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="New ingredient">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api("/api/inventory", { name: f.get("name"), unit: f.get("unit"), qty: Number(f.get("qty") || 0), lowStock: Number(f.get("low") || 0) });
            onDone();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <div><label className="label" htmlFor="n">Name</label><input id="n" name="name" className="input" required /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label" htmlFor="u">Unit</label><input id="u" name="unit" className="input" placeholder="kg, L, pcs" required /></div>
          <div><label className="label" htmlFor="q">Opening qty</label><input id="q" name="qty" className="input" inputMode="decimal" defaultValue="0" /></div>
          <div><label className="label" htmlFor="l">Low at</label><input id="l" name="low" className="input" inputMode="decimal" defaultValue="0" /></div>
        </div>
        <ErrorNote message={error} />
        <button className="btn-primary w-full">Add ingredient</button>
      </form>
    </Modal>
  );
}
