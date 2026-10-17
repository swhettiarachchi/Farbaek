/**
 * File paths inside a sandbox. Every path a person or agent sends is relative
 * to the workspace root and is checked before it reaches the runtime: no
 * absolute paths, no "..", no control characters, no backslashes. The
 * runtime's own filesystem is a separate microVM disk, so even a symlink
 * inside the sandbox can't lead to Farbaek's servers; this check keeps file
 * operations inside the project folder people expect.
 */

export const SANDBOX_WORKSPACE_ROOT = "/home/user/project";
export const MAX_SANDBOX_PATH_LENGTH = 512;
export const MAX_SANDBOX_FILE_BYTES = 512 * 1024;

export type SandboxPathResult = { ok: true; relative: string; absolute: string } | { ok: false; reason: string };

/** Accepts "" or "." for the root itself, otherwise a clean relative path. */
export function resolveSandboxPath(input: unknown): SandboxPathResult {
  if (typeof input !== "string") return { ok: false, reason: "The path must be text." };
  const raw = input.trim();
  if (raw === "" || raw === ".") return { ok: true, relative: "", absolute: SANDBOX_WORKSPACE_ROOT };
  if (raw.length > MAX_SANDBOX_PATH_LENGTH) return { ok: false, reason: "The path is too long." };
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, reason: "The path contains control characters." };
  if (raw.includes("\\")) return { ok: false, reason: "Use forward slashes in paths." };
  if (raw.startsWith("/") || raw.startsWith("~")) return { ok: false, reason: "Use a path relative to the project folder." };

  const parts = raw.split("/").filter((p) => p !== "" && p !== ".");
  if (parts.some((p) => p === "..")) return { ok: false, reason: "Paths can't leave the project folder." };
  if (parts.length === 0) return { ok: true, relative: "", absolute: SANDBOX_WORKSPACE_ROOT };
  const relative = parts.join("/");
  return { ok: true, relative, absolute: `${SANDBOX_WORKSPACE_ROOT}/${relative}` };
}

/** Maps an absolute path the runtime returns back to a workspace-relative one, or null if it is outside. */
export function toWorkspaceRelative(absolute: string): string | null {
  if (absolute === SANDBOX_WORKSPACE_ROOT) return "";
  if (!absolute.startsWith(`${SANDBOX_WORKSPACE_ROOT}/`)) return null;
  const rel = absolute.slice(SANDBOX_WORKSPACE_ROOT.length + 1);
  return resolveSandboxPath(rel).ok ? rel : null;
}
