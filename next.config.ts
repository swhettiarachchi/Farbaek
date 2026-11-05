import type { NextConfig } from "next";
import { OFFICE_STATIC_HEADERS, officeHostPattern } from "./src/server/http/office-headers";

// Baseline headers for every route. A nonce-based script-src CSP arrives with the
// authenticated app routes (Stage 1); see docs/security/threat-model.md.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // No includeSubDomains here: these headers also reach people's published sites, and on their own domain it would force
  // every other host of that domain to https. Farbaek's own host adds it below (ADR 0175).
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

// Every path but the preview frame (ADR 0169), which the app frames and which sends its own headers.
const NOT_PREVIEW_FRAME = "/:path((?!preview-frame$).*)";

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
    // including frame-ancestors for the app's own origin. So is the preview frame
    // (ADR 0169): the app frames it, and its route sends its own policy.
    return [
      {
        source: NOT_PREVIEW_FRAME,
        missing: [
          { type: "host", value: "p-[a-zA-Z2-7]{26}\\..*" },
          { type: "host", value: OFFICE_HOST },
        ],
        headers: securityHeaders,
      },
      // The exception is for Farbaek's own host only: on a published site or a custom domain,
      // a person's own /preview-frame page keeps the same headers as every other page.
      ...(APP_HOST
        ? [
            {
              source: "/preview-frame",
              missing: [
                { type: "host" as const, value: "p-[a-zA-Z2-7]{26}\\..*" },
                { type: "host" as const, value: OFFICE_HOST },
                { type: "host" as const, value: APP_HOST },
              ],
              headers: securityHeaders,
            },
          ]
        : []),
      { source: "/(.*)", has: [{ type: "host", value: OFFICE_HOST }], headers: [...OFFICE_STATIC_HEADERS] },
      // Later rules win for the same header: payment for Farbaek's own pages only.
      ...(APP_HOST
        ? [{ source: NOT_PREVIEW_FRAME, has: [{ type: "host" as const, value: APP_HOST }], headers: [{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" }, { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] }]
        : []),
      // Farbaek Scenes and the media library (ADR 0156) load into people's published sites and
      // previews, from other origins: module scripts and WebGL textures need CORS. Library files
      // never change under their versioned path; the kit may get fixes, so it's cached for a day.
      {
        source: "/media/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/kit/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
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
