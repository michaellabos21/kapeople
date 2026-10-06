import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kapeople",
  description: "Order ahead, earn points, and pick up fresh coffee.",
  // iOS: open full screen (no Safari bars) when launched from the home screen.
  appleWebApp: { capable: true, title: "Kapeople", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // Older iOS versions only honour Apple's own tag (Next emits just the generic one).
  other: { "apple-mobile-web-app-capable": "yes" },
};

// viewportFit "cover" lets the app use the full screen; safe-area padding keeps content clear of the notch / home bar.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#9a4f15" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
