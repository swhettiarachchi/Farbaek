/**
 * Words the surveyor writes on the plan (stage 255, ADR 0263): beside a surveyed point, or along the line between two, such as "Gate"
 * along a lot's side or "Proposed Drain" along a road. Presentation only: each is placed like every other label, clear of the rest, and
 * can be dragged on paper; nothing is measured from it, and no coordinate comes from it.
 */
import { atPage, besideSegment, inBounds, moved, outsideOf, text, textQuad, visible, type DrawCtx } from "./draw";
import { textWidth } from "./scene";

export function drawTexts(ctx: DrawCtx, inside: [number, number] | null): void {
  const { doc } = ctx;
  if (!visible(doc, "TEXT")) return;
  for (const t of doc.texts ?? []) {
    const a = ctx.byId.get(t.at);
    if (!a) continue;
    const b = t.along ? ctx.byId.get(t.along) : undefined;
    const entity = `text:${t.id}`;
    // In the practice style, lettered as small as the walls' codes, as gate and drain notes are on practising surveyors' plans (stage 261).
    // The surveyor's own size for these words (stage 265), on the usual one.
    const size = (doc.settings.wallTicks === true ? ctx.sizes.small * 0.6 : ctx.sizes.small) * (t.size ?? 1);
    const [x1, y1] = atPage(ctx, a);
    let tries: { x: number; y: number; rotate: number }[];
    let order: number[] | undefined;
    if (b) {
      const [x2, y2] = atPage(ctx, b);
      // Along the line, turned to read along it: outside the lot first, then inside, at the middle and then towards each end. A gate is
      // the lot's own, written inside it at the opening, as plans letter it (stage 261). Which side is outside comes from the lots'
      // outlines, so an L-shaped lot's arm is read right; with no lot, above the line first.
      // Numbered as before (stage 255): away from the lot's label, then towards it, at the middle; then a third of the way from each end
      // on each side (stage 261). A dragged word's saved place counts in these numbers, so they never change.
      const before: [number, number] = inside ? [(x1 + x2) / 2 - inside[0], (y1 + y2) / 2 - inside[1]] : [0, -1];
      const back: [number, number] = [-before[0], -before[1]];
      const place = (side: [number, number], along: number) => {
        const p = besideSegment(x1, y1, x2, y2, side, size, along);
        return { x: p.x, y: p.y, rotate: p.theta };
      };
      tries = [place(before, 0.5), place(back, 0.5), place(before, 0.3), place(before, 0.7), place(back, 0.3), place(back, 0.7)];
      // Preferred: outside the lot (found from the lots' outlines when they tell), a gate inside; the middle first.
      const away = outsideOf(ctx, x1, y1, x2, y2) ?? before;
      const want: [number, number] = /\bgates?\b/i.test(t.text) ? [-away[0], -away[1]] : away;
      const [nx, ny] = [-(y2 - y1), x2 - x1];
      const same = Math.sign(want[0] * nx + want[1] * ny) === Math.sign(before[0] * nx + before[1] * ny);
      order = same ? [0, 2, 3, 1, 4, 5] : [1, 4, 5, 0, 2, 3];
    } else {
      // Level beside the point: right, left, above, then below.
      const w = textWidth(t.text, size);
      tries = ([[1.5 + w / 2, size * 0.35], [-(1.5 + w / 2), size * 0.35], [0, -1.5], [0, 1.5 + size]] as const).map(([dx, dy]) => ({ x: x1 + dx, y: y1 + dy, rotate: 0 }));
    }
    // The surveyor's own angle (stage 265) turns every place the same way, so the solver judges them as they're drawn.
    if (t.turn !== undefined) tries = tries.map((c) => ({ ...c, rotate: t.turn! }));
    const quad = (c: { x: number; y: number; rotate: number }) =>
      textQuad({ kind: "text", x: c.x, y: c.y, text: t.text, size, rotate: c.rotate, weight: "regular", anchor: "middle", font: "sans", color: "ink", layer: "TEXT", entity, ...(ctx.slant ? { slant: ctx.slant } : {}) });
    const m = moved(ctx, [entity]);
    // Only places inside the drawing's bounds; with none, the first, and the checks say it runs past the frame.
    const admissible = tries.map((c) => inBounds(ctx, quad(c)));
    if (!admissible.some(Boolean)) ctx.outside.push(t.text);
    const k = ctx.placer.choose(
      entity,
      tries.map((c) => [quad(c)]),
      { ...(admissible.some(Boolean) ? { admissible } : {}), fallback: order?.[0] ?? 0, pinned: m.pinned, slot: m.slot, ...(m.shift ? { shift: m.shift } : {}), ...(order ? { order } : {}) },
    );
    const c = tries[k]!;
    text(ctx, "TEXT", entity, c.x, c.y, t.text, size, { rotate: c.rotate, slot: k });
  }
}
