"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { ChangePasswordButton } from "@/components/ChangePasswordModal";
import { ErrorNote, LoadState, useToast } from "@/components/ui";

interface Me { name: string; email: string; phone: string | null }

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [perm, setPerm] = useState<string>("default");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    api<{ user: Me }>("/api/auth/me").then((r) => setMe(r.user)).catch((e: Error) => setLoadError(e.message));
  }, []);
  useEffect(() => {
    load();
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, [load]);
  if (!me) return <LoadState error={loadError} onRetry={load} />;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">Profile</h1>

      <form
        className="card space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          try {
            const { user } = await api<{ user: Me }>("/api/profile", { name: f.get("name"), phone: f.get("phone") || undefined }, "PATCH");
            setMe(user);
            toast("Profile saved", "ok");
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
          }
          setBusy(false);
        }}
      >
        <div>
          <label className="label" htmlFor="pf-name">Name</label>
          <input id="pf-name" name="name" className="input" defaultValue={me.name} autoComplete="name" required maxLength={80} />
        </div>
        <div>
          <label className="label" htmlFor="pf-phone">Mobile</label>
          <input id="pf-phone" name="phone" className="input" defaultValue={me.phone ?? ""} autoComplete="tel" inputMode="tel" maxLength={30} />
        </div>
        <div>
          <p className="label">Email</p>
          <p className="text-sm">{me.email}</p>
        </div>
        <ErrorNote message={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
      </form>

      <div className="flex justify-center"><ChangePasswordButton className="!text-brand" /></div>

      {typeof Notification !== "undefined" && perm !== "granted" && perm !== "denied" && (
        <button className="btn-secondary w-full" onClick={async () => setPerm(await Notification.requestPermission())}>
          Turn on order alerts
        </button>
      )}
      {perm === "denied" && <p className="text-center text-xs text-muted">Order alerts are blocked in your browser settings.</p>}
      <button
        className="btn-secondary w-full"
        onClick={async () => {
          await api("/api/auth/logout", {});
          try { localStorage.removeItem("kapeople.cart.v1"); } catch {}
          router.replace("/app/login");
          router.refresh();
        }}
      >
        Sign out
      </button>
    </div>
  );
}
