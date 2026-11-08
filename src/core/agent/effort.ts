/**
 * How hard a run works, as people choose it. Labels only, so the effort
 * picker in the browser never imports routing.ts, which reads the plans.
 */
export const EFFORTS = ["fast", "balanced", "deep"] as const;
export type Effort = (typeof EFFORTS)[number];

export const EFFORT_LABELS: Record<Effort, { title: string; detail: string }> = {
  fast: { title: "Fast", detail: "The quickest models. Stretches your usage furthest." },
  balanced: { title: "Balanced", detail: "Farbaek picks the model for each step. Recommended." },
  deep: { title: "Deep", detail: "The strongest model your plan includes, for hard problems. Uses your usage faster." },
};
