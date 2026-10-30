import Link from "next/link";
import type { TrustGraph, TrustNodeKind } from "@/core/trust/trust-graph";

const COLUMNS: { kinds: TrustNodeKind[]; title: string }[] = [
  { kinds: ["person"], title: "People" },
  { kinds: ["agent", "workflow"], title: "Agents and workflows" },
  { kinds: ["project"], title: "Projects" },
  { kinds: ["integration"], title: "Connected services" },
];
const W = 960;
const COL_W = 200;
const ROW_H = 52;
const TOP = 44;

/**
 * The trust graph drawn in 2D (ADR 0132): four columns, an edge for every
 * record that connects two of them. A limited edge is dashed and an
 * inactive node faded, always with words in the lists beside it, never by
 * colour alone. Selecting a node highlights its edges.
 */
export function TrustMap({ graph, focus }: { graph: TrustGraph; focus: string | null }) {
  const x = (col: number) => 24 + col * ((W - 48 - COL_W) / (COLUMNS.length - 1));
  const pos = new Map<string, { x: number; y: number; col: number }>();
  let rows = 1;
  COLUMNS.forEach((c, col) => {
    const nodes = graph.nodes.filter((n) => c.kinds.includes(n.kind));
    rows = Math.max(rows, nodes.length);
    nodes.forEach((n, i) => pos.set(n.id, { x: x(col), y: TOP + i * ROW_H, col }));
  });
  const height = TOP + rows * ROW_H + 8;
  const near = focus ? new Set(graph.edges.filter((e) => e.from === focus || e.to === focus).flatMap((e) => [e.from, e.to])) : null;

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <svg viewBox={`0 0 ${W} ${height}`} className="min-w-[640px]" role="img" aria-label="Map of who and what can act on each project">
        {COLUMNS.map((c, col) => (
          <text key={c.title} x={x(col)} y={22} className="fill-[var(--color-ink-3)] text-[13px] font-medium">
            {c.title}
          </text>
        ))}
        {graph.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b || a.col === b.col) return null;
          const [l, r] = a.col < b.col ? [a, b] : [b, a];
          const on = focus ? e.from === focus || e.to === focus : true;
          const x1 = l.x + COL_W;
          const y1 = l.y + 16;
          const x2 = r.x;
          const y2 = r.y + 16;
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              strokeWidth={on && focus ? 2 : 1.25}
              strokeDasharray={e.limited ? "5 4" : undefined}
              className={on ? (e.limited ? "stroke-[var(--color-approval)]" : "stroke-[var(--color-accent)]") : "stroke-[var(--color-line)]"}
              opacity={on ? (focus ? 0.9 : 0.45) : 0.35}
            />
          );
        })}
        {graph.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const dim = (near && !near.has(n.id)) || n.inactive;
          return (
            <Link key={n.id} href={`?node=${encodeURIComponent(n.id)}#focus`} aria-label={`${n.label}: ${n.detail}`}>
              <g opacity={dim ? 0.45 : 1}>
                <rect x={p.x} y={p.y} width={COL_W} height={32} rx={16} className={n.id === focus ? "fill-[var(--color-accent)]" : "fill-[var(--color-surface-raised)] stroke-[var(--color-line)]"} />
                <text x={p.x + 14} y={p.y + 20.5} className={`text-[13px] ${n.id === focus ? "fill-[var(--color-on-accent)]" : "fill-[var(--color-ink)]"}`}>
                  {n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}
                </text>
              </g>
            </Link>
          );
        })}
      </svg>
    </div>
  );
}
