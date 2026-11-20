/**
 * A second measure of the model-free parts of live research (stage 206, ADR 0223), on messages written by someone who never saw
 * the rules: a separate agent wrote heldout.json from the label definitions alone. The rules were measured on it once before
 * anything was changed (docs/stages/stage-206.md has both sets of numbers); the floors below hold what they score now.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readAction } from "@/core/chat/intent";
import { glossSinhala } from "../gloss";
import { readSearchNeed } from "../intent";

interface HeldOut {
  need: { text: string; label: "none" | "web" | "deep" | "open"; group: string }[];
  actions: { text: string; label: "action" | "question"; group: string }[];
  gloss: { text: string; has: string[]; group: string }[];
}
const data = JSON.parse(readFileSync(new URL("./heldout.json", import.meta.url), "utf8")) as HeldOut;
const pct = (n: number, of: number) => (of === 0 ? "n/a" : `${Math.round((n / of) * 100)}%`);

describe("held-out messages (stage 206)", () => {
  it("whether a message needs the web", () => {
    const groups = [...new Set(data.need.map((c) => c.group))];
    const totals = { wronglySkipped: -1, atOnce: 0, caught: 0, deep: 0, needless: -1 };
    for (const group of ["all", ...groups]) {
      const cases = group === "all" ? data.need : data.need.filter((c) => c.group === group);
      const read = cases.map((c) => ({ ...c, got: readSearchNeed({ text: c.text, year: 2026 }).need }));
      const skippedWrongly = read.filter((c) => c.label !== "none" && c.got === "none");
      const none = read.filter((c) => c.label === "none");
      const web = read.filter((c) => c.label === "web");
      const deep = read.filter((c) => c.label === "deep");
      const needless = none.filter((c) => c.got === "search" || c.got === "deep");
      console.log(
        `${group}: ${cases.length}. Wrongly skipped ${skippedWrongly.length}. Answered at once ${none.filter((c) => c.got === "none").length}/${none.length} (${pct(none.filter((c) => c.got === "none").length, none.length)}). Web need caught ${web.filter((c) => c.got === "search" || c.got === "deep").length}/${web.length} (${pct(web.filter((c) => c.got === "search" || c.got === "deep").length, web.length)}). Research tasks ${deep.filter((c) => c.got === "deep").length}/${deep.length}. Searched needlessly ${needless.length}.`,
      );
      if (group !== "all") {
        for (const c of skippedWrongly) console.log(`  WRONGLY SKIPPED [${c.label}] ${c.text}`);
        for (const c of none.filter((x) => x.got !== "none")) console.log(`  not at once (${c.got}): ${c.text.replace(/\n/g, " / ")}`);
        for (const c of web.filter((x) => x.got === "unsure")) console.log(`  left to planner: ${c.text}`);
        for (const c of deep.filter((x) => x.got !== "deep")) console.log(`  deep read as ${c.got}: ${c.text}`);
      } else {
        totals.wronglySkipped = skippedWrongly.length;
        totals.atOnce = none.filter((c) => c.got === "none").length / none.length;
        totals.caught = web.filter((c) => c.got === "search" || c.got === "deep").length / web.length;
        totals.deep = deep.filter((c) => c.got === "deep").length / deep.length;
        totals.needless = needless.length;
      }
    }
    // First measured, before any change: 3 wrongly skipped, 61% answered at once, 97% caught, 11 of 14 research tasks, 3 searched needlessly.
    expect(totals.wronglySkipped).toBe(0);
    expect(totals.needless).toBe(0);
    expect(totals.atOnce).toBeGreaterThanOrEqual(0.9);
    expect(totals.caught).toBeGreaterThanOrEqual(0.95);
    expect(totals.deep).toBeGreaterThanOrEqual(0.9);
  });

  it("requests to act on the computer", () => {
    const read = data.actions.map((c) => ({ ...c, got: readAction(c.text) ? "action" : "question" }));
    const actions = read.filter((c) => c.label === "action");
    const questions = read.filter((c) => c.label === "question");
    console.log(`actions: caught ${actions.filter((c) => c.got === "action").length}/${actions.length}. Questions taken for requests ${questions.filter((c) => c.got === "action").length}/${questions.length}.`);
    for (const c of actions.filter((x) => x.got !== "action")) console.log(`  missed action: ${c.text}`);
    for (const c of questions.filter((x) => x.got === "action")) console.log(`  FALSE ALARM: ${c.text}`);
    // First measured, before any change: 16 of 25 requests caught, 1 of 25 questions taken for a request.
    expect(questions.filter((c) => c.got === "action")).toEqual([]);
    // After the fresh review the patterns were made stricter (a false alarm is the worse mistake: the answer would refuse
    // something nobody asked for), which gave up a little here: "click the submit button for me" is no longer read as a request.
    expect(actions.filter((c) => c.got === "action").length / actions.length).toBeGreaterThanOrEqual(0.85);
  });

  it("the search words for a Sinhala question", () => {
    for (const group of ["singlish", "sinhala"]) {
      let wanted = 0;
      let found = 0;
      const misses: string[] = [];
      for (const c of data.gloss.filter((x) => x.group === group)) {
        const query = glossSinhala(c.text).query.toLowerCase();
        for (const word of c.has) {
          wanted++;
          if (query.includes(word.toLowerCase())) found++;
          else misses.push(`${c.text} → “${query}” lacks ${word}`);
        }
      }
      console.log(`gloss ${group}: topic words found ${found}/${wanted} (${pct(found, wanted)})`);
      for (const m of misses) console.log(`  ${m}`);
      // First measured, before any change: 83% in English letters, 79% in Sinhala script. The words it lacked were then added,
      // so this is no longer an unseen measure: it holds the list in place.
      expect(found / wanted).toBeGreaterThanOrEqual(0.9);
    }
  });
});
