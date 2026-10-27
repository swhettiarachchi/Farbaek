/**
 * The desktop agent installer on Farbaek's own server (ADR 0077): what
 * www.farbaek.com/downloads/ serves, and what the Agents page names so anyone
 * can check the file they got. Change it only after the file is on the server
 * with this exact SHA-256 (docs/agent/README.md, "Publishing a release").
 */
export const AGENT_DOWNLOAD = {
  version: "0.5.0",
  platform: "windows",
  file: "Farbaek-Agent-Setup-0.5.0.exe",
  bytes: 113_873_073,
  sha256: "c5ea8e3230fd4de6a87913b37c7f7b96a2f96dfd7d2d0704e2372e3c153bc5df",
  builtOn: "2026-10-27",
} as const;

export const agentDownloadUrl = `/downloads/${AGENT_DOWNLOAD.file}`;
