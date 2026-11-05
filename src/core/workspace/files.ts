/**
 * Rules for project file paths and for what an import accepts. Shared by
 * the browser (to preview an import) and the server (which decides). The
 * database re-checks paths with the same shape.
 *
 * Paths are relative POSIX paths: no leading slash, no "." or ".." segments,
 * no empty segments, no backslashes or control characters. That keeps a
 * project's files inside its own root when they are written to a workspace.
 */

export const MAX_PATH_LENGTH = 300;
export const MAX_PATH_DEPTH = 24;
const MAX_SEGMENT_LENGTH = 120;

/** Dependency, VCS and build-output folders. Their contents are never imported. */
export const IGNORED_FOLDERS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".turbo",
  ".vercel",
  ".cache",
  ".parcel-cache",
  ".pnpm-store",
  ".yarn",
  "dist",
  "build",
  "out",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
]);

const IGNORED_FILES: ReadonlySet<string> = new Set([".DS_Store", "Thumbs.db"]);

/** Files that hold credentials by convention. Example and template env files are fine. */
function isSecretFileName(name: string): boolean {
  const lower = name.toLowerCase();
  if (/^\.env(\..+)?$/.test(lower)) return !/^\.env\.(example|sample|template)$/.test(lower);
  if (/\.(pem|key|p12|pfx|jks|keystore|ppk)$/.test(lower)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)(?!.*\.pub$)/.test(lower)) return true;
  return [".npmrc", ".pypirc", ".netrc", ".git-credentials", "credentials.json"].includes(lower);
}

/** Recognisable credential formats. A match blocks the file; the value is never echoed. */
/** On Windows and macOS `.GIT` is the real `.git`, so case can't get a folder past this. */
export function isIgnoredFolder(name: string): boolean {
  return IGNORED_FOLDERS.has(name) || IGNORED_FOLDERS.has(name.toLowerCase());
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bwhsec_[A-Za-z0-9+/=_-]{20,}/,
  /\bglpat-[A-Za-z0-9_-]{20,}/,
  /\bnpm_[A-Za-z0-9]{36}\b/,
  /\bfa_[A-Za-z0-9_-]{32,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/,
  /\bsk-(proj-)?[A-Za-z0-9_-]{40,}/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bsb_secret_[A-Za-z0-9_-]{10,}/,
  /\b[rs]k_live_[A-Za-z0-9]{16,}/,
];

export function containsSecret(content: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(content));
}

export type PathCheck = { ok: true; path: string } | { ok: false; reason: string };

/** Validates a relative path. Leading "./" is removed; nothing else is rewritten. */
export function checkPath(raw: string): PathCheck {
  const path = raw.startsWith("./") ? raw.slice(2) : raw;
  if (path.length === 0) return { ok: false, reason: "The path is empty." };
  if (path.length > MAX_PATH_LENGTH) return { ok: false, reason: `The path is longer than ${MAX_PATH_LENGTH} characters.` };
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return { ok: false, reason: "The path has a backslash or a control character." };
  if (path.startsWith("/")) return { ok: false, reason: "The path must be relative to the project root." };
  const segments = path.split("/");
  if (segments.length > MAX_PATH_DEPTH) return { ok: false, reason: `The path is more than ${MAX_PATH_DEPTH} folders deep.` };
  for (const s of segments) {
    if (s === "") return { ok: false, reason: "The path has an empty folder name." };
    if (s === "." || s === "..") return { ok: false, reason: 'The path can\'t contain "." or ".." folders.' };
    if (s.length > MAX_SEGMENT_LENGTH) return { ok: false, reason: `A name in the path is longer than ${MAX_SEGMENT_LENGTH} characters.` };
  }
  return { ok: true, path };
}

/** Drops the selected folder's own name from a browser folder upload path ("my-app/src/a.ts" to "src/a.ts"). */
export function stripRootFolder(relativePath: string): string {
  const i = relativePath.indexOf("/");
  return i === -1 ? relativePath : relativePath.slice(i + 1);
}

export type SkipReason = "invalid_path" | "ignored_folder" | "secret_file" | "secret_content" | "binary" | "too_large";

export const SKIP_LABELS: Record<SkipReason, string> = {
  invalid_path: "Path not allowed",
  ignored_folder: "Dependency or build folder",
  secret_file: "Credentials file",
  secret_content: "Contains what looks like a secret",
  binary: "Not a text file",
  too_large: "Too large",
};

export type ScreenResult = { ok: true; path: string } | { ok: false; reason: SkipReason; detail?: string };

/** Decides whether a path alone can be imported, before its content is read. */
export function screenPath(raw: string): ScreenResult {
  const checked = checkPath(raw);
  if (!checked.ok) return { ok: false, reason: "invalid_path", detail: checked.reason };
  const segments = checked.path.split("/");
  const name = segments.at(-1)!;
  if (segments.slice(0, -1).some(isIgnoredFolder) || IGNORED_FILES.has(name)) return { ok: false, reason: "ignored_folder" };
  if (isSecretFileName(name)) return { ok: false, reason: "secret_file" };
  return { ok: true, path: checked.path };
}

/** Decides whether a file can be imported. `sizeBytes` is the UTF-8 size. */
export function screenFile(raw: string, content: string, sizeBytes: number, maxFileBytes: number): ScreenResult {
  const byPath = screenPath(raw);
  if (!byPath.ok) return byPath;
  if (sizeBytes > maxFileBytes) return { ok: false, reason: "too_large" };
  if (content.includes("\u0000")) return { ok: false, reason: "binary" };
  if (containsSecret(content)) return { ok: false, reason: "secret_content" };
  return byPath;
}

/** "512 KB", "4 MB", "812 bytes". Binary units, as the limits are defined. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript (JSX)",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript (JSX)",
  mjs: "JavaScript",
  cjs: "JavaScript",
  json: "JSON",
  md: "Markdown",
  mdx: "MDX",
  css: "CSS",
  scss: "SCSS",
  html: "HTML",
  sql: "SQL",
  py: "Python",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  java: "Java",
  kt: "Kotlin",
  swift: "Swift",
  php: "PHP",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  sh: "Shell",
  svg: "SVG",
  txt: "Text",
};

/** A display label for a file's language, from its extension. */
export function languageOf(path: string): string {
  const name = path.split("/").at(-1) ?? path;
  if (name === "Dockerfile") return "Dockerfile";
  const ext = name.includes(".") ? name.split(".").at(-1)!.toLowerCase() : "";
  return LANGUAGES[ext] ?? "Text";
}

export interface TreeNode {
  name: string;
  /** Full path for files; the folder path for folders. */
  path: string;
  children?: TreeNode[];
}

/** Builds a sorted tree (folders first, then files, each alphabetical) from flat paths. */
export function buildTree(paths: readonly string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const p of paths) {
    let node = root;
    const parts = p.split("/");
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join("/");
      let child = node.children!.find((c) => c.name === part && Boolean(c.children) === !isFile);
      if (!child) {
        child = isFile ? { name: part, path: childPath } : { name: part, path: childPath, children: [] };
        node.children!.push(child);
      }
      node = child;
    });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => (a.children && !b.children ? -1 : !a.children && b.children ? 1 : a.name.localeCompare(b.name)))
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n));
  return sort(root.children!);
}
