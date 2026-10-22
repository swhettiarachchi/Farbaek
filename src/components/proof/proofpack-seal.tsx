import { sealGeometry } from "@/core/proof/seal";
import { shortHash } from "@/core/trust/canonical-json";

/**
 * The engraved Seal for a verified ProofPack, generated from its SHA-256
 * digest. Only render it for verified evidence or a clearly labelled sample.
 */
export function ProofPackSeal({
  hash,
  caption,
  size = 240,
  className = "",
  tone = "page",
  idSuffix = "",
}: {
  hash: string;
  caption: string;
  size?: number;
  className?: string;
  /** "media" for dark media panels such as the evidence terminal. */
  tone?: "page" | "media";
  /** Keeps SVG ids unique when the same digest is drawn twice on a page. */
  idSuffix?: string;
}) {
  const g = sealGeometry(hash, size);
  const pathId = `seal-ring-${hash.slice(0, 12)}${idSuffix}`;
  const r = g.textRadius;
  const c = g.center;
  const ringText = `${caption}  ${shortHash(hash, 8, 6)}`.toUpperCase();

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${caption}. Seal generated from ${shortHash(hash, 8, 6)}.`}
      className={`${tone === "media" ? "text-media-ink-2" : "text-seal"} ${className}`}
    >
      <defs>
        <path id={pathId} d={`M ${c - r} ${c} a ${r} ${r} 0 1 1 ${2 * r} 0 a ${r} ${r} 0 1 1 ${-2 * r} 0`} />
      </defs>
      <g fill="none" stroke="currentColor">
        <circle className="seal-part" pathLength={1} cx={c} cy={c} r={g.outerRadius} strokeWidth={1} />
        <circle className="seal-part" pathLength={1} cx={c} cy={c} r={g.outerRadius - 9} strokeWidth={0.5} />
        <circle className="seal-part" pathLength={1} cx={c} cy={c} r={g.innerRadius} strokeWidth={0.5} />
        <path className="seal-part" pathLength={1} d={g.ticks} strokeWidth={0.8} strokeLinecap="round" />
        {g.layers.map((layer, i) => (
          <path key={i} className="seal-part" pathLength={1} style={{ "--i": i + 1 } as React.CSSProperties} d={layer.d} strokeWidth={0.55} opacity={layer.opacity} strokeLinejoin="round" />
        ))}
      </g>
      <circle cx={c} cy={c} r={2.5} fill="currentColor" />
      <text fill="currentColor" fontFamily="var(--font-mono)" fontSize={8} letterSpacing={1.4}>
        <textPath href={`#${pathId}`} startOffset="25%" textAnchor="middle">
          {ringText}
        </textPath>
      </text>
    </svg>
  );
}
