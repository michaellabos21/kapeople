"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { STATUS_LABEL, type OrderStatus } from "@/lib/config";

const STATUS_STYLE: Record<OrderStatus, string> = {
  new: "bg-info-soft text-info",
  accepted: "bg-brand-soft text-brand-dark",
  preparing: "bg-warn-soft text-warn",
  ready: "bg-ok-soft text-ok",
  completed: "bg-line text-muted",
  cancelled: "bg-bad-soft text-bad",
  refunded: "bg-bad-soft text-bad",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// ---- toasts ----
interface Toast {
  id: number;
  text: string;
  tone: "info" | "ok" | "bad";
}
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children, position = "top" }: { children: ReactNode; position?: "top" | "bottom" }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((c) => [...c.slice(-3), { id, text, tone }]);
    setTimeout(() => setItems((c) => c.filter((t) => t.id !== id)), 5000);
  }, []);
  const tone = { info: "bg-ink text-white", ok: "bg-ok text-white", bad: "bg-bad text-white" };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 ${position === "top" ? "top-3" : "bottom-24"}`}
      >
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${tone[t.tone]}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-paper p-5 shadow-2xl sm:rounded-3xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
      >
        {title && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <button onClick={onClose} className="btn-ghost !px-2 !py-1" aria-label="Close">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-muted">{label}</p>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{message}</p>;
}

export function Stepper({ value, onChange, min = 1, max = 50 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-card">
      <button type="button" aria-label="Decrease" className="h-9 w-9 text-lg" onClick={() => onChange(Math.max(min - 1, value - 1))}>−</button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button type="button" aria-label="Increase" className="h-9 w-9 text-lg" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
