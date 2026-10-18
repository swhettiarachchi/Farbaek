/**
 * Known vulnerabilities in a project's npm packages, from `npm audit --json`
 * run in a sandbox against the lockfile (ADR 0024). Each vulnerable package
 * becomes one finding with the advisory's title and how to fix it.
 */
import type { Finding, Severity } from "./findings";

const SEVERITY: Record<string, Severity> = { critical: "critical", high: "high", moderate: "medium", low: "low", info: "info" };

interface AuditAdvisory {
  title?: string;
  url?: string;
}

interface AuditVulnerability {
  name?: string;
  severity?: string;
  isDirect?: boolean;
  range?: string;
  via?: (string | AuditAdvisory)[];
  fixAvailable?: boolean | { name?: string; version?: string; isSemVerMajor?: boolean };
}

export type AuditParse = { ok: true; findings: Finding[]; total: number } | { ok: false; reason: string };

export function parseNpmAudit(stdout: string, maxFindings = 50): AuditParse {
  let data: { vulnerabilities?: Record<string, AuditVulnerability>; error?: { summary?: string } };
  try {
    data = JSON.parse(stdout);
  } catch {
    return { ok: false, reason: "npm audit didn't return a report." };
  }
  if (data.error) return { ok: false, reason: `npm audit couldn't run: ${String(data.error.summary ?? "unknown error").slice(0, 200)}` };
  const vulns = Object.values(data.vulnerabilities ?? {});
  const findings: Finding[] = vulns
    .filter((v) => typeof v.name === "string" && v.severity && SEVERITY[v.severity])
    // Direct dependencies first: they're the ones a project can update itself.
    .sort((a, b) => Number(Boolean(b.isDirect)) - Number(Boolean(a.isDirect)))
    .slice(0, maxFindings)
    .map((v) => {
      const advisory = (v.via ?? []).find((x): x is AuditAdvisory => typeof x === "object" && x !== null);
      const fix = v.fixAvailable;
      const how =
        fix === true
          ? "Run npm audit fix, then run the tests."
          : typeof fix === "object" && fix
            ? `Update ${fix.name ?? v.name} to ${fix.version ?? "a fixed version"}${fix.isSemVerMajor ? " (a major version: check its changelog)" : ""}, then run the tests.`
            : "No fixed version is published yet. Check whether the affected feature is used, and watch for an update.";
      return {
        id: "",
        rule: "vulnerable-dependency",
        severity: SEVERITY[v.severity!]!,
        source: "dependencies" as const,
        title: `${v.name} has a known ${v.severity === "moderate" ? "moderate" : v.severity} vulnerability`,
        detail: `${advisory?.title ?? "A published advisory affects this package"}${v.range ? ` (affected versions: ${v.range})` : ""}.${advisory?.url ? ` ${advisory.url}` : ""}`.slice(0, 600),
        fix: how,
        file: "package-lock.json",
        line: null,
      };
    });
  return { ok: true, findings, total: vulns.length };
}
