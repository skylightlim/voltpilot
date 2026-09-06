import type { NextConfig } from "next";

/**
 * The browser always calls same-origin `/api/proxy/*`, which this rewrite
 * forwards to the backend. That keeps the backend URL out of the client bundle
 * and avoids CORS entirely.
 *
 * The rewrite is baked in at BUILD time, so BACKEND_URL must be present when
 * `next build` runs — not merely at runtime. In CI it comes from a repository
 * variable; see .github/workflows/ci.yml.
 */
const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;

// A production build with no backend URL used to fall back to a placeholder
// host (`your-backend-container.trycloudflare.com`). That deploys cleanly and
// then every API call fails against a domain that does not exist — a silent
// outage. Fail the build instead: a broken build is cheaper than a broken site.
if (!BACKEND_URL && process.env.NODE_ENV === "production") {
  throw new Error(
    "BACKEND_URL is required for a production build.\n" +
      "It is baked into the /api/proxy rewrite, so setting it only at runtime has no effect.\n" +
      "Set it in the environment before `next build` (CI reads the BACKEND_URL repository variable).",
  );
}

const resolved = BACKEND_URL || "http://127.0.0.1:8000"; // local dev default

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets a build run without clobbering the .next a dev server is holding open.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${resolved}/:path*`,
      },
    ];
  },
  env: {
    BACKEND_URL: resolved,
  },
};

export default nextConfig;
