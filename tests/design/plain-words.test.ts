/**
 * The signed-in app speaks plainly (ADR 0170): a plan, a change, proof and
 * rules, whatever someone knows about software. The technical names stay in
 * code, routes and file formats, and this keeps them off the screen. The
 * billing "contract", the legal "policy" and a Capsule (a kind of file, named
 * and explained on its own page) are real words for real things, and are
 * allowed where they mean that.
 *
 * Messages from the server and labels from core logic reach the same screens,
 * so they speak the same way (ADR 0174). What people don't read stays exact:
 * prompts to a model, rule sets whose hash is their version, signed sandbox
 * receipts, the Security page's scenarios, and raw database errors.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TASK_STATE_LABELS } from "@/core/realityloop/progress";

const ROOT = path.resolve(__dirname, "..", "..");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

// The staff console has its own audience, and the 3D scene has no words.
const SKIP = /components[\\/](three|office|admin)[\\/]/;
// What isn't read as a sentence on a screen: prompts, provider clients, the staff's own pages, and hand-off files for developers.
// Also what has to stay exact: legal pages, the ProofPack format's specification, and the Security page's scenarios.
const NOT_FOR_READING =
  /\(site\)[\\/](acceptable-use|privacy|terms|proofpack|security)[\\/]|[\\/](testing|admin)[\\/]|(app|components|server|core)[\\/]office[\\/]|core[\\/](ops|github)[\\/]|billing[\\/]apple|sample\.json|[\\/]server[\\/]ai[\\/]|[\\/]core[\\/]ai[\\/]|[\\/]core[\\/]sandbox[\\/]|security-eval|supabase-(reader|writer|store)|(e2b|vercel)-runtime|netlify-client|security-txt|core[\\/]agent[\\/](skills|studio-standard)|core[\\/]billing[\\/]allowance|core[\\/]workspace[\\/]export|core[\\/]security[\\/]rules|github[\\/]pull-requests/;
const APP = [
  ...files(path.join(ROOT, "src", "app", "app")),
  ...files(path.join(ROOT, "src", "app", "(site)")),
  path.join(ROOT, "src", "content", "films.ts"),
  path.join(ROOT, "src", "content", "showcase.ts"),
  ...files(path.join(ROOT, "desktop", "src", "renderer")),
  ...files(path.join(ROOT, "src", "components")),
  ...files(path.join(ROOT, "src", "core")),
  ...files(path.join(ROOT, "src", "server")),
].filter((f) => !SKIP.test(f) && !NOT_FOR_READING.test(f));

/** Sentences and labels in a line: quoted strings with a space or a capital, and text between tags. */
function words(line: string): string[] {
  const t = line.trim();
  if (/^(import |export \{|export function|function |\/\/|\*|\/\*|\{\/\*)/.test(t)) return [];
  const quoted = [...t.matchAll(/(["'`])((?:(?!\1).)*)\1/g)].map((m) => m[2]!).filter((x) => (/\s/.test(x) || /^[A-Z][a-z]+$/.test(x)) && !/^(bg-|text-|border|flex|grid|rounded|min-|max-|mt-|inline|hover|sha256)/.test(x));
  const between = [...t.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]!);
  // JSX text, as it reads: without its tags, expressions and entities.
  const prose = t.replace(/<\/?[A-Za-z][^<>]*>/g, " ").replace(/\{[^{}]*\}/g, " ").replace(/&[a-z]+;/g, "'").replace(/\s+/g, " ").trim();
  const bare = /^[A-Z][a-z']* [^=;(){}]*[.,:?]?$/.test(prose) ? [prose] : [];
  return [...quoted, ...between, ...bare];
}

const BANNED: { word: RegExp; say: string }[] = [
  { word: /\bintent contract\b/i, say: "the plan" },
  { word: /\bthe contract\b|\bits contract\b|\bcontract's\b|\bcontract&apos;s\b/i, say: "the plan" },
  { word: /\bproposals?\b/i, say: "a change" },
  { word: /\bcontracts\b/i, say: "plans" },
  { word: /\bgoverned evaluations?\b/i, say: "safety checks" },
  { word: /\bmicroVM\b/i, say: "a private, throwaway computer" },
  { word: /\bAI mapping\b|\bclause\b/i, say: "a line of the plan" },
  { word: /\blifecycle\b/i, say: "progress" },
  { word: /\binvariants?\b/i, say: "must stay true" },
  { word: /\bverified evidence\b/i, say: "passed checks" },
  { word: /\bmission control\b/i, say: "Home" },
  { word: /\bgoverned evaluations?\b/i, say: "safety checks" },
  { word: /\btrust graph\b/i, say: "who can do what" },
  { word: /\bautonomy level\b/i, say: "how much the agent can do on its own" },
  // ADR 0174: words that reached people from the server, Pricing and the Desktop app page.
  { word: /\b[Ll]evel [0-4]\b/, say: "what it does: small changes go in on their own" },
  { word: /\bautonomy\b/i, say: "applying on its own" },
  { word: /\b[Ss]hadow mode\b/, say: "practice mode" },
  { word: /\brehears/i, say: "practice" },
  { word: /\bverified sandbox\b/i, say: "a test space" },
  { word: /\bsandboxes\b/i, say: "test spaces" },
  { word: /\bsandbox hours?\b/i, say: "test space hours" },
  { word: /\bLaunchOS\b/, say: "its Launch plan" },
  { word: /\bAgent inbox\b/, say: "What the agent is doing" },
  { word: /\bcodebase\b/i, say: "a site or app" },
  { word: /\bPolicies and checks\b/, say: "Rules and checks" },
  { word: /\bthe policy\b|\bpolicy builder\b|\bbasic policies\b/i, say: "the rules" },
  { word: /\bgoverned\b/i, say: "say what it is, in everyday words" },
  { word: /(?<![.\w`$])leases?\b(?![.\w(])/i, say: "access" },
  { word: /\bevidence\b/i, say: "proof" },
  { word: /\bPerson \$\{/, say: "Teammate" },
  { word: /(?<![.\w$/-])contract(?![\w.(:=/-]*[\w(/=])/i, say: "the plan" },
  { word: /(?<!Vercel )(?<![.\w$/-])[Ss]andbox(?![\w.(:=/-]*[\w(/=])/, say: "the test space" },
  { word: /\bpropos(e|ed|al|als|ing)\b/i, say: "a change, or suggest" },
  { word: /\b(Agents|Sandbox|Integrations|Policies|Incidents|Activity) page\b/, say: "the page's name on screen" },
];

// Search keeps the old names on purpose, so anyone who knows them can still find the page.
const ALSO_KNOWN_AS = /also: \[/;
// Lines that aren't sentences for people: a rule set whose hash is its version, a database query, a raw error, a thrown bug.
const NOT_A_SENTENCE = /node scripts|pnpm sandbox|sandbox allow-scripts|Set by contract|"Contract"|\?\? "contract"|AGENT_POLICY_RULES|checks a verified sandbox can run|contract paths and operations|proposal: Pick|\.select\(|\.from\(|error\.message|Error\.message|^\s*"?id, /;

describe("the app speaks plainly", () => {
  it("says plan, change, proof and rules, not the technical names", () => {
    const hits = APP.flatMap((f) =>
      readFileSync(f, "utf8")
        .split(/\r?\n/)
        .flatMap((line, i) => {
          if (ALSO_KNOWN_AS.test(line) || NOT_A_SENTENCE.test(line)) return [];
          return words(line).flatMap((text) => BANNED.filter((b) => b.word.test(text)).map((b) => `${path.relative(ROOT, f)}:${i + 1} says "${text.slice(0, 70)}": use "${b.say}"`));
        }),
    );
    expect(hits).toEqual([]);
  });

  it("names every task state in everyday words, on the web and on the phone", () => {
    for (const label of Object.values(TASK_STATE_LABELS)) {
      expect(label).not.toMatch(/contract|policy|execut|authoriz|assembled|recover/i);
    }
  });
});
