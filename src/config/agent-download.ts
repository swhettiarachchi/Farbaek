/**
 * The desktop agent installer on Farbaek's own server (ADR 0077): what
 * www.farbaek.com/downloads/ serves, and what the Agents page names so anyone
 * can check the file they got. Change it only after the file is on the server
 * with this exact SHA-256 (docs/agent/README.md, "Publishing a release").
 */
export const AGENT_DOWNLOAD = {
  version: "0.3.0",
  platform: "windows",
  file: "Farbaek-Agent-Setup-0.3.0.exe",
  bytes: 113_869_967,
  sha256: "1429a8f889f5739627ae09b9f626afb273f9a7433993bff8c91914a0f9019e84",
  builtOn: "2026-10-26",
} as const;

export const agentDownloadUrl = `/downloads/${AGENT_DOWNLOAD.file}`;
