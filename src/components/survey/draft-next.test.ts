/** The Draft step's one next step (stage 300): where the plan stands, said plainly, and the single thing to do. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DraftNext, drawnWords } from "./draft-next";

const base = "/app/survey/11111111-1111-4111-8111-111111111111";
const text = (props: Partial<Parameters<typeof DraftNext>[0]>) =>
  renderToStaticMarkup(createElement(DraftNext, { base, lots: 0, lines: 0, roads: 0, sketchRead: false, reading: false, waiting: 0, codeless: false, ...props }))
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

describe("the Draft step's next step", () => {
  it("sends a drawn plan to be checked, saying what was drawn and how much waits", () => {
    const html = renderToStaticMarkup(createElement(DraftNext, { base, lots: 1, lines: 12, roads: 1, sketchRead: true, fromSketch: true, reading: false, waiting: 21, codeless: true }));
    expect(html).toContain(`href="${base}?step=plan"`);
    expect(text({ lots: 1, lines: 12, roads: 1, sketchRead: true, fromSketch: true, waiting: 21 })).toContain("Your plan is drawn Farbaek drew the lot, 12 lines and the road from your field sketch. 21 things wait for you to check on the plan.");
  });

  it("says when the lot isn't drawn yet, and that a clearer photo often settles it", () => {
    const t = text({ lines: 9, sketchRead: true, fromSketch: true, waiting: 4 });
    expect(t).toContain("Part of your plan is drawn");
    expect(t).toContain("The lot isn't drawn yet.");
    expect(t).toContain("A clearer photo of the sketch, taken flat and close up, often lets Farbaek close it; or give its corners on the Lots step.");
    // Drawn from the points' codes, with a sketch read that added nothing: never said to be from the sketch.
    expect(text({ lots: 1, lines: 3, sketchRead: true })).toContain("Your plan has the lot and 3 lines.");
    // A sketch that drew only a well is something drawn, never "nothing could be drawn".
    expect(text({ symbols: 1, sketchRead: true, fromSketch: true })).toContain("Farbaek drew a symbol from your field sketch.");
  });

  it("asks for the sketch when nothing is drawn, saying why when the points carry no codes", () => {
    const t = text({ codeless: true });
    expect(t).toContain("Add a photo of your field sketch");
    expect(t).toContain("Your points carry no codes, so they don't say which points make the lot.");
    expect(t).not.toContain("Check the plan");
    expect(text({ sketchRead: true })).toContain("Add a clearer photo of your sketch");
  });

  it("says the sketch is being read while it is", () => {
    expect(text({ reading: true, lines: 3 })).toContain("Reading your sketch");
  });

  it("names what was drawn in plain words", () => {
    expect(drawnWords(1, 0, 0)).toBe("the lot");
    expect(drawnWords(2, 1, 0)).toBe("2 lots and 1 line");
    expect(drawnWords(0, 5, 2)).toBe("5 lines and 2 roads");
  });
});
