import Image from "next/image";

/**
 * The owner-supplied Farbaek logo, used unaltered (public/brand/farbaek-logo.webp,
 * 1024x1536 with transparency). Never recolour, crop or redraw it.
 */
export const LOGO = { src: "/brand/farbaek-logo.webp", width: 1024, height: 1536 } as const;

/** Lit surface behind the logo so the black armour stays visible on dark backgrounds. */
export const PLATE_BACKGROUND = "radial-gradient(120% 85% at 50% 38%, var(--plate-center) 0%, var(--plate-edge) 100%)";

export function BrandLogo({ height = 36, className = "", preload = false }: { height?: number; className?: string; preload?: boolean }) {
  const width = Math.round((height * LOGO.width) / LOGO.height);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-sm border border-line ${className}`}
      style={{ background: PLATE_BACKGROUND, padding: `${Math.round(height * 0.08)}px ${Math.round(height * 0.18)}px` }}
    >
      <Image src={LOGO.src} alt="Farbaek" width={width} height={height} preload={preload} sizes={`${width}px`} />
    </span>
  );
}
