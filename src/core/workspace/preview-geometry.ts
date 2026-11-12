/**
 * How a site preview is drawn in the space it has (ADR 0195): the width the
 * site's own window gets, so it lays itself out as it would on that device,
 * and how far that window is scaled to fit.
 */
export type PreviewDevice = "phone" | "tablet" | "desktop";

/** Below this the preview is itself on a phone: "Phone" fills it, and the site sees the real width. */
export const PHONE_SPACE = 640;
const PHONE_WIDTH = 390;
const TABLET_WIDTH = 820;
const DESKTOP_WIDTH = 1280;
/** From this width a desktop layout fits as it is. */
const DESKTOP_FITS = 1024;

export function frameGeometry(device: PreviewDevice, space: number): { width: number; scale: number } {
  if (!(space > 0)) return { width: 0, scale: 1 };
  if (device === "phone") return { width: space <= PHONE_SPACE ? space : PHONE_WIDTH, scale: 1 };
  if (device === "tablet") return { width: TABLET_WIDTH, scale: Math.min(1, space / TABLET_WIDTH) };
  return space >= DESKTOP_FITS ? { width: space, scale: 1 } : { width: DESKTOP_WIDTH, scale: space / DESKTOP_WIDTH };
}

/** Until the person picks, the preview matches where it's seen: on a phone, the phone layout. */
export function defaultDevice(space: number): PreviewDevice {
  return space > 0 && space < PHONE_SPACE ? "phone" : "desktop";
}
