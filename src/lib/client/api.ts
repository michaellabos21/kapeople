export async function api<T = unknown>(url: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(url, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
    // Session expired or signed out in another tab: go to the right sign-in page.
    const path = window.location.pathname;
    if (!path.endsWith("/login")) window.location.assign(path.startsWith("/app") ? "/app/login" : "/pos/login");
  }
  if (!res.ok) {
    const err = new Error(data?.error ?? "Something went wrong.") as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data as T;
}
