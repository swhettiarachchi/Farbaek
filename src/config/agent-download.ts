/**
 * The desktop agent installer on Farbaek's own server (ADR 0077): what
 * www.farbaek.com/downloads/ serves, and what the Agents page names so anyone
 * can check the file they got. Change it only after the file is on the server
 * with this exact SHA-256 (docs/agent/README.md, "Publishing a release").
 */
export const AGENT_DOWNLOAD = {
  version: "0.10.0",
  platform: "windows",
  file: "Farbaek-Agent-Setup-0.10.0.exe",
  bytes: 114_124_010,
  sha256: "5761f5bd8f376e49e8d06928afd6614d42a56429b1176e633ebf3e69e894cd51",
  builtOn: "2026-11-06",
} as const;

export const agentDownloadUrl = `/downloads/${AGENT_DOWNLOAD.file}`;

/**
 * Where people install without a warning (ADR 0098). Farbaek Agent's
 * Microsoft Store listing, which Microsoft signs; and the Mac disk image,
 * signed with the owner's Developer ID and notarized by Apple. Each stays
 * null until it's published; the Agents page then offers it first.
 */
export const AGENT_STORE_URL: string | null = "https://apps.microsoft.com/detail/9N4GNB94KH9M";

export const AGENT_MAC: { version: string; file: string; bytes: number; sha256: string; builtOn: string } | null = {
  version: "0.10.0",
  file: "Farbaek-Agent-0.10.0-mac.dmg",
  bytes: 227_928_773,
  sha256: "3685d36182f5b074c57c2a6fa7e5eab4168635182876d0e0788453af037c2431",
  builtOn: "2026-11-06",
};

/**
 * The Linux AppImage (ADR 0111), built on GitHub's Linux runner
 * (.github/workflows/agent-linux.yml) and published on Farbaek's own server
 * like the Windows installer. Null until it's on the server with this exact
 * SHA-256; the Agents page then offers it.
 */
export const AGENT_LINUX: { version: string; file: string; bytes: number; sha256: string; builtOn: string } | null = {
  version: "0.10.0",
  file: "Farbaek-Agent-0.10.0-linux-x86_64.AppImage",
  bytes: 130_331_536,
  sha256: "534e5b2261a1456275b37b50ab4116698f3cb3d509ad40cf03c3117aebbde2a3",
  builtOn: "2026-11-06",
};
