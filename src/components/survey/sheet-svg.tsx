import type { PointerEvent as ReactPointerEvent } from "react";
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
  /** Whether an item can be dragged (a label on an unlocked layer), so it shows a move cursor. */
  draggable?: (item: SceneItem) => boolean;
  onEntityPointerDown?: (item: SceneItem, event: ReactPointerEvent<SVGElement>) => void;
  label: string;
  className?: string;
  /** Marks lines to draw themselves and text to fade in, for the showcase (CSS in globals.css, never under reduced motion). */
  draw?: boolean;
}

function itemProps(item: SceneItem, props: SheetSvgProps) {
  const entity = item.entity;
  const selected = entity !== undefined && entity === props.selected;
  return {
    "data-entity": entity,
    style: entity && props.draggable?.(item) ? { cursor: "move" } : entity && props.onEntityPointerDown ? { cursor: "pointer" } : undefined,
    onPointerDown: entity && props.onEntityPointerDown ? (e: ReactPointerEvent<SVGElement>) => props.onEntityPointerDown!(item, e) : undefined,
    selected,
  };
}

export function SheetSvg(props: SheetSvgProps) {
  const { page } = props;
  const [vx, vy, vw, vh] = props.viewBox ?? [0, 0, page.widthMm, page.heightMm];
  return (
    <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label={props.label} className={props.className} preserveAspectRatio="xMidYMid meet">
      <rect x={0} y={0} width={page.widthMm} height={page.heightMm} fill="var(--color-surface)" />
      {page.items.map((item, i) => {
        if (props.hidden?.has(item.layer)) return null;
        const { selected, ...p } = itemProps(item, props);
        if (item.kind === "path") {
          const d = item.points.map(([x, y], j) => `${j === 0 ? "M" : "L"}${x.toFixed(3)} ${y.toFixed(3)}`).join(" ") + (item.closed ? " Z" : "");
          return (
            <g key={i}>
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
          return <circle key={i} {...p} className={props.draw ? "survey-fade" : undefined} cx={item.cx} cy={item.cy} r={selected ? item.r * 1.8 : item.r} fill={item.fill ? COLOR[item.fill] : "none"} stroke={selected ? "var(--color-accent)" : COLOR[item.color]} strokeWidth={item.width} />;
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
            transform={item.rotate ? `rotate(${item.rotate.toFixed(3)} ${item.x.toFixed(3)} ${item.y.toFixed(3)})` : undefined}
            fill={selected ? "var(--color-accent)" : COLOR[item.color]}
            style={{ ...p.style, userSelect: "none" }}
            className={props.draw ? "survey-fade" : undefined}
          >
            {item.text}
          </text>
        );
      })}
    </svg>
  );
}
