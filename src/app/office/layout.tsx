import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { officeClients } from "@/server/office/access";

export const metadata: Metadata = {
  title: { default: "Office Space", template: "%s | Office Space" },
  robots: { index: false, follow: false, nocache: true },
};

// Rendered per request, so the proxy's nonce reaches every script (ADR 0032).
export const dynamic = "force-dynamic";

/** Office Space exists only on its own host, and only when it's set up. Everywhere else it's not found. */
export default async function OfficeRoot({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!(await officeClients())) notFound();
  return <div className="min-h-[100dvh] bg-canvas">{children}</div>;
}
