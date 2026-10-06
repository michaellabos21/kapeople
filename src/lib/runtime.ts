/**
 * Serverless hosts (Vercel, Netlify) can't keep an event stream open or share the in-memory event bus between
 * instances, so live updates fall back to client polling there. DISABLE_SSE=true forces the same elsewhere.
 */
export const isServerless = () =>
  process.env.DISABLE_SSE === "true" || !!process.env.VERCEL || !!process.env.NETLIFY;

/**
 * Client IP for throttling, or null when there's no trustworthy one. Each host sets its own header and strips
 * look-alikes from the request, so we only trust the header belonging to the platform we're running on:
 * a visitor can forge x-nf-client-connection-ip on Vercel (and vice versa) to dodge a rate limit.
 */
export function clientIpFrom(h: { get(name: string): string | null }): string | null {
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  if (process.env.VERCEL) return first(h.get("x-vercel-forwarded-for")) ?? first(h.get("x-real-ip")) ?? first(h.get("x-forwarded-for"));
  if (process.env.NETLIFY) return first(h.get("x-nf-client-connection-ip")) ?? first(h.get("x-forwarded-for"));
  return first(h.get("x-nf-client-connection-ip")) ?? first(h.get("x-forwarded-for")); // local / self-hosted behind a proxy
}
