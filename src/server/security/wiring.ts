/**
 * Builds a security check's dependencies from the signed-in context
 * (ADR 0024), the same way cloud runs do (ADR 0022): the package audit runs
 * in a sandbox session created as the person, with their refreshed access
 * token kept in memory only; reports and usage go through the service-role
 * functions.
 */
import { createOsvLookup } from "./osv-client";
import { COMPACT_SCRIPT, SCAN_DIR, SECRETS_COMMAND, SEMGREP_COMMAND, STATIC_SCAN_INSTALL, semgrepRulesYaml } from "@/core/security/static-scan";
import { createClient } from "@supabase/supabase-js";
import { resolveAiProvider } from "@/server/ai/config";
import { createAnthropicSecurityReviewer } from "@/server/ai/security-reviewer";
import { createSupabaseAgentStore } from "@/server/agent/supabase-store";
import { sandboxExecutionMode } from "@/server/sandbox/registry";
import { sandboxServiceFor } from "@/server/sandbox/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { readSupabaseConfig } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { createServerUsageDeps } from "@/server/workspace/usage-store";
import type { OrgRole } from "@/server/workspace/types";
import type { SecurityCheckDeps } from "./runner";
import { createSupabaseSecurityStore } from "./store";

export type SecurityWiring = { ok: true; deps: SecurityCheckDeps } | { ok: false; reason: string };

async function freshAccessToken(): Promise<string | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data } = await client.auth.refreshSession().catch(() => ({ data: { session: null } }));
  return data.session?.access_token ?? null;
}

export async function securityCheckDeps(person: { orgId: string; userId: string; role: OrgRole }): Promise<SecurityWiring> {
  const admin = createSupabaseAdminClient();
  const config = readSupabaseConfig();
  if (!admin || !config) return { ok: false, reason: "Accounts aren't configured on this server." };
  const agentStore = createSupabaseAgentStore(admin);
  const ai = resolveAiProvider();
  const sandbox = sandboxExecutionMode();
  const token = sandbox.mode === "sandboxed" ? await freshAccessToken() : null;

  const audit: SecurityCheckDeps["audit"] = !token
    ? { unavailable: sandbox.mode === "sandboxed" ? "Your session couldn't be confirmed for the sandbox. Sign in again." : "No verified sandbox is connected, so packages can't be checked." }
    : async ({ projectId, reportId }) => {
        const user = createClient(config.url, config.publishableKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const { service, actor } = sandboxServiceFor(user, person.userId, person.orgId, person.role);
        const limits = (await service.overview(actor)).limits.limits;
        if (!limits.networkProfiles.includes("package_registries")) return { ok: false, reason: "This plan's sandboxes can't reach the npm registry." };
        const created = await service.createSession(
          actor,
          { name: "Security check", template: "node-ts", size: "small", network: "package_registries", minutes: Math.max(5, Math.min(15, limits.maxSessionMinutes)), projectId, taskId: null, include: [] },
          `security:${reportId}`,
        );
        if (!created.ok) return { ok: false, reason: created.message };
        const sessionId = created.value.sessionId;
        try {
          // Reads the lockfile only: nothing is installed and no package code runs.
          const r = await service.runCommand(actor, sessionId, { command: "npm audit --json --package-lock-only", timeoutSeconds: 120, label: "Security check: npm audit" }, crypto.randomUUID());
          if (!r.ok) return { ok: false, reason: r.message };
          if (!r.value.stdout.trim()) return { ok: false, reason: `npm audit didn't produce a report${r.value.stderr ? `: ${r.value.stderr.slice(0, 200)}` : "."}` };
          return { ok: true, stdout: r.value.stdout };
        } finally {
          await service.stopSession(actor, sessionId).catch(() => undefined);
        }
      };

  // Semgrep and detect-secrets (ADR 0137): pinned, from PyPI, in a throwaway environment; no project code runs.
  const staticScan: SecurityCheckDeps["staticScan"] = !token
    ? { unavailable: sandbox.mode === "sandboxed" ? "Your session couldn't be confirmed for the sandbox. Sign in again." : "No verified sandbox is connected, so Semgrep and the secret scan can't run." }
    : async ({ projectId, reportId }) => {
        const user = createClient(config.url, config.publishableKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const { service, actor } = sandboxServiceFor(user, person.userId, person.orgId, person.role);
        const limits = (await service.overview(actor)).limits.limits;
        if (!limits.networkProfiles.includes("package_registries")) return { ok: false, reason: "This plan's sandboxes can't reach PyPI, so Semgrep couldn't be installed." };
        const created = await service.createSession(
          actor,
          { name: "Security check: static analysis", template: "python", size: "small", network: "package_registries", minutes: Math.max(5, Math.min(15, limits.maxSessionMinutes)), projectId, taskId: null, include: [] },
          `security-static:${reportId}`,
        );
        if (!created.ok) return { ok: false, reason: created.message };
        const sessionId = created.value.sessionId;
        const run = (command: string, timeoutSeconds: number, label: string) => service.runCommand(actor, sessionId, { command, timeoutSeconds, label }, crypto.randomUUID());
        try {
          for (const [path, content] of [
            [`${SCAN_DIR}/semgrep.yml`, semgrepRulesYaml()],
            [`${SCAN_DIR}/compact.py`, COMPACT_SCRIPT],
          ] as const) {
            const w = await service.writeFile(actor, sessionId, path, content);
            if (!w.ok) return { ok: false, reason: `Farbaek's scan files couldn't be written into the sandbox: ${w.message}` };
          }
          const installed = await run(STATIC_SCAN_INSTALL, 300, "Security check: install Semgrep and detect-secrets");
          if (!installed.ok) return { ok: false, reason: installed.message };
          if (installed.value.exitCode !== 0) return { ok: false, reason: `Semgrep and detect-secrets couldn't be installed${installed.value.state === "timed_out" ? " in time" : ` (exit ${installed.value.exitCode})`}.` };
          // Each tool reports on its own: one that didn't run doesn't hide the other's results.
          const report = (r: Awaited<ReturnType<typeof run>>) => (r.ok ? r.value.stdout : JSON.stringify({ ok: false, exit: -1, error: r.message }));
          const semgrep = await run(SEMGREP_COMMAND, 300, "Security check: Semgrep");
          const secrets = await run(SECRETS_COMMAND, 180, "Security check: detect-secrets");
          return { ok: true, semgrep: report(semgrep), secrets: report(secrets) };
        } finally {
          await service.stopSession(actor, sessionId).catch(() => undefined);
        }
      };

  return {
    ok: true,
    deps: {
      reports: createSupabaseSecurityStore(admin),
      checks: agentStore,
      usage: { ...agentStore, ...createServerUsageDeps(admin) },
      reviewer:
        ai.provider === "anthropic"
          ? { family: "anthropic", create: (s) => createAnthropicSecurityReviewer({ model: s.model, effort: s.thinking }) }
          : { unavailable: ai.provider ? "The AI review needs Claude on this server." : ai.reason },
      audit,
      osv: createOsvLookup(),
      staticScan,
    },
  };
}
