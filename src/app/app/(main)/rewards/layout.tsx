import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rewards · Kapeople" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
