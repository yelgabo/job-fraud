import type { NextConfig } from "next"

// Next's App Router hydrates through inline scripts, so script-src needs 'unsafe-inline' unless
// every page takes a per-request nonce; the site loads nothing from other origins. `next dev`
// also needs 'unsafe-eval' for its reloader.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/engines"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // The audit token is in the path, so these pages must not send it on to sites they link to.
        source: "/audit/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ]
  },
}

export default nextConfig
