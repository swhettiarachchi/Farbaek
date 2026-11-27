"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * What the navigation counts for a person (stage 287, ADR 0295): changes waiting for their yes or no, and replies from
 * Farbaek they haven't read. The signed-in layout reads them once, on the server, and every frame's list of places shows
 * them from here: the count on Approvals, and a mark on More where Help is behind it (Chat's sidebar, the studios' and
 * the rail beside Build's workspace). The app's own sidebar lists Help itself and shows the replies there.
 */
export interface NavCounts {
  approvals: number;
  helpUnread: number;
}

const NONE: NavCounts = { approvals: 0, helpUnread: 0 };
const Counts = createContext<NavCounts>(NONE);

export function NavCountsProvider({ approvals, helpUnread, children }: NavCounts & { children: ReactNode }) {
  const value = useMemo(() => ({ approvals, helpUnread }), [approvals, helpUnread]);
  return <Counts.Provider value={value}>{children}</Counts.Provider>;
}

/** Zero for both outside the signed-in layout, so a list of places can be drawn anywhere. */
export function useNavCounts(): NavCounts {
  return useContext(Counts);
}
