/**
 * The desktop agent installer on Farbaek's own server (ADR 0077): what
 * www.farbaek.com/downloads/ serves, and what the Agents page names so anyone
 * can check the file they got. Change it only after the file is on the server
 * with this exact SHA-256 (docs/agent/README.md, "Publishing a release").
 */
export const AGENT_DOWNLOAD = {
  version: "0.2.0",
  platform: "windows",
  file: "Farbaek-Agent-Setup-0.2.0.exe",
  bytes: 113_866_415,
  sha256: "c5bcb99e3e6f9561f5de6a620af949082a2cd7f3d7a955ea3d9b150b13224a71",
  builtOn: "2026-10-25",
} as const;

export const agentDownloadUrl = `/downloads/${AGENT_DOWNLOAD.file}`;
