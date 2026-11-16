"use client";

import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/app/page-transition";

/**
 * Farbaek AI's workspaces bring their own full-screen frame, with no app shell: Chat (stage 199, ADR 0213) and the image and video
 * studios (stage 201, ADR 0216).
 */
const OWN_FRAME = ["/app/chat", "/app/images", "/app/video"];

export function isChatPath(pathname: string | null): boolean {
  const p = pathname ?? "";
  return OWN_FRAME.some((root) => p === root || p.startsWith(`${root}/`));
}

/**
 * The signed-in app's frame: the sidebar, the page bands and phone header, the page, and the phone tab bar, all rendered on the
 * server and passed in. On Chat's and the studios' pages only the page shows, since they bring their own frame.
 */
export function AppFrame({ sidebar, top, tabBar, children }: { sidebar: React.ReactNode; top: React.ReactNode; tabBar: React.ReactNode; children: React.ReactNode }) {
  if (isChatPath(usePathname())) {
    return (
      <div data-signed-in className="bg-canvas">
        {children}
      </div>
    );
  }
  return (
    <div data-signed-in className="min-h-[100dvh] bg-canvas lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      {sidebar}
      <div className="min-w-0">
        {top}
        <main id="main" className="overflow-x-clip px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-10 lg:pb-16 lg:pt-10">
          <div className="mx-auto max-w-[1120px]">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
      {tabBar}
    </div>
  );
}
