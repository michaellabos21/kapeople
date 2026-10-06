"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useLive } from "@/lib/client/live";
import { generatePassword } from "@/lib/client/password";
import { dateTime } from "@/lib/format";
import { ErrorNote, Modal, useToast } from "./ui";

interface Member { id: number; name: string; email: string; role: "employee" | "admin"; active: boolean; created_at: string }

export function StaffManager({ myEmail }: { myEmail: string }) {
  const toast = useToast();
  const { data, reload } = useLive(() => api<{ staff: Member[] }>("/api/staff"), [], 60000);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Member | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  async function toggle(m: Member) {
    try {
      await api(`/api/staff/${m.id}`, { active: !m.active }, "PATCH");
      toast(m.active ? `${m.name} was deactivated and signed out.` : `${m.name} can sign in again.`, "ok");
      void reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">Staff &amp; admins</h2>
        <button className="btn-primary" onClick={() => setAdding(true)}>+ Add account</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Name</th><th>Email</th><th>Role</th><th>Status</th><th className="px-4 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(data?.staff ?? []).map((m) => (
              <tr key={m.id} className={m.active ? "" : "opacity-60"}>
                <td className="px-4 py-2.5 font-semibold">{m.name}{m.email === myEmail && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand-dark">YOU</span>}</td>
                <td>{m.email}</td>
                <td className="capitalize">{m.role === "employee" ? "Staff" : "Admin"}</td>
                <td>{m.active ? <span className="font-semibold text-ok">Active</span> : <span className="text-muted">Deactivated</span>}</td>
                <td className="space-x-1 px-4 py-2 text-right">
                  <button className="btn-secondary !px-2.5 !py-1 !text-xs" onClick={() => setResetting(m)}>Reset password</button>
                  {m.email !== myEmail && <button className="btn-secondary !px-2.5 !py-1 !text-xs" onClick={() => toggle(m)}>{m.active ? "Deactivate" : "Reactivate"}</button>}
                </td>
              </tr>
            ))}
            {data && data.staff.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">No accounts.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Deactivated people are signed out immediately and can&apos;t sign in. Their order history is kept.</p>

      {adding && <AddModal onClose={() => setAdding(false)} onDone={(email, password) => { setAdding(false); setIssued({ email, password }); void reload(); }} />}
      {resetting && <ResetModal member={resetting} onClose={() => setResetting(null)} onDone={(password) => { setIssued({ email: resetting.email, password }); setResetting(null); }} />}
      <Modal open={!!issued} onClose={() => setIssued(null)} title="Share these sign-in details">
        {issued && (
          <div className="space-y-3 text-sm">
            <p className="text-muted">This password is shown only once. Send it privately and ask them to change it from <b>Change password</b> after signing in.</p>
            <div className="rounded-xl bg-card p-3 font-mono">
              <p>Email: {issued.email}</p>
              <p>Password: {issued.password}</p>
            </div>
            <button className="btn-primary w-full" onClick={() => navigator.clipboard?.writeText(`Email: ${issued.email}\nPassword: ${issued.password}`).then(() => toast("Copied", "ok"))}>Copy</button>
          </div>
        )}
      </Modal>
    </section>
  );
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor="sf-pw">Temporary password (12+ characters)</label>
      <div className="flex gap-2">
        <input id="sf-pw" className="input font-mono" value={value} onChange={(e) => onChange(e.target.value)} minLength={12} required />
        <button type="button" className="btn-secondary shrink-0" onClick={() => onChange(generatePassword())}>Generate</button>
      </div>
    </div>
  );
}

function AddModal({ onClose, onDone }: { onClose: () => void; onDone: (email: string, password: string) => void }) {
  const [pw, setPw] = useState(() => generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Add account">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          try {
            await api("/api/staff", { name: f.get("name"), email: f.get("email"), role: f.get("role"), password: pw });
            onDone(String(f.get("email")).trim().toLowerCase(), pw);
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <div><label className="label" htmlFor="sf-name">Name</label><input id="sf-name" name="name" className="input" required /></div>
        <div><label className="label" htmlFor="sf-email">Email</label><input id="sf-email" name="email" type="email" className="input" required /></div>
        <div>
          <label className="label" htmlFor="sf-role">Role</label>
          <select id="sf-role" name="role" className="input" defaultValue="employee">
            <option value="employee">Staff — POS, orders, inventory, reports</option>
            <option value="admin">Admin — everything, including accounts and menu</option>
          </select>
        </div>
        <PasswordField value={pw} onChange={setPw} />
        <ErrorNote message={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
    </Modal>
  );
}

function ResetModal({ member, onClose, onDone }: { member: Member; onClose: () => void; onDone: (password: string) => void }) {
  const [pw, setPw] = useState(() => generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Reset password · ${member.name}`}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api(`/api/staff/${member.id}`, { password: pw }, "PATCH");
            onDone(pw);
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-muted">They will be signed out everywhere and any sign-in lockout is lifted.</p>
        <PasswordField value={pw} onChange={setPw} />
        <ErrorNote message={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Reset password"}</button>
      </form>
    </Modal>
  );
}
