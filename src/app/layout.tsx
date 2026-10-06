import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kapeople",
  description: "Order ahead, earn points, and pick up fresh coffee.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#a8591a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
