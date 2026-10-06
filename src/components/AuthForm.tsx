"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { suggestEmail } from "@/lib/client/email";
import { ErrorNote } from "./ui";

export function AuthForm({ mode, demo }: { mode: "customer" | "staff"; demo?: string }) {
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Until React has hydrated, a click would fall back to a native form submit.
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const suggestion = signup ? suggestEmail(email) : null;
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
        <input id="email" name="email" type="email" className="input" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {suggestion && (
          <p className="mt-1 text-sm text-muted">
            Did you mean{" "}
            <button type="button" className="font-semibold text-brand underline" onClick={() => setEmail(suggestion)}>{suggestion}</button>?
          </p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} className="input !pr-16" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} required />
          <button type="button" aria-pressed={show} onClick={() => setShow(!show)} className="absolute inset-y-0 right-2 px-2 text-xs font-semibold text-muted">{show ? "Hide" : "Show"}</button>
        </div>
        {signup && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}
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
