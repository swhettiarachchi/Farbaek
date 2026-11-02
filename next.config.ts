import type { NextConfig } from "next";
import { OFFICE_STATIC_HEADERS, officeHostPattern } from "./src/server/http/office-headers";

// Baseline headers for every route. A nonce-based script-src CSP arrives with the
// authenticated app routes (Stage 1); see docs/security/threat-model.md.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

// Office Space (ADR 0032) has its own, stricter set; the proxy adds its nonce CSP.
const OFFICE_HOST = officeHostPattern(process.env.OFFICE_HOST);

// Farbaek for Android buys plans through Google Play with the Payment Request API (ADR 0154). Only Farbaek's
// own host may use it: people's published sites, previews and frames keep payment=(). Without the site URL
// at build time there's no exception, so purchases fail closed.
const APP_HOST = (() => {
  try {
    // The hostname, without a port: Next.js matches a host rule against the Host header's name only.
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") || null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // AVIF first, WebP for browsers without it: the same images in fewer bytes on phones (ADR 0052).
  images: { formats: ["image/avif", "image/webp"] },
  reactStrictMode: true,
  experimental: {
    // Project imports send up to 4 MB of text (src/config/workspace.ts); JSON escaping and form encoding add overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    // Preview hosts are excluded: the sandbox preview gateway sets their headers,
    // including frame-ancestors for the app's own origin.
    return [
      {
        source: "/(.*)",
        missing: [
          { type: "host", value: "p-[a-zA-Z2-7]{26}\\..*" },
          { type: "host", value: OFFICE_HOST },
        ],
        headers: securityHeaders,
      },
      { source: "/(.*)", has: [{ type: "host", value: OFFICE_HOST }], headers: [...OFFICE_STATIC_HEADERS] },
      // Later rules win for the same header: payment for Farbaek's own pages only.
      ...(APP_HOST
        ? [{ source: "/(.*)", has: [{ type: "host" as const, value: APP_HOST }], headers: [{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" }] }]
        : []),
      // Film recordings and tracks are requested with their content hash (?v=, ADR 0051), so a
      // phone can keep them; a re-recording has a new URL. Unversioned requests keep the default.
      {
        source: "/films/:path*",
        has: [{ type: "query", key: "v", value: "[0-9a-f]{12}" }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
