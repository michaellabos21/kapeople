"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { peso } from "@/lib/format";
import { AddonsManager } from "@/components/menu/AddonsManager";
import { CategoriesManager } from "@/components/menu/CategoriesManager";
import { ProductEditor } from "@/components/menu/ProductEditor";
import type { AdminProduct, MenuAdminData } from "@/components/menu/types";
import { LoadState, ToastProvider, useDialog, useToast } from "@/components/ui";

export default function MenuPage() {
  return (
    <ToastProvider>
      <Inner />
    </ToastProvider>
  );
}

function Inner() {
  const toast = useToast();
  const dialog = useDialog();
  const { data, error, reload } = useLive(() => api<MenuAdminData>("/api/admin/menu"), ["inventory"], 60000);
  const [cat, setCat] = useState<number | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [editor, setEditor] = useState<{ product: AdminProduct | null } | null>(null);
  const [panel, setPanel] = useState<"categories" | "addons" | null>(null);

  if (!data) return <LoadState error={error} onRetry={reload} />;
  const hiddenCount = data.products.filter((p) => p.archived).length;
  const shown = data.products.filter((p) => (showHidden ? p.archived : !p.archived) && (cat === null || p.category_id === cat));
  const catName = (id: number) => data.categories.find((c) => c.id === id)?.name ?? "—";

  async function patch(p: AdminProduct, body: object, ok: string) {
    try {
      await api(`/api/admin/products/${p.id}`, body, "PATCH");
      toast(ok, "ok");
      void reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }

  function priceLabel(p: AdminProduct) {
    if (!p.variants.length) return peso(p.base_price);
    const prices = p.variants.map((v) => p.base_price + v.price_delta);
    return `${peso(Math.min(...prices))}–${peso(Math.max(...prices))}`;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Menu</h1>
          <p className="text-sm text-muted">Add and edit the products customers see in the app and you ring up on the POS.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setPanel("categories")}>Categories</button>
          <button className="btn-secondary" onClick={() => setPanel("addons")}>Add-ons</button>
          <button className="btn-primary" onClick={() => setEditor({ product: null })}>+ Add product</button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[{ id: null, name: "All" }, ...data.categories].map((c) => (
          <button key={c.id ?? "all"} onClick={() => setCat(c.id)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${cat === c.id ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{c.name}</button>
        ))}
        {hiddenCount > 0 && (
          <label className="ml-auto flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="accent-[var(--color-brand)]" /> Show hidden ({hiddenCount})</label>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Product</th><th>Category</th><th>Price</th><th>Sizes</th><th>Status</th><th className="px-4 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((p) => (
              <tr key={p.id} className={p.archived || !p.available ? "opacity-70" : ""}>
                <td className="px-4 py-2.5"><span aria-hidden="true" className="mr-2 text-xl">{p.emoji}</span><b>{p.name}</b>{p.description && <span className="block pl-8 text-xs text-muted">{p.description}</span>}</td>
                <td>{catName(p.category_id)}</td>
                <td className="tabular-nums">{priceLabel(p)}</td>
                <td className="text-muted">{p.variants.length ? p.variants.map((v) => v.name).join(", ") : "—"}</td>
                <td>{p.archived ? <span className="font-semibold text-muted">Hidden</span> : p.available ? <span className="font-semibold text-ok">On the menu</span> : <span className="font-semibold text-warn">Switched off</span>}</td>
                <td className="space-x-1 whitespace-nowrap px-4 py-2 text-right">
                  {!p.archived && <button className="btn-secondary !px-2.5 !py-1 !text-xs" onClick={() => setEditor({ product: p })}>Edit</button>}
                  {!p.archived && (
                    <button className="btn-secondary !px-2.5 !py-1 !text-xs" onClick={async () => {
                      try { await api("/api/products/" + p.id, { available: !p.available }, "PATCH"); toast(p.available ? `${p.name} switched off` : `${p.name} is on the menu`, "ok"); void reload(); } catch (e) { toast((e as Error).message, "bad"); }
                    }}>{p.available ? "Switch off" : "Switch on"}</button>
                  )}
                  {p.archived ? (
                    <button className="btn-secondary !px-2.5 !py-1 !text-xs" onClick={() => patch(p, { archived: false }, `${p.name} restored (still switched off)`)}>Restore</button>
                  ) : (
                    <button className="btn-ghost !px-2.5 !py-1 !text-xs text-bad" onClick={async () => {
                      if (await dialog.confirm({ title: `Hide ${p.name}?`, message: p.has_orders ? "It disappears from the menu and POS. Past orders keep their record of it, and you can restore it later." : "It disappears from the menu and POS. You can restore it later.", confirmLabel: "Hide product", danger: true })) await patch(p, { archived: true }, `${p.name} hidden`);
                    }}>Hide</button>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted">{showHidden ? "No hidden products." : "No products here yet — add your first one."}</td></tr>}
          </tbody>
        </table>
      </div>

      {editor && <ProductEditor key={editor.product?.id ?? "new"} product={editor.product} data={data} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); toast("Saved", "ok"); void reload(); }} />}
      {panel === "categories" && <CategoriesManager data={data} onClose={() => setPanel(null)} onChanged={() => void reload()} />}
      {panel === "addons" && <AddonsManager data={data} onClose={() => setPanel(null)} onChanged={() => void reload()} />}
    </div>
  );
}
