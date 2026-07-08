import type { NextConfig } from "next";

const backend = process.env.API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` },
      { source: "/api/health", destination: `${backend}/api/health` },
    ];
  },
};

export default nextConfig;
