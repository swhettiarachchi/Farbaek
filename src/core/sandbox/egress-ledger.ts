/**
 * The Sandbox Egress Ledger (ADR 0127): what a command asked to reach on the
 * network, allowed or blocked.
 *
 * The provider's firewall, outside the sandbox, stays the boundary
 * (network.ts). The provider reports only byte totals, so Farbaek starts a
 * small proxy inside the sandbox that records each address a command asks
 * for and refuses anything the session's rules don't allow. It never grants
 * more than the firewall does. It's an observer: code that runs in the
 * sandbox could avoid it or change its record, and connections that don't
 * use the proxy settings aren't listed. Everything here says so.
 */
import { z } from "zod";

export const EGRESS_PORT = 3998;
export const EGRESS_DIR = "/tmp/farbaek";
export const EGRESS_SCRIPT_PATH = `${EGRESS_DIR}/egress.mjs`;
export const EGRESS_LOG_PATH = `${EGRESS_DIR}/egress.log`;
/** How much of the record Farbaek reads back after a command. */
export const EGRESS_READ_BYTES = 256 * 1024;
const MAX_LINES = 5000;
const MAX_HOSTS = 50;

export const EGRESS_LIMIT_TEXT =
  "Network: addresses were recorded by Farbaek's proxy inside the sandbox. Connections that didn't use it aren't listed, and code in the sandbox could change the record; the provider's firewall outside the sandbox blocked every address not on the allowlist.";

/**
 * The proxy, run with Node inside the sandbox. It listens on 127.0.0.1 only,
 * handles CONNECT (https) and plain http, allows a host only when it's on
 * the session's list and on an allowed port, and appends one JSON line per
 * attempt to the log, up to 1 MB.
 */
export const EGRESS_SCRIPT = `import http from "node:http";
import net from "node:net";
import { appendFileSync, statSync } from "node:fs";
const PORT = Number(process.env.FARBAEK_EGRESS_PORT || ${EGRESS_PORT});
const LOG = process.env.FARBAEK_EGRESS_LOG || ${JSON.stringify(EGRESS_LOG_PATH)};
const PORTS = new Set(String(process.env.FARBAEK_EGRESS_PORTS || "80,443").split(",").map(Number));
let list = [];
try { list = JSON.parse(process.env.FARBAEK_EGRESS_ALLOW || "[]"); } catch {}
const ALLOW = new Set((Array.isArray(list) ? list : []).filter((h) => typeof h === "string").map((h) => h.toLowerCase()));
const clean = (h) => String(h || "").toLowerCase().replace(/^\\[|\\]$/g, "").replace(/\\.$/, "").slice(0, 300);
function record(host, port, decision) {
  try { if (statSync(LOG).size > 1048576) return; } catch {}
  try { appendFileSync(LOG, JSON.stringify({ t: Date.now(), host, port, decision }) + "\\n"); } catch {}
}
const ok = (host, port) => ALLOW.has(host) && PORTS.has(port);
const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url); } catch { res.writeHead(400).end(); return; }
  const host = clean(url.hostname);
  const port = Number(url.port || 80);
  if (url.protocol !== "http:" || !ok(host, port)) {
    record(host, port, "blocked");
    res.writeHead(403, { "content-type": "text/plain" }).end("Blocked by this sandbox's network rules.\\n");
    return;
  }
  record(host, port, "allowed");
  const headers = { ...req.headers };
  delete headers["proxy-connection"];
  delete headers["proxy-authorization"];
  const up = http.request({ host, port, method: req.method, path: url.pathname + url.search, headers }, (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
  up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(up);
});
server.on("connect", (req, socket, head) => {
  socket.on("error", () => {});
  const m = /^\\[?([^\\[\\]]+?)\\]?:(\\d{1,5})$/.exec(String(req.url || ""));
  const host = clean(m ? m[1] : req.url);
  const port = m ? Number(m[2]) : 0;
  if (!m || !ok(host, port)) {
    record(host, port, "blocked");
    socket.end("HTTP/1.1 403 Forbidden\\r\\nContent-Length: 0\\r\\n\\r\\n");
    return;
  }
  record(host, port, "allowed");
  const up = net.connect(port, host, () => {
    socket.write("HTTP/1.1 200 Connection Established\\r\\n\\r\\n");
    if (head && head.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on("error", () => socket.destroy());
  socket.on("close", () => up.destroy());
});
server.on("clientError", (_e, socket) => socket.destroy());
server.listen(PORT, "127.0.0.1", () => { if (process.env.FARBAEK_EGRESS_ANNOUNCE) process.stdout.write(server.address().port + "\\n"); });
`;

const HEREDOC = "FARBAEK_EGRESS_SCRIPT_END";
const PROXY = `http://127.0.0.1:${EGRESS_PORT}`;
const listening = `(exec 3<>/dev/tcp/127.0.0.1/${EGRESS_PORT}) 2>/dev/null`;

/** Single-quotes text for bash. */
const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * The lines run before a command: start the proxy if it isn't running,
 * start this command's record afresh, and point the usual proxy settings at
 * it, but only once it answers. If it can't start, the command runs exactly
 * as it would without it.
 */
export function commandPrelude(allowHosts: readonly string[]): string {
  if (EGRESS_SCRIPT.includes(HEREDOC)) throw new Error("The proxy script can't contain its own end marker.");
  const allow = JSON.stringify(allowHosts.map((h) => h.toLowerCase()));
  return [
    "__farbaek_egress() {",
    `  mkdir -p ${EGRESS_DIR} 2>/dev/null || return 0`,
    `  if ! ${listening}; then`,
    `    cat > ${EGRESS_SCRIPT_PATH} <<'${HEREDOC}'`,
    EGRESS_SCRIPT.trimEnd(),
    HEREDOC,
    "    if command -v setsid >/dev/null 2>&1; then __fbk_detach=setsid; else __fbk_detach=; fi",
    `    FARBAEK_EGRESS_ALLOW=${quote(allow)} $__fbk_detach nohup node ${EGRESS_SCRIPT_PATH} >/dev/null 2>&1 </dev/null &`,
    `    for __fbk_i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do ${listening} && break; sleep 0.1; done`,
    "  fi",
    `  if ${listening}; then`,
    `    : > ${EGRESS_LOG_PATH}`,
    `    export HTTP_PROXY=${PROXY} HTTPS_PROXY=${PROXY} http_proxy=${PROXY} https_proxy=${PROXY}`,
    "    export NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1 NODE_USE_ENV_PROXY=1",
    "  fi",
    "}",
    "__farbaek_egress",
    "unset -f __farbaek_egress",
  ].join("\n");
}

/** The command that reads this command's record back. */
export const READ_EGRESS_COMMAND = `tail -c ${EGRESS_READ_BYTES} ${EGRESS_LOG_PATH} 2>/dev/null; true`;

export type EgressDecision = "allowed" | "blocked";
export interface EgressAttempt {
  host: string;
  port: number;
  decision: EgressDecision;
}

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOSTNAME = new RegExp(`^(?=.{1,253}$)(?:${LABEL}\\.)*${LABEL}$`);
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV6 = /^[0-9a-f:.]{2,45}$/;

/** A host as recorded, or null when it isn't a plain host name or address. */
export function readableHost(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const h = raw.trim().toLowerCase().replace(/\.$/, "");
  if (HOSTNAME.test(h) || IPV4.test(h) || (h.includes(":") && IPV6.test(h))) return h;
  return null;
}

/**
 * Reads the proxy's record. It comes from inside the sandbox, so every line
 * is checked: anything that isn't a plain host, a port and a decision is
 * counted as unreadable, never shown as written.
 */
export function parseEgressLog(text: string): { attempts: EgressAttempt[]; unreadable: number; truncated: boolean } {
  const lines = text.split("\n").filter((l) => l.trim());
  // Reading the tail can cut the first line in half.
  if (text.length >= EGRESS_READ_BYTES && lines.length) lines.shift();
  const truncated = lines.length > MAX_LINES || text.length >= EGRESS_READ_BYTES;
  const attempts: EgressAttempt[] = [];
  let unreadable = 0;
  for (const line of lines.slice(-MAX_LINES)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      unreadable += 1;
      continue;
    }
    const p = parsed as { host?: unknown; port?: unknown; decision?: unknown } | null;
    const host = readableHost(p?.host);
    const port = typeof p?.port === "number" && Number.isInteger(p.port) && p.port >= 0 && p.port <= 65535 ? p.port : null;
    const decision = p?.decision === "allowed" || p?.decision === "blocked" ? p.decision : null;
    if (!host || port === null || !decision) {
      unreadable += 1;
      continue;
    }
    attempts.push({ host, port, decision });
  }
  return { attempts, unreadable, truncated };
}

export const EgressHostSchema = z.object({ host: z.string().max(253), port: z.number().int().min(0).max(65535), attempts: z.number().int().min(1) });
export const EgressSummarySchema = z.object({
  allowed: z.array(EgressHostSchema).max(MAX_HOSTS),
  blocked: z.array(EgressHostSchema).max(MAX_HOSTS),
  unreadable: z.number().int().min(0),
  truncated: z.boolean(),
});
export type EgressHost = z.infer<typeof EgressHostSchema>;
export type EgressSummary = z.infer<typeof EgressSummarySchema>;

function group(attempts: { host: string; port: number; attempts: number }[]): { hosts: EgressHost[]; cut: boolean } {
  const byKey = new Map<string, EgressHost>();
  for (const a of attempts) {
    const key = `${a.host}:${a.port}`;
    const seen = byKey.get(key);
    if (seen) seen.attempts += a.attempts;
    else byKey.set(key, { host: a.host, port: a.port, attempts: a.attempts });
  }
  const hosts = [...byKey.values()].sort((a, b) => b.attempts - a.attempts || a.host.localeCompare(b.host) || a.port - b.port);
  return { hosts: hosts.slice(0, MAX_HOSTS), cut: hosts.length > MAX_HOSTS };
}

/** One command's record, grouped by address and decision. */
export function summarizeEgress(log: { attempts: EgressAttempt[]; unreadable: number; truncated: boolean }): EgressSummary {
  const allowed = group(log.attempts.filter((a) => a.decision === "allowed").map((a) => ({ ...a, attempts: 1 })));
  const blocked = group(log.attempts.filter((a) => a.decision === "blocked").map((a) => ({ ...a, attempts: 1 })));
  return { allowed: allowed.hosts, blocked: blocked.hosts, unreadable: log.unreadable, truncated: log.truncated || allowed.cut || blocked.cut };
}

/** Several commands' records together, as for a check run. */
export function mergeEgress(summaries: readonly (EgressSummary | null)[]): EgressSummary | null {
  const present = summaries.filter((s): s is EgressSummary => s !== null);
  if (present.length === 0) return null;
  const allowed = group(present.flatMap((s) => s.allowed));
  const blocked = group(present.flatMap((s) => s.blocked));
  return {
    allowed: allowed.hosts,
    blocked: blocked.hosts,
    unreadable: present.reduce((n, s) => n + s.unreadable, 0),
    truncated: present.some((s) => s.truncated) || allowed.cut || blocked.cut,
  };
}

/** A short line for people: what was reached and what was blocked. */
export function egressWords(s: EgressSummary | null): string {
  if (!s) return "Not recorded.";
  if (s.allowed.length === 0 && s.blocked.length === 0) return s.unreadable ? `Nothing readable was recorded (${s.unreadable} unreadable).` : "Nothing asked for the network.";
  const name = (h: EgressHost) => (h.port === 443 || h.port === 80 ? h.host : `${h.host}:${h.port}`);
  const parts: string[] = [];
  if (s.allowed.length) parts.push(`Reached ${s.allowed.map(name).join(", ")}.`);
  if (s.blocked.length) parts.push(`Blocked ${s.blocked.map(name).join(", ")}.`);
  if (s.truncated) parts.push("More wasn't recorded.");
  return parts.join(" ");
}
