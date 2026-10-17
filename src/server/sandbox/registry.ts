/**
 * Which runtime this server uses, and whether project code may run on it.
 * There is no fallback: without a configured, verified isolated runtime,
 * Farbaek stays in Review Only and says why. Code never runs on this server.
 */
import { executionMode, type ExecutionMode } from "@/core/execution/sandbox";
import type { SandboxRuntime } from "@/core/sandbox/runtime";
import { readSandboxConfig, type SandboxServerConfig } from "./config";
import { createE2bRuntime } from "./e2b-runtime";

export type RuntimeResolution =
  | { runtime: SandboxRuntime; reason: null; config: SandboxServerConfig }
  | { runtime: null; reason: string; config: SandboxServerConfig };

let cached: { key: string; resolution: RuntimeResolution } | null = null;

export function resolveSandboxRuntime(config: SandboxServerConfig = readSandboxConfig()): RuntimeResolution {
  const key = JSON.stringify([config.provider, config.unknownProvider, Boolean(config.e2b.apiKey), config.e2b.domain, config.e2b.apiUrl, config.isolationVerifiedAt]);
  if (cached?.key === key) return { ...cached.resolution, config };

  let resolution: RuntimeResolution;
  if (config.unknownProvider) {
    resolution = { runtime: null, reason: `SANDBOX_PROVIDER is set to "${config.unknownProvider}", which Farbaek has no adapter for. Use "e2b".`, config };
  } else if (!config.provider) {
    resolution = { runtime: null, reason: "No isolated sandbox runtime is connected yet, so project code doesn't run here.", config };
  } else if (!config.e2b.apiKey) {
    resolution = { runtime: null, reason: "SANDBOX_PROVIDER is e2b, but E2B_API_KEY isn't set on this server.", config };
  } else {
    resolution = { runtime: createE2bRuntime(config), reason: null, config };
  }
  cached = { key, resolution };
  return resolution;
}

export function sandboxExecutionMode(resolution: RuntimeResolution = resolveSandboxRuntime()): ExecutionMode {
  if (!resolution.runtime) return executionMode(null, resolution.reason);
  const mode = executionMode(resolution.runtime);
  if (mode.mode === "review_only" && !resolution.runtime.capabilities.verified) {
    return {
      mode: "review_only",
      reason: `${resolution.runtime.capabilities.provider} is connected, but its isolation hasn't been verified for this deployment. Run pnpm sandbox:smoke, then set SANDBOX_ISOLATION_VERIFIED_AT.`,
    };
  }
  return mode;
}
