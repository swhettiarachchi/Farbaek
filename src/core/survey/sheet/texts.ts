/**
 * Words the surveyor writes on the plan (stage 255, ADR 0263): beside a surveyed point, or along the line between two, such as "Gate"
 * along a lot's side or "Proposed Drain" along a road. Presentation only: each is placed like every other label, clear of the rest, and
 * can be dragged on paper; nothing is measured from it, and no coordinate comes from it.
 */
import { atPage, besideSegment, inBounds, moved, text, textQuad, visible, type DrawCtx } from "./draw";
import { textWidth } from "./scene";

export function drawTexts(ctx: DrawCtx, inside: [number, number] | null): void {
  const { doc } = ctx;
  if (!visible(doc, "TEXT")) return;
  for (const t of doc.texts ?? []) {
    const a = ctx.byId.get(t.at);
    if (!a) continue;
    const b = t.along ? ctx.byId.get(t.along) : undefined;
    const entity = `text:${t.id}`;
    const size = ctx.sizes.small;
    const [x1, y1] = atPage(ctx, a);
    let tries: { x: number; y: number; rotate: number }[];
    if (b) {
      const [x2, y2] = atPage(ctx, b);
      // Along the line, turned to read along it: outside the lot first, then inside.
      const out: [number, number] = inside ? [(x1 + x2) / 2 - inside[0], (y1 + y2) / 2 - inside[1]] : [0, -1];
      tries = [out, [-out[0], -out[1]] as [number, number]].map((side) => {
        const p = besideSegment(x1, y1, x2, y2, side, size);
        return { x: p.x, y: p.y, rotate: p.theta };
      });
    } else {
      // Level beside the point: right, left, above, then below.
      const w = textWidth(t.text, size);
      tries = ([[1.5 + w / 2, size * 0.35], [-(1.5 + w / 2), size * 0.35], [0, -1.5], [0, 1.5 + size]] as const).map(([dx, dy]) => ({ x: x1 + dx, y: y1 + dy, rotate: 0 }));
    }
    const quad = (c: { x: number; y: number; rotate: number }) =>
      textQuad({ kind: "text", x: c.x, y: c.y, text: t.text, size, rotate: c.rotate, weight: "regular", anchor: "middle", font: "sans", color: "ink", layer: "TEXT", entity, ...(ctx.slant ? { slant: ctx.slant } : {}) });
    const m = moved(ctx, [entity]);
    // Only places inside the drawing's bounds; with none, the first, and the checks say it runs past the frame.
    const admissible = tries.map((c) => inBounds(ctx, quad(c)));
    if (!admissible.some(Boolean)) ctx.outside.push(t.text);
    const k = ctx.placer.choose(
      entity,
      tries.map((c) => [quad(c)]),
      { ...(admissible.some(Boolean) ? { admissible } : {}), fallback: 0, pinned: m.pinned, slot: m.slot, ...(m.shift ? { shift: m.shift } : {}) },
    );
    const c = tries[k]!;
    text(ctx, "TEXT", entity, c.x, c.y, t.text, size, { rotate: c.rotate, slot: k });
  }
}
