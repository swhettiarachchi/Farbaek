/**
 * Which runtime this server uses, and whether project code may run on it.
 * There is no fallback: without a configured, verified isolated runtime,
 * Farbaek stays in Review Only and says why. Code never runs on this server.
 *
 * Two audiences read the why (ADR 0180). People get one sentence, the
 * `reason`, on the Build page, a task's checks, Settings, the Test space page,
 * the phone app and the desktop agent. Whoever runs the server gets the
 * `detail` (which setting is missing, what to run next), in the logs and
 * through sandboxExecutionStatus for the staff console. A person never reads
 * a setting's name.
 */
import { executionMode, type ExecutionMode } from "@/core/execution/sandbox";
import { log } from "@/server/observability/log";
import { platformPause } from "@/server/platform/state";
import type { SandboxRuntime } from "@/core/sandbox/runtime";
import { readSandboxConfig, type SandboxServerConfig } from "./config";
import { createE2bRuntime } from "./e2b-runtime";
import { createVercelRuntime, vercelCredentialProblem } from "./vercel-runtime";

/** What a person reads whenever project code can't run here, whatever the server-side cause. */
export const CHECKS_CANT_RUN = "Project code can't run on this server, so test spaces and checks are off and changes stay unverified.";

export type RuntimeResolution =
  | { runtime: SandboxRuntime; reason: null; detail?: null; config: SandboxServerConfig }
  | {
      runtime: null;
      /** For people: CHECKS_CANT_RUN. */
      reason: string;
      /** For staff and the logs only: the setting that's missing or wrong. */
      detail?: string;
      config: SandboxServerConfig;
    };

/** Review Only, as people see it, with the operator's reason beside it for staff. */
export interface ExecutionStatus {
  mode: ExecutionMode;
  /** Why, in the server's own terms. Null when code runs, or when the reason was written for people (a pause). */
  detail: string | null;
}

function unavailable(detail: string, config: SandboxServerConfig): RuntimeResolution {
  return { runtime: null, reason: CHECKS_CANT_RUN, detail, config };
}

let cached: { key: string; resolution: RuntimeResolution } | null = null;

export function resolveSandboxRuntime(config: SandboxServerConfig = readSandboxConfig()): RuntimeResolution {
  const key = JSON.stringify([
    config.provider,
    config.unknownProvider,
    Boolean(config.e2b.apiKey),
    config.e2b.domain,
    config.e2b.apiUrl,
    Boolean(config.vercel.token),
    config.vercel.teamId,
    config.vercel.projectId,
    config.vercel.oidc,
    config.vercel.region,
    config.isolationVerifiedAt,
    config.runtimeMaxSessionMinutes,
  ]);
  if (cached?.key === key) return { ...cached.resolution, config };

  let resolution: RuntimeResolution;
  if (config.unknownProvider) {
    resolution = unavailable(`SANDBOX_PROVIDER is set to "${config.unknownProvider}", which Farbaek has no adapter for. Use "vercel" or "e2b".`, config);
  } else if (!config.provider) {
    resolution = unavailable("SANDBOX_PROVIDER isn't set, so no isolated runtime is connected and project code doesn't run here.", config);
  } else if (config.provider === "vercel") {
    const problem = vercelCredentialProblem(config);
    resolution = problem ? unavailable(problem, config) : { runtime: createVercelRuntime(config), reason: null, config };
  } else if (!config.e2b.apiKey) {
    resolution = unavailable("SANDBOX_PROVIDER is e2b, but E2B_API_KEY isn't set on this server.", config);
  } else {
    resolution = { runtime: createE2bRuntime(config), reason: null, config };
  }
  // Once per configuration, so whoever runs the server finds the cause in the logs.
  if (!resolution.runtime) log("warn", "sandbox.runtime_unavailable", { detail: resolution.detail });
  cached = { key, resolution };
  return resolution;
}

/**
 * Whether project code may run here: the mode people see, and the operator's
 * reason for staff and the logs. Only the staff console reads `detail`.
 */
export function sandboxExecutionStatus(resolution: RuntimeResolution = resolveSandboxRuntime()): ExecutionStatus {
  // A pause's message was written for people in Office Space, so it's shown as it is.
  const paused = platformPause("sandboxes");
  if (paused) return { mode: executionMode(null, paused), detail: null };
  if (!resolution.runtime) return { mode: executionMode(null, resolution.reason), detail: resolution.detail ?? null };
  const mode = executionMode(resolution.runtime);
  if (mode.mode === "sandboxed") return { mode, detail: null };
  const detail = resolution.runtime.capabilities.verified
    ? mode.reason
    : `${resolution.runtime.capabilities.provider} is connected, but its isolation hasn't been verified for this deployment. Run pnpm sandbox:smoke, then set SANDBOX_ISOLATION_VERIFIED_AT.`;
  return { mode: { mode: "review_only", reason: CHECKS_CANT_RUN }, detail };
}

/** Whether project code may run here, in the words a person reads. Safe to send to any screen or device. */
export function sandboxExecutionMode(resolution: RuntimeResolution = resolveSandboxRuntime()): ExecutionMode {
  return sandboxExecutionStatus(resolution).mode;
}
