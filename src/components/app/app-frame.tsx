"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { PageTransition } from "@/components/app/page-transition";

/** Where each page's window was left, by address, for Back and Forward. Kept for the visit; nothing is stored. */
const LEFT_AT = new Map<string, number>();

/**
 * Farbaek AI's workspaces bring their own full-screen frame, with no app shell: Chat (stage 199, ADR 0213) and the image and video
 * studios (stage 201, ADR 0216).
 */
const OWN_FRAME = ["/app/chat", "/app/images", "/app/video", "/app/workbench"];

export function isChatPath(pathname: string | null): boolean {
  const p = pathname ?? "";
  return OWN_FRAME.some((root) => p === root || p.startsWith(`${root}/`));
}

/**
 * The signed-in app's frame: the sidebar, the page bands and phone header, the page, and the phone tab bar, all rendered on the
 * server and passed in. On Chat's and the studios' pages only the page shows, since they bring their own frame.
 *
 * On wide screens it is the same frame Chat has (stage 212, ADR 0230): a rounded window on a pale stage, with the spectrum's
 * light glowing from behind its edges, the sidebar inside it and the page scrolling inside it. So Home, Projects, Settings
 * and Chat are one window, and going between them changes what is in it, not the whole screen. Phones and small tablets
 * keep the page as it was: it fills the screen and the page itself scrolls, which is what a phone's browser bars expect.
 */
export function AppFrame({ sidebar, top, tabBar, children }: { sidebar: React.ReactNode; top: React.ReactNode; tabBar: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const scroller = useRef<HTMLDivElement>(null);
  const cameBackTo = useRef<string | null>(null);

  // Back and Forward return to where the page was left. The browser does that for a page that scrolls itself; a window
  // that scrolls inside itself has to remember.
  useEffect(() => {
    const back = () => {
      cameBackTo.current = window.location.pathname;
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  // A new page starts at its top. The window scrolls inside itself on wide screens, so the browser's own "top of the
  // document" isn't the top of the page there. A link to a part of a page (#appearance) is left to go where it points.
  // Before paint, and before the browser reports the shorter page's own scroll, so the place kept is the place left.
  useLayoutEffect(() => {
    const left = cameBackTo.current === pathname ? LEFT_AT.get(pathname) : undefined;
    cameBackTo.current = null;
    if (left !== undefined) scroller.current?.scrollTo({ top: left });
    else if (!window.location.hash) scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);

  if (isChatPath(pathname)) {
    return (
      <div data-signed-in className="bg-canvas">
        {children}
      </div>
    );
  }
  return (
    <div data-signed-in className="relative min-h-[100dvh] bg-canvas lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden lg:bg-canvas-2 lg:p-3 xl:p-4 2xl:p-5">
      {/* The stage's light, as behind Chat's window: still, drawn with gradients, and only on wide screens. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
        <div className="chat-halo" />
        <div className="chat-halo-fade absolute inset-0" />
      </div>
      <div className="relative bg-canvas lg:grid lg:h-full lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:overflow-hidden lg:rounded-lg lg:border lg:border-line lg:shadow-e2">
        {sidebar}
        <div ref={scroller} data-app-scroll onScroll={(e) => LEFT_AT.set(pathname ?? "", e.currentTarget.scrollTop)} className="min-w-0 lg:h-full lg:overflow-y-auto lg:overscroll-contain">
          {top}
          <main id="main" className="overflow-x-clip px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-10 lg:pb-16 lg:pt-10">
            <div className="mx-auto max-w-[1120px]">
              <PageTransition>{children}</PageTransition>
            </div>
          </main>
        </div>
        {tabBar}
      </div>
    </div>
  );
}
