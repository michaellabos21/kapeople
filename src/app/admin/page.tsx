"use client";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { peso } from "@/lib/format";
import { ReportView } from "@/components/ReportView";
import { ToastProvider, useToast } from "@/components/ui";
import type { MenuProduct } from "@/lib/services/catalog";

export default function AdminPage() {
  return (
    <ToastProvider>
      <h1 className="font-display mb-4 text-3xl font-bold">Dashboard</h1>
      <ReportView extended />
      <MenuManager />
    </ToastProvider>
  );
}

function MenuManager() {
  const toast = useToast();
  const { data, reload } = useLive(() => api<{ products: MenuProduct[] }>("/api/menu"), ["inventory"], 30000);
  if (!data) return null;

  async function patch(id: number, body: object) {
    try {
      await api(`/api/products/${id}`, body, "PATCH");
      toast("Saved", "ok");
      void reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="font-display mb-3 text-2xl font-bold">Menu</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Product</th><th>Base price</th><th>Availability</th><th className="px-4 text-right">Switch</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.products.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5 font-semibold">{p.emoji} {p.name}</td>
                <td>
                  <input
                    aria-label={`${p.name} base price`}
                    className="input !w-24 !py-1"
                    defaultValue={p.base_price}
                    inputMode="decimal"
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v) && v !== p.base_price) void patch(p.id, { basePrice: v });
                    }}
                  />
                </td>
                <td>{p.available ? (p.sold_out ? <span className="font-semibold text-warn">{p.sold_out_reason}</span> : <span className="text-ok">On the menu</span>) : <span className="text-muted">Hidden ({peso(p.base_price)})</span>}</td>
                <td className="px-4 text-right">
                  <button className="btn-secondary !py-1 !text-xs" onClick={() => patch(p.id, { available: !p.available })}>{p.available ? "Turn off" : "Turn on"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
