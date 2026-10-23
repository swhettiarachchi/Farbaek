/**
 * What the host says about the build this server is running (ADR 0035).
 * On the VPS, Farbaek's deploy script sets FARBAEK_COMMIT,
 * FARBAEK_ENVIRONMENT and FARBAEK_REGION. Names and a commit only, never a
 * secret, so it can be shown to staff and in /api/health.
 */
type Env = Record<string, string | undefined>;

export interface DeploymentInfo {
  /** Where it runs, when the deploy said so. */
  host: "vps" | null;
  /** The full commit SHA, when known. */
  commit: string | null;
  environment: string | null;
  region: string | null;
}

function value(env: Env, name: string): string | null {
  return env[name]?.trim() || null;
}

export function deploymentInfo(env: Env = process.env): DeploymentInfo {
  const commit = value(env, "FARBAEK_COMMIT");
  const environment = value(env, "FARBAEK_ENVIRONMENT");
  return {
    host: commit || environment ? "vps" : null,
    commit,
    environment,
    region: value(env, "FARBAEK_REGION"),
  };
}
