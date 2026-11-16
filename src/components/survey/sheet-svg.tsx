import { memo, type PointerEvent as ReactPointerEvent } from "react";
import { entityGroup } from "@/core/survey/sheet/entities";
import type { SceneColor, SceneItem, SheetPage } from "@/core/survey/sheet/scene";

/**
 * Draws one composed sheet page as SVG in millimetres: the same scene the PDF
 * writer prints (ADR 0201), so the preview is the plan. Colours come from the
 * design tokens on screen; the printed PDF uses the template's black ink.
 */

const COLOR: Record<SceneColor, string> = {
  ink: "var(--color-ink)",
  muted: "var(--color-ink-2)",
  faint: "var(--color-ink-3)",
  red: "var(--color-failed)",
  paper: "var(--color-surface)",
};

export interface SheetSvgProps {
  page: SheetPage;
  /** The visible area, in page millimetres: [x, y, width, height]. Defaults to the whole page. */
  viewBox?: [number, number, number, number];
  /** Layers to leave out. */
  hidden?: ReadonlySet<string>;
  selected?: string | null;
  /**
   * Items picked on the sheet, in the order picked (stage 195): each shows as selected, and picked points carry their order, so "these
   * points" reads as a ring before anything is drawn through them.
   */
  picked?: readonly string[];
  /** What a change adds or alters, by item (lot:<id>, road:<id>...): shown with the accent while it's looked at, and for a turn after. */
  marks?: ReadonlySet<string>;
  /** Whether an item can be dragged (a label on an unlocked layer), so it shows a move cursor. */
  draggable?: (item: SceneItem) => boolean;
  onEntityPointerDown?: (item: SceneItem, event: ReactPointerEvent<SVGElement>) => void;
  label: string;
  className?: string;
  /** Marks lines to draw themselves and text to fade in, for the showcase (CSS in globals.css, never under reduced motion). */
  draw?: boolean;
  /**
   * Invisible, wider strokes under the lines and points, so a finger near one picks it (stage 196): 14px for a line, 20px for a point,
   * whatever the zoom. Where things on the sheet can be tapped (the editor), not where it's only shown.
   */
  hitTargets?: boolean;
}

type ItemsProps = Omit<SheetSvgProps, "viewBox" | "label" | "className">;

function itemProps(item: SceneItem, props: ItemsProps, picked: ReadonlySet<string>) {
  const entity = item.entity;
  const selected = entity !== undefined && (entity === props.selected || picked.has(entity));
  const marked = entity !== undefined && props.marks !== undefined && (props.marks.has(entity) || props.marks.has(entityGroup(entity)));
  return {
    "data-entity": entity,
    style: entity && props.draggable?.(item) ? { cursor: "move" } : entity && props.onEntityPointerDown ? { cursor: "pointer" } : undefined,
    onPointerDown: entity && props.onEntityPointerDown ? (e: ReactPointerEvent<SVGElement>) => props.onEntityPointerDown!(item, e) : undefined,
    selected,
    marked,
  };
}

/** Rotation, then the lean of slanted lettering, both about the text's own point, as the PDF writer applies them. */
function textTransform(item: { x: number; y: number; rotate: number; slant?: number }): string | undefined {
  if (!item.rotate && !item.slant) return undefined;
  const x = item.x.toFixed(3);
  const y = item.y.toFixed(3);
  const parts = [`translate(${x} ${y})`];
  if (item.rotate) parts.push(`rotate(${item.rotate.toFixed(3)})`);
  if (item.slant) parts.push(`skewX(${(-item.slant).toFixed(3)})`);
  parts.push(`translate(${-item.x} ${-item.y})`);
  return parts.join(" ");
}

export function SheetSvg(props: SheetSvgProps) {
  const { page, viewBox, label, className, ...items } = props;
  const [vx, vy, vw, vh] = viewBox ?? [0, 0, page.widthMm, page.heightMm];
  return (
    <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label={label} className={className} preserveAspectRatio="xMidYMid meet">
      <rect x={0} y={0} width={page.widthMm} height={page.heightMm} fill="var(--color-surface)" />
      <Items page={page} {...items} badge={Math.max(1.6, vw / 120)} />
    </svg>
  );
}

const pathOf = (item: Extract<SceneItem, { kind: "path" }>) => item.points.map(([x, y], j) => `${j === 0 ? "M" : "L"}${x.toFixed(3)} ${y.toFixed(3)}`).join(" ") + (item.closed ? " Z" : "");

/** Everything drawn on the page. Memoised, so panning and zooming only move the view. */
const Items = memo(function Items(props: ItemsProps & { page: SheetPage; badge: number }) {
  const { page, badge } = props;
  const picked = new Set(props.picked ?? []);
  // Where each picked point sits, for its order number: the point's own circle on the sheet.
  const order = (props.picked ?? [])
    .map((e, i) => {
      const id = entityGroup(e);
      const circle = id.startsWith("pt:") ? page.items.find((it): it is Extract<SceneItem, { kind: "circle" }> => it.kind === "circle" && it.entity !== undefined && entityGroup(it.entity) === id) : undefined;
      return circle ? { n: i + 1, x: circle.cx, y: circle.cy, r: circle.r } : null;
    })
    .filter((o): o is { n: number; x: number; y: number; r: number } => o !== null);
  const pick = props.hitTargets ? props.onEntityPointerDown : undefined;
  return (
    <>
      {pick ? (
        // Lines: under the drawing, so what's drawn keeps its own exact edge, and a tap near a line still finds it.
        <g aria-hidden>
          {page.items.map((item, i) =>
            item.kind === "path" && item.entity && !props.hidden?.has(item.layer) ? (
              <path key={`hit-${i}`} d={pathOf(item)} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" pointerEvents="stroke" onPointerDown={(e) => pick(item, e)} />
            ) : null,
          )}
        </g>
      ) : null}
      {page.items.map((item, i) => {
        if (props.hidden?.has(item.layer)) return null;
        const { selected, marked, ...p } = itemProps(item, props, picked);
        if (item.kind === "path") {
          const d = pathOf(item);
          return (
            <g key={i}>
              {marked ? <path d={d} fill={item.closed ? "color-mix(in oklab, var(--color-accent) 7%, transparent)" : "none"} stroke="var(--color-accent)" strokeWidth={item.width + 2.2} strokeOpacity={0.22} strokeLinejoin="round" /> : null}
              {selected ? <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth={item.width + 1.2} strokeOpacity={0.35} strokeLinejoin="round" /> : null}
              <path
                {...p}
                d={d}
                fill={item.fill ? COLOR[item.fill] : "none"}
                stroke={COLOR[item.color]}
                strokeWidth={item.width}
                strokeDasharray={item.dash?.join(" ")}
                strokeLinejoin="round"
                {...(props.draw ? (item.fill || item.dash ? { className: "survey-fade" } : { pathLength: 1, className: "survey-draw", style: { ["--d" as string]: `${Math.min(i * 0.012, 1.2).toFixed(3)}s` } }) : {})}
                // Lines are picked on their stroke, filled shapes anywhere inside.
                pointerEvents={item.fill ? "visiblePainted" : "stroke"}
              />
            </g>
          );
        }
        if (item.kind === "circle") {
          return <circle key={i} {...p} className={props.draw ? "survey-fade" : undefined} cx={item.cx} cy={item.cy} r={selected ? item.r * 1.8 : item.r} fill={item.fill ? COLOR[item.fill] : "none"} stroke={selected || marked ? "var(--color-accent)" : COLOR[item.color]} strokeWidth={item.width} />;
        }
        return (
          <text
            key={i}
            {...p}
            x={item.x}
            y={item.y}
            fontSize={item.size}
            fontWeight={item.weight === "bold" ? 600 : 400}
            fontFamily={item.font === "mono" ? "var(--font-geist-mono), monospace" : "var(--font-geist), sans-serif"}
            textAnchor={item.anchor}
            transform={textTransform(item)}
            fill={selected || marked ? "var(--color-accent)" : COLOR[item.color]}
            style={{ ...p.style, userSelect: "none" }}
            className={props.draw ? "survey-fade" : undefined}
          >
            {item.text}
          </text>
        );
      })}
      {pick ? (
        // Points: over the drawing, since a point is small and often sits on a lot's edge or inside its fill.
        <g aria-hidden>
          {page.items.map((item, i) =>
            item.kind === "circle" && item.entity && !props.hidden?.has(item.layer) ? (
              // A dot drawn as a path: browsers hit-test a path's screen-sized stroke, not a circle's.
              <path key={`hit-pt-${i}`} d={`M${item.cx} ${item.cy}h0.001`} fill="none" stroke="transparent" strokeWidth={22} strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="stroke" onPointerDown={(e) => pick(item, e)} />
            ) : null,
          )}
        </g>
      ) : null}
      {order.map((o) => (
        <g key={`order-${o.n}`} aria-hidden pointerEvents="none">
          <circle cx={o.x + o.r + badge * 0.9} cy={o.y - o.r - badge * 0.9} r={badge} fill="var(--color-accent)" />
          <text x={o.x + o.r + badge * 0.9} y={o.y - o.r - badge * 0.9} fontSize={badge * 1.15} fontWeight={600} fill="var(--color-surface)" textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-geist), sans-serif">
            {o.n}
          </text>
        </g>
      ))}
    </>
  );
});
