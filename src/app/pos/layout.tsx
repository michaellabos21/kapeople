import type { Metadata } from "next";

export const metadata: Metadata = { title: "POS · Kapeople", robots: { index: false, follow: false } };

export default function PosRoot({ children }: { children: React.ReactNode }) {
  return children;
}
