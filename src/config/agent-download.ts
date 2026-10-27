/**
 * The desktop agent installer on Farbaek's own server (ADR 0077): what
 * www.farbaek.com/downloads/ serves, and what the Agents page names so anyone
 * can check the file they got. Change it only after the file is on the server
 * with this exact SHA-256 (docs/agent/README.md, "Publishing a release").
 */
export const AGENT_DOWNLOAD = {
  version: "0.6.0",
  platform: "windows",
  file: "Farbaek-Agent-Setup-0.6.0.exe",
  bytes: 113_873_285,
  sha256: "220118bfbc099eaa667c6a9bda23e978ad98ffa7ea2b9aaba177a3de7e80f37e",
  builtOn: "2026-10-27",
} as const;

export const agentDownloadUrl = `/downloads/${AGENT_DOWNLOAD.file}`;

/**
 * Where people install without a warning (ADR 0098). Farbaek Agent's
 * Microsoft Store listing, which Microsoft signs; and the Mac disk image,
 * signed with the owner's Developer ID and notarized by Apple. Each stays
 * null until it's published; the Agents page then offers it first.
 */
export const AGENT_STORE_URL: string | null = null;

export const AGENT_MAC: { version: string; file: string; bytes: number; sha256: string; builtOn: string } | null = null;
