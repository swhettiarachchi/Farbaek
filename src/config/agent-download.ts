/**
 * The desktop agent installer on Farbaek's own server (ADR 0077): what
 * www.farbaek.com/downloads/ serves, and what the Agents page names so anyone
 * can check the file they got. Change it only after the file is on the server
 * with this exact SHA-256 (docs/agent/README.md, "Publishing a release").
 */
export const AGENT_DOWNLOAD = {
  version: "0.11.0",
  platform: "windows",
  file: "Farbaek-Agent-Setup-0.11.0.exe",
  bytes: 114_142_465,
  sha256: "323068b4676bab892c728c09ab6218d45bc5ea605ca74ebdc57a5f1cef367e4e",
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
  version: "0.11.0",
  file: "Farbaek-Agent-0.11.0-mac.dmg",
  bytes: 227_943_376,
  sha256: "e24635e99e25ce2ada64f4886ee28f77cbe10c5c31a1a1959af39ebe93069a79",
  builtOn: "2026-11-13",
};

/**
 * The Linux AppImage (ADR 0111), built on GitHub's Linux runner
 * (.github/workflows/agent-linux.yml) and published on Farbaek's own server
 * like the Windows installer. Null until it's on the server with this exact
 * SHA-256; the Agents page then offers it.
 */
export const AGENT_LINUX: { version: string; file: string; bytes: number; sha256: string; builtOn: string } | null = {
  version: "0.11.0",
  file: "Farbaek-Agent-0.11.0-linux-x86_64.AppImage",
  bytes: 130_356_078,
  sha256: "5e4c2e43e44633f3a7f607706205bf631bb703e686a41a526f6040f9581981af",
  builtOn: "2026-11-13",
};
