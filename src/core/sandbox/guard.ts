/**
 * Farbaek Guard rules for sandboxes: the same policy engine family as change
 * proposals (ADR 0004), with its own versioned, hashed rule set. Every
 * decision records the hash, so it can be traced to the rules that made it.
 *
 * What Guard decides here is who may cross which boundary: starting an
 * environment, running code in it, writing its files, opening a preview of
 * it. It doesn't try to judge whether shell text is "safe": commands are
 * untrusted by design and the microVM is the boundary. Nothing runs when
 * isolation isn't verified for this deployment.
 *
 * Results flow the other way too: a check run's real exit codes become a
 * verification verdict, which is evidence, not permission. A passing run
 * doesn't authorize a deployment.
 */
import type { PolicyOutcome } from "../billing/usage";
import type { ExecutionMode } from "../execution/sandbox";
import type { PolicyDecision, PolicyFinding } from "../trust/policy";
import { canonicalHash } from "../trust/canonical-json";
import type { SessionState } from "./lifecycle";
import type { NetworkProfile } from "./network";

export type SandboxAction = "session.create" | "command.run" | "files.write" | "files.read" | "preview.open" | "session.stop" | "session.pause";

export type SandboxRole = "owner" | "admin" | "member" | "viewer";

export interface SandboxGuardInput {
  action: SandboxAction;
  execution: ExecutionMode;
  role: SandboxRole | null;
  /** True when the actor started the session. Ignored for session.create. */
  isSessionOwner: boolean;
  sessionState: SessionState | null;
  network: NetworkProfile;
  /** The command text, for command.run. */
  command?: string;
}

const INSTALL_PATTERN = /(^|[\s;&|(])(npm|pnpm|yarn|bun)\s+(i|install|add|ci)\b|(^|[\s;&|(])pip3?\s+install\b|(^|[\s;&|(])(uv|poetry)\s+(add|install|sync)\b/;

/** The rule set, as data. Its canonical hash is the version every decision records. */
export const SANDBOX_POLICY_RULES = {
  schema: "farbaek.policy/v1",
  scope: "sandbox",
  isolation: { required: "verified microVM with restricted egress", otherwise: "BLOCK" },
  roles: { viewer: "BLOCK", member: "ALLOW_WITHIN_LIMITS", admin: "ALLOW_WITHIN_LIMITS", owner: "ALLOW_WITHIN_LIMITS" },
  othersSessions: { managers: "ALLOW_WITHIN_LIMITS", members: "BLOCK", reads: "ALLOW" },
  sessionMustBeRunning: ["command.run", "files.write", "files.read", "preview.open"],
  network: { none: "ALLOW_WITHIN_LIMITS", package_registries: "ALLOW_WITHIN_LIMITS" },
  installWithoutNetwork: { outcome: "ALLOW_WITHIN_LIMITS", note: "will fail without registry access", pattern: INSTALL_PATTERN.source },
  deployment: "not authorized by sandbox results; needs the deploy workflow",
} as const;

let versionPromise: Promise<string> | null = null;
export function sandboxPolicyVersion(): Promise<string> {
  versionPromise ??= canonicalHash(SANDBOX_POLICY_RULES);
  return versionPromise;
}

const RANK: Record<PolicyOutcome, number> = { ALLOW: 0, ALLOW_WITHIN_LIMITS: 1, SIMULATE_FIRST: 2, REQUIRE_APPROVAL: 3, ESCALATE: 4, BLOCK: 5 };

export function looksLikeInstall(command: string): boolean {
  return INSTALL_PATTERN.test(command);
}

export async function evaluateSandboxAction(input: SandboxGuardInput): Promise<PolicyDecision> {
  const findings: PolicyFinding[] = [];
  const reading = input.action === "files.read";

  if (input.execution.mode !== "sandboxed" && !reading && input.action !== "session.stop") {
    findings.push({ rule: "isolation", outcome: "BLOCK", detail: input.execution.reason });
  }
  if (!input.role) {
    findings.push({ rule: "membership", outcome: "BLOCK", detail: "You're not a member of this workspace." });
  } else if (input.role === "viewer" && !reading) {
    findings.push({ rule: "role", outcome: "BLOCK", detail: "Viewers can look at sessions but can't start or change them." });
  }

  if (input.action !== "session.create") {
    const manager = input.role === "owner" || input.role === "admin";
    if (!input.isSessionOwner && !manager && !reading) {
      findings.push({ rule: "session_owner", outcome: "BLOCK", detail: "Only the person who started this session, or an owner or admin, can do that." });
    }
    const needsRunning = (SANDBOX_POLICY_RULES.sessionMustBeRunning as readonly string[]).includes(input.action);
    if (needsRunning && input.sessionState !== "ready") {
      findings.push({ rule: "session_state", outcome: "BLOCK", detail: "The session isn't running." });
    }
  }

  if (input.action === "session.create" && input.network === "package_registries") {
    findings.push({ rule: "network", outcome: "ALLOW_WITHIN_LIMITS", detail: "Outbound access is limited to the package registries." });
  }
  if (input.action === "command.run" && input.command && input.network === "none" && looksLikeInstall(input.command)) {
    findings.push({
      rule: "install_without_network",
      outcome: "ALLOW_WITHIN_LIMITS",
      detail: "This looks like a package install, and the session has no network, so it will likely fail.",
    });
  }

  const outcome = findings.reduce<PolicyOutcome>((worst, f) => (RANK[f.outcome] > RANK[worst] ? f.outcome : worst), "ALLOW_WITHIN_LIMITS");
  return { outcome, findings, policyVersion: await sandboxPolicyVersion() };
}

/** The first blocking reason, for showing people why something was refused. */
export function blockReason(decision: PolicyDecision): string | null {
  return decision.outcome === "BLOCK" ? (decision.findings.find((f) => f.outcome === "BLOCK")?.detail ?? "Stopped by the rules.") : null;
}
