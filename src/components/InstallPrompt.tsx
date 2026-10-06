"use client";
import { useEffect, useState } from "react";
import { installPromptFor, type InstallDevice } from "@/lib/client/install";

const KEY = "kapeople.install-prompt.v1";

const ShareIcon = () => (
  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15V3" /><path d="M8 7l4-4 4 4" /><path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
  </svg>
);
const PlusIcon = () => (
  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
);

/**
 * One-time hint for first-time visitors in iPhone/iPad Safari: how to add the app to the Home Screen so it
 * opens full screen. Never shown inside the installed app, in other browsers, or twice.
 * QA: append ?install-preview=iphone (or ipad) to any /app URL to force it.
 */
export function InstallPrompt() {
  const [device, setDevice] = useState<InstallDevice | null>(null);

  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get("install-preview");
    if (preview === "iphone" || preview === "ipad") {
      setDevice(preview);
      return;
    }
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) !== null;
    } catch {}
    const found = installPromptFor({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      standalone: (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches,
      seenBefore: seen,
    });
    if (!found) return;
    const t = setTimeout(() => {
      setDevice(found);
      try {
        localStorage.setItem(KEY, new Date().toISOString()); // "first visit" only: never show again
      } catch {}
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  if (!device) return null;
  const close = () => setDevice(null);
  const step = "flex items-center gap-3 text-sm";
  const num = "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white";

  return (
    <section
      aria-label="Install Kapeople on your home screen"
      className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-md px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <div className="relative rounded-3xl border border-line bg-card p-5 shadow-2xl">
        <button onClick={close} aria-label="Dismiss" className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-lg text-muted">✕</button>
        <div className="flex items-center gap-3 pr-8">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand text-2xl" aria-hidden="true">☕</div>
          <div>
            <h2 className="font-display text-lg font-bold leading-tight">Add Kapeople to your Home Screen</h2>
            <p className="text-sm text-muted">Opens full screen like an app, so ordering takes a tap.</p>
          </div>
        </div>

        <ol className="mt-4 space-y-3">
          <li className={step}>
            <span className={num}>1</span>
            <span>Tap the <b>Share</b> button <span className="mx-0.5 inline-flex translate-y-1 text-brand"><ShareIcon /></span> {device === "ipad" ? "at the top of Safari" : "in Safari's toolbar"}</span>
          </li>
          <li className={step}>
            <span className={num}>2</span>
            <span>Scroll down and tap <b>Add to Home Screen</b> <span className="mx-0.5 inline-flex translate-y-1 text-brand"><PlusIcon /></span></span>
          </li>
          <li className={step}>
            <span className={num}>3</span>
            <span>Tap <b>Add</b>, then open Kapeople from your Home Screen</span>
          </li>
        </ol>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted">You&apos;ll sign in once more in the app.</p>
          <button onClick={close} className="btn-primary !px-5">Got it</button>
        </div>

        {device === "iphone" && (
          // Points at Safari's bottom toolbar, where the Share button lives.
          <div aria-hidden="true" className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-line bg-card" />
        )}
      </div>
    </section>
  );
}
