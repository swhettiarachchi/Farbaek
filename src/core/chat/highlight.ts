/**
 * A light syntax tint for code in answers (stage 199, ADR 0213): keywords, strings, comments, numbers, types and calls, for the
 * languages answers use most. It reads one line at a time with a few patterns, so it never loads a parser and works while the
 * code is still streaming. Colours come from the same roles as the file editor (keyword and type in the accent, strings and
 * numbers in the syntax tint, comments quiet).
 */

export type TokenKind = "plain" | "keyword" | "string" | "comment" | "number" | "type" | "call" | "property" | "punct";
export interface Token {
  k: TokenKind;
  v: string;
}

interface Grammar {
  keywords: Set<string>;
  types?: Set<string>;
  lineComment?: string[];
  blockComment?: [string, string];
  /** Quote characters that start strings. */
  quotes: string[];
  /** Triple-quoted strings (Python). */
  triple?: boolean;
  /** Names starting with a capital are types (most C-family languages). */
  capitalTypes?: boolean;
}

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

const JS: Grammar = {
  keywords: words(
    "break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set as satisfies interface type enum implements namespace declare readonly private protected public abstract keyof infer is true false null undefined",
  ),
  types: words("string number boolean any unknown never object symbol bigint void Promise Array Record Partial Readonly Map Set"),
  lineComment: ["//"],
  blockComment: ["/*", "*/"],
  quotes: ['"', "'", "`"],
  capitalTypes: true,
};

const PY: Grammar = {
  keywords: words("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case True False None self"),
  types: words("int float str bool list dict set tuple bytes object type"),
  lineComment: ["#"],
  quotes: ['"', "'"],
  triple: true,
  capitalTypes: true,
};

const SH: Grammar = {
  keywords: words("if then else elif fi for in do done while until case esac function return export local readonly declare echo cd exit set unset source sudo"),
  lineComment: ["#"],
  quotes: ['"', "'"],
};

const SQL: Grammar = {
  keywords: words(
    "select from where and or not insert into values update set delete create table index view drop alter add column primary key foreign references join left right inner outer full on as group by order having limit offset union all distinct case when then else end null is in exists like between returning with recursive function returns language begin commit rollback grant revoke default constraint unique check cascade",
  ),
  types: words("int integer bigint smallint text varchar char boolean bool uuid timestamp timestamptz date numeric decimal real jsonb json serial"),
  lineComment: ["--"],
  blockComment: ["/*", "*/"],
  quotes: ["'", '"'],
};

const C_LIKE: Grammar = {
  keywords: words(
    "auto break case catch char class const continue default delete do double else enum extern float for friend goto if inline int long namespace new operator private protected public register return short signed sizeof static struct switch template this throw try typedef typename union unsigned using virtual void volatile while true false null nullptr final override package import interface extends implements abstract boolean byte instanceof native super synchronized transient var val fun when is object companion data sealed lateinit internal open in out let func guard defer go chan select fallthrough map range type struct impl trait fn mut pub use mod crate where match loop move ref dyn async await Self self None Some Ok Err",
  ),
  types: words("String Vec Option Result i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 usize isize bool str int64 int32 float64 error rune"),
  lineComment: ["//"],
  blockComment: ["/*", "*/"],
  quotes: ['"', "'", "`"],
  capitalTypes: true,
};

const CSS: Grammar = {
  keywords: words("important media supports keyframes import from to and not only screen print"),
  blockComment: ["/*", "*/"],
  quotes: ['"', "'"],
};

const JSON_G: Grammar = { keywords: words("true false null"), quotes: ['"'] };
const RUBY: Grammar = { ...PY, keywords: words("def end class module if elsif else unless while until for in do return yield begin rescue ensure raise require true false nil self and or not then when case puts attr_accessor"), triple: false };

const LANGS: Record<string, Grammar> = {
  js: JS, jsx: JS, javascript: JS, ts: JS, tsx: JS, typescript: JS, mjs: JS, cjs: JS,
  py: PY, python: PY,
  sh: SH, bash: SH, shell: SH, zsh: SH, console: SH, powershell: SH, ps1: SH,
  sql: SQL, postgres: SQL, postgresql: SQL, plpgsql: SQL,
  c: C_LIKE, h: C_LIKE, cpp: C_LIKE, "c++": C_LIKE, cs: C_LIKE, csharp: C_LIKE, java: C_LIKE, kotlin: C_LIKE, kt: C_LIKE, swift: C_LIKE, go: C_LIKE, golang: C_LIKE, rust: C_LIKE, rs: C_LIKE, dart: C_LIKE, scala: C_LIKE, php: C_LIKE,
  css: CSS, scss: CSS, less: CSS,
  json: JSON_G, jsonc: JS,
  rb: RUBY, ruby: RUBY,
};

/** The name shown above a code block. */
const LABELS: Record<string, string> = {
  js: "JavaScript", jsx: "JSX", javascript: "JavaScript", ts: "TypeScript", tsx: "TSX", typescript: "TypeScript", py: "Python", python: "Python", sh: "Shell", bash: "Bash", shell: "Shell", zsh: "Shell",
  console: "Terminal", powershell: "PowerShell", ps1: "PowerShell", sql: "SQL", postgres: "SQL", postgresql: "SQL", c: "C", cpp: "C++", "c++": "C++", cs: "C#", csharp: "C#", java: "Java", kotlin: "Kotlin", kt: "Kotlin",
  swift: "Swift", go: "Go", golang: "Go", rust: "Rust", rs: "Rust", dart: "Dart", php: "PHP", css: "CSS", scss: "SCSS", html: "HTML", xml: "XML", json: "JSON", yaml: "YAML", yml: "YAML", md: "Markdown", markdown: "Markdown",
  rb: "Ruby", ruby: "Ruby", diff: "Diff", text: "Text", txt: "Text", toml: "TOML", dockerfile: "Dockerfile", graphql: "GraphQL",
};

export function languageLabel(lang: string): string {
  const key = lang.toLowerCase();
  return LABELS[key] ?? (key ? key.slice(0, 1).toUpperCase() + key.slice(1) : "Code");
}

/** A file extension for saving a code block. */
export function extensionFor(lang: string): string {
  const map: Record<string, string> = { javascript: "js", typescript: "ts", python: "py", shell: "sh", bash: "sh", zsh: "sh", golang: "go", rust: "rs", ruby: "rb", csharp: "cs", kotlin: "kt", markdown: "md", yaml: "yml", powershell: "ps1", postgres: "sql", postgresql: "sql", text: "txt" };
  const key = lang.toLowerCase();
  return map[key] ?? (/^[a-z0-9+#]{1,8}$/.test(key) ? key.replace("+", "p").replace("#", "s") : "txt");
}

function push(out: Token[], k: TokenKind, v: string) {
  if (!v) return;
  const last = out[out.length - 1];
  if (last && last.k === k) last.v += v;
  else out.push({ k, v });
}

/** HTML and XML: tags, attribute names and values, comments. */
function markup(code: string): Token[] {
  const out: Token[] = [];
  const re = /(<!--[\s\S]*?(?:-->|$))|(<\/?)([A-Za-z][\w:-]*)|([A-Za-z_:][\w:.-]*)(?==)|("[^"]*"?|'[^']*'?)|(\/?>)/g;
  let last = 0;
  let inTag = false;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    if (m.index > last) push(out, "plain", code.slice(last, m.index));
    if (m[1]) push(out, "comment", m[1]);
    else if (m[3]) {
      push(out, "punct", m[2]!);
      push(out, "type", m[3]);
      inTag = true;
    } else if (m[4] && inTag) push(out, "property", m[4]);
    else if (m[5] && inTag) push(out, "string", m[5]);
    else if (m[6]) {
      push(out, "punct", m[6]);
      inTag = false;
    } else push(out, "plain", m[0]);
    last = re.lastIndex;
  }
  push(out, "plain", code.slice(last));
  return out;
}

function diff(code: string): Token[] {
  const out: Token[] = [];
  for (const line of code.split(/(?<=\n)/)) {
    push(out, line.startsWith("+") && !line.startsWith("+++") ? "string" : line.startsWith("-") && !line.startsWith("---") ? "keyword" : line.startsWith("@@") ? "comment" : "plain", line);
  }
  return out;
}

function yaml(code: string): Token[] {
  const out: Token[] = [];
  for (const line of code.split(/(?<=\n)/)) {
    const comment = /^(\s*)(#.*)$/.exec(line.replace(/\n$/, ""));
    if (comment) {
      push(out, "plain", comment[1]!);
      push(out, "comment", comment[2]! + (line.endsWith("\n") ? "\n" : ""));
      continue;
    }
    const kv = /^(\s*-?\s*)([\w.-]+)(:)(.*)$/s.exec(line);
    if (kv) {
      push(out, "plain", kv[1]!);
      push(out, "property", kv[2]!);
      push(out, "punct", kv[3]!);
      const value = kv[4]!;
      push(out, /^\s*(?:\d[\d.]*|true|false|null)\s*$/.test(value) ? "number" : /^\s*["']/.test(value) ? "string" : "plain", value);
    } else push(out, "plain", line);
  }
  return out;
}

/** The code as tinted pieces. Unknown languages come back as one plain piece. */
export function highlight(code: string, lang: string): Token[] {
  const key = lang.toLowerCase();
  if (code.length > 200_000) return [{ k: "plain", v: code }];
  if (key === "html" || key === "xml" || key === "svg" || key === "vue") return markup(code);
  if (key === "diff" || key === "patch") return diff(code);
  if (key === "yaml" || key === "yml" || key === "toml") return yaml(code);
  const g = LANGS[key];
  if (!g) return [{ k: "plain", v: code }];

  const out: Token[] = [];
  let i = 0;
  let prevWord = "";
  while (i < code.length) {
    const rest = code.slice(i);
    const ch = code[i]!;

    const line = g.lineComment?.find((c) => rest.startsWith(c));
    if (line) {
      const end = code.indexOf("\n", i);
      const stop = end < 0 ? code.length : end;
      push(out, "comment", code.slice(i, stop));
      i = stop;
      continue;
    }
    if (g.blockComment && rest.startsWith(g.blockComment[0])) {
      const end = code.indexOf(g.blockComment[1], i + g.blockComment[0].length);
      const stop = end < 0 ? code.length : end + g.blockComment[1].length;
      push(out, "comment", code.slice(i, stop));
      i = stop;
      continue;
    }
    if (g.triple && (rest.startsWith('"""') || rest.startsWith("'''"))) {
      const q = rest.slice(0, 3);
      const end = code.indexOf(q, i + 3);
      const stop = end < 0 ? code.length : end + 3;
      push(out, "string", code.slice(i, stop));
      i = stop;
      continue;
    }
    if (g.quotes.includes(ch)) {
      let j = i + 1;
      while (j < code.length && code[j] !== ch) {
        if (code[j] === "\\") j++;
        else if (code[j] === "\n" && ch !== "`") break;
        j++;
      }
      const stop = Math.min(code.length, j + 1);
      push(out, "string", code.slice(i, stop));
      i = stop;
      continue;
    }
    const num = /^(?:0x[0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)\b/.exec(rest);
    if (num && !/[\w$]/.test(code[i - 1] ?? "")) {
      push(out, "number", num[0]);
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (word) {
      const w = word[0];
      const after = code.slice(i + w.length).match(/^\s*\(/);
      const kind: TokenKind = g.keywords.has(w)
        ? "keyword"
        : g.types?.has(w) || (g.capitalTypes && /^[A-Z][a-z0-9]/.test(w) && w.length > 1)
          ? "type"
          : after && prevWord !== "function"
            ? "call"
            : code[i - 1] === "." && g !== SQL
              ? "property"
              : "plain";
      push(out, kind, w);
      prevWord = w;
      i += w.length;
      continue;
    }
    if (g === CSS && ch === "@") {
      const at = /^@[\w-]+/.exec(rest);
      if (at) {
        push(out, "keyword", at[0]);
        i += at[0].length;
        continue;
      }
    }
    push(out, /[{}()[\];,.:=<>+\-*/%!&|^~?]/.test(ch) ? "punct" : "plain", ch);
    i++;
  }
  return out;
}
