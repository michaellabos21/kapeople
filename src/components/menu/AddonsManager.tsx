"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { peso } from "@/lib/format";
import { ErrorNote, Modal, useDialog } from "../ui";
import type { Addon, MenuAdminData } from "./types";

const blank = { name: "", price: "", available: true, replaces: "", replacement: "", extras: [] as { ingredientId: number; qty: string }[] };

export function AddonsManager({ data, onClose, onChanged }: { data: MenuAdminData; onClose: () => void; onChanged: () => void }) {
  const dialog = useDialog();
  const [editing, setEditing] = useState<{ id: number | null; f: typeof blank } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ing = (id: number | null) => data.ingredients.find((i) => i.id === id)?.name;

  const edit = (a: Addon | null) =>
    setEditing({
      id: a?.id ?? null,
      f: a
        ? { name: a.name, price: String(a.price), available: a.available, replaces: a.replaces_ingredient_id ? String(a.replaces_ingredient_id) : "", replacement: a.replacement_ingredient_id ? String(a.replacement_ingredient_id) : "", extras: a.extras.map((e) => ({ ingredientId: e.ingredient_id, qty: String(e.qty) })) }
        : blank,
    });

  async function save() {
    if (!editing) return;
    const { id, f } = editing;
    setError(null);
    try {
      const body = {
        name: f.name, price: Number(f.price), available: f.available,
        replacesIngredientId: f.replaces ? Number(f.replaces) : null,
        replacementIngredientId: f.replacement ? Number(f.replacement) : null,
        extras: f.extras.filter((x) => x.ingredientId).map((x) => ({ ingredientId: x.ingredientId, qty: Number(x.qty) })),
      };
      if (Number.isNaN(body.price)) throw new Error("Enter a price (0 if it's free).");
      await api(id ? `/api/admin/addons/${id}` : "/api/admin/addons", body, id ? "PUT" : "POST");
      setEditing(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const set = (p: Partial<typeof blank>) => setEditing(editing && { ...editing, f: { ...editing.f, ...p } });

  return (
    <Modal open onClose={onClose} title={editing ? (editing.id ? "Edit add-on" : "New add-on") : "Add-ons"} wide>
      {!editing ? (
        <div className="space-y-4">
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {data.addons.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No add-ons yet.</li>}
            {data.addons.map((a) => (
              <li key={a.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                <span className="flex-1"><b>{a.name}</b> <span className="text-muted">+{peso(a.price)}</span>{!a.available && <span className="ml-2 rounded bg-line px-1.5 py-0.5 text-[10px] font-bold text-muted">OFF</span>}
                  {a.replaces_ingredient_id && <span className="block text-xs text-muted">uses {ing(a.replacement_ingredient_id)} instead of {ing(a.replaces_ingredient_id)}</span>}</span>
                <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => edit(a)}>Edit</button>
                <button className="btn-ghost !px-2 !py-1 !text-xs text-bad" onClick={async () => {
                  if (await dialog.confirm({ title: `Delete ${a.name}?`, message: "It's removed from every product. Past orders keep their record of it.", confirmLabel: "Delete", danger: true })) {
                    try { await api(`/api/admin/addons/${a.id}`, undefined, "DELETE"); onChanged(); } catch (e) { setError((e as Error).message); }
                  }
                }}>Delete</button>
              </li>
            ))}
          </ul>
          <ErrorNote message={error} />
          <button className="btn-primary w-full" onClick={() => edit(null)}>+ New add-on</button>
          <p className="text-xs text-muted">Attach add-ons to products from each product&apos;s edit form.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div><label className="label" htmlFor="ad-name">Name</label><input id="ad-name" className="input" value={editing.f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Extra Shot" maxLength={60} /></div>
            <div><label className="label" htmlFor="ad-price">Price (₱)</label><input id="ad-price" className="input" inputMode="decimal" value={editing.f.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, "") })} placeholder="25" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.f.available} onChange={(e) => set({ available: e.target.checked })} className="accent-[var(--color-brand)]" /> Available</label>

          <fieldset className="space-y-2 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold">Swaps an ingredient <span className="font-normal text-muted">(optional, e.g. oat milk instead of milk)</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <select aria-label="Replaces" className="input" value={editing.f.replaces} onChange={(e) => set({ replaces: e.target.value })}><option value="">Doesn&apos;t replace anything</option>{data.ingredients.map((i) => <option key={i.id} value={i.id}>Replaces {i.name}</option>)}</select>
              <select aria-label="Uses instead" className="input" value={editing.f.replacement} onChange={(e) => set({ replacement: e.target.value })}><option value="">Uses instead…</option>{data.ingredients.map((i) => <option key={i.id} value={i.id}>Uses {i.name}</option>)}</select>
            </div>
          </fieldset>

          <fieldset className="space-y-2 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold">Extra ingredients used <span className="font-normal text-muted">(optional, e.g. 0.009 kg beans for an extra shot)</span></legend>
            {editing.f.extras.map((x, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_32px] gap-2">
                <select aria-label={`Extra ingredient ${i + 1}`} className="input" value={x.ingredientId || ""} onChange={(e) => set({ extras: editing.f.extras.map((y, j) => (j === i ? { ...y, ingredientId: Number(e.target.value) } : y)) })}><option value="">Choose…</option>{data.ingredients.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}</select>
                <input aria-label={`Extra amount ${i + 1}`} className="input" inputMode="decimal" value={x.qty} onChange={(e) => set({ extras: editing.f.extras.map((y, j) => (j === i ? { ...y, qty: e.target.value.replace(/[^\d.]/g, "") } : y)) })} />
                <button type="button" aria-label={`Remove extra ${i + 1}`} className="text-muted hover:text-bad" onClick={() => set({ extras: editing.f.extras.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button type="button" className="btn-secondary !py-1.5" onClick={() => set({ extras: [...editing.f.extras, { ingredientId: 0, qty: "" }] })}>+ Add ingredient</button>
          </fieldset>

          <ErrorNote message={error} />
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => { setEditing(null); setError(null); }}>Back</button>
            <button className="btn-primary flex-1" onClick={save}>Save add-on</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
