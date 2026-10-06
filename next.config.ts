import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Lets you open the POS on 127.0.0.1 next to the customer app on localhost (separate cookie jars) in dev.
  allowedDevOrigins: ["127.0.0.1"],
  // PGlite (embedded Postgres) must stay a plain Node dependency, not bundled.
  // db/*.sql is read at runtime to create the schema on first start, so make sure it ships with the server bundle.
  outputFileTracingIncludes: { "/**": ["./db/**/*"] },
  // The service worker must always be re-fetched so updates reach installed apps.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
