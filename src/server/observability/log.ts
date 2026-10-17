/**
 * Structured logs: one JSON object per line, with an event name and a
 * correlation id (a session or execution id) so a run can be followed across
 * requests. Values that look like credentials are masked before they're
 * written, and messages are capped, so a log line can't carry a secret or a
 * whole stack of user output.
 */

type Level = "info" | "warn" | "error";

const SECRET_PATTERNS: RegExp[] = [
  /e2b_[A-Za-z0-9]{8,}/g,
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sb_secret_[A-Za-z0-9_-]{8,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /(api[_-]?key|token|secret|password)(["'\s:=]+)[^\s"',}]{6,}/gi,
];

export function redact(text: string): string {
  let out = text;
  for (const p of SECRET_PATTERNS) out = out.replace(p, (m, k?: string, sep?: string) => (k && sep ? `${k}${sep}[redacted]` : "[redacted]"));
  return out;
}

function clean(value: unknown): unknown {
  if (typeof value === "string") return redact(value).slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  if (value instanceof Error) return redact(`${value.name}: ${value.message}`).slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map(clean);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30)) out[k] = clean(v);
    return out;
  }
  return String(value);
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...(clean(fields) as Record<string, unknown>) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
