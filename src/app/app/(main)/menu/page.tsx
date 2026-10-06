"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { peso } from "@/lib/format";
import { Spinner } from "@/components/ui";
import type { MenuProduct } from "@/lib/services/catalog";

export default function MenuPage() {
  const { data } = useLive(() => api<{ categories: { id: number; name: string }[]; products: MenuProduct[] }>("/api/menu"), ["inventory", "orders"], 30000);
  const [cat, setCat] = useState<number | null>(null);
  if (!data) return <Spinner />;
  const shown = data.products.filter((p) => cat === null || p.category_id === cat);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Menu</h1>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {[{ id: null, name: "All" }, ...data.categories].map((c) => (
          <button
            key={c.id ?? "all"}
            onClick={() => setCat(c.id)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold ${cat === c.id ? "border-ink bg-ink text-white" : "border-line bg-card"}`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <ul className="space-y-3">
        {shown.map((p) => {
          const body = (
            <div className={`card flex items-center gap-4 p-4 ${p.sold_out ? "opacity-55" : ""}`}>
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-soft text-3xl">{p.emoji}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.name}</p>
                <p className="line-clamp-2 text-sm text-muted">{p.description}</p>
                <p className="mt-1 text-sm font-semibold">{p.sold_out ? <span className="text-bad">Sold out</span> : `${p.variants.length ? "from " : ""}${peso(p.base_price)}`}</p>
              </div>
            </div>
          );
          return <li key={p.id}>{p.sold_out ? <div aria-disabled>{body}</div> : <Link href={`/app/product/${p.id}`}>{body}</Link>}</li>;
        })}
      </ul>
    </div>
  );
}
