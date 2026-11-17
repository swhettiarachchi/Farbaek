/**
 * The language reader on its labelled set (language.golden.ts), written apart from the word lists. Prints what it measures; the
 * floor below is the accuracy measured on the first run, so a change that makes it worse fails.
 */
import { describe, expect, it } from "vitest";
import { readLanguage } from "./language";
import { languageNote, planLanguage } from "./language-plan";
import { GOLDEN } from "./language.golden";

function correct(reading: ReturnType<typeof readLanguage>, expected: string | null): boolean {
  if (expected === null) return reading.confidence === "low";
  // A family ("hi|ur") is right when the reading is that family or one of its languages.
  return reading.language !== null && (reading.language === expected || expected.split("|").includes(reading.language));
}

describe("the language reader on the labelled set", () => {
  it("measures language, script and romanization", () => {
    const rows = GOLDEN.map((c) => ({ c, r: readLanguage(c.text) }));
    const language = rows.filter(({ c, r }) => correct(r, c.language));
    const script = rows.filter(({ c, r }) => r.script === c.script);
    const romanized = rows.filter(({ c, r }) => r.romanized === c.romanized);
    const misses = rows.filter(({ c, r }) => !correct(r, c.language)).map(({ c, r }) => `${c.language ?? "unclear"} read as ${r.language ?? "nothing"} (${r.confidence}): ${c.text}`);
    console.log(
      [`language ${language.length}/${rows.length}`, `script ${script.length}/${rows.length}`, `romanized ${romanized.length}/${rows.length}`, ...misses].join("\n"),
    );
    // First run, 2026-11-17, before any tuning: language 76 of 77, script 77 of 77, romanized 77 of 77.
    expect(language.length).toBeGreaterThanOrEqual(76);
    expect(script.length).toBe(rows.length);
    expect(romanized.length).toBe(rows.length);
  });

  it("measures time per reading and per turn's plan, and the note's size", () => {
    const texts = GOLDEN.map((c) => c.text);
    const long = texts.join(" ").repeat(20).slice(0, 12_000);
    const rounds = 40;
    let t = performance.now();
    for (let i = 0; i < rounds; i++) for (const text of texts) readLanguage(text);
    const perReading = (performance.now() - t) / (rounds * texts.length);
    t = performance.now();
    for (let i = 0; i < rounds; i++) for (const text of texts) planLanguage({ message: text, earlier: texts.slice(0, 12) });
    const perPlan = (performance.now() - t) / (rounds * texts.length);
    t = performance.now();
    for (let i = 0; i < rounds; i++) readLanguage(long);
    const perLong = (performance.now() - t) / rounds;
    const notes = texts.map((text) => languageNote(planLanguage({ message: text })) ?? "");
    const longestNote = Math.max(...notes.map((n) => n.length));
    console.log(`per reading ${perReading.toFixed(3)} ms, per plan with 12 earlier messages ${perPlan.toFixed(3)} ms, 12,000-character message ${perLong.toFixed(3)} ms, longest note ${longestNote} characters`);
    // Generous ceilings for a slow machine: the point is that it stays far below a model's first word.
    expect(perPlan).toBeLessThan(20);
    expect(longestNote).toBeLessThan(400);
  });
});
