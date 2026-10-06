import { describe, expect, it } from "vitest";
import { installPromptFor, type InstallEnv } from "../src/lib/client/install";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1",
  iphoneFacebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]",
  iphoneWebview: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ipadSafari: "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36",
};
const env = (o: Partial<InstallEnv>): InstallEnv => ({ userAgent: UA.iphoneSafari, standalone: false, seenBefore: false, ...o });

describe("installPromptFor", () => {
  it("shows iPhone instructions in Safari on a first visit", () => {
    expect(installPromptFor(env({}))).toBe("iphone");
  });
  it("shows iPad instructions, including iPadOS desktop-mode Safari", () => {
    expect(installPromptFor(env({ userAgent: UA.ipadSafari }))).toBe("ipad");
    expect(installPromptFor(env({ userAgent: UA.ipadDesktopMode, platform: "MacIntel", maxTouchPoints: 5 }))).toBe("ipad");
  });
  it("never shows on a Mac, on Android, or in other iOS browsers / in-app webviews", () => {
    expect(installPromptFor(env({ userAgent: UA.macSafari, platform: "MacIntel", maxTouchPoints: 0 }))).toBeNull();
    expect(installPromptFor(env({ userAgent: UA.androidChrome }))).toBeNull();
    expect(installPromptFor(env({ userAgent: UA.iphoneChrome }))).toBeNull();
    expect(installPromptFor(env({ userAgent: UA.iphoneFacebook }))).toBeNull();
    expect(installPromptFor(env({ userAgent: UA.iphoneWebview }))).toBeNull();
  });
  it("is not fooled by an emulated/spoofed non-Apple user agent on touch hardware reporting MacIntel", () => {
    expect(installPromptFor(env({ userAgent: UA.androidChrome, platform: "MacIntel", maxTouchPoints: 5 }))).toBeNull();
  });
  it("never shows inside the installed app, or to someone who has already seen it", () => {
    expect(installPromptFor(env({ standalone: true }))).toBeNull();
    expect(installPromptFor(env({ seenBefore: true }))).toBeNull();
  });
});
