import type { MetadataRoute } from "next";

/**
 * Farbaek as an installed app on phones and computers (ADR 0079): it opens
 * Mission Control full screen, with shortcuts to Approvals and a new build.
 * The colours match the canvas token (src/styles/tokens.css), since a
 * manifest can't read CSS.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Farbaek",
    short_name: "Farbaek",
    description: "From idea to verified software, with control at every step.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#fbfbfc",
    theme_color: "#fbfbfc",
    categories: ["developer", "productivity"],
    icons: [
      { src: "/brand/farbaek-app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/farbaek-app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/farbaek-app-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Approvals", short_name: "Approvals", url: "/app/approvals", icons: [{ src: "/brand/farbaek-app-192.png", sizes: "192x192" }] },
      { name: "New build", short_name: "Build", url: "/app/new", icons: [{ src: "/brand/farbaek-app-192.png", sizes: "192x192" }] },
    ],
  };
}
