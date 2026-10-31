/**
 * The desktop agent installer on Farbaek's own server (ADR 0077): what
 * www.farbaek.com/downloads/ serves, and what the Agents page names so anyone
 * can check the file they got. Change it only after the file is on the server
 * with this exact SHA-256 (docs/agent/README.md, "Publishing a release").
 */
export const AGENT_DOWNLOAD = {
  version: "0.8.0",
  platform: "windows",
  file: "Farbaek-Agent-Setup-0.8.0.exe",
  bytes: 114_108_986,
  sha256: "e886be32e698e9b7635f7f360f88a009747685595a7bd45d533722118dcc829e",
  builtOn: "2026-10-31",
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

/**
 * The Linux AppImage (ADR 0111), built on GitHub's Linux runner
 * (.github/workflows/agent-linux.yml) and published on Farbaek's own server
 * like the Windows installer. Null until it's on the server with this exact
 * SHA-256; the Agents page then offers it.
 */
export const AGENT_LINUX: { version: string; file: string; bytes: number; sha256: string; builtOn: string } | null = null;
