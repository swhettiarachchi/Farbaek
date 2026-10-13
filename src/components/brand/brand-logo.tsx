import Image from "next/image";

/**
 * The owner-supplied Farbaek logo, used unaltered (public/brand/farbaek-logo.webp,
 * 1024x1536, transparent background). It sits directly on the page: no plate,
 * frame, filter or recolouring.
 */
export const LOGO = { src: "/brand/farbaek-logo.webp", width: 1024, height: 1536 } as const;

export function BrandLogo({ height = 36, className = "", preload = false }: { height?: number; className?: string; preload?: boolean }) {
  const width = Math.round((height * LOGO.width) / LOGO.height);
  return (
    <Image src={LOGO.src} alt="Farbaek" width={width} height={height} preload={preload} sizes={`${width}px`} className={`shrink-0 ${className}`} />
  );
}
