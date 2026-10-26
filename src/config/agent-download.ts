/**
 * The desktop agent installer on Farbaek's own server (ADR 0077): what
 * www.farbaek.com/downloads/ serves, and what the Agents page names so anyone
 * can check the file they got. Change it only after the file is on the server
 * with this exact SHA-256 (docs/agent/README.md, "Publishing a release").
 */
export const AGENT_DOWNLOAD = {
  version: "0.4.0",
  platform: "windows",
  file: "Farbaek-Agent-Setup-0.4.0.exe",
  bytes: 113_872_598,
  sha256: "e86856af0a15e6c57d71f4d976529608cb8c43444b8dc6e6bc6c383cd7c69f2e",
  builtOn: "2026-10-26",
} as const;

export const agentDownloadUrl = `/downloads/${AGENT_DOWNLOAD.file}`;
