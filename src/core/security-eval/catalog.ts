/**
 * The security evaluation suite (spec §9, ADR 0048): Farbaek's own
 * adversarial scenarios, each a deterministic test of one of its boundaries,
 * mapped to the OWASP Top 10 for Agentic Applications 2026 and the OWASP Top
 * 10 for LLM Applications 2025. Coverage is reported per risk as "tested",
 * "not tested" or "not applicable", always with what isn't tested. Nothing
 * here claims complete coverage or a certification.
 */

export type RiskList = "agentic-2026" | "llm-2025";

export interface OwaspRisk {
  id: string;
  title: string;
  list: RiskList;
}

export const RISK_LISTS: Record<RiskList, { title: string; short: string; url: string; published: string }> = {
  "agentic-2026": {
    title: "OWASP Top 10 for Agentic Applications 2026",
    short: "Agentic applications, 2026",
    url: "https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/",
    published: "2025-12-09",
  },
  "llm-2025": {
    title: "OWASP Top 10 for LLM Applications 2025",
    short: "LLM applications, 2025",
    url: "https://genai.owasp.org/llm-top-10/",
    published: "2025",
  },
};

export const OWASP_RISKS: readonly OwaspRisk[] = [
  { id: "ASI01", title: "Agent Goal Hijack", list: "agentic-2026" },
  { id: "ASI02", title: "Tool Misuse & Exploitation", list: "agentic-2026" },
  { id: "ASI03", title: "Identity & Privilege Abuse", list: "agentic-2026" },
  { id: "ASI04", title: "Agentic Supply Chain Vulnerabilities", list: "agentic-2026" },
  { id: "ASI05", title: "Unexpected Code Execution", list: "agentic-2026" },
  { id: "ASI06", title: "Memory & Context Poisoning", list: "agentic-2026" },
  { id: "ASI07", title: "Insecure Inter-Agent Communication", list: "agentic-2026" },
  { id: "ASI08", title: "Cascading Failures", list: "agentic-2026" },
  { id: "ASI09", title: "Human-Agent Trust Exploitation", list: "agentic-2026" },
  { id: "ASI10", title: "Rogue Agents", list: "agentic-2026" },
  { id: "LLM01", title: "Prompt Injection", list: "llm-2025" },
  { id: "LLM02", title: "Sensitive Information Disclosure", list: "llm-2025" },
  { id: "LLM03", title: "Supply Chain", list: "llm-2025" },
  { id: "LLM04", title: "Data and Model Poisoning", list: "llm-2025" },
  { id: "LLM05", title: "Improper Output Handling", list: "llm-2025" },
  { id: "LLM06", title: "Excessive Agency", list: "llm-2025" },
  { id: "LLM07", title: "System Prompt Leakage", list: "llm-2025" },
  { id: "LLM08", title: "Vector and Embedding Weaknesses", list: "llm-2025" },
  { id: "LLM09", title: "Misinformation", list: "llm-2025" },
  { id: "LLM10", title: "Unbounded Consumption", list: "llm-2025" },
];

export interface EvalScenario {
  /** SE-NNN; each is exactly one describe block in tests/security-eval. */
  id: string;
  title: string;
  risks: readonly string[];
  /** What the scenario asserts, in one plain sentence. */
  asserts: string;
  file: string;
}

export const EVAL_SCENARIOS: readonly EvalScenario[] = [
  {
    id: "SE-001",
    title: "A README tells the agent to leave its contract",
    risks: ["ASI01", "LLM01", "LLM06"],
    asserts: "An agent that obeys planted instructions is refused a write outside the contract's paths and a command in Review Only, and no file outside scope changes.",
    file: "goal-hijack.test.ts",
  },
  {
    id: "SE-002",
    title: "Command output carries instructions",
    risks: ["ASI01", "ASI02", "LLM01"],
    asserts: "Output comes back labelled as project data, and a destructive command it suggests waits for a person; declined, it never runs.",
    file: "goal-hijack.test.ts",
  },
  {
    id: "SE-003",
    title: "Text claims the contract allows more",
    risks: ["ASI01", "LLM06"],
    asserts: "Paths and operations come only from the approved contract, whatever the content of a file or a write says.",
    file: "goal-hijack.test.ts",
  },
  {
    id: "SE-004",
    title: "Paths that escape the project",
    risks: ["ASI02", "LLM06"],
    asserts: "Traversal, absolute paths, device names and junctions leading outside are refused before the disk is touched.",
    file: "tool-misuse.test.ts",
  },
  {
    id: "SE-005",
    title: "Risky commands without a person",
    risks: ["ASI02", "ASI05", "LLM06"],
    asserts: "Destructive, network and install commands always need a person, Review Only runs nothing, and only checks run on their own in a verified sandbox.",
    file: "tool-misuse.test.ts",
  },
  {
    id: "SE-006",
    title: "Shell syntax and install scripts",
    risks: ["ASI02", "ASI05"],
    asserts: "The broker accepts a program's name only and refuses characters cmd.exe would interpret; package installs skip install scripts.",
    file: "tool-misuse.test.ts",
  },
  {
    id: "SE-007",
    title: "Code running outside verified isolation",
    risks: ["ASI05", "ASI03"],
    asserts: "The sandbox guard runs nothing without verified isolation, and viewers or other members can't drive someone's session.",
    file: "tool-misuse.test.ts",
  },
  {
    id: "SE-008",
    title: "An approval reused for something else",
    risks: ["ASI03", "ASI09"],
    asserts: "An approval covers one exact payload and versions: another payload, a changed version or an expired approval is refused, and the agent loop refuses a mismatched answer.",
    file: "privilege.test.ts",
  },
  {
    id: "SE-009",
    title: "Sensitive files slipping through autonomy",
    risks: ["ASI03", "ASI08"],
    asserts: "Migrations, CI, dependencies, infrastructure and security code escalate to an owner or admin, and autonomy never lowers a block or an escalation.",
    file: "privilege.test.ts",
  },
  {
    id: "SE-010",
    title: "A project skill changed after approval",
    risks: ["ASI04", "ASI06", "LLM03", "LLM04"],
    asserts: "A project skill that is new, or changed since a person approved it, is held back from the agent.",
    file: "supply-chain.test.ts",
  },
  {
    id: "SE-011",
    title: "A dependency change applying on its own",
    risks: ["ASI04", "LLM03"],
    asserts: "Manifest and lockfile changes are flagged as sensitive in every package ecosystem Farbaek knows, so they always wait for an owner or admin.",
    file: "supply-chain.test.ts",
  },
  {
    id: "SE-012",
    title: "A claim of success without proof",
    risks: ["ASI09", "LLM09"],
    asserts: "Verified comes only from real exit codes: a check that didn't run, or a summary saying tests passed, never verifies.",
    file: "trust.test.ts",
  },
  {
    id: "SE-013",
    title: "Evidence changed after the fact",
    risks: ["ASI09"],
    asserts: "A ProofPack or check receipt with one value changed no longer matches its digest.",
    file: "trust.test.ts",
  },
  {
    id: "SE-014",
    title: "Secrets written into the project",
    risks: ["LLM02"],
    asserts: "Private keys and tokens are refused on import and in the agent's writes and edits.",
    file: "disclosure.test.ts",
  },
  {
    id: "SE-015",
    title: "Secrets inherited by commands",
    risks: ["LLM02", "ASI05"],
    asserts: "Commands get an allowlist of environment names only, so API keys and other secrets never reach them.",
    file: "disclosure.test.ts",
  },
  {
    id: "SE-016",
    title: "Secrets in what the model reads",
    risks: ["LLM07", "LLM02"],
    asserts: "The agent's system prompt and opening message carry no environment values, checked with planted ones.",
    file: "disclosure.test.ts",
  },
  {
    id: "SE-017",
    title: "Model output trusted as fact",
    risks: ["LLM05"],
    asserts: "AI suggestions keep only hunks that were sent and clauses that exist, and AI contract drafts must match the schema to be used.",
    file: "disclosure.test.ts",
  },
  {
    id: "SE-018",
    title: "A run spending past its cap",
    risks: ["LLM10", "ASI08"],
    asserts: "The gateway refuses a step whose worst case passes the run's cap, before reserving, charging or calling the model.",
    file: "consumption.test.ts",
  },
  {
    id: "SE-019",
    title: "An agent that never stops",
    risks: ["LLM10", "ASI10"],
    asserts: "The agent loop stops at its step limit and when cancelled, and runs nothing after.",
    file: "consumption.test.ts",
  },
  {
    id: "SE-020",
    title: "Reaching into another workspace",
    risks: ["ASI03"],
    asserts: "A member of one workspace can't read another's tasks, proposals or verifications, and server functions refuse to act there.",
    file: "database.test.ts",
  },
  {
    id: "SE-021",
    title: "A desktop agent's credentials reused",
    risks: ["ASI07", "ASI10", "ASI03"],
    asserts: "A pairing code works once, and a revoked agent's token stops working at once.",
    file: "database.test.ts",
  },
  {
    id: "SE-022",
    title: "Stopping AI everywhere at once",
    risks: ["ASI10", "ASI08"],
    asserts: "While Farbaek's AI switch is paused, every workspace's usage reservation is refused.",
    file: "database.test.ts",
  },
  {
    id: "SE-023",
    title: "A failure after autonomy applies a change",
    risks: ["ASI08", "ASI10"],
    asserts: "A failed or partly failed check after an automatic apply pauses autonomy for the whole workspace, and one verification runs per task at a time.",
    file: "database.test.ts",
  },
  {
    id: "SE-024",
    title: "Deploying without evidence",
    risks: ["ASI09", "LLM06"],
    asserts: "A site goes live only when a check run verified the latest applied change, or when an owner or admin gives a reason that's kept with the version and in the audit log.",
    file: "database.test.ts",
  },
  {
    id: "SE-025",
    title: "A workspace rule bypassed",
    risks: ["LLM06", "ASI03"],
    asserts: "A change to files a workspace rule protects is refused unless its outcome is as strict as the rule asks, whichever path made it, and only an owner or admin of that workspace can change the rules.",
    file: "database.test.ts",
  },
  {
    id: "SE-026",
    title: "An agent that won't stop",
    risks: ["ASI10", "ASI08"],
    asserts: "Anyone who contributes can pause a workspace's agents, which refuses new runs and automatic applies at once while people's own changes go on, and only an owner or admin resumes them.",
    file: "database.test.ts",
  },
];

/** What isn't tested for each risk, and the reason when a risk doesn't apply. */
export const RISK_NOTES: Record<string, { untested: string; notApplicable?: string }> = {
  ASI01: { untested: "Whether a model resists injected instructions. The tests assume it obeys them and check that the boundaries hold anyway." },
  ASI02: { untested: "Misuse of tools inside the sandbox, which is isolated by the microVM rather than judged command by command." },
  ASI03: { untested: "Sign-in itself (email codes, authenticators) and staff roles in Office Space, which have their own tests outside this suite." },
  ASI04: { untested: "Vulnerabilities inside third-party packages beyond the npm audit in security checks; MCP servers, which Farbaek doesn't connect to agents." },
  ASI05: { untested: "Escapes from the sandbox's microVM, which belong to the runtime provider." },
  ASI06: { untested: "Poisoning of the model's own training data; long-term agent memory, which Farbaek doesn't keep between runs." },
  ASI07: { untested: "Network-level attacks on the agent API (it relies on HTTPS), and Mesh transfers between computers, which have their own tests." },
  ASI08: { untested: "Failures across Farbaek's infrastructure, such as the database or a model provider going down." },
  ASI09: { untested: "How people read and act on what they see; the suite checks only that what's shown is backed by evidence." },
  ASI10: { untested: "Behavioural detection of an agent drifting from its task, which Farbaek doesn't do; it relies on limits and switches instead." },
  LLM01: { untested: "Model-level defences against injection; the tests check that boundaries hold when injection succeeds." },
  LLM02: { untested: "Secrets in forms Farbaek's patterns don't recognise; what a model provider does with what it's sent." },
  LLM03: { untested: "The integrity of model weights and providers' supply chains." },
  LLM04: { untested: "Training and fine-tuning data: Farbaek doesn't train or fine-tune models." },
  LLM05: { untested: "The AI security review's findings, which people read as advice." },
  LLM06: { untested: "Permissions inside integrations Farbaek doesn't connect yet." },
  LLM07: { untested: "Whether a model can be made to repeat its instructions; the prompts hold no secrets, so leaking them exposes no credentials." },
  LLM08: { untested: "", notApplicable: "Farbaek doesn't use retrieval, vector stores or embeddings." },
  LLM09: { untested: "The accuracy of the model's explanations, plans and summaries; only claims of verification are checked against evidence." },
  LLM10: { untested: "Denial of service against Farbaek's servers, which rate limits and the host address separately." },
};

export interface RunResult {
  status: "passed" | "failed";
  tests: number;
}

/** The committed report of the latest run (scripts/security-eval.mjs). */
export interface EvalRun {
  ranAt: string;
  commit: string;
  node: string;
  scenarios: Record<string, RunResult>;
}

export type RiskCoverage =
  | { state: "tested"; scenarios: { scenario: EvalScenario; result: RunResult | null }[]; untested: string }
  | { state: "not_tested"; untested: string }
  | { state: "not_applicable"; reason: string };

export function coverageFor(riskId: string, run: EvalRun | null): RiskCoverage {
  const note = RISK_NOTES[riskId];
  if (note?.notApplicable) return { state: "not_applicable", reason: note.notApplicable };
  const scenarios = EVAL_SCENARIOS.filter((s) => s.risks.includes(riskId));
  if (scenarios.length === 0) return { state: "not_tested", untested: note?.untested ?? "No scenario tests this risk yet." };
  return { state: "tested", scenarios: scenarios.map((scenario) => ({ scenario, result: run?.scenarios[scenario.id] ?? null })), untested: note?.untested ?? "" };
}

/** Totals for the run stamp. */
export function runTotals(run: EvalRun | null): { scenarios: number; passed: number; failed: number; tests: number } {
  const results = Object.values(run?.scenarios ?? {});
  return {
    scenarios: EVAL_SCENARIOS.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    tests: results.reduce((n, r) => n + r.tests, 0),
  };
}
