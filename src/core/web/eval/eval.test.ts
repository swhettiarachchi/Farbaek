/**
 * The measured quality of the parts of live research that run without a model (stage 206, ADR 0223): reading whether a message
 * needs the web, the search query made for a Sinhala question when the planner model fails, and the check of an answer's
 * citations. Each test prints its numbers, and fails when they fall below what was measured when the stage was written, so a
 * later change can't make them worse unnoticed. What a model writes (the answer itself, its Sinhala) isn't measured here: that
 * needs the live models (docs/stages/stage-206.md says how it was looked at).
 */
import { describe, expect, it } from "vitest";
import { readLanguage } from "@/core/chat/language";
import { supportOf, haystack } from "../citations";
import { glossSinhala } from "../gloss";
import { readSearchNeed } from "../intent";
import { localPlan } from "../plan";
import { CITATION_CASES } from "./citations.golden";
import { GLOSS_SINGLISH, GLOSS_SINHALA, type GlossCase } from "./gloss.golden";
import { NEED_ENGLISH, NEED_WORLD, type NeedCase } from "./need.golden";
import { NEED_MIXED, NEED_SINGLISH, NEED_SINHALA } from "./need-sinhala.golden";

const YEAR = 2026;
const pct = (n: number, of: number) => (of === 0 ? "n/a" : `${Math.round((n / of) * 100)}%`);

interface NeedScore {
  cases: number;
  /** A message that needs the web, or might, read as needing nothing: the one mistake that costs an answer its facts. */
  wronglySkipped: string[];
  /** Messages with nothing to look up that were answered at once. */
  skipped: number;
  nothingToLookUp: number;
  /** Messages whose own words ask for the web, caught without a model. */
  caught: number;
  asksForWeb: number;
  /** Research tasks read as such. */
  deep: number;
  deepTasks: number;
  /** Messages that weren't sure and were sent to a search they may not need: none read as search. */
  searchedNeedlessly: string[];
}

function scoreNeed(cases: readonly NeedCase[]): NeedScore {
  const score: NeedScore = { cases: cases.length, wronglySkipped: [], skipped: 0, nothingToLookUp: 0, caught: 0, asksForWeb: 0, deep: 0, deepTasks: 0, searchedNeedlessly: [] };
  for (const [text, label] of cases) {
    const { need } = readSearchNeed({ text, year: YEAR });
    if (label === "none") {
      score.nothingToLookUp++;
      if (need === "none") score.skipped++;
      else if (need !== "unsure") score.searchedNeedlessly.push(text);
    } else {
      if (need === "none") score.wronglySkipped.push(text);
      if (label === "web") {
        score.asksForWeb++;
        if (need === "search" || need === "deep") score.caught++;
      }
      if (label === "deep") {
        score.deepTasks++;
        if (need === "deep") score.deep++;
      }
    }
  }
  return score;
}

const line = (name: string, s: NeedScore) =>
  `${name}: ${s.cases} messages. Wrongly skipped ${s.wronglySkipped.length}. Answered at once ${s.skipped}/${s.nothingToLookUp} (${pct(s.skipped, s.nothingToLookUp)}). Web need caught without a model ${s.caught}/${s.asksForWeb} (${pct(s.caught, s.asksForWeb)}). Research tasks ${s.deep}/${s.deepTasks}. Searched needlessly ${s.searchedNeedlessly.length}.`;

describe("whether a message needs the web, measured (stage 206)", () => {
  const sets: [string, readonly NeedCase[], { skipped: number; caught: number }][] = [
    ["English", NEED_ENGLISH, { skipped: 0.9, caught: 0.9 }],
    ["Sinhala", NEED_SINHALA, { skipped: 0.85, caught: 0.9 }],
    ["Sinhala in English letters", NEED_SINGLISH, { skipped: 0.85, caught: 0.9 }],
    ["Sinhala mixed with English", NEED_MIXED, { skipped: 0.75, caught: 0.9 }],
    ["Other languages", NEED_WORLD, { skipped: 0.75, caught: 0.85 }],
  ];
  for (const [name, cases, floor] of sets) {
    it(`${name}: never skips a search that's needed, and answers the rest at once`, () => {
      const s = scoreNeed(cases);
      console.log(line(name, s));
      if (s.wronglySkipped.length > 0) console.log(`  wrongly skipped: ${s.wronglySkipped.join(" | ")}`);
      const missedNone = cases.filter(([text, label]) => label === "none" && readSearchNeed({ text, year: YEAR }).need !== "none").map(([text]) => text);
      const missedWeb = cases.filter(([text, label]) => label === "web" && readSearchNeed({ text, year: YEAR }).need === "unsure").map(([text]) => text);
      const missedDeep = cases.filter(([text, label]) => label === "deep" && readSearchNeed({ text, year: YEAR }).need !== "deep").map(([text]) => text);
      if (missedNone.length > 0) console.log(`  not answered at once: ${missedNone.join(" | ")}`);
      if (missedWeb.length > 0) console.log(`  left to the planner: ${missedWeb.join(" | ")}`);
      if (missedDeep.length > 0) console.log(`  research task not read as one: ${missedDeep.join(" | ")}`);
      expect(s.wronglySkipped).toEqual([]);
      expect(s.searchedNeedlessly).toEqual([]);
      expect(s.skipped / s.nothingToLookUp).toBeGreaterThanOrEqual(floor.skipped);
      expect(s.caught / s.asksForWeb).toBeGreaterThanOrEqual(floor.caught);
    });
  }

  it("the same question in Sinhala, in English letters and in English reads the same way", () => {
    for (const text of ["Mata aluth AI news tikak kiyanna.", "මට අලුත් AI news ටිකක් කියන්න.", "Can you tell me the latest AI news in Sinhala?"]) {
      expect(readSearchNeed({ text, year: YEAR }).need, text).toBe("search");
    }
  });
});

describe("the search query for a Sinhala question when no model wrote one, measured (stage 206)", () => {
  const score = (cases: readonly GlossCase[]) => {
    let wanted = 0;
    let found = 0;
    const leaks: string[] = [];
    const misses: string[] = [];
    for (const [question, has, never] of cases) {
      const query = glossSinhala(question).query;
      const lower = ` ${query.toLowerCase()} `;
      for (const word of has) {
        wanted++;
        if (lower.includes(word.toLowerCase())) found++;
        else misses.push(`${question} → “${query}” lacks ${word}`);
      }
      for (const word of never) if (lower.includes(` ${word.toLowerCase()} `)) leaks.push(`${question} → “${query}” keeps ${word}`);
    }
    return { wanted, found, leaks, misses };
  };

  it("in English letters: the topic's words are there, and no request word reaches a search engine", () => {
    const s = score(GLOSS_SINGLISH);
    console.log(`Sinhala in English letters: ${GLOSS_SINGLISH.length} questions. Topic words found ${s.found}/${s.wanted} (${pct(s.found, s.wanted)}). Request words leaked ${s.leaks.length}.`);
    for (const m of [...s.misses, ...s.leaks]) console.log(`  ${m}`);
    expect(s.leaks).toEqual([]);
    expect(s.found / s.wanted).toBeGreaterThanOrEqual(0.95);
  });

  it("in Sinhala script: the topic's words are there in English", () => {
    const s = score(GLOSS_SINHALA);
    console.log(`Sinhala script: ${GLOSS_SINHALA.length} questions. Topic words found ${s.found}/${s.wanted} (${pct(s.found, s.wanted)}). Request words leaked ${s.leaks.length}.`);
    for (const m of [...s.misses, ...s.leaks]) console.log(`  ${m}`);
    expect(s.leaks).toEqual([]);
    expect(s.found / s.wanted).toBeGreaterThanOrEqual(0.95);
  });

  it("a question in English letters is never its own search query", () => {
    for (const [question] of GLOSS_SINGLISH) {
      expect(readLanguage(question).language, question).toBe("si");
      const plan = localPlan(question, YEAR);
      expect(plan.queries.length, question).toBeGreaterThan(0);
      for (const q of plan.queries) expect(q.toLowerCase(), question).not.toBe(question.toLowerCase().replace(/[.?!]+$/, ""));
    }
  });

  it("a question in Sinhala script is searched in English and as written", () => {
    const plan = localPlan("නවතම තාක්ෂණ පුවත් දෙන්න", YEAR);
    expect(plan.queries[0]).toBe("latest technology news");
    expect(plan.queries[1]).toBe("නවතම තාක්ෂණ පුවත් දෙන්න");
    expect(plan).toMatchObject({ news: true, depth: "standard" });
  });
});

describe("the check of an answer's citations, measured (stage 206)", () => {
  it("reads each labelled sentence the way a person did, and never calls a wrong figure matched", () => {
    let right = 0;
    const wrong: string[] = [];
    let wrongFigures = 0;
    let wrongFiguresPassed = 0;
    for (const c of CITATION_CASES) {
      const got = supportOf(c.claim, haystack({ title: "", text: c.page }), c.read);
      if (got === c.expect) right++;
      else wrong.push(`${c.claim} → ${got}, expected ${c.expect} (${c.why})`);
      if (c.expect === "partly" || c.expect === "unmatched") {
        wrongFigures++;
        if (got === "matched") wrongFiguresPassed++;
      }
    }
    console.log(`Citation check: ${right}/${CITATION_CASES.length} labelled sentences read as labelled (${pct(right, CITATION_CASES.length)}). Unsupported sentences passed as matched: ${wrongFiguresPassed}/${wrongFigures}.`);
    for (const w of wrong) console.log(`  ${w}`);
    expect(wrongFiguresPassed).toBe(0);
    expect(right / CITATION_CASES.length).toBeGreaterThanOrEqual(0.9);
  });
});
