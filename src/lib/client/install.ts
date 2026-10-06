export type InstallDevice = "iphone" | "ipad";

export interface InstallEnv {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** navigator.standalone (iOS) or display-mode: standalone */
  standalone: boolean;
  /** Has the visitor already been shown (or dismissed) the prompt? */
  seenBefore: boolean;
}

// Browsers/webviews on iOS that can't "Add to Home Screen" the way Safari does.
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|Snapchat|DuckDuckGo/;

/**
 * Which device's Safari instructions to show — or null if we shouldn't show the prompt
 * (not iOS Safari, already installed, or the visitor has seen it before).
 */
export function installPromptFor(env: InstallEnv): InstallDevice | null {
  if (env.standalone || env.seenBefore) return null;
  const ua = env.userAgent;
  // iPadOS 13+ pretends to be a Mac; a touch screen gives it away. Require a Mac user agent too, so a
  // spoofed/emulated Android or desktop UA on touch hardware is not mistaken for an iPad.
  const ipadAsMac = env.platform === "MacIntel" && (env.maxTouchPoints ?? 0) > 1 && /Macintosh/.test(ua);
  const isIPad = /iPad/.test(ua) || ipadAsMac;
  const isIPhone = /iPhone|iPod/.test(ua);
  if (!isIPad && !isIPhone) return null;
  if (!/Safari\//.test(ua) || NOT_SAFARI.test(ua)) return null;
  return isIPad ? "ipad" : "iphone";
}
