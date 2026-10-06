import type { MetadataRoute } from "next";

// Customer app. Installed from the home screen it opens full screen at /app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kapeople",
    short_name: "Kapeople",
    description: "Order ahead, earn points, and pick up fresh coffee.",
    id: "/app",
    start_url: "/app",
    scope: "/app",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf7f1",
    theme_color: "#9a4f15",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
