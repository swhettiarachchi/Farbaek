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

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
    ];
  },
};

export default nextConfig;
