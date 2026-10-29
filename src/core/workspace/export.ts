/**
 * Eject Anytime (spec §25, ADR 0039): everything Farbaek holds about a
 * project, in one download that needs nothing from Farbaek afterwards. The
 * project's files sit at the root, as in the plain download; a `.farbaek/`
 * folder beside them holds the tasks, contracts and every piece of evidence
 * (ProofPacks, recovery receipts, check receipts) in the same
 * `{ digest, status, statement }` form that farbaek.com/verify checks, plus
 * the file history and an index. Pure: the server gathers, this lays out.
 */
import { KIND_LABELS, filesToRead, planLaunch } from "../launch/planner";
import type { FileChangeEvent } from "../realityloop/scope-drift";

export const EXPORT_FORMAT = "farbaek.export/1";
/** History beyond this many changes is cut, and the export says so. */
export const EXPORT_HISTORY_LIMIT = 500;

export interface EvidenceRecord {
  digest: string;
  status: string;
  statement: unknown;
  createdAt: string;
}

export interface ExportTask {
  id: string;
  title: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  transitions: { eventType: string; from: string; to: string; actorKind: string; at: string }[];
  contract: { version: number; status: string; sha256: string; body: unknown; createdAt: string; approvedAt: string | null } | null;
  proofPacks: EvidenceRecord[];
  recoveries: EvidenceRecord[];
  checks: EvidenceRecord[];
}

export interface ExportInput {
  project: { id: string; name: string; description: string | null; createdAt: string };
  exportedAt: string;
  /** The project's current files: text, and images as bytes (ADR 0108). */
  files: readonly { path: string; content: string | Uint8Array }[];
  tasks: readonly ExportTask[];
  history: { events: readonly FileChangeEvent[]; truncated: boolean };
}

export interface ExportIndexEntry {
  kind: "proofpack" | "recovery" | "check_receipt";
  digest: string;
  status: string;
  task: string;
  path: string;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function readme(input: ExportInput, folder: string, index: ExportIndexEntry[]): string {
  const paths = input.files.map((f) => f.path);
  // Only text files tell the launch plan anything; images are skipped.
  const byPath = new Map(input.files.flatMap((f) => (typeof f.content === "string" ? [[f.path, f.content] as const] : [])));
  const texts = Object.fromEntries(filesToRead(paths).flatMap((p) => (byPath.has(p) ? [[p, byPath.get(p)!]] : [])));
  const plan = planLaunch({ paths, texts });
  const install = paths.includes("pnpm-lock.yaml")
    ? "pnpm install"
    : paths.includes("yarn.lock")
      ? "yarn install"
      : paths.includes("bun.lock") || paths.includes("bun.lockb")
        ? "bun install"
        : paths.includes("package.json")
          ? "npm install"
          : paths.includes("requirements.txt")
            ? "pip install -r requirements.txt"
            : null;
  const commands = [
    install ? `- Install: \`${install}\`` : null,
    plan.build ? `- Build: \`${plan.build.command}\`${plan.build.source === "assumed" ? " (the framework's usual command; the project doesn't name one)" : ""}` : null,
    plan.start ? `- Start: \`${plan.start.command}\`${plan.start.source === "assumed" ? " (the framework's usual command)" : ""}` : null,
    plan.output ? `- Output folder: \`${plan.output.command}\`` : null,
  ].filter(Boolean);
  const envNames = plan.envNames.map((e) => `\`${e.name}\``);
  const count = (kind: ExportIndexEntry["kind"]) => index.filter((e) => e.kind === kind).length;

  return [
    `# ${input.project.name}: exported from Farbaek`,
    "",
    `Exported ${input.exportedAt}. Format \`${EXPORT_FORMAT}\`.`,
    "",
    "This folder is a complete, ordinary copy of the project. Nothing in it needs Farbaek to build, run or read.",
    "",
    "## Building it",
    "",
    `${KIND_LABELS[plan.kind]}.`,
    ...(commands.length > 0 ? ["", ...commands] : ["", "No build or start command was found. Check the project's own documentation."]),
    ...(envNames.length > 0 ? ["", `It reads these settings, which aren't included (values never leave Farbaek in an export): ${envNames.join(", ")}.`] : []),
    "",
    `## What's in \`${folder}/\``,
    "",
    "| File | What it is |",
    "| --- | --- |",
    "| `project.json` | The project's name, description and when it was created |",
    "| `tasks/<task>/task.json` | Each task: its title, state and every state change, with who (user, agent or system) and when |",
    "| `tasks/<task>/contract.json` | The task's latest intent contract, with its SHA-256 and status |",
    `| \`tasks/<task>/proofpacks/\` | ${count("proofpack")} ProofPacks: what was approved, the exact content applied and the checks that ran |`,
    `| \`tasks/<task>/recoveries/\` | ${count("recovery")} recovery receipts: changes that were undone |`,
    `| \`tasks/<task>/checks/\` | ${count("check_receipt")} check receipts: check runs in a sandbox |`,
    `| \`history.json\` | File changes, oldest first${input.history.truncated ? ` (the first ${EXPORT_HISTORY_LIMIT}; later ones may be missing, and each file's current content is at the root)` : ""} |`,
    "| `index.json` | Every evidence file, with its kind, digest and path |",
    "",
    "## Checking the evidence",
    "",
    "Each evidence file holds an in-toto statement and its digest: the SHA-256 of the statement's RFC 8785 canonical JSON. Recompute it to see whether anything changed since Farbaek recorded it, or drop the file on https://farbaek.com/verify, which checks it in your browser without uploading it.",
    "",
    "A matching digest proves the record is unchanged. It doesn't yet prove who made it: Farbaek doesn't sign statements yet.",
    "",
    "## People",
    "",
    "People appear only as the ids already inside the records, never by name or email.",
    "",
  ].join("\n");
}

/** The export's files: the project as it is, then the `.farbaek/` folder. */
export function buildExport(input: ExportInput): { files: { path: string; content: string | Uint8Array }[]; folder: string; index: ExportIndexEntry[] } {
  // A project with its own `.farbaek` folder keeps it; the export uses another name.
  const folder = input.files.some((f) => f.path === ".farbaek" || f.path.startsWith(".farbaek/")) ? ".farbaek-export" : ".farbaek";
  const out: { path: string; content: string | Uint8Array }[] = [...input.files];
  const index: ExportIndexEntry[] = [];

  for (const task of input.tasks) {
    const base = `${folder}/tasks/${task.id}`;
    out.push({ path: `${base}/task.json`, content: json({ id: task.id, title: task.title, state: task.state, createdAt: task.createdAt, updatedAt: task.updatedAt, transitions: task.transitions }) });
    if (task.contract) out.push({ path: `${base}/contract.json`, content: json(task.contract) });
    const groups: [ExportIndexEntry["kind"], string, readonly EvidenceRecord[]][] = [
      ["proofpack", "proofpacks", task.proofPacks],
      ["recovery", "recoveries", task.recoveries],
      ["check_receipt", "checks", task.checks],
    ];
    for (const [kind, dir, records] of groups) {
      for (const r of records) {
        const path = `${base}/${dir}/${r.digest}.json`;
        out.push({ path, content: json({ digest: r.digest, status: r.status, recordedAt: r.createdAt, statement: r.statement }) });
        index.push({ kind, digest: r.digest, status: r.status, task: task.id, path });
      }
    }
  }

  out.push({ path: `${folder}/project.json`, content: json({ format: EXPORT_FORMAT, id: input.project.id, name: input.project.name, description: input.project.description, createdAt: input.project.createdAt, exportedAt: input.exportedAt, files: input.files.length, tasks: input.tasks.length }) });
  out.push({ path: `${folder}/history.json`, content: json({ truncated: input.history.truncated, events: input.history.events }) });
  out.push({ path: `${folder}/index.json`, content: json({ format: EXPORT_FORMAT, evidence: index }) });
  out.push({ path: `${folder}/README.md`, content: readme(input, folder, index) });
  return { files: out, folder, index };
}
