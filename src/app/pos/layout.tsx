import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "POS · Kapeople",
  robots: { index: false, follow: false },
  manifest: "/pos/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kapeople POS", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export default function PosRoot({ children }: { children: React.ReactNode }) {
  return children;
}
