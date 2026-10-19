/**
 * Drawn artwork for the showroom's concept mockups (ADR 0031): original SVG,
 * nothing fetched, sharp at any size. Colours here belong to the concepts,
 * not to Farbaek's interface.
 */

/** Maison Ore's bag: graphite leather on a lit plinth. */
export function Handbag({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 190" className={className} aria-hidden>
      <defs>
        <linearGradient id="ore-leather" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a3c42" />
          <stop offset="0.55" stopColor="#1b1c20" />
          <stop offset="1" stopColor="#0c0d0f" />
        </linearGradient>
        <linearGradient id="ore-flap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#45474e" />
          <stop offset="1" stopColor="#202125" />
        </linearGradient>
        <radialGradient id="ore-shine" cx="0.3" cy="0.25" r="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="176" rx="74" ry="9" fill="#000000" opacity="0.18" />
      <path d="M62 66c0-34 76-34 76 0" fill="none" stroke="#1b1c20" strokeWidth="9" strokeLinecap="round" />
      <path d="M66 66c0-28 68-28 68 0" fill="none" stroke="#4a4d55" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M38 76h124l10 82a14 14 0 0 1-14 16H42a14 14 0 0 1-14-16z" fill="url(#ore-leather)" />
      <path d="M38 76h124l10 82a14 14 0 0 1-14 16H42a14 14 0 0 1-14-16z" fill="url(#ore-shine)" />
      <path d="M36 76h128c0 30-28 48-64 48S36 106 36 76z" fill="url(#ore-flap)" />
      <path d="M44 82h112c-4 22-26 34-56 34s-52-12-56-34z" fill="none" stroke="#6e737c" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
      <rect x="92" y="114" width="16" height="10" rx="3" fill="#9db7cc" />
      <rect x="95" y="117" width="10" height="4" rx="2" fill="#16171a" opacity="0.5" />
    </svg>
  );
}

/** Halo One: the finish colour comes from `finish`, so the swatches can recolour it. */
export function Headphones({ finish, className = "" }: { finish: string; className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden>
      <defs>
        <linearGradient id="halo-band" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#15171b" />
          <stop offset="0.5" stopColor="#3a3d44" />
          <stop offset="1" stopColor="#15171b" />
        </linearGradient>
        <radialGradient id="halo-gloss" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="halo-cushion" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a2c32" />
          <stop offset="1" stopColor="#0d0e11" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="222" rx="80" ry="8" fill="#000000" opacity="0.16" />
      <path d="M46 132C46 56 194 56 194 132" fill="none" stroke="url(#halo-band)" strokeWidth="14" strokeLinecap="round" />
      <path d="M58 120C64 72 176 72 182 120" fill="none" stroke={finish} strokeWidth="5" strokeLinecap="round" opacity="0.9" />
      <rect x="40" y="112" width="14" height="40" rx="7" fill="#2a2c32" />
      <rect x="186" y="112" width="14" height="40" rx="7" fill="#2a2c32" />
      <rect x="22" y="134" width="56" height="78" rx="26" fill="url(#halo-cushion)" />
      <rect x="28" y="130" width="54" height="80" rx="25" fill={finish} />
      <rect x="28" y="130" width="54" height="80" rx="25" fill="url(#halo-gloss)" />
      <circle cx="55" cy="170" r="11" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
      <rect x="162" y="134" width="56" height="78" rx="26" fill="url(#halo-cushion)" />
      <rect x="158" y="130" width="54" height="80" rx="25" fill={finish} />
      <rect x="158" y="130" width="54" height="80" rx="25" fill="url(#halo-gloss)" />
      <circle cx="185" cy="170" r="11" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
    </svg>
  );
}

/** Kumo, the cloud. */
export function KumoCloud({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden>
      <ellipse cx="100" cy="140" rx="58" ry="7" fill="#2a2340" opacity="0.1" />
      <path d="M52 124c-24 0-38-16-36-34 2-17 18-28 34-24 2-24 22-40 46-38 18 2 32 14 36 30 20-6 42 8 44 30 2 20-14 36-36 36z" fill="#ffffff" />
      <path d="M52 124c-24 0-38-16-36-34 2-17 18-28 34-24 2-24 22-40 46-38 18 2 32 14 36 30 20-6 42 8 44 30 2 20-14 36-36 36z" fill="none" stroke="#2a2340" strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="78" cy="88" rx="6" ry="8" fill="#2a2340" />
      <ellipse cx="122" cy="88" rx="6" ry="8" fill="#2a2340" />
      <circle cx="80" cy="85" r="2" fill="#ffffff" />
      <circle cx="124" cy="85" r="2" fill="#ffffff" />
      <path d="M92 100c4 5 12 5 16 0" fill="none" stroke="#2a2340" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="62" cy="102" rx="9" ry="5" fill="#ff8c69" opacity="0.6" />
      <ellipse cx="138" cy="102" rx="9" ry="5" fill="#ff8c69" opacity="0.6" />
    </svg>
  );
}

/** Kumo's stickers. */
export function Sticker({ kind, className = "" }: { kind: "star" | "drop" | "book" | "heart"; className?: string }) {
  const shapes = {
    star: <path d="M30 6l7 15 16 2-12 11 3 16-14-8-14 8 3-16L7 23l16-2z" fill="#ffe07a" stroke="#2a2340" strokeWidth="3" strokeLinejoin="round" />,
    drop: <path d="M30 6c10 14 18 24 18 34a18 18 0 0 1-36 0c0-10 8-20 18-34z" fill="#9cc3ff" stroke="#2a2340" strokeWidth="3" strokeLinejoin="round" />,
    book: (
      <g stroke="#2a2340" strokeWidth="3" strokeLinejoin="round">
        <path d="M8 14h20a4 4 0 0 1 4 4v30a4 4 0 0 0-4-4H8z" fill="#ff8c69" />
        <path d="M52 14H32a4 4 0 0 0-4 4v30a4 4 0 0 1 4-4h20z" fill="#ffb4a2" />
      </g>
    ),
    heart: <path d="M30 50S8 36 8 22a11 11 0 0 1 22-4 11 11 0 0 1 22 4c0 14-22 28-22 28z" fill="#ff8c69" stroke="#2a2340" strokeWidth="3" strokeLinejoin="round" />,
  };
  return (
    <svg viewBox="0 0 60 60" className={className} aria-hidden>
      <g transform="translate(2 3)" opacity="0.18">
        {shapes[kind]}
      </g>
      {shapes[kind]}
    </svg>
  );
}

/** A progress ring, as Tally's balance. */
export function Ring({ value, track, fill, className = "" }: { value: number; track: string; fill: string; className?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={fill}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        transform="rotate(-90 50 50)"
        className="motion-safe:animate-[showcase-ring_1.6s_cubic-bezier(0.16,1,0.3,1)_both]"
        style={{ ["--ring-from" as string]: String(c) }}
      />
    </svg>
  );
}
