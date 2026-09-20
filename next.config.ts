import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * CSP pragmática para Next: los payloads RSC/hidratación van inline, así que
 * script-src necesita 'unsafe-inline' (la alternativa sería nonces por
 * request vía middleware). Solo en producción — en dev, HMR usa eval/ws.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  ...(isProd
    ? [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "Content-Security-Policy", value: CSP },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg", "pg-cloudflare"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
