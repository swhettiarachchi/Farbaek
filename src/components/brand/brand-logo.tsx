import Image from "next/image";

/**
 * The owner-supplied Farbaek logo (ADR 0226): the black cat, used unaltered (public/brand/farbaek-logo-v2.webp,
 * 832x1073, the paper round the cat transparent). It sits directly on the page: no frame, filter or recolouring.
 * On Chat's dark theme it sits on its own white paper, since a black cat can't be seen on a dark page
 * (`data-brand-logo`, src/styles/chat-theme.css). `node scripts/brand-assets.mjs` makes it from the owner's image.
 */
export const LOGO = { src: "/brand/farbaek-logo-v2.webp", width: 832, height: 1073 } as const;

export function BrandLogo({ height = 36, className = "", preload = false }: { height?: number; className?: string; preload?: boolean }) {
  const width = Math.round((height * LOGO.width) / LOGO.height);
  return (
    <Image data-brand-logo="" src={LOGO.src} alt="Farbaek" width={width} height={height} preload={preload} sizes={`${width}px`} className={`shrink-0 ${className}`} />
  );
}
