import { EventEmitter } from "node:events";

/** In-process change feed behind /api/events. Clients refetch when told something changed. */
export interface BusEvent {
  type: "orders" | "inventory" | "notification";
  orderId?: number;
  /** For notifications: only this user should hear it. */
  userId?: number;
}

const g = globalThis as unknown as { __kapeopleBus?: EventEmitter };
const emitter = (g.__kapeopleBus ??= new EventEmitter().setMaxListeners(0));

export const publish = (e: BusEvent) => emitter.emit("event", e);
export const subscribe = (fn: (e: BusEvent) => void) => {
  emitter.on("event", fn);
  return () => emitter.off("event", fn);
};
