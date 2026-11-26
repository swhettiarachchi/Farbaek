/**
 * Farbaek's own icons (ADR 0289): one soft, rounded set. Every icon is drawn on a 24 unit square with a single stroke that has
 * round ends and round joins, and every box in it has soft corners. An icon is an outline; as a state (`weight="fill"`) it is
 * its body filled, with its mark cut out of it.
 *
 * The components take the props the app already passes to an icon (`size`, `weight`, `className`, `aria-hidden`, `alt`,
 * `mirrored`, `color`), so a screen changes its icons by changing where it imports them from. They hold no state and read no
 * context, so they draw the same in a Server Component and in the browser.
 */
import { forwardRef, useId } from "react";
import type { Icon, IconProps } from "@phosphor-icons/react";
import type { Fill, Soft } from "./shape";

const ROUND = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** The stroke, in the icon's own units: a little heavier when the icon is drawn small, so a 14px icon is as dark as a 20px one. */
export function strokeFor(size: IconProps["size"]): number {
  return typeof size === "number" && size <= 16 ? 2.3 : 2;
}

export function soft(name: string, shape: Soft, fill?: Fill): Icon {
  const SoftIcon = forwardRef<SVGSVGElement, IconProps>(function SoftIcon({ size = "1em", weight, color = "currentColor", mirrored, alt, children, ...rest }, ref) {
    const own = useId();
    const width = strokeFor(size);
    const state = weight === "fill" ? fill : undefined;
    const moves = [mirrored ? "translate(24 0) scale(-1 1)" : "", shape.turn ? `rotate(${shape.turn} 12 12)` : ""].filter(Boolean).join(" ");
    let drawn;
    if (state) {
      // What is cut out of the body is drawn into a mask, in black on white: those two are the mask's own values, not colours shown.
      const cut = Boolean(state.k || state.ks);
      const id = `fbi-${own.replace(/[^a-zA-Z0-9]/g, "")}`;
      drawn = (
        <>
          {cut ? (
            <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
              <rect width="24" height="24" fill="white" />
              {state.k ? <path d={state.k} fill="none" stroke="black" strokeWidth={width} {...ROUND} /> : null}
              {state.ks ? <path d={state.ks} fill="black" /> : null}
            </mask>
          ) : null}
          <path d={state.b} fill={color} stroke={color} strokeWidth={width} mask={cut ? `url(#${id})` : undefined} {...ROUND} />
          {state.o ? <path d={state.o} fill="none" stroke={color} strokeWidth={width} {...ROUND} /> : null}
        </>
      );
    } else {
      drawn = (
        <>
          {shape.o ? <path d={shape.o} fill="none" stroke={color} strokeWidth={width} strokeDasharray={shape.dash} {...ROUND} /> : null}
          {shape.s ? <path d={shape.s} fill={color} /> : null}
        </>
      );
    }
    return (
      <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
        {alt ? <title>{alt}</title> : null}
        {children}
        {moves ? <g transform={moves}>{drawn}</g> : drawn}
      </svg>
    );
  });
  SoftIcon.displayName = `${name}Icon`;
  return SoftIcon as unknown as Icon;
}
