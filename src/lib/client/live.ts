"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface LiveEvent {
  type: "orders" | "inventory" | "notification";
  orderId?: number;
}

/** Subscribes to the server event stream. Auto-reconnects via EventSource. */
export function useEvents(onEvent: (e: LiveEvent) => void) {
  const ref = useRef(onEvent);
  useEffect(() => {
    ref.current = onEvent;
  });
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (m) => {
      try {
        ref.current(JSON.parse(m.data));
      } catch {}
    };
    return () => es.close();
  }, []);
}

/**
 * Loads data, then keeps it fresh: refetches when the server says something
 * changed (matching `types`) and polls as a fallback if the stream drops.
 */
export function useLive<T>(
  load: () => Promise<T>,
  types: LiveEvent["type"][] = ["orders", "notification"],
  pollMs = 15000,
  /** Change this to force an immediate reload (e.g. when filters change). */
  key = "",
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const typesKey = types.join(",");

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
  }, [reload, pollMs, key]);

  useEvents((e) => {
    if (typesKey.split(",").includes(e.type)) void reload();
  });

  return { data, error, reload, loading: data === null && !error };
}
