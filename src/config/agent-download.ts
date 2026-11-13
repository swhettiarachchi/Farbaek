/**
 * The desktop agent installer on Farbaek's own server (ADR 0077): what
 * www.farbaek.com/downloads/ serves, and what the Agents page names so anyone
 * can check the file they got. Change it only after the file is on the server
 * with this exact SHA-256 (docs/agent/README.md, "Publishing a release").
 */
export const AGENT_DOWNLOAD = {
  version: "0.12.0",
  platform: "windows",
  file: "Farbaek-Agent-Setup-0.12.0.exe",
  bytes: 114_148_160,
  sha256: "9bed847d02a28763efb0047c38c7fd9ec8de61541e091d10adf2bebfc96f1ed4",
  builtOn: "2026-11-13",
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
  version: "0.12.0",
  file: "Farbaek-Agent-0.12.0-mac.dmg",
  bytes: 227_946_164,
  sha256: "c28257ddcd2c1bcd7a908b43f8a83bddf2d828eb096165c8a210700311929668",
  builtOn: "2026-11-13",
};

/**
 * The Linux AppImage (ADR 0111), built on GitHub's Linux runner
 * (.github/workflows/agent-linux.yml) and published on Farbaek's own server
 * like the Windows installer. Null until it's on the server with this exact
 * SHA-256; the Agents page then offers it.
 */
export const AGENT_LINUX: { version: string; file: string; bytes: number; sha256: string; builtOn: string } | null = {
  version: "0.12.0",
  file: "Farbaek-Agent-0.12.0-linux-x86_64.AppImage",
  bytes: 130_360_122,
  sha256: "ba06a96d47ab4c019f5f64b64f91a5c4a8f790ed4e67140e80a49598e5471d62",
  builtOn: "2026-11-13",
};
