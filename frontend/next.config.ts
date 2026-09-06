import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || "https://your-backend-container.trycloudflare.com";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
  env: {
    BACKEND_URL,
  },
};

export default nextConfig;
