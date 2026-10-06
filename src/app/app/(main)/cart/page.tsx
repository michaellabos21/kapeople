"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { useCart } from "@/lib/client/cart";
import { peso } from "@/lib/format";
import { ErrorNote, Stepper } from "@/components/ui";
import type { PaymentMethod } from "@/lib/config";

interface Promo { code: string; title: string; kind: "percent" | "amount"; value: number; min_spend: number }
interface Loyalty { balance: number; rewards: { id: number; name: string; points_cost: number; discount_amount: number }[] }

const METHODS: { id: PaymentMethod; label: string; hint: string }[] = [
  { id: "gcash", label: "GCash", hint: "Test mode — no real charge" },
  { id: "card", label: "Card", hint: "Test mode — no real charge" },
  { id: "cash", label: "Pay at pickup", hint: "Cash at the counter" },
];

export default function CartPage() {
  const cart = useCart();
  const router = useRouter();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [code, setCode] = useState("");
  const [useReward, setUseReward] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("gcash");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<string>(crypto.randomUUID()); // one key per checkout attempt → no double orders

  useEffect(() => {
    api<{ promotions: Promo[] }>("/api/promotions").then((r) => setPromos(r.promotions));
    api<Loyalty>("/api/loyalty").then(setLoyalty);
  }, []);

  const reward = loyalty?.rewards.find((r) => loyalty.balance >= r.points_cost);
  const promo = promos.find((p) => p.code.toUpperCase() === code.trim().toUpperCase());
  const preview = useMemo(() => {
    const sub = cart.subtotal;
    const disc = promo && sub >= promo.min_spend ? (promo.kind === "percent" ? sub * (promo.value / 100) : promo.value) : 0;
    const rew = useReward && reward ? Math.min(reward.discount_amount, sub - disc) : 0;
    return { disc, rew, total: Math.max(0, sub - disc - rew) };
  }, [cart.subtotal, promo, useReward, reward]);

  async function place() {
    setBusy(true);
    setError(null);
    try {
      const { order } = await api<{ order: { id: number } }>("/api/orders", {
        items: cart.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, addonIds: l.addons.map((a) => a.id), qty: l.qty, notes: l.notes })),
        paymentMethod: method,
        promoCode: code.trim() || undefined,
        rewardId: useReward && reward ? reward.id : undefined,
        notes: notes.trim() || undefined,
        idempotencyKey: attempt.current,
      });
      cart.clear();
      router.replace(`/app/orders/${order.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!cart.lines.length) {
    return (
      <div className="py-16 text-center">
        <p className="text-5xl">🛒</p>
        <p className="mt-3 font-semibold">Your cart is empty</p>
        <Link href="/app/menu" className="btn-primary mt-4">Browse the menu</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">Your order</h1>
      <p className="-mt-4 text-sm text-muted">Pickup at Kapeople — Main Branch</p>

      <ul className="space-y-3">
        {cart.lines.map((l) => (
          <li key={l.key} className="card flex items-start gap-3 p-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-2xl">{l.emoji}</div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{l.name}{l.variantName ? ` · ${l.variantName}` : ""}</p>
              {l.addons.length > 0 && <p className="text-xs text-muted">{l.addons.map((a) => a.name).join(", ")}</p>}
              {l.notes && <p className="text-xs text-muted">“{l.notes}”</p>}
              <div className="mt-2 flex items-center justify-between">
                <Stepper value={l.qty} min={1} onChange={(n) => cart.setQty(l.key, n)} />
                <span className="font-semibold">{peso(l.unitPrice * l.qty)}</span>
              </div>
            </div>
            <button aria-label={`Remove ${l.name}`} className="p-1 text-muted" onClick={() => cart.setQty(l.key, 0)}>✕</button>
          </li>
        ))}
      </ul>

      <section className="space-y-3">
        <div>
          <label className="label" htmlFor="promo">Promo code</label>
          <input id="promo" className="input uppercase" placeholder="WELCOME10" value={code} onChange={(e) => setCode(e.target.value)} />
          {code && !promo && <p className="mt-1 text-xs text-muted">We&apos;ll check this code when you place your order.</p>}
          {promo && cart.subtotal < promo.min_spend && <p className="mt-1 text-xs text-warn">Spend {peso(promo.min_spend)} or more to use {promo.code}.</p>}
        </div>
        {reward && (
          <label className={`flex items-center justify-between rounded-xl border px-4 py-3 ${useReward ? "border-brand bg-brand-soft" : "border-line bg-card"}`}>
            <span className="text-sm">
              <span className="font-semibold">🎉 {reward.name}</span>
              <span className="block text-xs text-muted">Uses {reward.points_cost} of your {loyalty!.balance} points</span>
            </span>
            <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} className="h-5 w-5 accent-[var(--color-brand)]" />
          </label>
        )}
        <div>
          <label className="label" htmlFor="note">Note to the store (optional)</label>
          <input id="note" className="input" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </section>

      <section>
        <h2 className="label">Payment</h2>
        <div className="space-y-2">
          {METHODS.map((m) => (
            <label key={m.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${method === m.id ? "border-brand bg-brand-soft" : "border-line bg-card"}`}>
              <input type="radio" name="pay" checked={method === m.id} onChange={() => setMethod(m.id)} className="accent-[var(--color-brand)]" />
              <span className="text-sm"><span className="font-semibold">{m.label}</span><span className="block text-xs text-muted">{m.hint}</span></span>
            </label>
          ))}
        </div>
      </section>

      <section className="card space-y-1 p-4 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{peso(cart.subtotal)}</span></div>
        {preview.disc > 0 && <div className="flex justify-between text-ok"><span>Promo {promo?.code}</span><span>−{peso(preview.disc)}</span></div>}
        {preview.rew > 0 && <div className="flex justify-between text-ok"><span>Reward</span><span>−{peso(preview.rew)}</span></div>}
        <div className="flex justify-between border-t border-line pt-2 text-lg font-bold"><span>Total</span><span>{peso(preview.total)}</span></div>
      </section>

      <ErrorNote message={error} />
      <button className="btn-primary w-full py-3.5 text-base" disabled={busy} onClick={place}>
        {busy ? "Placing order…" : method === "cash" ? `Place order · pay ${peso(preview.total)} at pickup` : `Pay ${peso(preview.total)} & place order`}
      </button>
    </div>
  );
}
