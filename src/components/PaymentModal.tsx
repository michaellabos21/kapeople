"use client";
import { useState } from "react";
import { peso } from "@/lib/format";
import type { PaymentMethod } from "@/lib/config";
import { ErrorNote, Modal } from "./ui";

/** Collects cash (with change) or records a GCash / card payment. */
export function PaymentModal({
  open, total, initialMethod = "cash", busy, error, confirmLabel = "Confirm payment", onClose, onConfirm,
}: {
  open: boolean;
  total: number;
  initialMethod?: PaymentMethod;
  busy?: boolean;
  error?: string | null;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, tendered?: number) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>(initialMethod);
  const [cash, setCash] = useState("");
  const tendered = cash === "" ? total : Number(cash);
  const change = tendered - total;
  const quick = [...new Set([total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000])].filter((n) => n >= total).slice(0, 4);
  const short = method === "cash" && change < -0.001;

  return (
    <Modal open={open} onClose={onClose} title="Take payment">
      <div className="space-y-4">
        <div className="rounded-2xl bg-ink py-4 text-center text-white">
          <p className="text-xs uppercase tracking-widest text-white/60">Amount due</p>
          <p className="font-display text-4xl font-bold">{peso(total)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["cash", "gcash", "card"] as const).map((m) => (
            <button key={m} onClick={() => setMethod(m)} aria-pressed={method === m} className={`rounded-xl border py-3 text-sm font-bold uppercase ${method === m ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-card"}`}>
              {m}
            </button>
          ))}
        </div>
        {method === "cash" ? (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="tendered">Cash received</label>
              <input id="tendered" className="input text-lg font-semibold" inputMode="decimal" autoFocus placeholder={String(total)} value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <div className="flex flex-wrap gap-2">
              {quick.map((n) => (
                <button key={n} className="btn-secondary !py-2" onClick={() => setCash(String(n))}>{n === total ? "Exact" : peso(n)}</button>
              ))}
            </div>
            <p className={`text-center text-lg font-bold ${short ? "text-bad" : "text-ok"}`}>
              {short ? `Short by ${peso(-change)}` : `Change: ${peso(change)}`}
            </p>
          </div>
        ) : (
          <p className="rounded-xl bg-info-soft px-4 py-3 text-sm text-info">
            Confirm the {method === "gcash" ? "GCash" : "card"} payment went through on the terminal, then record it here.
          </p>
        )}
        <ErrorNote message={error ?? null} />
        <button className="btn-primary w-full py-3.5 text-base" disabled={busy || short} onClick={() => onConfirm(method, method === "cash" ? tendered : undefined)}>
          {busy ? "Saving…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
