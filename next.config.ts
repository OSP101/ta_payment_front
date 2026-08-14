import type { NextConfig } from "next";

const backend = process.env.API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  experimental: {
    // Next buffers a proxied request body in memory so it can be read twice,
    // and caps that buffer at 10 MB by default. Document uploads are capped at
    // 10 MB (maxDocBytes), and multipart framing puts a 10 MB file a few
    // hundred bytes OVER that on the wire — so a file at the limit stalled here
    // and never reached the API at all. Measured: 9.5 MB proxied in 65 ms,
    // 10 MB timed out after 30 s with the request never reaching Fiber.
    //
    // 16 MB leaves headroom for the multipart envelope without inviting anything
    // larger; the real limit is still enforced server-side, which is where a
    // refusal produces a message the user can act on.
    proxyClientMaxBodySize: "16mb",
  },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` },
      { source: "/api/health", destination: `${backend}/api/health` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Sent unconditionally — browsers only ever honour this when the
          // response itself arrived over HTTPS, so it's a no-op over plain
          // HTTP in local dev rather than something that needs gating on
          // NODE_ENV. No includeSubDomains: this app doesn't own every
          // subdomain of its parent domain, and HSTS misapplied to one that
          // isn't HTTPS-ready locks users out of it, not just this app.
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
  devIndicators: false
};

export default nextConfig;
