/**
 * Farbaek's own security rules (ADR 0024): deterministic checks over a
 * project's files, run on Farbaek's servers with no code executed. They
 * catch common, high-impact mistakes in web projects. Each rule is
 * conservative: it prefers missing a case to crying wolf, and it never
 * echoes a secret's value back.
 */
import type { Finding, Severity } from "./findings";

export interface ProjectFile {
  path: string;
  content: string;
}

interface Rule {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
  /** Which files the rule reads. */
  applies(path: string): boolean;
  /** Matches per line; the line is 1-based. */
  pattern?: RegExp;
  /** Ignore a match when the line also matches this (placeholders, examples). */
  unless?: RegExp;
}

const CODE = /\.(m?[jt]sx?|cjs|py|rb|go|php|java|cs)$/i;
const WEB = /\.(m?[jt]sx?|cjs|html?|vue|svelte)$/i;
const TEST = /(^|\/)(__tests__|tests?|spec|fixtures?|examples?)\/|\.(test|spec)\.[a-z]+$/i;
const PLACEHOLDER = /(your[-_ ]|example|changeme|change[-_]me|xxx+|<[^>]+>|\$\{|process\.env|os\.environ|getenv|placeholder|dummy|test[-_]?(key|secret|password)|\*{3,}|\.\.\.)/i;

const RULES: Rule[] = [
  {
    id: "hardcoded-credential",
    severity: "high",
    title: "A credential is written into the code",
    detail: "Anyone who can read this file, including everyone the code is shared with, can use it. Credentials in code also end up in history and backups.",
    fix: "Move the value to an environment variable, read it on the server only, and rotate the old value.",
    applies: (p) => CODE.test(p) && !TEST.test(p),
    pattern: /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i,
    unless: PLACEHOLDER,
  },
  {
    id: "token-in-source",
    severity: "high",
    title: "A signed token is written into the code",
    detail: "This looks like a JSON Web Token. If it's a real token, whoever reads the file can act with its permissions until it expires.",
    fix: "Remove it from the code and fetch tokens at run time. If it was a real token, revoke it.",
    applies: (p) => !TEST.test(p),
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    id: "public-env-secret",
    severity: "high",
    title: "A secret is exposed to the browser",
    detail: "Variables starting with NEXT_PUBLIC_ or VITE_ are built into the JavaScript every visitor downloads. A secret there is public.",
    fix: "Rename the variable without the public prefix and use it only in server code.",
    applies: (p) => CODE.test(p) || /(^|\/)\.env\.(example|sample|template)$/i.test(p),
    pattern: /\b(NEXT_PUBLIC|VITE|REACT_APP|EXPO_PUBLIC)_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD)[A-Z0-9_]*\b/,
  },
  {
    id: "service-key-in-client",
    severity: "critical",
    title: "A server-only key is used in browser code",
    detail: "A Supabase service role key (or a similar admin key) bypasses Row Level Security. In code that runs in the browser, anyone can read it and do anything to the database.",
    fix: "Use the key only in server code (route handlers, server actions or API routes) and use the publishable key in the browser.",
    applies: (p) => /\.(m?[jt]sx?)$/i.test(p),
    pattern: /service[_-]?role|SUPABASE_SECRET_KEY|sb_secret_/i,
  },
  {
    id: "cors-wildcard",
    severity: "medium",
    title: "Any website can call this API",
    detail: "Allowing every origin lets any site read responses from this endpoint in a visitor's browser. With credentials, that can expose personal data.",
    fix: "List the origins that should call the API instead of *.",
    applies: (p) => CODE.test(p),
    pattern: /Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["']|\borigin\s*:\s*["']\*["']|allow_origins\s*=\s*\[\s*["']\*["']/i,
  },
  {
    id: "raw-html",
    severity: "medium",
    title: "HTML is inserted without escaping",
    detail: "If any part of this HTML comes from users or other outside sources, a script in it runs on your site (cross-site scripting).",
    fix: "Render text instead of HTML, or sanitize the HTML with a maintained library such as DOMPurify first.",
    applies: (p) => WEB.test(p) && !TEST.test(p),
    pattern: /dangerouslySetInnerHTML|\.innerHTML\s*=(?!\s*["'`][^"'`$]*["'`]\s*;?\s*$)|\bv-html\b|\{@html\b/,
  },
  {
    id: "dynamic-code",
    severity: "medium",
    title: "Text is run as code",
    detail: "eval and new Function run whatever string they receive. If that string can be influenced from outside, an attacker can run code.",
    fix: "Replace it with code that doesn't evaluate strings, for example JSON.parse for data.",
    applies: (p) => /\.(m?[jt]sx?|cjs)$/i.test(p) && !TEST.test(p),
    pattern: /(^|[^.\w])eval\s*\(|new\s+Function\s*\(/,
  },
  {
    id: "sql-from-strings",
    severity: "medium",
    title: "A database query is built from strings",
    detail: "Putting values into SQL text with string building lets crafted input change the query (SQL injection).",
    fix: "Pass values as query parameters instead of building the SQL text.",
    applies: (p) => CODE.test(p) && !TEST.test(p),
    pattern: /`[^`]*\b(select|insert|update|delete)\b[^`]*\$\{[^`]*`|["'][^"']*\b(select|insert|update|delete)\b[^"']*["']\s*\+\s*\w|f["'][^"']*\b(select|insert|update|delete)\b[^"']*\{/i,
  },
  {
    id: "weak-hash",
    severity: "low",
    title: "A weak hash is used",
    detail: "MD5 and SHA-1 are broken for security purposes. For passwords they're also far too fast.",
    fix: "Use bcrypt, scrypt or Argon2 for passwords, and SHA-256 or better for other integrity checks.",
    applies: (p) => CODE.test(p) && !TEST.test(p),
    pattern: /createHash\(\s*["'](md5|sha1)["']|hashlib\.(md5|sha1)\(|\bMD5\.Create\(/i,
  },
  {
    id: "debug-on",
    severity: "low",
    title: "Debug mode is on",
    detail: "Debug pages can show source code, settings and stack traces to anyone who triggers an error.",
    fix: "Turn debug off for anything that's deployed, for example from an environment variable.",
    applies: (p) => /(^|\/)settings\.py$/i.test(p),
    pattern: /^\s*DEBUG\s*=\s*True\b/,
  },
];

function lineMatches(rule: Rule, file: ProjectFile): number[] {
  if (!rule.pattern) return [];
  const out: number[] = [];
  const lines = file.content.split("\n");
  for (let i = 0; i < lines.length && out.length < 5; i += 1) {
    const line = lines[i]!;
    if (line.length > 2_000) continue;
    if (rule.pattern.test(line) && !(rule.unless && rule.unless.test(line))) out.push(i + 1);
  }
  return out;
}

/** Server-only code where a server key belongs. */
function isServerCode(file: ProjectFile): boolean {
  if (/^\s*["']use client["']/m.test(file.content)) return false;
  return /(^|\/)(server|api|actions?|lib\/server|supabase\/functions|scripts)\/|route\.[jt]s$|\.server\.[jt]sx?$|^\s*["']use server["']|import\s+["']server-only["']/m.test(`${file.path}\n${file.content}`);
}

/** Tables created in SQL files that no SQL file enables Row Level Security on. */
function tablesWithoutRls(files: readonly ProjectFile[]): Finding[] {
  const sql = files.filter((f) => /\.sql$/i.test(f.path));
  if (sql.length === 0) return [];
  const all = sql.map((f) => f.content).join("\n").toLowerCase();
  const out: Finding[] = [];
  for (const f of sql) {
    const lines = f.content.split("\n");
    lines.forEach((line, i) => {
      const m = /create\s+table\s+(if\s+not\s+exists\s+)?((public)\.)?"?([a-z_][a-z0-9_]*)"?/i.exec(line);
      if (!m || (m[2] === undefined && /create\s+table\s+(if\s+not\s+exists\s+)?[a-z_]+\./i.test(line))) return;
      const table = m[4]!.toLowerCase();
      const enabled = new RegExp(`alter\\s+table\\s+(if\\s+exists\\s+)?(only\\s+)?(public\\.)?"?${table}"?\\s+enable\\s+row\\s+level\\s+security`).test(all);
      if (!enabled) {
        out.push({
          id: "",
          rule: "table-without-rls",
          severity: "high",
          source: "rules",
          title: `The table ${table} has no Row Level Security`,
          detail: "With Supabase, a table without Row Level Security can be read and changed by anyone who has the public key, which every visitor's browser has.",
          fix: `Add "alter table public.${table} enable row level security;" and policies for who may read and write it.`,
          file: f.path,
          line: i + 1,
        });
      }
    });
  }
  return out;
}

/** Projects that serve HTML but set no Content Security Policy anywhere. */
function missingCsp(files: readonly ProjectFile[]): Finding[] {
  const nextConfig = files.find((f) => /(^|\/)next\.config\.(m?[jt]s|cjs)$/.test(f.path));
  const html = files.find((f) => /(^|\/)index\.html?$/i.test(f.path));
  const anyCsp = files.some((f) => /Content-Security-Policy/i.test(f.content));
  if (anyCsp || (!nextConfig && !html)) return [];
  const where = nextConfig ?? html!;
  return [
    {
      id: "",
      rule: "no-csp",
      severity: "low",
      source: "rules",
      title: "No Content Security Policy",
      detail: "A Content Security Policy limits which scripts a page may run, which blunts cross-site scripting if it ever slips in.",
      fix: nextConfig
        ? "Add a Content-Security-Policy header in next.config's headers(), starting strict (default-src 'self') and allowing only what the site needs."
        : 'Add <meta http-equiv="Content-Security-Policy" content="default-src \'self\'"> to the page head and widen it only as needed.',
      file: where.path,
      line: null,
    },
  ];
}

/** Runs every rule over the project's files. Ids are assigned in a stable order. */
export function runRules(files: readonly ProjectFile[]): Finding[] {
  const out: Finding[] = [];
  for (const file of files) {
    for (const rule of RULES) {
      if (!rule.applies(file.path)) continue;
      if (rule.id === "service-key-in-client" && isServerCode(file)) continue;
      for (const line of lineMatches(rule, file)) {
        out.push({ id: "", rule: rule.id, severity: rule.severity, source: "rules", title: rule.title, detail: rule.detail, fix: rule.fix, file: file.path, line });
      }
    }
  }
  out.push(...tablesWithoutRls(files), ...missingCsp(files));
  return out;
}

/** Files most worth a closer, AI-assisted look: where rules fired, and server, auth and data code. */
export function riskiestFiles(files: readonly ProjectFile[], findings: readonly Finding[], limit = 8): ProjectFile[] {
  const flagged = new Set(findings.map((f) => f.file));
  const score = (f: ProjectFile) =>
    (flagged.has(f.path) ? 10 : 0) +
    (/(auth|login|session|password|token|admin|api|server|middleware|proxy|route|action|db|sql|supabase|payment|webhook)/i.test(f.path) ? 5 : 0) +
    (CODE.test(f.path) ? 1 : 0) -
    (TEST.test(f.path) ? 5 : 0);
  return [...files]
    .filter((f) => (CODE.test(f.path) || /\.sql$/i.test(f.path)) && f.content.length <= 60_000)
    .sort((a, b) => score(b) - score(a) || a.path.localeCompare(b.path))
    .slice(0, limit);
}
