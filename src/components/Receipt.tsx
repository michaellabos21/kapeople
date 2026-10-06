"use client";
import { peso, dateTime } from "@/lib/format";
import { STATUS_LABEL, type OrderStatus } from "@/lib/config";

interface Item {
  name: string;
  variant_name: string | null;
  addons: { name: string; price: number }[];
  qty: number;
  unit_price: number;
  line_total: number;
  notes: string | null;
}
export interface ReceiptOrder {
  order_number: number;
  created_at: string;
  status: OrderStatus;
  source: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  discount: number;
  discount_label: string | null;
  reward_discount: number;
  total: number;
  points_earned: number;
  customer_name?: string | null;
  items: Item[];
  payments: { kind: string; method: string; amount: number; tendered: number | null; change_given: number | null; reference: string | null }[];
}

const Row = ({ a, b, bold }: { a: string; b: string; bold?: boolean }) => (
  <div className={`flex justify-between gap-4 ${bold ? "text-base font-bold" : ""}`}>
    <span>{a}</span>
    <span className="tabular-nums">{b}</span>
  </div>
);

export function Receipt({ order }: { order: ReceiptOrder }) {
  const pay = order.payments.find((p) => p.kind === "payment");
  return (
    <div id="receipt" className="mx-auto w-full max-w-sm rounded-2xl border border-dashed border-line bg-card p-5 font-mono text-[13px] leading-relaxed">
      <div className="text-center">
        <p className="font-display text-lg font-bold">Kapeople</p>
        <p className="text-muted">Main Branch</p>
        <p className="mt-2 text-base font-bold">Order #{order.order_number}</p>
        <p className="text-muted">{dateTime(order.created_at)}</p>
        {order.customer_name && <p className="text-muted">{order.customer_name}</p>}
      </div>
      <hr className="my-3 border-dashed border-line" />
      <div className="space-y-2">
        {order.items.map((it, i) => (
          <div key={i}>
            <Row a={`${it.qty} × ${it.name}${it.variant_name ? ` (${it.variant_name})` : ""}`} b={peso(it.line_total)} />
            {it.addons.map((a) => (
              <p key={a.name} className="pl-4 text-muted">+ {a.name}</p>
            ))}
            {it.notes && <p className="pl-4 text-muted">“{it.notes}”</p>}
          </div>
        ))}
      </div>
      <hr className="my-3 border-dashed border-line" />
      <div className="space-y-0.5">
        <Row a="Subtotal" b={peso(order.subtotal)} />
        {order.discount > 0 && <Row a={`Discount${order.discount_label ? ` (${order.discount_label})` : ""}`} b={`−${peso(order.discount)}`} />}
        {order.reward_discount > 0 && <Row a="Reward" b={`−${peso(order.reward_discount)}`} />}
        <Row a="Total" b={peso(order.total)} bold />
      </div>
      <hr className="my-3 border-dashed border-line" />
      <div className="space-y-0.5">
        <Row a="Payment" b={`${order.payment_method.toUpperCase()} · ${order.payment_status}`} />
        {pay?.tendered != null && <Row a="Cash received" b={peso(pay.tendered)} />}
        {pay?.change_given != null && <Row a="Change" b={peso(pay.change_given)} />}
        {pay?.reference && <Row a="Ref" b={pay.reference} />}
        {order.points_earned > 0 && <Row a="Points earned" b={`+${order.points_earned}`} />}
        <Row a="Status" b={STATUS_LABEL[order.status]} />
      </div>
      <p className="mt-4 text-center text-muted">Thank you for choosing Kapeople ☕</p>
    </div>
  );
}

export function PrintButton() {
  return (
    <button className="btn-secondary print:hidden" onClick={() => window.print()}>
      Print receipt
    </button>
  );
}
