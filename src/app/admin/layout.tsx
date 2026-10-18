import { ArrowLeftIcon, CheckCircleIcon, CircleDashedIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { PageTransition } from "@/components/app/page-transition";
import { BrandLogo } from "@/components/brand/brand-logo";
import { requireAdmin } from "@/server/admin/access";
import { deploymentConnections, deploymentLabel, type Connection } from "@/server/admin/data";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Always rendered per request, and only for an admin (ADR 0026).
export const dynamic = "force-dynamic";

/**
 * What this deployment has connected, at the top of every console page.
 * Each item says on or off in words and icon; the reason is one tap away.
 */
function ConnectionsStrip({ connections, deployment }: { connections: Connection[]; deployment: string }) {
  return (
    <section aria-label="This deployment" className="rounded-md border border-line bg-surface px-4 py-3 shadow-e1">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="font-mono text-xs text-ink-3">{`// ${deployment}`}</p>
        <ul className="flex flex-wrap gap-1.5">
          {connections.map((c) => (
            <li key={c.name}>
              <span
                title={c.detail}
                className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs ${c.on ? "border-verified/35 text-ink" : "border-dashed border-line-strong/50 text-ink-2"}`}
              >
                {c.on ? <CheckCircleIcon size={14} weight="fill" className="text-verified" aria-hidden /> : <CircleDashedIcon size={14} className="text-ink-3" aria-hidden />}
                {c.name}
                <span className="sr-only">{c.on ? ": on." : ": off."} {c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireAdmin();

  return (
    <div className="min-h-[100dvh] bg-canvas lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-6 overflow-y-auto border-r border-line bg-canvas-2 px-4 py-5 lg:flex">
        <div className="grid gap-1 px-1.5">
          <Link href="/admin" className="flex w-fit items-center gap-2 rounded-full" aria-label="Farbaek admin console, overview">
            <BrandLogo height={30} />
            <span className="text-[16px] font-semibold tracking-[-0.02em]">Farbaek</span>
          </Link>
          <p className="font-mono text-xs text-ink-3">{"// admin console"}</p>
        </div>
        <AdminNav layout="column" />
        <div className="mt-auto grid gap-3 border-t border-line pt-4">
          <Link href="/app" className="inline-flex min-h-11 items-center gap-2 px-2 text-sm text-ink-2 hover:text-ink">
            <ArrowLeftIcon size={16} aria-hidden /> Back to the app
          </Link>
          <p className="truncate px-2 text-xs text-ink-3">Signed in as {user.email}</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 grid gap-2 border-b border-line bg-canvas/90 px-4 pb-2 pt-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" className="flex items-center gap-2 rounded-full" aria-label="Farbaek admin console, overview">
              <BrandLogo height={28} />
              <span className="font-mono text-xs text-ink-3">{"// admin"}</span>
            </Link>
            <Link href="/app" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-2">
              <ArrowLeftIcon size={16} aria-hidden /> App
            </Link>
          </div>
          <AdminNav layout="row" />
        </header>

        <main id="main" className="px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <div className="mx-auto grid max-w-[1180px] gap-8">
            <ConnectionsStrip connections={deploymentConnections()} deployment={deploymentLabel()} />
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
