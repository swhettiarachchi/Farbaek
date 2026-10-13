import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import "./globals.css";

// next/font downloads these at build time and serves them from our own origin.
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Farbaek: from idea to verified software", template: "%s | Farbaek" },
  description:
    "Farbaek plans each change, runs the real checks, keeps the evidence and waits for your approval before anything ships. Now in development.",
  applicationName: "Farbaek",
  icons: { icon: "/brand/farbaek-icon.png", apple: "/brand/farbaek-apple-icon.png" },
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
        <SiteHeader />
        <main id="main" className="overflow-x-clip">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
