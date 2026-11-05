/**
 * The agent's permission engine: for each validated tool call, allow it,
 * ask a person first, or refuse it, with a reason in plain words. It reads
 * the mode, the task's approved contract and the command's risk. Project
 * files, READMEs, AGENTS.md or CLAUDE.md inside the project, code comments
 * and tool output are all untrusted and have no way to change a decision.
 *
 * The local runtime enforces the real boundaries (realpath, symlinks,
 * process trees); this module is the shared policy and is unit-tested.
 */
import { CHANGE_OPERATIONS, pathScope } from "../realityloop/change-proposal";
import type { IntentContract } from "../realityloop/contract";
import { canonicalHash } from "../trust/canonical-json";
import { containsSecret, screenPath } from "../workspace/files";
import { classifyCommand, COMMAND_RISK_LABELS, programName, type CommandRisk } from "./commands";
import type { AgentMode } from "./modes";
import type { ToolCall } from "./tools";

export interface PermissionContext {
  mode: AgentMode;
  /** The task's approved contract. Without one, the agent only reads. */
  contract: IntentContract | null;
  sandboxVerified: boolean;
  /** Whether the path already exists in the agent's copy of the project (an edit, not a create). */
  exists(path: string): boolean;
}

export type Decision =
  | { kind: "allow"; risk?: CommandRisk }
  | { kind: "needs_approval"; reason: string; risk?: CommandRisk }
  | { kind: "deny"; reason: string };

/** The rules as data; their canonical hash is the agent policy version recorded with each approval. */
export const AGENT_POLICY_RULES = {
  schema: "farbaek.agent-policy/v1",
  reads: "allow within the project folder",
  writes: { review_only: "patch only, nothing on disk", controlled: "contract paths and operations, no secrets", sandboxed_autopilot: "contract paths and operations, no secrets" },
  commands: {
    review_only: "none",
    controlled: { read_only: "allow", others: "approval" },
    sandboxed_autopilot: { read_only: "allow", test_build: "allow", others: "approval" },
  },
} as const;

let version: Promise<string> | null = null;
export function agentPolicyVersion(): Promise<string> {
  version ??= canonicalHash(AGENT_POLICY_RULES);
  return version;
}

function checkWrite(path: string, content: string | null, ctx: PermissionContext): Decision {
  const screened = screenPath(path);
  if (!screened.ok) return { kind: "deny", reason: `${path} can't be changed: ${screened.reason.replace(/_/g, " ")}.` };
  if (!ctx.contract) return { kind: "deny", reason: "The task has no approved contract, so the agent can't change files." };
  const operation = ctx.exists(path) ? CHANGE_OPERATIONS.edit : CHANGE_OPERATIONS.create;
  if (ctx.contract.forbiddenOperations.includes(operation)) return { kind: "deny", reason: `The contract forbids ${operation}.` };
  if (!ctx.contract.allowedOperations.includes(operation)) return { kind: "deny", reason: `The contract doesn't allow ${operation}.` };
  const scope = pathScope(ctx.contract);
  if (scope.length > 0 && !scope.some((s) => path === s || path.startsWith(`${s}/`))) {
    return { kind: "deny", reason: `${path} is outside the plan's paths (${scope.join(", ")}).` };
  }
  if (content !== null && containsSecret(content)) return { kind: "deny", reason: "The new content looks like it contains a secret. Keep secrets in environment variables." };
  return { kind: "allow" };
}

export function decide(call: ToolCall, ctx: PermissionContext): Decision {
  switch (call.name) {
    case "list_files":
    case "search_files":
    case "read_file":
    case "review_site":
    case "finish":
      return { kind: "allow" };
    case "write_file":
      return checkWrite(call.input.path, call.input.content, ctx);
    case "edit_file":
      // The edited content is screened again by the runtime once the edits are applied.
      if (!ctx.exists(call.input.path)) return { kind: "deny", reason: `${call.input.path} doesn't exist. Use write_file to create it.` };
      return checkWrite(call.input.path, call.input.edits.map((e) => e.replace).join("\n"), ctx);
    case "run_command": {
      // A plan's `farbaek check-site` is Farbaek's own check, run when the change is verified. It isn't a
      // program anywhere the agent runs, so asking a person to approve it would stop the run for nothing.
      if (programName(call.input.program) === "farbaek") {
        return { kind: "deny", reason: "farbaek check-site isn't a command: Farbaek runs its site check itself when it verifies this change. Call review_site to check the site now." };
      }
      const risk = classifyCommand(call.input.program, call.input.args);
      if (ctx.mode === "review_only") return { kind: "deny", reason: "Review Only doesn't run commands. Suggest it in the summary instead." };
      if (ctx.mode === "sandboxed_autopilot") {
        if (!ctx.sandboxVerified) return { kind: "deny", reason: "No verified sandbox is connected, so Sandboxed Autopilot can't run commands." };
        if (risk === "read_only" || risk === "test_build") return { kind: "allow", risk };
        return { kind: "needs_approval", reason: `${COMMAND_RISK_LABELS[risk]}. This crosses the sandbox's limits, so a person decides.`, risk };
      }
      if (risk === "read_only") return { kind: "allow", risk };
      return { kind: "needs_approval", reason: `${COMMAND_RISK_LABELS[risk]}. It runs on this computer and isn't isolated.`, risk };
    }
  }
}
