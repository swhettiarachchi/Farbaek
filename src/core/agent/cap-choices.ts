/**
 * A run's cap, as people choose it. Labels only, so the approve form in the
 * browser never imports run-cap.ts, which reads what each model costs.
 */
export const CAP_CHOICES = ["top", "double", "plan"] as const;
export type CapChoice = (typeof CAP_CHOICES)[number];

export const CAP_LABELS: Record<CapChoice, { title: string; detail: (top: number) => string }> = {
  top: { title: "The estimate", detail: (top) => `Stops at ${top}% of this period's usage, the top of the estimate. A bigger change may stop early.` },
  double: { title: "Twice that", detail: (top) => `Stops at ${top * 2}%. Room for a run that needs more than usual.` },
  plan: { title: "No run cap", detail: () => "Runs until it finishes or your plan's usage runs out." },
};
