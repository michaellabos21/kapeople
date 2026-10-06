"use client";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";

export type PushStatus =
  | "loading"
  | "unsupported" // this browser can't do push
  | "needs-install" // iPhone/iPad: only works once added to the Home Screen
  | "not-configured" // the server has no VAPID keys
  | "blocked" // permission denied in browser settings
  | "off"
  | "on";

interface PushState {
  status: PushStatus;
  busy: boolean;
  error: string | null;
}

// One shared store, so every component (profile card, order nudge, POS dialog, the layouts) agrees and the
// work (key fetch, service-worker lookup) happens once instead of once per mounted component.
let state: PushState = { status: "loading", busy: false, error: null };
const listeners = new Set<() => void>();
const set = (p: Partial<PushState>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const SERVER_STATE: PushState = { status: "loading", busy: false, error: null };

let keyPromise: Promise<string | null> | null = null;
const getKey = () =>
  (keyPromise ??= api<{ publicKey: string | null }>("/api/push/key")
    .then((r) => r.publicKey)
    .catch((e) => {
      keyPromise = null; // don't cache a failure
      throw e;
    }));

const isStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

function keyToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return { reg, sub: (await reg?.pushManager.getSubscription()) ?? null };
}

// The server row can disappear (push service said "gone", repeated failures) or belong to a previous user of this
// shared device while the browser keeps its subscription. Re-registering it is an idempotent upsert that
// re-attaches the device to whoever is signed in now.
let lastSync: { endpoint: string; at: number } | null = null;
async function syncSubscription(sub: PushSubscription) {
  if (lastSync && lastSync.endpoint === sub.endpoint && Date.now() - lastSync.at < 30_000) return;
  try {
    await api("/api/push/subscribe", sub.toJSON());
    lastSync = { endpoint: sub.endpoint, at: Date.now() };
  } catch {}
}

async function resolveStatus() {
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!capable) return set({ status: isIOS() && !isStandalone() ? "needs-install" : "unsupported" });
  if (Notification.permission === "denied") return set({ status: "blocked" });
  try {
    if (!(await getKey())) return set({ status: "not-configured" });
    const { sub } = await currentSubscription();
    if (sub && Notification.permission === "granted") {
      await syncSubscription(sub);
      set({ status: "on" });
    } else {
      set({ status: "off" });
    }
  } catch {
    set({ status: "off" });
  }
}

let inflight: Promise<void> | null = null;
/** Work out (and share) whether alerts are on for this device; also re-attaches the device to the current user. */
export function refreshPush(): Promise<void> {
  return (inflight ??= resolveStatus().finally(() => {
    inflight = null;
  }));
}

/** Must run straight from a tap/click (browsers, iOS especially, refuse permission prompts otherwise). */
export async function enablePush() {
  set({ busy: true, error: null });
  try {
    // First await on purpose: the permission prompt must still be inside the user's tap.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return set({ status: permission === "denied" ? "blocked" : "off" });

    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const publicKey = await getKey();
    if (!publicKey) return set({ status: "not-configured" });

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
      } catch {
        // A subscription made with different server keys can't be reused: replace it.
        await (await reg.pushManager.getSubscription())?.unsubscribe();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
      }
    }
    lastSync = null;
    await api("/api/push/subscribe", sub.toJSON());
    lastSync = { endpoint: sub.endpoint, at: Date.now() };
    set({ status: "on" });
  } catch (e) {
    set({ error: (e as Error).message || "Couldn't turn on alerts." });
    await refreshPush();
  } finally {
    set({ busy: false });
  }
}

/** Stops alerts for this device's current account (browser subscription stays, so the next login can resume). */
export async function detachDevice() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const { sub } = await currentSubscription();
    lastSync = null;
    if (sub) await api("/api/push/subscribe", { endpoint: sub.endpoint }, "DELETE").catch(() => {});
  } catch {}
}

/** Fully turn alerts off on this device. */
export async function disablePush() {
  set({ busy: true });
  await detachDevice();
  try {
    const { sub } = await currentSubscription();
    await sub?.unsubscribe();
  } catch {}
  set({ status: "off", busy: false });
}

export async function sendTestPush() {
  set({ error: null });
  try {
    await api("/api/push/test", {});
  } catch (e) {
    set({ error: (e as Error).message });
  }
}

/** Shared push state for any component; also keeps it fresh on mount. */
export function usePush() {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  useEffect(() => {
    void refreshPush();
  }, []);
  return { ...s, enable: enablePush, disable: disablePush, test: sendTestPush };
}

/** Mount once in each signed-in layout: after login, re-attach this device so alerts resume without a tap. */
export function usePushSync() {
  useEffect(() => {
    void refreshPush();
  }, []);
}
