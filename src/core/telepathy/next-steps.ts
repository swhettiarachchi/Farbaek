/**
 * Suggested next steps (stage 283, ADR 0291; Telepathy part 1). Framework-free.
 *
 * When nothing is waiting for the person, Home can still say what would be worth doing next. A suggestion here is worked out by
 * tested rules from the person's own records (their tasks, and which projects have a live site). No model is asked, nothing is
 * guessed, and each suggestion carries the reason it was made, so "why this?" always has a true answer.
 *
 * The person corrects it: "Not now" puts one suggestion away for a week, and a kind of suggestion can be switched off. Both are
 * kept in their browser, since they are about what this person wants to see, not about the workspace.
 */
import { tidyProjectText } from "@/core/chat/project-brief";
import type { TaskState } from "@/core/realityloop/task-machine";

export type SuggestionKind = "fix" | "resume" | "plan" | "publish";

/** First to last: what a person would most regret missing. */
export const SUGGESTION_ORDER: readonly SuggestionKind[] = ["fix", "resume", "plan", "publish"];

/** What a kind is called where the person switches it off. */
export const SUGGESTION_KIND_WORDS: Record<SuggestionKind, string> = {
  fix: "fixes for failed checks",
  resume: "runs that were interrupted",
  plan: "plans waiting to be read",
  publish: "projects ready to publish",
};

export interface NextFacts {
  now: number;
  projects: readonly { id: string; name: string; archived: boolean }[];
  tasks: readonly { id: string; title: string; state: TaskState; projectId: string; updatedAt: string }[];
  /** The projects that have a live site; null when that couldn't be read, and then nothing is said about publishing. */
  liveProjects: readonly string[] | null;
  /** Whether publishing is set up on this server. */
  canPublish: boolean;
}

export interface Suggestion {
  /** Its kind, its subject and when that subject last changed: a task that fails again is a new suggestion. */
  id: string;
  kind: SuggestionKind;
  title: string;
  body: string;
  /** Why it is suggested, as a sentence around a time: `before`, when (`at`), `after`. */
  why: { before: string; at: string; after: string };
  action: { label: string; href: string };
}

export const SUGGEST_LIMITS = {
  /** Work older than this is the person's to come back to by themselves: it isn't suggested. */
  freshDays: 30,
  /** The most suggestions worked out; Home shows the first one the person hasn't put away. */
  most: 3,
  name: 70,
} as const;

const KIND_OF: Partial<Record<TaskState, SuggestionKind>> = { FAILED: "fix", INTERRUPTED: "resume", CONTRACT_DRAFTED: "plan", VERIFIED: "publish" };

/**
 * What to suggest, best first. One at most for a project, from its newest task: what happened last in a project is what its
 * next step follows from, so a failed task with a newer one after it is not brought up again.
 */
export function suggestNext(facts: NextFacts): Suggestion[] {
  const projects = new Map(facts.projects.filter((p) => !p.archived).map((p) => [p.id, p]));
  const live = facts.liveProjects ? new Set(facts.liveProjects) : null;
  const oldest = facts.now - SUGGEST_LIMITS.freshDays * 86_400_000;
  const newest = new Map<string, NextFacts["tasks"][number]>();
  for (const task of facts.tasks) {
    if (!projects.has(task.projectId)) continue;
    const at = Date.parse(task.updatedAt);
    if (!Number.isFinite(at)) continue;
    const seen = newest.get(task.projectId);
    if (!seen || at > Date.parse(seen.updatedAt)) newest.set(task.projectId, task);
  }
  const out: Suggestion[] = [];
  for (const task of newest.values()) {
    const at = Date.parse(task.updatedAt);
    // Too old to bring up, or dated after now: neither is a next step.
    if (at < oldest || at > facts.now + 60_000) continue;
    const kind = KIND_OF[task.state];
    if (!kind) continue;
    const project = tidyProjectText(projects.get(task.projectId)!.name, SUGGEST_LIMITS.name) || "your project";
    const title = tidyProjectText(task.title, SUGGEST_LIMITS.name) || "a task";
    const id = `${kind}:${task.id}:${task.updatedAt}`;
    const open = { label: "Open the task", href: `/app/tasks/${task.id}` };
    if (kind === "fix") {
      out.push({ id, kind, title: "Fix what failed", body: `"${title}", in ${project}.`, why: { before: "Its checks failed ", at: task.updatedAt, after: `, and nothing newer has been started in ${project}.` }, action: open });
    } else if (kind === "resume") {
      out.push({ id, kind, title: "Carry on where the agent stopped", body: `"${title}", in ${project}.`, why: { before: "Its run was interrupted ", at: task.updatedAt, after: ", before the work was finished." }, action: open });
    } else if (kind === "plan") {
      out.push({ id, kind, title: "Read the plan and approve it", body: `"${title}", in ${project}.`, why: { before: "The plan was written ", at: task.updatedAt, after: ", and nothing is built until you approve it." }, action: { label: "Read the plan", href: open.href } });
    } else if (facts.canPublish && live && !live.has(task.projectId)) {
      out.push({
        id,
        kind,
        title: `Publish ${project}`,
        body: `Its latest change, "${title}", passed its checks.`,
        why: { before: "It was verified ", at: task.updatedAt, after: ", and the project has no live site yet." },
        action: { label: "Open the project", href: `/app/projects/${task.projectId}` },
      });
    }
  }
  return out.sort((a, b) => SUGGESTION_ORDER.indexOf(a.kind) - SUGGESTION_ORDER.indexOf(b.kind) || Date.parse(b.why.at) - Date.parse(a.why.at) || a.id.localeCompare(b.id)).slice(0, SUGGEST_LIMITS.most);
}

/** What the person has put away, in their browser: single suggestions until a time, and whole kinds. */
export interface Dismissals {
  until: Record<string, number>;
  kinds: SuggestionKind[];
}

export const DISMISS_KEY = "fb-suggested-next";
export const DISMISS_DAYS = 7;
/** The most single suggestions remembered: the oldest go first. */
const DISMISS_MOST = 60;

const isKind = (value: unknown): value is SuggestionKind => typeof value === "string" && (SUGGESTION_ORDER as readonly string[]).includes(value);

/** What was stored, read without trusting it: anything that isn't the right shape is left out. */
export function parseDismissals(raw: string | null): Dismissals {
  const empty: Dismissals = { until: {}, kinds: [] };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as { until?: unknown; kinds?: unknown };
    const until: Record<string, number> = {};
    if (parsed.until && typeof parsed.until === "object") {
      for (const [id, at] of Object.entries(parsed.until as Record<string, unknown>).slice(0, DISMISS_MOST * 2)) {
        if (id.length <= 200 && typeof at === "number" && Number.isFinite(at)) until[id] = at;
      }
    }
    const kinds = Array.isArray(parsed.kinds) ? [...new Set(parsed.kinds.filter(isKind))] : [];
    return { until, kinds };
  } catch {
    return empty;
  }
}

/** The first suggestion the person hasn't put away, or null. */
export function visibleSuggestion(candidates: readonly Suggestion[], dismissals: Dismissals, now: number): Suggestion | null {
  return candidates.find((s) => !dismissals.kinds.includes(s.kind) && !((dismissals.until[s.id] ?? 0) > now)) ?? null;
}

/** "Not now": this one suggestion is put away for a week. What has run out, and the oldest beyond the most kept, are dropped. */
export function dismissOne(dismissals: Dismissals, suggestion: Pick<Suggestion, "id">, now: number, days: number = DISMISS_DAYS): Dismissals {
  const kept = Object.entries({ ...dismissals.until, [suggestion.id]: now + days * 86_400_000 })
    .filter(([, at]) => at > now)
    .sort((a, b) => b[1] - a[1])
    .slice(0, DISMISS_MOST);
  return { until: Object.fromEntries(kept), kinds: dismissals.kinds };
}

/** A kind switched off, or back on. */
export function setKind(dismissals: Dismissals, kind: SuggestionKind, off: boolean): Dismissals {
  const kinds = dismissals.kinds.filter((k) => k !== kind);
  return { until: dismissals.until, kinds: off ? [...kinds, kind] : kinds };
}
