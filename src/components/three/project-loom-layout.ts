/**
 * The Real-Project Loom's layout (ADR 0142, spec §25): a project's real
 * lanes placed in 3D. Each task is a row in depth, newest at the front; its
 * five stages run left to right (intent, contract, change, proof, live).
 * Every node is a stage that has a record, and keeps that record's link.
 * Plain numbers, no React or three.js, so it's tested without WebGL. The
 * colours mirror src/styles/tokens.css: a canvas can't read CSS variables
 * cheaply each frame.
 */
import { STAGES, STAGE_TITLES, type Lane, type StageState } from "@/core/insights/project-graph";

export const LOOM_STATE_COLORS: Record<StageState, string> = {
  reached: "#2450f0",
  waiting: "#9a4d00",
  stopped: "#5f636b",
  failed: "#b42318",
  not_yet: "#c9cdd4",
};

export const LOOM_STATE_WORDS: Record<StageState, string> = {
  reached: "Reached",
  waiting: "Waiting",
  stopped: "Stopped",
  failed: "Failed",
  not_yet: "Not yet",
};

export interface LoomNode {
  id: string;
  laneIndex: number;
  stage: (typeof STAGES)[number];
  position: [number, number, number];
  state: StageState;
  color: string;
  /** What a person reads when they point at it: task, stage and what happened. */
  label: string;
  href: string | null;
}

export interface LoomEdge {
  from: [number, number, number];
  to: [number, number, number];
  /** Solid when the work got to the next stage, faint when it hasn't. */
  solid: boolean;
}

export const LOOM_SPACING = { stage: 2.4, lane: 1.7 } as const;
/** More lanes than this and the 3D view gets hard to read; the 2D lanes list every one. */
export const LOOM_MAX_LANES = 24;

/** Places at most LOOM_MAX_LANES lanes, centred on the origin. */
export function loomLayout(lanes: readonly Lane[]): { nodes: LoomNode[]; edges: LoomEdge[]; shown: number } {
  const shown = lanes.slice(0, LOOM_MAX_LANES);
  const width = (STAGES.length - 1) * LOOM_SPACING.stage;
  const depth = Math.max(0, shown.length - 1) * LOOM_SPACING.lane;
  const nodes: LoomNode[] = [];
  const edges: LoomEdge[] = [];
  shown.forEach((lane, laneIndex) => {
    const z = depth / 2 - laneIndex * LOOM_SPACING.lane;
    let previous: LoomNode | null = null;
    for (const [i, key] of STAGES.entries()) {
      const stage = lane.stages.find((s) => s.key === key);
      if (!stage) continue;
      const node: LoomNode = {
        id: `${lane.taskId}:${key}`,
        laneIndex,
        stage: key,
        position: [i * LOOM_SPACING.stage - width / 2, 0, z],
        state: stage.state,
        color: LOOM_STATE_COLORS[stage.state],
        // The stage's own words, unless they only repeat its state.
        label: `${lane.title}: ${STAGE_TITLES[key]}, ${LOOM_STATE_WORDS[stage.state].toLowerCase()}${stage.label && stage.label.toLowerCase() !== LOOM_STATE_WORDS[stage.state].toLowerCase() ? `. ${stage.label}` : ""}`,
        href: stage.href,
      };
      nodes.push(node);
      if (previous) edges.push({ from: previous.position, to: node.position, solid: node.state === "reached" || (node.state !== "not_yet" && previous.state === "reached") });
      previous = node;
    }
  });
  return { nodes, edges, shown: shown.length };
}
