"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { ErrorNote, Modal, useDialog } from "../ui";
import type { MenuAdminData } from "./types";

export function CategoriesManager({ data, onClose, onChanged }: { data: MenuAdminData; onClose: () => void; onChanged: () => void }) {
  const dialog = useDialog();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const counts = new Map<number, number>();
  for (const p of data.products) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  return (
    <Modal open onClose={onClose} title="Categories">
      <div className="space-y-4">
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {data.categories.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              <div className="flex flex-col">
                <button aria-label={`Move ${c.name} up`} disabled={i === 0} className="text-xs leading-none text-muted disabled:opacity-30" onClick={() => run(() => api(`/api/admin/categories/${c.id}`, { move: "up" }, "PATCH"))}>▲</button>
                <button aria-label={`Move ${c.name} down`} disabled={i === data.categories.length - 1} className="text-xs leading-none text-muted disabled:opacity-30" onClick={() => run(() => api(`/api/admin/categories/${c.id}`, { move: "down" }, "PATCH"))}>▼</button>
              </div>
              <span className="flex-1 font-medium">{c.name}</span>
              <span className="text-xs text-muted">{counts.get(c.id) ?? 0} item{(counts.get(c.id) ?? 0) === 1 ? "" : "s"}</span>
              <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={async () => {
                const v = await dialog.ask({ title: "Rename category", confirmLabel: "Save", input: { label: "Name", required: true } });
                if (v) await run(() => api(`/api/admin/categories/${c.id}`, { name: v }, "PATCH"));
              }}>Rename</button>
              <button className="btn-ghost !px-2 !py-1 !text-xs text-bad" onClick={async () => {
                if (await dialog.confirm({ title: `Delete ${c.name}?`, message: "Only empty categories can be deleted.", confirmLabel: "Delete", danger: true })) await run(() => api(`/api/admin/categories/${c.id}`, undefined, "DELETE"));
              }}>Delete</button>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api("/api/admin/categories", { name }))) setName(""); }}>
          <input aria-label="New category name" className="input" placeholder="New category (e.g. Smoothies)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <button className="btn-primary shrink-0" disabled={!name.trim()}>Add</button>
        </form>
        <ErrorNote message={error} />
        <p className="text-xs text-muted">The order here is the order customers see.</p>
      </div>
    </Modal>
  );
}
