"use client";
import { useState } from "react";
import type { MenuProduct } from "@/lib/services/catalog";
import type { CartLine } from "@/lib/client/cart";
import { peso } from "@/lib/format";
import { Stepper } from "./ui";

/** Size, add-ons, quantity and notes for one product. Shared by the customer app and the POS. */
export function ProductConfigurator({
  product,
  submitLabel = "Add to order",
  onSubmit,
}: {
  product: MenuProduct;
  submitLabel?: string;
  onSubmit: (line: Omit<CartLine, "key">) => void;
}) {
  const [variantId, setVariantId] = useState<number | null>(
    product.variants.find((v) => v.is_default)?.id ?? product.variants[0]?.id ?? null,
  );
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");

  const variant = product.variants.find((v) => v.id === variantId);
  const addons = product.addons.filter((a) => addonIds.includes(a.id) && !a.sold_out);
  const unit = product.base_price + (variant?.price_delta ?? 0) + addons.reduce((s, a) => s + a.price, 0);

  return (
    <div className="space-y-5">
      {product.variants.length > 0 && (
        <fieldset>
          <legend className="label">Size</legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={v.id === variantId}
                onClick={() => setVariantId(v.id)}
                className={`rounded-xl border px-4 py-2.5 text-left text-sm transition ${v.id === variantId ? "border-brand bg-brand-soft font-semibold" : "border-line bg-card"}`}
              >
                <span className="block">{v.name}</span>
                <span className="text-xs text-muted">{peso(product.base_price + v.price_delta)}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {product.addons.length > 0 && (
        <fieldset>
          <legend className="label">Add-ons</legend>
          <div className="space-y-2">
            {product.addons.filter((a) => a.available).map((a) => {
              const on = addonIds.includes(a.id);
              return (
                <label key={a.id} className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm ${a.sold_out ? "border-line bg-card opacity-70" : on ? "border-brand bg-brand-soft" : "border-line bg-card"}`}>
                  <span className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      disabled={a.sold_out}
                      checked={on && !a.sold_out}
                      onChange={() => setAddonIds((c) => (on ? c.filter((x) => x !== a.id) : [...c, a.id]))}
                      className="h-4 w-4 accent-[var(--color-brand)]"
                    />
                    {a.name}
                  </span>
                  <span className={a.sold_out ? "font-semibold text-bad" : "text-muted"}>{a.sold_out ? a.sold_out_reason ?? "Sold out" : `+${peso(a.price)}`}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div>
        <label className="label" htmlFor="cfg-notes">Notes (optional)</label>
        <input id="cfg-notes" className="input" maxLength={200} placeholder="Less ice, no sugar…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex items-center gap-3">
        <Stepper value={qty} onChange={setQty} />
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={() =>
            onSubmit({
              productId: product.id,
              name: product.name,
              emoji: product.emoji,
              variantId,
              variantName: variant?.name ?? null,
              addons: addons.map((a) => ({ id: a.id, name: a.name, price: a.price })),
              unitPrice: unit,
              qty,
              notes: notes.trim() || undefined,
            })
          }
        >
          {submitLabel} · {peso(unit * qty)}
        </button>
      </div>
    </div>
  );
}
