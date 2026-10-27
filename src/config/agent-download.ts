/**
 * The desktop agent installer on Farbaek's own server (ADR 0077): what
 * www.farbaek.com/downloads/ serves, and what the Agents page names so anyone
 * can check the file they got. Change it only after the file is on the server
 * with this exact SHA-256 (docs/agent/README.md, "Publishing a release").
 */
export const AGENT_DOWNLOAD = {
  version: "0.7.0",
  platform: "windows",
  file: "Farbaek-Agent-Setup-0.7.0.exe",
  bytes: 114_100_130,
  sha256: "7374925e77e89afb05e6651be2a091b2097341b7281cda3811bf763cff1f70a0",
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
