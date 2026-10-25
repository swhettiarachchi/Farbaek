import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// next/font downloads these at build time and serves them from our own origin.
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Farbaek: from idea to verified software", template: "%s | Farbaek" },
  description:
    "Farbaek plans each change, runs the real checks, keeps the evidence and waits for your approval before anything ships.",
  applicationName: "Farbaek",
  // Small sizes first: a tab only needs 16 to 48 pixels, and the 512px file is 200 KB (ADR 0052).
  icons: {
    icon: [
      { url: "/brand/farbaek-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/farbaek-icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/brand/farbaek-icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/brand/farbaek-apple-icon.png",
  },
  // Added to an iPhone's Home Screen, Farbaek opens full screen under its own name (ADR 0079).
  appleWebApp: { capable: true, title: "Farbaek", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#fbfbfc",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-[100dvh] antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
