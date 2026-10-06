"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { peso, qty } from "@/lib/format";
import { LoadState } from "./ui";

type Range = "today" | "week" | "month";
interface Report {
  sales: number;
  orders: number;
  average_order: number;
  refunds: { count: number; amount: number };
  by_payment: { method: string; orders: number; amount: number }[];
  by_source: { source: string; orders: number; amount: number }[];
  best_sellers: { name: string; qty: number; revenue: number }[];
  daily: { day: string; sales: number; orders: number }[];
  customers: { total: number; new_customers: number; repeat_customers: number };
  loyalty: { issued: number; redeemed: number };
  low_stock: { id: number; name: string; unit: string; current_qty: number; low_stock_threshold: number }[];
}

const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="card p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
    <p className="font-display mt-1 text-3xl font-bold tabular-nums">{value}</p>
    {sub && <p className="text-xs text-muted">{sub}</p>}
  </div>
);

function Bars({ rows, fmt }: { rows: { label: string; value: number; note?: string }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="mb-1 flex justify-between"><span className="font-medium capitalize">{r.label}{r.note && <span className="text-muted"> · {r.note}</span>}</span><span className="tabular-nums font-semibold">{fmt(r.value)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function ReportView({ extended = false }: { extended?: boolean }) {
  const [range, setRange] = useState<Range>("today");
  const { data: r, error, reload } = useLive(() => api<Report>(`/api/reports?range=${range}`), ["orders", "inventory"], 30000, range);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {RANGES.map((x) => (
          <button key={x.id} onClick={() => setRange(x.id)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${range === x.id ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{x.label}</button>
        ))}
      </div>
      {!r ? <LoadState error={error} onRetry={reload} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Sales" value={peso(r.sales)} sub="completed orders" />
            <Stat label="Orders" value={String(r.orders)} />
            <Stat label="Average order" value={peso(r.average_order)} />
            <Stat label="Refunds" value={peso(r.refunds.amount)} sub={`${r.refunds.count} order${r.refunds.count === 1 ? "" : "s"}`} />
          </div>

          {r.daily.length > 1 && (
            <section className="card p-4">
              <h2 className="mb-3 font-semibold">Sales by day</h2>
              <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Daily sales bar chart">
                {r.daily.map((d) => {
                  const max = Math.max(...r.daily.map((x) => x.sales));
                  return (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${peso(d.sales)} (${d.orders} orders)`}>
                      <div className="w-full rounded-t-md bg-brand" style={{ height: `${Math.max(4, (d.sales / max) * 100)}%` }} />
                      <span className="text-[10px] text-muted">{d.day.slice(8)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-4">
              <h2 className="mb-3 font-semibold">Payment breakdown</h2>
              {r.by_payment.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : <Bars fmt={peso} rows={r.by_payment.map((p) => ({ label: p.method, value: p.amount, note: `${p.orders} order${p.orders === 1 ? "" : "s"}` }))} />}
              {r.by_source.length > 0 && (
                <>
                  <h3 className="mb-2 mt-5 text-sm font-semibold text-muted">By channel</h3>
                  <Bars fmt={peso} rows={r.by_source.map((p) => ({ label: p.source === "app" ? "Customer app" : "POS walk-in", value: p.amount, note: `${p.orders}` }))} />
                </>
              )}
            </section>

            <section className="card p-4">
              <h2 className="mb-3 font-semibold">Best sellers</h2>
              {r.best_sellers.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {r.best_sellers.map((b, i) => (
                      <tr key={b.name}><td className="w-6 py-2 text-muted">{i + 1}</td><td className="font-medium">{b.name}</td><td className="text-right tabular-nums">{b.qty} sold</td><td className="text-right tabular-nums text-muted">{peso(b.revenue)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="card p-4">
            <h2 className="mb-3 font-semibold">Low stock {r.low_stock.length > 0 && <span className="ml-1 rounded-full bg-bad-soft px-2 py-0.5 text-xs font-bold text-bad">{r.low_stock.length}</span>}</h2>
            {r.low_stock.length === 0 ? <p className="text-sm text-muted">Everything is above its low-stock level.</p> : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {r.low_stock.map((i) => (
                  <li key={i.id} className="flex items-center justify-between rounded-xl bg-warn-soft px-3 py-2 text-sm"><span className="font-semibold">{i.name}</span><span>{qty(i.current_qty, i.unit)} <span className="text-muted">/ {qty(i.low_stock_threshold)}</span></span></li>
                ))}
              </ul>
            )}
          </section>

          {extended && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="Customers" value={String(r.customers.total)} />
              <Stat label="New" value={String(r.customers.new_customers)} sub={`this ${range === "today" ? "day" : range}`} />
              <Stat label="Repeat" value={String(r.customers.repeat_customers)} sub="2+ orders, all time" />
              <Stat label="Points issued" value={String(r.loyalty.issued)} />
              <Stat label="Points redeemed" value={String(r.loyalty.redeemed)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
