"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { ErrorNote, Modal, useToast } from "./ui";

export function ChangePasswordButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`text-sm font-semibold text-muted hover:text-ink ${className}`} onClick={() => setOpen(true)}>
        Change password
      </button>
      {open && <ChangePasswordModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Change password">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (f.get("next") !== f.get("confirm")) return setError("The new passwords don't match.");
          setBusy(true);
          setError(null);
          try {
            await api("/api/auth/password", { current: f.get("current"), next: f.get("next") });
            toast("Password changed. Other devices were signed out.", "ok");
            onClose();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <div><label className="label" htmlFor="cp-cur">Current password</label><input id="cp-cur" name="current" type="password" autoComplete="current-password" className="input" required /></div>
        <div><label className="label" htmlFor="cp-new">New password (12+ characters)</label><input id="cp-new" name="next" type="password" autoComplete="new-password" minLength={12} className="input" required /></div>
        <div><label className="label" htmlFor="cp-conf">Repeat new password</label><input id="cp-conf" name="confirm" type="password" autoComplete="new-password" minLength={12} className="input" required /></div>
        <ErrorNote message={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
      </form>
    </Modal>
  );
}
