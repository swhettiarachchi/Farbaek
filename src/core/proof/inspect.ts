/**
 * Checks a piece of Farbaek evidence anyone was given (Portable Proof,
 * spec §25, ADR 0039): a ProofPack, a recovery receipt, a sandbox check
 * receipt or a security report. Each is an in-toto statement whose digest is
 * the SHA-256 of its RFC 8785 canonical JSON, so recomputing it shows
 * whether a single character changed since Farbaek recorded it.
 *
 * It runs anywhere Web Crypto does, including the public verify page, where
 * nothing leaves the visitor's browser. The digest proves integrity. A
 * ProofPack Farbaek signed (ADR 0062) carries a DSSE envelope too, and its
 * signature, checked against Farbaek's published keys, proves who recorded it.
 */
import { EgressSummarySchema } from "../sandbox/egress-ledger";
import { z } from "zod";
import { canonicalHash } from "../trust/canonical-json";
import { fromBase64, verifyEnvelope, type PublicSigningKey } from "../trust/dsse";
import { IN_TOTO_STATEMENT_TYPE, LEGACY_PROOFPACK_PREDICATE_TYPE, PROOFPACK_PREDICATE_TYPE } from "./proofpack";
import { RECOVERY_PREDICATE_TYPE } from "./recovery-receipt";

/** Kept as literals so this module doesn't pull in the sandbox and security code. */
const CHECK_RECEIPT_PREDICATE_TYPE = "https://farbaek.dev/sandbox-receipt/v1";
const SECURITY_REPORT_PREDICATE_TYPE = "https://farbaek.dev/security-report/v1";

export type EvidenceKind = "proofpack" | "recovery" | "check_receipt" | "security_report";

export const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  proofpack: "ProofPack",
  recovery: "Recovery receipt",
  check_receipt: "Check receipt",
  security_report: "Security report",
};

const KIND_BY_PREDICATE: Record<string, EvidenceKind> = {
  [PROOFPACK_PREDICATE_TYPE]: "proofpack",
  [LEGACY_PROOFPACK_PREDICATE_TYPE]: "proofpack",
  [RECOVERY_PREDICATE_TYPE]: "recovery",
  [CHECK_RECEIPT_PREDICATE_TYPE]: "check_receipt",
  [SECURITY_REPORT_PREDICATE_TYPE]: "security_report",
};

export interface EvidenceFile {
  path: string;
  sha256: string;
  /** What happened to it, in words: "created", "edited", "restored". */
  note: string;
}

export interface EvidenceCheck {
  name: string;
  command: string | null;
  status: "passed" | "failed" | "not_run";
  exitCode: number | null;
}

export interface EvidenceSummary {
  /** Labelled facts, in reading order. */
  facts: { label: string; value: string; mono?: boolean; time?: boolean }[];
  files: EvidenceFile[];
  checks: EvidenceCheck[];
  /** Other evidence this one points at, by digest. */
  links: { label: string; digest: string }[];
  limits: string[];
}

export type Inspection =
  | {
      ok: true;
      kind: EvidenceKind;
      /** The digest the file claims, or the one pasted with it; null when there's none to compare. */
      claimed: string | null;
      computed: string;
      /** null when there was no digest to compare with. */
      intact: boolean | null;
      status: string | null;
      recordedAt: string | null;
      /** Marked as sample data inside the statement, so it must be shown as a sample. */
      sample: boolean;
      summary: EvidenceSummary;
      signature: EvidenceSignature;
    }
  | { ok: false; message: string };

/** Who signed it (ADR 0062): checked against Farbaek's published keys, or why it couldn't be. */
export type EvidenceSignature =
  | { status: "signed"; keyid: string }
  | { status: "bad"; reason: string }
  | { status: "unknown_key"; keyid: string }
  | { status: "unsigned" }
  /** It's signed, but Farbaek's keys couldn't be loaded to check it. */
  | { status: "unchecked" };

/** The statement inside a bare DSSE envelope, or null. */
function statementFromEnvelope(env: Record<string, unknown>): unknown {
  if (typeof env.payload !== "string" || typeof env.payloadType !== "string") return null;
  const bytes = fromBase64(env.payload);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

async function checkSignature(dsse: unknown, computed: string, keys: readonly PublicSigningKey[] | null): Promise<EvidenceSignature> {
  if (dsse === undefined || dsse === null) return { status: "unsigned" };
  if (!keys) return { status: "unchecked" };
  const r = await verifyEnvelope(dsse, keys);
  if (r.status === "unknown_key") return { status: "unknown_key", keyid: r.keyid };
  if (r.status === "invalid") return { status: "bad", reason: r.reason };
  // The signature must be over this very statement, not some other one.
  return (await canonicalHash(r.statement)) === computed ? { status: "signed", keyid: r.keyid } : { status: "bad", reason: "The signature is for different evidence than this file holds." };
}

const Hex64 = /^[0-9a-f]{64}$/;
const str = z.string().max(2000);
const hex = z.string().regex(Hex64);

const CheckSchema = z.object({ name: str, command: str.optional(), exitCode: z.number().int().nullable(), status: z.enum(["passed", "failed", "not_run"]).optional() });
const toCheck = (c: z.infer<typeof CheckSchema>): EvidenceCheck => ({
  name: c.name,
  command: c.command ?? null,
  exitCode: c.exitCode,
  status: c.status ?? (c.exitCode === null ? "not_run" : c.exitCode === 0 ? "passed" : "failed"),
});

const ProofPackPredicate = z.object({
  status: str,
  task: z.object({ id: str }),
  contract: z.object({ version: z.number(), sha256: hex }),
  proposal: z.object({ model: str.nullable() }).partial(),
  policy: z.object({ outcome: str }).nullable(),
  approval: z.object({ approvedAt: str }),
  changes: z.array(z.object({ path: str, kind: z.enum(["create", "edit"]), sha256: hex })),
  checks: z.array(CheckSchema),
  execution: z.union([z.object({ mode: z.literal("sandboxed"), provider: str }), z.object({ mode: z.literal("review_only"), reason: str })]),
  limits: z.array(str),
  createdAt: str,
  previous: hex.nullable(),
  verification: z.object({ receipt: hex, appliedProofPack: hex }).optional(),
  egress: EgressSummarySchema.optional(),
});

const RecoveryPredicate = z.object({
  status: str,
  task: z.object({ id: str }),
  proofPack: hex.nullable(),
  approval: z.object({ approvedAt: str }),
  operations: z.array(z.object({ path: str, action: z.enum(["restore", "remove"]), fromRevision: z.number(), toRevision: z.number().nullable(), toSha256: hex.nullable() })),
  left: z.array(z.object({ path: str, reason: str })),
  limits: z.array(str),
  createdAt: str,
});

const ReceiptPredicate = z.object({
  status: str,
  runtime: z.object({ provider: str }).partial().optional(),
  checks: z.array(CheckSchema),
  verdict: z.object({ proofPackDigest: hex.nullable() }).partial(),
  appliedChange: z.object({ files: z.array(z.object({ path: str, expected: hex, actual: hex.nullable() })), matched: z.boolean() }).optional(),
  limits: z.array(str),
  createdAt: str,
});

const SecurityPredicate = z.object({
  project: z.object({ name: str, files: z.number() }),
  score: z.number(),
  grade: str,
  counts: z.record(z.string(), z.number()),
  checks: z.array(z.union([z.object({ name: str, ran: z.literal(true), findings: z.number() }), z.object({ name: str, ran: z.literal(false), reason: str })])),
  findings: z.array(z.object({ severity: str, title: str }).partial()),
  generatedAt: str,
});

const STATUS_WORDS: Record<string, string> = {
  verified: "Verified",
  partially_verified: "Partly verified",
  unverified: "Not verified",
  failed: "Failed",
  recovered: "Recovered",
  partially_recovered: "Partly recovered",
};
const words = (status: string) => STATUS_WORDS[status] ?? status;

/** Addresses from the Egress Ledger (ADR 0127), as written in the record. */
const hostList = (hosts: { host: string; port: number; attempts: number }[]) =>
  hosts.length ? hosts.map((h) => `${h.port === 443 || h.port === 80 ? h.host : `${h.host}:${h.port}`} (${h.attempts}×)`).join(", ") : "Nothing";

function summarize(kind: EvidenceKind, predicate: unknown): { summary: EvidenceSummary; status: string | null; recordedAt: string | null } | null {
  if (kind === "proofpack") {
    const p = ProofPackPredicate.safeParse(predicate);
    if (!p.success) return null;
    const d = p.data;
    const links = [...(d.previous ? [{ label: "The project's previous ProofPack", digest: d.previous }] : []), ...(d.verification ? [{ label: "The change this verifies", digest: d.verification.appliedProofPack }, { label: "The check run's receipt", digest: d.verification.receipt }] : [])];
    return {
      status: d.status,
      recordedAt: d.createdAt,
      summary: {
        facts: [
          { label: "Status", value: words(d.status) },
          { label: "Task", value: d.task.id, mono: true },
          { label: "Contract", value: `Version ${d.contract.version}, sha256:${d.contract.sha256.slice(0, 12)}…`, mono: true },
          { label: "Policy", value: d.policy ? d.policy.outcome : "Not recorded" },
          { label: "Approved", value: d.approval.approvedAt, time: true },
          { label: "Where checks ran", value: d.execution.mode === "sandboxed" ? `In a sandbox (${d.execution.provider})` : `Not run: ${d.execution.reason}` },
          ...(d.proposal.model ? [{ label: "Model", value: d.proposal.model, mono: true }] : []),
          ...(d.egress
            ? [
                { label: "Network reached", value: hostList(d.egress.allowed), mono: d.egress.allowed.length > 0 },
                { label: "Network blocked", value: hostList(d.egress.blocked), mono: d.egress.blocked.length > 0 },
              ]
            : []),
        ],
        files: d.changes.map((c) => ({ path: c.path, sha256: c.sha256, note: c.kind === "create" ? "created" : "edited" })),
        checks: d.checks.map(toCheck),
        links,
        limits: d.limits,
      },
    };
  }
  if (kind === "recovery") {
    const p = RecoveryPredicate.safeParse(predicate);
    if (!p.success) return null;
    const d = p.data;
    return {
      status: d.status,
      recordedAt: d.createdAt,
      summary: {
        facts: [
          { label: "Status", value: words(d.status) },
          { label: "Task", value: d.task.id, mono: true },
          { label: "Approved", value: d.approval.approvedAt, time: true },
          { label: "Left as they are", value: d.left.length === 0 ? "None" : d.left.map((l) => `${l.path} (${l.reason.replace("_", " ")})`).join(", ") },
        ],
        files: d.operations.flatMap((o) => (o.toSha256 ? [{ path: o.path, sha256: o.toSha256, note: `restored to revision ${o.toRevision}` }] : [])),
        checks: [],
        links: d.proofPack ? [{ label: "The ProofPack of the change it undid", digest: d.proofPack }] : [],
        limits: d.limits,
      },
    };
  }
  if (kind === "check_receipt") {
    const p = ReceiptPredicate.safeParse(predicate);
    if (!p.success) return null;
    const d = p.data;
    return {
      status: d.status,
      recordedAt: d.createdAt,
      summary: {
        facts: [
          { label: "Status", value: words(d.status) },
          ...(d.runtime?.provider ? [{ label: "Sandbox", value: d.runtime.provider }] : []),
          ...(d.appliedChange ? [{ label: "Applied content", value: d.appliedChange.matched ? "Every file matched inside the sandbox" : "Some files didn't match" }] : []),
        ],
        files: (d.appliedChange?.files ?? []).map((f) => ({ path: f.path, sha256: f.expected, note: f.actual === f.expected ? "matched in the sandbox" : "didn't match in the sandbox" })),
        checks: d.checks.map(toCheck),
        links: d.verdict.proofPackDigest ? [{ label: "The ProofPack it produced", digest: d.verdict.proofPackDigest }] : [],
        limits: d.limits,
      },
    };
  }
  const p = SecurityPredicate.safeParse(predicate);
  if (!p.success) return null;
  const d = p.data;
  return {
    status: null,
    recordedAt: d.generatedAt,
    summary: {
      facts: [
        { label: "Project", value: d.project.name },
        { label: "Score", value: `${d.score} (grade ${d.grade})` },
        { label: "Findings", value: Object.entries(d.counts).filter(([, n]) => n > 0).map(([s, n]) => `${n} ${s}`).join(", ") || "None" },
        { label: "Files checked", value: String(d.project.files) },
      ],
      files: [],
      checks: d.checks.map((c) => ({ name: c.name, command: null, status: c.ran ? "passed" : "not_run", exitCode: null })),
      links: [],
      limits: [],
    },
  };
}

/**
 * Inspects evidence as downloaded from Farbaek (`{ digest, status, statement,
 * dsse? }`), a bare statement, or a bare DSSE envelope. `pastedDigest`, when
 * given, is what it's compared with. `keys` are Farbaek's published signing
 * keys; null when they couldn't be loaded.
 */
export async function inspectEvidence(input: unknown, pastedDigest?: string, keys: readonly PublicSigningKey[] | null = null): Promise<Inspection> {
  if (typeof input !== "object" || input === null) return { ok: false, message: "This isn't a Farbaek evidence file: it isn't a JSON object." };
  const envelope = input as Record<string, unknown>;
  const bare = statementFromEnvelope(envelope);
  const dsse = bare ? envelope : envelope.dsse;
  const statement = bare ?? ("statement" in envelope && !("_type" in envelope) ? envelope.statement : envelope);
  if (typeof statement !== "object" || statement === null) return { ok: false, message: "This file has no statement to check." };
  const s = statement as Record<string, unknown>;
  if (s._type !== IN_TOTO_STATEMENT_TYPE) return { ok: false, message: "This isn't an in-toto statement, so it isn't Farbaek evidence." };
  const kind = typeof s.predicateType === "string" ? KIND_BY_PREDICATE[s.predicateType] : undefined;
  if (!kind) return { ok: false, message: "This statement is a kind of evidence Farbaek doesn't record, so it can't be checked here." };

  const pasted = pastedDigest?.trim().toLowerCase().replace(/^sha256:/, "");
  if (pasted && !Hex64.test(pasted)) return { ok: false, message: "The digest should be 64 hexadecimal characters." };
  const claimedRaw = pasted || (typeof envelope.digest === "string" ? envelope.digest.toLowerCase() : null);
  const claimed = claimedRaw && Hex64.test(claimedRaw) ? claimedRaw : null;

  const computed = await canonicalHash(statement);
  const summarized = summarize(kind, s.predicate);
  if (!summarized) return { ok: false, message: `This ${EVIDENCE_LABELS[kind]} is missing parts Farbaek always records, so it was changed or isn't genuine.` };
  const sample = typeof s.predicate === "object" && s.predicate !== null && (s.predicate as Record<string, unknown>).sample === true;
  const signature = await checkSignature(dsse, computed, keys);
  return { ok: true, kind, claimed, computed, intact: claimed === null ? null : claimed === computed, status: summarized.status, recordedAt: summarized.recordedAt, sample, summary: summarized.summary, signature };
}

/** The files in a summary whose recorded SHA-256 is this one. */
export function matchFile(summary: EvidenceSummary, sha256: string): EvidenceFile[] {
  return summary.files.filter((f) => f.sha256 === sha256);
}
