/**
 * The second check's words, as people read them. Kept apart from
 * second-check.ts so the card in the browser never imports the routing that
 * reads plans and model costs.
 */
export const SECOND_CHECK_VERDICTS = ["consistent", "concerns", "unclear"] as const;
export type SecondCheckVerdict = (typeof SECOND_CHECK_VERDICTS)[number];

export const VERDICT_LABELS: Record<SecondCheckVerdict, { title: string; detail: string }> = {
  consistent: { title: "No concerns", detail: "The second model found the change consistent with the plan." },
  concerns: { title: "Concerns", detail: "The second model found something to look at before approving." },
  unclear: { title: "Couldn't tell", detail: "The second model couldn't judge the change from what it was given." },
};

export const FINDING_TOPICS = ["intent", "scope", "invariant", "risk", "tests"] as const;
export const FINDING_SEVERITIES = ["note", "concern", "serious"] as const;

export const TOPIC_LABELS: Record<(typeof FINDING_TOPICS)[number], string> = {
  intent: "Outcome",
  scope: "Scope",
  invariant: "Must stay true",
  risk: "Risk",
  tests: "Checks",
};
