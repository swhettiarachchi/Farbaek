/**
 * Verifying an applied change in one step (ADR 0047): what a fresh sandbox
 * needs installed before the contract's checks can run, how an attempt
 * reads at a given moment, and the words people see for each result. The
 * check run itself, and its receipt and ProofPack, are unchanged; an attempt
 * only says which run verified the change, or why none could.
 */
import { setupReport } from "@/core/agent/setup-report";

export type VerificationTrigger = "person" | "autonomy";
export type VerificationResult = "verified" | "partially_verified" | "failed" | "unverified";

export interface VerificationRecord {
  id: string;
  taskId: string;
  trigger: VerificationTrigger;
  status: "running" | "done" | "failed";
  result: VerificationResult | null;
  receiptDigest: string | null;
  failure: string | null;
  sessionId: string | null;
  startedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** An attempt still running after this long has stopped somewhere; the database closes it on the next start. */
export const VERIFICATION_STALE_MINUTES = 20;

export interface VerificationSetup {
  command: string;
  /** Why it runs, in words. */
  label: string;
  /** Installs need the package registries. */
  network: boolean;
}

/**
 * The install a fresh sandbox needs before the checks, or null when the
 * project has nothing to install. Lifecycle scripts never run: a package's
 * own install scripts aren't part of checking a change.
 */
export function verificationSetup(paths: readonly string[], read: (path: string) => string | null): VerificationSetup | null {
  const report = setupReport(paths, read);
  const has = (p: string) => paths.includes(p);
  if (has("package.json")) {
    if (report.lockfile === "pnpm-lock.yaml") return { command: "corepack pnpm install --frozen-lockfile --ignore-scripts", label: "Install packages with pnpm", network: true };
    if (report.lockfile === "package-lock.json") return { command: "npm ci --ignore-scripts", label: "Install packages with npm", network: true };
    return { command: "npm install --ignore-scripts", label: "Install packages with npm", network: true };
  }
  if (has("requirements.txt")) return { command: "python3 -m pip install -r requirements.txt", label: "Install Python packages", network: true };
  return null;
}

export type VerificationState = "running" | "stale" | "done" | "failed";

export function verificationState(v: Pick<VerificationRecord, "status" | "startedAt">, now: Date): VerificationState {
  if (v.status !== "running") return v.status;
  return now.getTime() - Date.parse(v.startedAt) >= VERIFICATION_STALE_MINUTES * 60_000 ? "stale" : "running";
}

export const VERIFICATION_RESULT_WORDS: Record<VerificationResult, { title: string; detail: string }> = {
  verified: { title: "Verified", detail: "Every check passed against exactly the applied files." },
  partially_verified: { title: "Partly verified", detail: "Some checks passed and some failed. See the check run below." },
  failed: { title: "Checks failed", detail: "The checks ran against exactly the applied files and failed. See the check run below." },
  unverified: { title: "Not verified", detail: "The checks couldn't run against exactly the applied files, so nothing was verified." },
};

/** What a cloud run says once a change it applied on its own has been checked (or couldn't be). */
export function autoVerifiedOutcome(r: { ok: true; result: VerificationResult } | { ok: false; reason: string }): string {
  if (!r.ok) return `Finished. The change applied on its own, but its checks couldn't run (${r.reason.replace(/[.\s]+$/, "")}). Run them from the task, or undo it there.`;
  switch (r.result) {
    case "verified":
      return "Finished. The change applied on its own, and its checks passed: verified.";
    case "partially_verified":
      return "Finished. The change applied on its own, and some of its checks failed, so changes applying on their own are paused for this workspace. Review it, or undo it from the task.";
    case "failed":
      return "Finished. The change applied on its own, and its checks failed, so changes applying on their own are paused for this workspace. Undo it from the task.";
    case "unverified":
      return "Finished. The change applied on its own, but its checks couldn't run against exactly those files, so it isn't verified. Run them from the task.";
  }
}
