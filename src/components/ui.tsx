"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
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

// ---- modal ----

// Open dialogs, topmost last. Only the top one handles Escape/Tab, and page scroll
// stays locked until the last one closes (nested dialogs close in any order).
const modalStack: symbol[] = [];

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: labelled, traps Tab, closes on Escape / backdrop, locks page scroll,
 * moves focus in (first field, else first action) and restores it to the opener on close.
 */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const id = Symbol("modal");
    if (!modalStack.length) document.body.dataset.scrollLock = document.body.style.overflow;
    modalStack.push(id);
    document.body.style.overflow = "hidden";
    const el = ref.current;
    const items = () => Array.from(el?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = el?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]),select,textarea") ?? items().find((n) => n.dataset.close === undefined) ?? el;
    if (!el?.contains(document.activeElement)) first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id) return; // a dialog opened on top of this one owns the keyboard
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === "Tab") {
        const list = items();
        if (!list.length) return e.preventDefault();
        const a = list[0];
        const z = list[list.length - 1];
        if (e.shiftKey && document.activeElement === a) (e.preventDefault(), z.focus());
        else if (!e.shiftKey && document.activeElement === z) (e.preventDefault(), a.focus());
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      modalStack.splice(modalStack.indexOf(id), 1);
      if (!modalStack.length) {
        document.body.style.overflow = document.body.dataset.scrollLock ?? "";
        delete document.body.dataset.scrollLock;
      }
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-paper p-5 shadow-2xl outline-none sm:rounded-3xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
      >
        {title && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-display text-xl font-semibold">{title}</h2>
            <button data-close onClick={onClose} className="btn-ghost !px-3 !py-2" aria-label="Close dialog">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ---- toasts + confirm/ask dialogs (replaces native confirm()/prompt()) ----

interface Toast {
  id: number;
  text: string;
  tone: "info" | "ok" | "bad";
}
export interface DialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** If set, the dialog asks for text and `ask()` resolves with it (or null if cancelled). */
  input?: { label: string; placeholder?: string; required?: boolean };
}
interface DialogApi {
  confirm: (o: DialogOptions) => Promise<boolean>;
  ask: (o: DialogOptions) => Promise<string | null>;
}

const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
const DialogCtx = createContext<DialogApi>({ confirm: async () => false, ask: async () => null });
export const useToast = () => useContext(ToastCtx);
export const useDialog = () => useContext(DialogCtx);

export function ToastProvider({ children, position = "top" }: { children: ReactNode; position?: "top" | "bottom" }) {
  const [items, setItems] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<{ opts: DialogOptions; done: (v: string | null) => void } | null>(null);
  const [text, setText] = useState("");

  const push = useCallback((t: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((c) => [...c.slice(-3), { id, text: t, tone }]);
    setTimeout(() => setItems((c) => c.filter((x) => x.id !== id)), 5000);
  }, []);

  const open = useCallback(
    (opts: DialogOptions) =>
      new Promise<string | null>((resolve) => {
        setText("");
        setDialog({ opts, done: resolve });
      }),
    [],
  );
  const api = useRef<DialogApi>({
    confirm: async (o) => (await open(o)) !== null,
    ask: (o) => open({ ...o, input: o.input ?? { label: "Reason" } }),
  });
  const close = (v: string | null) => {
    dialog?.done(v);
    setDialog(null);
  };

  const tone = { info: "bg-ink text-white", ok: "bg-ok text-white", bad: "bg-bad text-white" };
  return (
    <ToastCtx.Provider value={push}>
      <DialogCtx.Provider value={api.current}>
        {children}
        <Modal open={!!dialog} onClose={() => close(null)} title={dialog?.opts.title}>
          {dialog && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                close(dialog.opts.input ? text.trim() : "ok");
              }}
            >
              {dialog.opts.message && <p className="text-sm text-muted">{dialog.opts.message}</p>}
              {dialog.opts.input && (
                <div>
                  <label className="label" htmlFor="dlg-input">{dialog.opts.input.label}</label>
                  <input id="dlg-input" className="input" maxLength={200} required={dialog.opts.input.required} placeholder={dialog.opts.input.placeholder} value={text} onChange={(e) => setText(e.target.value)} />
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => close(null)}>Cancel</button>
                <button className={`${dialog.opts.danger ? "btn-danger" : "btn-primary"} flex-1`}>{dialog.opts.confirmLabel ?? "Confirm"}</button>
              </div>
            </form>
          )}
        </Modal>
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
      </DialogCtx.Provider>
    </ToastCtx.Provider>
  );
}

// ---- loading / error states ----

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <p role="status" className="py-10 text-center text-sm text-muted">{label}</p>;
}

/** Shown while data is loading, or — if the request failed — an error with a retry button. */
export function LoadState({ error, onRetry }: { error: string | null; onRetry?: () => void }) {
  if (!error) return <Spinner />;
  return (
    <div role="alert" className="mx-auto my-10 max-w-sm rounded-2xl bg-bad-soft p-5 text-center">
      <p className="font-semibold text-bad">We couldn&apos;t load this.</p>
      <p className="mt-1 text-sm text-bad">{error}</p>
      {onRetry && <button className="btn-secondary mt-3" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{message}</p>;
}

export function Stepper({ value, onChange, min = 1, max = 50 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div role="group" aria-label="Quantity" className="inline-flex items-center rounded-xl border border-line bg-card">
      <button type="button" aria-label="Decrease quantity" className="h-11 w-11 text-lg" onClick={() => onChange(Math.max(min - 1, value - 1))}>−</button>
      <span aria-live="polite" className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button type="button" aria-label="Increase quantity" className="h-11 w-11 text-lg disabled:opacity-40" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
