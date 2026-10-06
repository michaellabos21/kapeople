"use client";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { peso } from "@/lib/format";
import { StatusBadge, LoadState } from "@/components/ui";
import type { MenuProduct } from "@/lib/services/catalog";
import type { OrderStatus } from "@/lib/config";

interface Loyalty {
  balance: number;
  rewards: { id: number; name: string; points_cost: number; discount_amount: number }[];
  next_reward: { points_cost: number; discount_amount: number } | null;
}
interface Promo { id: number; code: string; title: string; description: string }
interface OrderLite { id: number; order_number: number; status: OrderStatus; total: number; items: { name: string; qty: number }[] }

export default function HomePage() {
  const { data, error, reload } = useLive(async () => {
    const [me, loyalty, promos, menu, orders] = await Promise.all([
      api<{ user: { name: string } }>("/api/auth/me"),
      api<Loyalty>("/api/loyalty"),
      api<{ promotions: Promo[] }>("/api/promotions"),
      api<{ products: MenuProduct[] }>("/api/menu"),
      api<{ orders: OrderLite[] }>("/api/orders?status=new,accepted,preparing,ready"),
    ]);
    return { me: me.user, loyalty, promos: promos.promotions, menu: menu.products, active: orders.orders };
  });
  if (!data) return <LoadState error={error} onRetry={reload} />;
  const { me, loyalty, promos, menu, active } = data;
  const target = loyalty.next_reward?.points_cost ?? loyalty.rewards[0]?.points_cost ?? 100;
  const canRedeem = loyalty.rewards.some((r) => loyalty.balance >= r.points_cost);
  const pct = Math.min(100, Math.round(((loyalty.balance % target || (canRedeem ? target : 0)) / target) * 100));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">Good day,</p>
        <h1 className="font-display text-3xl font-bold">{me.name.split(" ")[0]}</h1>
      </div>

      {active.map((o) => (
        <Link key={o.id} href={`/app/orders/${o.id}`} className="card flex items-center justify-between border-brand p-4">
          <div>
            <p className="font-semibold">Order #{o.order_number}</p>
            <p className="text-sm text-muted">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
          </div>
          <StatusBadge status={o.status} />
        </Link>
      ))}

      <Link href="/app/rewards" className="block rounded-2xl bg-ink p-5 text-white">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Your points</p>
            <p className="font-display text-4xl font-bold">{loyalty.balance}</p>
          </div>
          {canRedeem && <span className="rounded-full bg-brand px-3 py-1 text-xs font-bold">🎉 Reward ready</span>}
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-white/70">
          {canRedeem
            ? `Use ${loyalty.rewards[0].points_cost} points for ${peso(loyalty.rewards[0].discount_amount)} off at checkout.`
            : `${target - loyalty.balance} more points to unlock ${peso(loyalty.next_reward?.discount_amount ?? 50)} off.`}
        </p>
      </Link>

      {promos.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Offers</h2>
          <div className="space-y-2">
            {promos.map((p) => (
              <div key={p.id} className="card flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm text-muted">{p.description}</p>
                </div>
                <code className="rounded-lg bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-dark">{p.code}</code>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">From the menu</h2>
          <Link href="/app/menu" className="text-sm font-semibold text-brand">See menu</Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {menu.filter((p) => !p.sold_out).slice(0, 4).map((p) => (
            <Link key={p.id} href={`/app/product/${p.id}`} className="card p-4">
              <div className="text-3xl" aria-hidden="true">{p.emoji}</div>
              <p className="mt-2 text-sm font-semibold leading-tight">{p.name}</p>
              <p className="text-sm text-muted">from {peso(p.base_price)}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
