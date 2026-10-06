"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartLine {
  key: string;
  productId: number;
  name: string;
  emoji: string;
  variantId: number | null;
  variantName: string | null;
  addons: { id: number; name: string; price: number }[];
  unitPrice: number; // display only — the server reprices
  qty: number;
  notes?: string;
}

interface CartCtx {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (l: Omit<CartLine, "key">) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
}

/** Same product + size + add-ons + note = same line (quantities merge). */
export function lineKey(l: Omit<CartLine, "key">): string {
  return [l.productId, l.variantId, l.addons.map((a) => a.id).sort().join("."), l.notes ?? ""].join("|");
}

export function mergeLine(lines: CartLine[], l: Omit<CartLine, "key">): CartLine[] {
  const key = lineKey(l);
  return lines.some((x) => x.key === key)
    ? lines.map((x) => (x.key === key ? { ...x, qty: x.qty + l.qty } : x))
    : [...lines, { ...l, key }];
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = "kapeople.cart.v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {}
  }, [lines, ready]);

  const add = useCallback((l: Omit<CartLine, "key">) => setLines((cur) => mergeLine(cur, l)), []);
  const setQty = useCallback(
    (key: string, qty: number) => setLines((cur) => (qty <= 0 ? cur.filter((x) => x.key !== key) : cur.map((x) => (x.key === key ? { ...x, qty } : x)))),
    [],
  );
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      subtotal: lines.reduce((s, l) => s + l.unitPrice * l.qty, 0),
      add,
      setQty,
      clear,
    }),
    [lines, add, setQty, clear],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
