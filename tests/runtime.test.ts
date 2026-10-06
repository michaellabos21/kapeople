import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIpFrom, isServerless } from "../src/lib/runtime";

afterEach(() => vi.unstubAllEnvs());
const headers = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe("clientIpFrom", () => {
  it("on Vercel ignores a forged Netlify header", () => {
    vi.stubEnv("VERCEL", "1");
    const h = headers({ "x-nf-client-connection-ip": "6.6.6.6", "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientIpFrom(h)).toBe("203.0.113.9");
    expect(clientIpFrom(headers({ "x-vercel-forwarded-for": "198.51.100.4", "x-forwarded-for": "9.9.9.9" }))).toBe("198.51.100.4");
    expect(clientIpFrom(headers({ "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
  });
  it("on Netlify trusts its own header first", () => {
    vi.stubEnv("NETLIFY", "true");
    expect(clientIpFrom(headers({ "x-nf-client-connection-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.7");
  });
  it("returns null when no header is present", () => {
    vi.stubEnv("VERCEL", "1");
    expect(clientIpFrom(headers({}))).toBeNull();
  });
});

describe("isServerless", () => {
  it("is true on Vercel/Netlify or when forced, false otherwise", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NETLIFY", "");
    vi.stubEnv("DISABLE_SSE", "");
    expect(isServerless()).toBe(false);
    vi.stubEnv("VERCEL", "1");
    expect(isServerless()).toBe(true);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DISABLE_SSE", "true");
    expect(isServerless()).toBe(true);
  });
});
