"use client";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { dateTime, peso } from "@/lib/format";
import { Spinner } from "@/components/ui";
import { PESOS_PER_POINT } from "@/lib/config";

interface Loyalty {
  balance: number;
  history: { id: number; type: string; points: number; balance_after: number; note: string; created_at: string }[];
  rewards: { id: number; name: string; points_cost: number; discount_amount: number }[];
}

export default function RewardsPage() {
  const { data } = useLive(() => api<Loyalty>("/api/loyalty"));
  if (!data) return <Spinner />;
  const r = data.rewards[0];
  const ready = r && data.balance >= r.points_cost;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">Rewards</h1>
      <div className="rounded-2xl bg-ink p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Point balance</p>
        <p className="font-display text-5xl font-bold">{data.balance}</p>
        {r && (
          <>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (data.balance / r.points_cost) * 100)}%` }} />
            </div>
            <p className="mt-2 text-sm text-white/75">{ready ? "🎉 You earned a reward!" : `${r.points_cost - data.balance} points to go`}</p>
          </>
        )}
      </div>

      {ready && (
        <div className="card flex items-center justify-between p-4">
          <div>
            <p className="font-semibold">{r.name}</p>
            <p className="text-sm text-muted">{r.points_cost} points · apply at checkout</p>
          </div>
          <Link href="/app/menu" className="btn-primary">Order now</Link>
        </div>
      )}
      <p className="text-sm text-muted">
        Earn 1 point for every {peso(PESOS_PER_POINT)} you spend. {r && `${r.points_cost} points = ${peso(r.discount_amount)} off.`} Points are added when your order is completed.
      </p>

      <section>
        <h2 className="mb-2 font-semibold">Points history</h2>
        {data.history.length === 0 && <p className="text-sm text-muted">Your first order will start your history.</p>}
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {data.history.map((h) => (
            <li key={h.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{h.note}</p>
                <p className="text-xs text-muted">{dateTime(h.created_at)} · balance {h.balance_after}</p>
              </div>
              <span className={`font-bold tabular-nums ${h.points >= 0 ? "text-ok" : "text-bad"}`}>{h.points > 0 ? "+" : ""}{h.points}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
