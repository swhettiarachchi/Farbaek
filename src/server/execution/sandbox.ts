/**
 * Which sandbox, if any, this server can use. No provider adapter is
 * installed yet: choosing E2B or Vercel Sandbox is an open owner decision
 * (ADR 0003). Until then every environment is Review Only, with a reason.
 */
import { executionMode, type ExecutionMode, type SandboxProvider } from "@/core/execution/sandbox";

export function resolveSandboxProvider(): { provider: SandboxProvider | null; reason: string } {
  const name = (process.env.SANDBOX_PROVIDER ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  if (!name) {
    return { provider: null, reason: "No isolated sandbox is connected yet, so project code doesn't run here." };
  }
  return { provider: null, reason: `SANDBOX_PROVIDER is set to "${name}", but no adapter for it is installed yet, so project code doesn't run here.` };
}

export function currentExecutionMode(): ExecutionMode {
  const { provider, reason } = resolveSandboxProvider();
  return executionMode(provider, reason);
}
