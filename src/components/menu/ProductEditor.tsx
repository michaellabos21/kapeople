"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { peso } from "@/lib/format";
import { ErrorNote, Modal } from "../ui";
import type { AdminProduct, MenuAdminData } from "./types";

const EMOJIS = ["☕", "🧊", "🥛", "🍵", "🍫", "🥐", "🍪", "🍞", "🥪", "🍝", "🍰", "🧁", "🍔", "🍟", "🥤", "🧋", "🍳", "🥗", "🍕", "🍩"];
const PRESETS = [
  { name: "Tall", factor: 0.8 },
  { name: "Grande", factor: 1 },
  { name: "Venti", factor: 1.25 },
];

interface SizeRow { id?: number; name: string; price: string; factor: string }

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function ProductEditor({ product, data, onClose, onSaved }: { product: AdminProduct | null; data: MenuAdminData; onClose: () => void; onSaved: () => void }) {
  const isNew = !product;
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState<number>(product?.category_id ?? data.categories[0]?.id ?? 0);
  const [emoji, setEmoji] = useState(product?.emoji ?? "☕");
  const [description, setDescription] = useState(product?.description ?? "");
  const [available, setAvailable] = useState(product?.available ?? true);
  const [hasSizes, setHasSizes] = useState((product?.variants.length ?? 0) > 0);
  const [price, setPrice] = useState(product && !product.variants.length ? String(product.base_price) : "");
  const [sizes, setSizes] = useState<SizeRow[]>(
    product?.variants.length
      ? product.variants.map((v) => ({ id: v.id, name: v.name, price: String(product.base_price + v.price_delta), factor: String(v.recipe_multiplier) }))
      : [{ name: "Regular", price: "", factor: "1" }],
  );
  const [defaultSize, setDefaultSize] = useState(Math.max(0, product?.variants.findIndex((v) => v.is_default) ?? 0));
  const [addonIds, setAddonIds] = useState<number[]>(product?.addon_ids ?? []);
  const [recipe, setRecipe] = useState(product?.recipe.map((r) => ({ ingredientId: r.ingredient_id, qty: String(r.qty), scales: r.scales })) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ingName = (id: number) => data.ingredients.find((i) => i.id === id);

  async function save() {
    setError(null);
    let basePrice: number;
    let variants: { id?: number; name: string; priceDelta: number; recipeMultiplier: number; isDefault: boolean }[] = [];
    if (hasSizes) {
      const prices = sizes.map((s) => num(s.price));
      if (sizes.length === 0 || prices.some((p) => Number.isNaN(p))) return setError("Enter a price for every size.");
      basePrice = Math.min(...prices); // the cheapest size is the product's base price
      variants = sizes.map((s, i) => ({ id: s.id, name: s.name, priceDelta: Math.round((prices[i] - basePrice) * 100) / 100, recipeMultiplier: num(s.factor) || 1, isDefault: i === defaultSize }));
    } else {
      basePrice = num(price);
      if (Number.isNaN(basePrice)) return setError("Enter a price.");
    }
    const body = {
      name, categoryId, emoji, description, basePrice, available, variants, addonIds,
      recipe: recipe.filter((r) => r.ingredientId).map((r) => ({ ingredientId: r.ingredientId, qty: num(r.qty), scales: r.scales })),
    };
    if (body.recipe.some((r) => !(r.qty > 0))) return setError("Enter an amount for every ingredient in the recipe.");
    setBusy(true);
    try {
      await api(isNew ? "/api/admin/products" : `/api/admin/products/${product!.id}`, body, isNew ? "POST" : "PUT");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const input = "input";
  return (
    <Modal open onClose={onClose} title={isNew ? "Add product" : `Edit ${product!.name}`} wide>
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div><label className="label" htmlFor="pe-name">Name</label><input id="pe-name" className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Iced Mocha" maxLength={80} /></div>
            <div>
              <label className="label" htmlFor="pe-cat">Category</label>
              <select id="pe-cat" className={input} value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
                {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="pe-desc">Description (shown to customers)</label>
            <input id="pe-desc" className={input} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Espresso with chocolate and steamed milk" />
          </div>
          <div>
            <span className="label">Icon</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {EMOJIS.map((e) => (
                <button key={e} type="button" aria-label={`Use ${e}`} aria-pressed={e === emoji} onClick={() => setEmoji(e)} className={`h-10 w-10 rounded-xl border text-xl ${e === emoji ? "border-brand bg-brand-soft" : "border-line bg-card"}`}>{e}</button>
              ))}
              <input aria-label="Custom icon" className="input !w-20 text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" /> On the menu (customers can order it)</label>
        </section>

        <section className="space-y-3 rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Price</h3>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasSizes} onChange={(e) => setHasSizes(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" /> Has sizes</label>
          </div>
          {!hasSizes ? (
            <div className="max-w-40"><label className="label" htmlFor="pe-price">Price (₱)</label><input id="pe-price" className={input} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="120" /></div>
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_110px_130px_70px_32px] gap-2 text-xs font-semibold uppercase tracking-wide text-muted sm:grid"><span>Size</span><span>Price (₱)</span><span title="How much of each ingredient this size uses compared with the recipe">Ingredients ×</span><span>Default</span><span /></div>
              {sizes.map((s, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_110px_130px_70px_32px] sm:items-center">
                  <input aria-label={`Size ${i + 1} name`} className={`${input} col-span-2 sm:col-span-1`} value={s.name} onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Grande" maxLength={40} />
                  <input aria-label={`Size ${i + 1} price`} className={input} inputMode="decimal" value={s.price} onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, "") } : x)))} placeholder="140" />
                  <input aria-label={`Size ${i + 1} ingredient amount`} className={input} inputMode="decimal" value={s.factor} onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, factor: e.target.value.replace(/[^\d.]/g, "") } : x)))} placeholder="1" />
                  <label className="flex items-center gap-1.5 text-sm"><input type="radio" name="default-size" checked={defaultSize === i} onChange={() => setDefaultSize(i)} className="accent-[var(--color-brand)]" /> Default</label>
                  <button type="button" aria-label={`Remove size ${i + 1}`} className="text-muted hover:text-bad" disabled={sizes.length === 1} onClick={() => { setSizes(sizes.filter((_, j) => j !== i)); setDefaultSize(0); }}>✕</button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary !py-1.5" onClick={() => setSizes([...sizes, { name: "", price: "", factor: "1" }])}>+ Add size</button>
                {PRESETS.map((p) => !sizes.some((s) => s.name.toLowerCase() === p.name.toLowerCase()) && (
                  <button key={p.name} type="button" className="btn-ghost !py-1.5" onClick={() => setSizes([...sizes.filter((s) => s.name || s.price), { name: p.name, price: "", factor: String(p.factor) }])}>+ {p.name}</button>
                ))}
              </div>
              <p className="text-xs text-muted">Enter the full price of each size. “Ingredients ×” scales the recipe for that size (1 = as written below).</p>
            </div>
          )}
        </section>

        {data.addons.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-semibold">Add-ons offered</h3>
            <div className="flex flex-wrap gap-2">
              {data.addons.map((a) => {
                const on = addonIds.includes(a.id);
                return (
                  <label key={a.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${on ? "border-brand bg-brand-soft" : "border-line bg-card"}`}>
                    <input type="checkbox" checked={on} onChange={() => setAddonIds(on ? addonIds.filter((x) => x !== a.id) : [...addonIds, a.id])} className="accent-[var(--color-brand)]" />
                    {a.name} <span className="text-muted">+{peso(a.price)}</span>
                  </label>
                );
              })}
            </div>
          </section>
        )}

        <section className="space-y-2 rounded-2xl border border-line p-4">
          <h3 className="font-semibold">Recipe <span className="text-sm font-normal text-muted">(optional)</span></h3>
          <p className="text-xs text-muted">What one serving uses. Stock is deducted automatically when an order is completed, and the item shows “sold out” when an ingredient runs out. Leave empty to sell without tracking stock.</p>
          {recipe.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_auto_32px] items-center gap-2">
              <select aria-label={`Ingredient ${i + 1}`} className={input} value={r.ingredientId || ""} onChange={(e) => setRecipe(recipe.map((x, j) => (j === i ? { ...x, ingredientId: Number(e.target.value) } : x)))}>
                <option value="">Choose ingredient…</option>
                {data.ingredients.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}
              </select>
              <input aria-label={`Ingredient ${i + 1} amount`} className={input} inputMode="decimal" placeholder={ingName(r.ingredientId)?.unit ?? "amount"} value={r.qty} onChange={(e) => setRecipe(recipe.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/[^\d.]/g, "") } : x)))} />
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs"><input type="checkbox" checked={r.scales} onChange={(e) => setRecipe(recipe.map((x, j) => (j === i ? { ...x, scales: e.target.checked } : x)))} className="accent-[var(--color-brand)]" /> grows with size</label>
              <button type="button" aria-label={`Remove ingredient ${i + 1}`} className="text-muted hover:text-bad" onClick={() => setRecipe(recipe.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="btn-secondary !py-1.5" onClick={() => setRecipe([...recipe, { ingredientId: 0, qty: "", scales: true }])}>+ Add ingredient</button>
          {data.ingredients.length === 0 && <p className="text-xs text-muted">No ingredients yet — add them under Inventory first.</p>}
        </section>

        <ErrorNote message={error} />
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={busy} onClick={save}>{busy ? "Saving…" : isNew ? "Add product" : "Save changes"}</button>
        </div>
      </div>
    </Modal>
  );
}
