/**
 * What the host says about the build this server is running (ADR 0035).
 * On the VPS, Farbaek's deploy script sets FARBAEK_COMMIT,
 * FARBAEK_ENVIRONMENT and FARBAEK_REGION; the RAILWAY_* names are read too,
 * for a Railway deploy still running. Names and a commit only, never a
 * secret, so it can be shown to staff and in /api/health.
 */
type Env = Record<string, string | undefined>;

export interface DeploymentInfo {
  /** Where it runs, when a host said so. */
  host: "vps" | "railway" | null;
  /** The full commit SHA, when known. */
  commit: string | null;
  environment: string | null;
  region: string | null;
}

function first(env: Env, ...names: string[]): string | null {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export function deploymentInfo(env: Env = process.env): DeploymentInfo {
  const ours = Boolean(first(env, "FARBAEK_COMMIT", "FARBAEK_ENVIRONMENT"));
  const railway = Boolean(first(env, "RAILWAY_GIT_COMMIT_SHA", "RAILWAY_ENVIRONMENT_NAME"));
  return {
    host: ours ? "vps" : railway ? "railway" : null,
    commit: first(env, "FARBAEK_COMMIT", "RAILWAY_GIT_COMMIT_SHA"),
    environment: first(env, "FARBAEK_ENVIRONMENT", "RAILWAY_ENVIRONMENT_NAME"),
    region: first(env, "FARBAEK_REGION", "RAILWAY_REPLICA_REGION"),
  };
}
