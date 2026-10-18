// PreToolUse guard for Claude Code. Reads the hook payload from stdin.
// Exit code 2 blocks the tool call and shows the stderr message to Claude.
// CLAUDE.md rules are requests; this file is the enforcement.
import { readFileSync } from "node:fs";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const tool = input.tool_name ?? "";
const args = input.tool_input ?? {};

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) {
  const path = String(args.file_path ?? args.notebook_path ?? "").replace(/\\/g, "/");
  const name = path.split("/").pop() ?? "";

  if (/^\.env(\..+)?$/.test(name) && name !== ".env.example") {
    block(`Blocked: ${name} holds secret values. Add variable names to .env.example instead.`);
  }
  if (/\.(pem|key|p8|p12|pfx)$/i.test(name)) {
    block(`Blocked: ${name} looks like private key material.`);
  }
  if (/^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/.test(name)) {
    block("Blocked: lockfiles change only through the package manager.");
  }
}

if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(args.command ?? "");

  if (/\bgit\b[^;&|]*\bpush\b[^;&|]*(--force\b|--force-with-lease\b|\s-f\b)/.test(cmd)) {
    block("Blocked: force push. Ask the owner first.");
  }
  if (/\brm\s+-(?=[a-z]*r)(?=[a-z]*f)[a-z]+\b/i.test(cmd) || /Remove-Item\b[^;]*-Recurse\b[^;]*-Force\b/i.test(cmd)) {
    block("Blocked: recursive forced delete. Remove specific paths instead.");
  }
  if (/\b(DROP|TRUNCATE)\s+(TABLE|SCHEMA|DATABASE)\b/i.test(cmd)) {
    block("Blocked: destructive SQL. Run it yourself against a test database if you really mean it.");
  }
  if (/\b(curl|wget|irm|iwr|Invoke-WebRequest|Invoke-RestMethod)\b[^|]*\|\s*(sh|bash|zsh|iex|pwsh|powershell)\b/i.test(cmd)) {
    block("Blocked: piping a download into a shell.");
  }
  if (/\b(cat|type|less|more|head|tail|Get-Content|gc)\b[^|;&]*\.env(?!\.example)(\.[\w.]+)?\b/i.test(cmd)) {
    block("Blocked: reading .env files. Use .env.example for variable names.");
  }
}

process.exit(0);
