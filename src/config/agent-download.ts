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
  bytes: 114_124_227,
  sha256: "29f9899724d50f20a9ec7a30557395a778d7c4e33bd4e456ffa79a5cb05e7429",
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
  bytes: 227_927_326,
  sha256: "961c044cc3d5e28e76281fa547a176b9ebac936d5d5c9233bcaed5399103585b",
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
  bytes: 130_331_492,
  sha256: "37812144d8e6e37d4891ee72e46353dcbca2b02d872f2519810e97a9f87ded58",
  builtOn: "2026-11-06",
};
