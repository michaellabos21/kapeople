"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { ErrorNote } from "./ui";

export function AuthForm({ mode, demo }: { mode: "customer" | "staff"; demo?: string }) {
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Until React has hydrated, a click would fall back to a native form submit.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(f) as Record<string, string>;
      const { user } = await api<{ user: { role: string } }>(signup ? "/api/auth/signup" : "/api/auth/login", body);
      if (mode === "customer") {
        if (user.role !== "customer") throw new Error("That's a staff account. Use the POS sign-in.");
        router.replace("/app");
      } else {
        if (user.role === "customer") {
          await api("/api/auth/logout", {});
          throw new Error("That's a customer account. Use the Kapeople app.");
        }
        router.replace(user.role === "admin" ? "/admin" : "/pos");
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="mt-8 space-y-4">
      {signup && (
        <>
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" className="input" autoComplete="name" required />
          </div>
          <div>
            <label className="label" htmlFor="phone">Mobile (optional)</label>
            <input id="phone" name="phone" className="input" autoComplete="tel" inputMode="tel" />
          </div>
        </>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} required />
      </div>
      <ErrorNote message={error} />
      <button className="btn-primary w-full" disabled={busy || !ready}>
        {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
      </button>
      {mode === "customer" && (
        <button type="button" className="btn-ghost w-full" onClick={() => { setSignup(!signup); setError(null); }}>
          {signup ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
      )}
      {demo && <p className="text-center text-xs text-muted">Local demo account: {demo} (password in README)</p>}
    </form>
  );
}
