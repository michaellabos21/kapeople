"use client";
import { usePush } from "@/lib/client/push";
import { ErrorNote } from "./ui";

const COPY = {
  needsInstall: "On iPhone and iPad, alerts only work once Kapeople is on your Home Screen: open it in Safari, tap Share → Add to Home Screen, then open it from there and come back to this page.",
  unsupported: "This browser doesn't support push alerts. Order updates still appear inside the app.",
  blocked: "Alerts are blocked for this site. Allow notifications for Kapeople in your browser or phone settings, then come back.",
  notConfigured: "Alerts aren't switched on for this shop yet.",
};

/** Settings card: turn order alerts on/off for this device. */
export function PushToggle({ audience = "customer" }: { audience?: "customer" | "staff" }) {
  const { status, busy, error, enable, disable, test } = usePush();
  if (status === "loading") return null;

  const what = audience === "staff" ? "Get an alert on this device whenever a customer places an order." : "Get an alert on this device when your order is accepted, being prepared, and ready for pickup.";
  return (
    <section className="card space-y-3 p-4" aria-labelledby="push-h">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="push-h" className="font-semibold">Order alerts</h2>
          <p className="text-sm text-muted">{status === "on" ? "On for this device." : status === "off" ? what : ""}</p>
        </div>
        {status === "on" && <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-bold text-ok">ON</span>}
      </div>
      {status === "needs-install" && <p className="text-sm text-muted">{COPY.needsInstall}</p>}
      {status === "unsupported" && <p className="text-sm text-muted">{COPY.unsupported}</p>}
      {status === "blocked" && <p className="text-sm text-muted">{COPY.blocked}</p>}
      {status === "not-configured" && <p className="text-sm text-muted">{COPY.notConfigured}</p>}
      <ErrorNote message={error} />
      {status === "off" && <button className="btn-primary w-full" disabled={busy} onClick={enable}>{busy ? "Turning on…" : "Turn on alerts"}</button>}
      {status === "on" && (
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={test}>Send a test alert</button>
          <button className="btn-ghost flex-1" disabled={busy} onClick={disable}>Turn off</button>
        </div>
      )}
    </section>
  );
}

/** Slim prompt shown right after ordering, when alerts are the natural next step. */
export function PushNudge() {
  const { status, busy, enable } = usePush();
  if (status !== "off") return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-soft p-4">
      <p className="text-sm"><b>Know the moment it&apos;s ready.</b> Turn on alerts for this order.</p>
      <button className="btn-primary shrink-0" disabled={busy} onClick={enable}>Turn on</button>
    </div>
  );
}
