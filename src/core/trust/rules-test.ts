/**
 * Testing a draft of workspace rules against real history (ADR 0082), before
 * it can be activated. Each past change is judged twice by the same policy
 * engine: with the rules active today, then with the draft. Both use today's
 * autonomy, so the only difference is the rules. A draft can be stricter
 * than today's rules or, when it drops a rule, looser; both are counted.
 * Nothing is applied or changed; the result is a prediction from past
 * changes and says so.
 */
import type { PolicyOutcome } from "../billing/usage";
import { evaluateChangePolicy, type AutonomyLimits } from "./policy";
import type { ReplayChange } from "./replay";
import { matchRules, type ActiveRules } from "./workspace-rules";

/** What a change needed, from strictest to least strict. */
export type TestOutcome = "stopped" | "owner" | "person" | "own";
export const TEST_OUTCOMES: readonly TestOutcome[] = ["stopped", "owner", "person", "own"];
/** Each outcome after "would have". */
export const TEST_OUTCOME_WORDS: Record<TestOutcome, string> = {
  stopped: "been stopped",
  owner: "needed an owner or admin",
  person: "waited for a person",
  own: "applied on its own",
};

export const OUTCOME_RANK: Record<TestOutcome, number> = { stopped: 3, owner: 2, person: 1, own: 0 };
export const outcomeOf = (o: PolicyOutcome): TestOutcome => (o === "BLOCK" ? "stopped" : o === "ESCALATE" ? "owner" : o === "ALLOW_WITHIN_LIMITS" || o === "ALLOW" ? "own" : "person");

export interface RulesTestChange {
  proposalId: string;
  taskId: string;
  createdAt: string;
  from: TestOutcome;
  to: TestOutcome;
  /** The files the draft's rules matched, at most three. */
  paths: string[];
  /** The draft rules that matched. */
  rules: string[];
}

export interface RulesTestSummary {
  /** The draft's hash: the result belongs to exactly this set. */
  sha256: string;
  days: number;
  changes: number;
  before: Record<TestOutcome, number>;
  after: Record<TestOutcome, number>;
  /** Changes the draft would have made stricter than today's rules. */
  stricter: number;
  /** Changes it would have let through more easily, because it drops or softens a rule. */
  looser: number;
  /** The first ten that differ, newest first. */
  changed: RulesTestChange[];
  testedAt: string;
}

const zero = (): Record<TestOutcome, number> => ({ stopped: 0, owner: 0, person: 0, own: 0 });
const SHOWN = 10;

export async function testRules(
  changes: readonly ReplayChange[],
  input: { current: ActiveRules | null; draft: ActiveRules; autonomy: AutonomyLimits | null; sandboxConnected: boolean; days: number; now: Date },
): Promise<RulesTestSummary> {
  const before = zero();
  const after = zero();
  const changed: RulesTestChange[] = [];
  let stricter = 0;
  let looser = 0;
  // A rehearsal never applies anything, so only level 2 that's really on counts.
  const autonomy = input.autonomy && !input.autonomy.rehearsal ? input.autonomy : null;
  for (const c of changes) {
    const shared = {
      files: c.files,
      contractViolations: c.violations > 0 ? [{ kind: "replay", detail: "It broke its contract." }] : [],
      // Level 2 never applies the desktop agent's changes.
      autonomy: c.fromAgent ? null : autonomy,
      verifiable: c.hasChecks && input.sandboxConnected,
    };
    const was = outcomeOf((await evaluateChangePolicy({ ...shared, rules: input.current })).outcome);
    const now = outcomeOf((await evaluateChangePolicy({ ...shared, rules: input.draft })).outcome);
    before[was]++;
    after[now]++;
    if (was === now) continue;
    if (OUTCOME_RANK[now] > OUTCOME_RANK[was]) stricter++;
    else looser++;
    if (changed.length >= SHOWN) continue;
    // The rules behind the difference: the draft's when it's stricter, today's when it's looser.
    const by = OUTCOME_RANK[now] > OUTCOME_RANK[was] ? input.draft.rules : (input.current?.rules ?? []);
    const matched = c.files.map((f) => ({ path: f.path, rules: matchRules(by, f.path).map((m) => m.rule.id) })).filter((m) => m.rules.length > 0);
    changed.push({
      proposalId: c.proposalId,
      taskId: c.taskId,
      createdAt: c.createdAt,
      from: was,
      to: now,
      paths: matched.slice(0, 3).map((m) => m.path),
      rules: [...new Set(matched.flatMap((m) => m.rules))],
    });
  }
  return { sha256: input.draft.sha256, days: input.days, changes: changes.length, before, after, stricter, looser, changed, testedAt: input.now.toISOString() };
}
