/**
 * The desktop agent installer on Farbaek's own server (ADR 0077): what
 * www.farbaek.com/downloads/ serves, and what the Agents page names so anyone
 * can check the file they got. Change it only after the file is on the server
 * with this exact SHA-256 (docs/agent/README.md, "Publishing a release").
 */
export const AGENT_DOWNLOAD = {
  version: "0.9.0",
  platform: "windows",
  file: "Farbaek-Agent-Setup-0.9.0.exe",
  bytes: 114_113_152,
  sha256: "406cbfc62d2eba76aec7435f9f466e9283cd87cf8345df585f8419f46dacaff6",
  builtOn: "2026-10-31",
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
  version: "0.9.0",
  file: "Farbaek-Agent-0.9.0-mac.dmg",
  bytes: 227_928_858,
  sha256: "f64015289e2a88f376d1b762c613e09dbc65a22e80d8e5f9dc78638283b65a11",
  builtOn: "2026-11-01",
};

/**
 * The Linux AppImage (ADR 0111), built on GitHub's Linux runner
 * (.github/workflows/agent-linux.yml) and published on Farbaek's own server
 * like the Windows installer. Null until it's on the server with this exact
 * SHA-256; the Agents page then offers it.
 */
export const AGENT_LINUX: { version: string; file: string; bytes: number; sha256: string; builtOn: string } | null = {
  version: "0.9.0",
  file: "Farbaek-Agent-0.9.0-linux-x86_64.AppImage",
  bytes: 130_319_103,
  sha256: "df4e1194dbe3cc77f4367e57591d335759605c5c887d84e6b483ec94552550e4",
  builtOn: "2026-11-01",
};
