/**
 * Three ways through one survey project (stage 227, ADR 0238), the brief's §21: the same project, steps and saved versions, with
 * only the steps on show changing. Nothing is hidden for good: every step stays one choice away, and a step opened by its link is
 * always shown.
 *
 * - Express, the default: draw (only until the plan is drawn), the plan with what needs you, and approval and print.
 * - Professional: every step, with the checks, history and settings, for diagnostics and configuration.
 * - Manual CAD: the points, lots and lines, and the sheet, for drawing by hand when the automatic draft isn't enough.
 */
export const SURVEY_MODES = ["express", "professional", "cad"] as const;
export type SurveyMode = (typeof SURVEY_MODES)[number];

export const MODE_LABELS: Record<SurveyMode, string> = { express: "Express", professional: "Professional", cad: "Manual CAD" };
export const MODE_HINTS: Record<SurveyMode, string> = {
  express: "Only what needs you, then approve and print.",
  professional: "Every step, the checks, history and settings.",
  cad: "Points, lots, lines and the sheet, to draw by hand.",
};

export const SURVEY_MODE_COOKIE = "fb_survey_mode";

export function parseMode(raw: string | null | undefined): SurveyMode {
  return (SURVEY_MODES as readonly string[]).includes(raw ?? "") ? (raw as SurveyMode) : "express";
}

const STEPS: Record<SurveyMode, readonly string[]> = {
  express: ["draft", "plan", "export"],
  professional: ["import", "points", "draft", "boundary", "plan", "check", "export", "history", "settings"],
  cad: ["points", "boundary", "plan", "export"],
};

/**
 * The steps a mode shows, in the project's order: Express leaves Draft out once the plan is drawn, and the step that's open is always
 * among them, so a link to any step never leads nowhere.
 */
export function stepsFor<T extends { id: string }>(mode: SurveyMode, all: readonly T[], input: { drawn: boolean; current: string }): T[] {
  const wanted = new Set(STEPS[mode].filter((s) => !(mode === "express" && s === "draft" && input.drawn)));
  wanted.add(input.current);
  return all.filter((s) => wanted.has(s.id));
}
