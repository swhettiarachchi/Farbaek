/**
 * Architecture Why-Graph for one file (ADR 0123, spec §10): why the file is
 * the way it is, from facts the workspace already records, each with its
 * source. The tasks whose applied changes wrote it (with the contract's
 * outcome and the reason the change gave), the docs that name it and the
 * tests that reach it. A doc that names only a file with the same name is
 * marked inferred. Edits nobody recorded a reason for are counted, never
 * explained: no historical reasoning is invented.
 */

export interface WhyRevision {
  revision: number;
  change: "import" | "edit" | "delete";
  createdAt: string;
}

export interface WhyChange {
  taskId: string;
  taskTitle: string;
  /** The approved contract's outcome, when the task has one. */
  outcome: string | null;
  /** The reason the change gave for this file. */
  reason: string;
  appliedAt: string;
  /** The model that wrote it, or null for a change a person wrote. */
  model: string | null;
  byAgent: boolean;
}

export type WhyFact =
  | { kind: "origin"; text: string; at: string; source: { label: string; href: string | null } }
  | { kind: "change"; text: string; detail: string | null; at: string; source: { label: string; href: string }; inferred: false }
  | { kind: "doc"; text: string; quote: string; source: { label: string; href: string }; inferred: boolean }
  | { kind: "test"; text: string; source: { label: string; href: string }; inferred: false };

export interface WhyGraph {
  facts: WhyFact[];
  /** Saved edits that no applied change accounts for: made by hand, with no recorded reason. */
  unexplainedEdits: number;
}

const DOC = /\.(md|mdx|markdown|txt|rst|adoc)$/i;
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lines in the project's docs that name the file: by its path (confirmed), or only by its file name (inferred). */
export function docMentions(path: string, docs: ReadonlyMap<string, string>, limit = 8): { path: string; line: number; quote: string; inferred: boolean }[] {
  const name = baseName(path);
  const byPath = new RegExp(`(^|[^\\w/.-])${escapeRe(path)}($|[^\\w/-])`);
  // A short or common name ("index.ts") says too little to count as a mention.
  const byName = name.length >= 6 && name !== "index.ts" && name !== "index.js" ? new RegExp(`(^|[^\\w.-])${escapeRe(name)}($|[^\\w-])`) : null;
  const out: { path: string; line: number; quote: string; inferred: boolean }[] = [];
  for (const [docPath, text] of [...docs].sort(([a], [b]) => a.localeCompare(b))) {
    if (docPath === path || !DOC.test(docPath)) continue;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && out.length < limit; i++) {
      const line = lines[i]!;
      const confirmed = byPath.test(line);
      if (!confirmed && !(byName && byName.test(line))) continue;
      out.push({ path: docPath, line: i + 1, quote: line.trim().slice(0, 200), inferred: !confirmed });
    }
  }
  return out;
}

export function whyGraph(input: {
  projectId: string;
  path: string;
  revisions: readonly WhyRevision[];
  changes: readonly WhyChange[];
  docs: ReadonlyMap<string, string>;
  tests: readonly string[];
}): WhyGraph {
  const fileHref = (p: string) => `/app/projects/${input.projectId}/files?path=${encodeURIComponent(p)}`;
  const facts: WhyFact[] = [];
  const first = [...input.revisions].sort((a, b) => a.revision - b.revision)[0];
  if (first) {
    facts.push({
      kind: "origin",
      text: first.change === "import" ? "Imported into the project." : "Created in Farbaek.",
      at: first.createdAt,
      source: { label: `Revision ${first.revision}`, href: `${fileHref(input.path)}&history=1` },
    });
  }
  for (const c of [...input.changes].sort((a, b) => a.appliedAt.localeCompare(b.appliedAt))) {
    facts.push({
      kind: "change",
      text: c.outcome ? `Changed for the task "${c.taskTitle}", whose outcome is: ${c.outcome}` : `Changed for the task "${c.taskTitle}".`,
      detail: c.reason ? `The change's reason for this file: ${c.reason}` : null,
      at: c.appliedAt,
      source: { label: c.byAgent ? "Task, changed by an agent" : c.model ? `Task, written by ${c.model}` : "Task", href: `/app/tasks/${c.taskId}` },
      inferred: false,
    });
  }
  for (const m of docMentions(input.path, input.docs)) {
    facts.push({
      kind: "doc",
      text: m.inferred ? `${m.path} names a file called ${baseName(input.path)}, which may be this one.` : `${m.path} names this file.`,
      quote: m.quote,
      source: { label: `${m.path}, line ${m.line}`, href: fileHref(m.path) },
      inferred: m.inferred,
    });
  }
  for (const t of [...input.tests].sort()) {
    facts.push({ kind: "test", text: `${t} reaches this file through its imports.`, source: { label: t, href: fileHref(t) }, inferred: false });
  }
  const edits = input.revisions.filter((r) => r.change === "edit").length;
  return { facts, unexplainedEdits: Math.max(0, edits - input.changes.length) };
}
