"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { dateTime, peso } from "@/lib/format";
import { CustomerDetailModal } from "@/components/CustomerDetail";
import { LoadState, ToastProvider } from "@/components/ui";

interface Row { not_activated: boolean; id: number; name: string; email: string; phone: string | null; points_balance: number; active: boolean; created_at: string; orders: number; spent: number; last_order: string | null }

const SORTS = [
  { v: "recent", l: "Newest" },
  { v: "spent", l: "Top spenders" },
  { v: "orders", l: "Most orders" },
  { v: "points", l: "Most points" },
  { v: "last_order", l: "Recently active" },
  { v: "name", l: "Name A–Z" },
];
const SIZE = 25;

export default function CustomersPage() {
  return (
    <ToastProvider>
      <Inner />
    </ToastProvider>
  );
}

function Inner() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ sort, page: String(page), size: String(SIZE) });
  if (debounced.trim()) qs.set("q", debounced.trim());
  const { data, error, reload } = useLive(() => api<{ customers: Row[]; total: number }>(`/api/admin/customers?${qs}`), [], 60000, qs.toString());
  const pages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Customers</h1>
          <p className="text-sm text-muted">{data ? `${data.total} customer${data.total === 1 ? "" : "s"}` : " "}</p>
        </div>
        <a href="/api/admin/customers/export" className="btn-secondary">Export CSV</a>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input !w-72" placeholder="Search name, email or phone" aria-label="Search customers" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input !w-auto" aria-label="Sort customers" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
      </div>

      {!data ? <LoadState error={error} onRetry={reload} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-3">Customer</th><th>Phone</th><th className="text-right">Orders</th><th className="text-right">Spent</th><th className="text-right">Points</th><th className="pl-6">Last order</th><th className="px-4">Joined</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.customers.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c.id)} className={`cursor-pointer hover:bg-brand-soft/50 ${c.active ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{c.name}{!c.active && <span className="ml-2 rounded bg-bad-soft px-1.5 py-0.5 text-[10px] font-bold text-bad">BLOCKED</span>}{c.not_activated && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold text-warn">NOT ACTIVATED</span>}</p>
                    <p className="text-xs text-muted">{c.email}</p>
                  </td>
                  <td>{c.phone ?? "—"}</td>
                  <td className="text-right tabular-nums">{c.orders}</td>
                  <td className="text-right tabular-nums font-semibold">{peso(c.spent)}</td>
                  <td className="text-right tabular-nums">{c.points_balance}</td>
                  <td className="pl-6 text-muted">{c.last_order ? dateTime(c.last_order) : "—"}</td>
                  <td className="px-4 text-muted">{new Date(c.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</td>
                </tr>
              ))}
              {data.customers.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-muted">{debounced ? "No customers match that search." : "No customers yet."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {data && pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
          <span className="text-muted">Page {page} of {pages}</span>
          <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}

      {open !== null && <CustomerDetailModal id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
