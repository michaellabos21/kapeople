export const dynamic = "force-static";

// Staff app (tablet / phone). Separate from the customer manifest so it opens /pos, not /app.
export function GET() {
  return Response.json(
    {
      name: "Kapeople POS",
      short_name: "Kapeople POS",
      id: "/pos",
      start_url: "/pos",
      scope: "/pos",
      display: "standalone",
      background_color: "#fbf7f1",
      theme_color: "#9a4f15",
      icons: [
        { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
