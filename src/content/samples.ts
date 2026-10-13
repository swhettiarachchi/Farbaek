/**
 * Sample data for the public site. Every item here is labelled "sample" where
 * it is shown. Hashes and digests are computed from this content at build
 * time; nothing here comes from a real customer or a real run.
 */
import { approvalBindingHash, type ApprovalSubject } from "@/core/trust/approval";
import { canonicalHash, sha256Hex } from "@/core/trust/canonical-json";
import type { IntentContract } from "@/core/realityloop/contract";

export const SAMPLE_CONTRACT: IntentContract = {
  schema: "farbaek.intent-contract/v1",
  version: 3,
  outcome: "Rewrite the descriptions of 100 storefront products in the new house style.",
  scope: {
    organizationId: "org_sample",
    projectId: "prj_sample_storefront",
    resources: ["products"],
  },
  allowedOperations: ["products.update"],
  forbiddenOperations: ["products.delete", "products.publish"],
  protectedFields: ["price", "stock", "published"],
  protectedInvariants: [
    { id: "inv-1", statement: "Prices, stock and publication state are unchanged." },
    { id: "inv-2", statement: "No orders are created, edited or cancelled." },
  ],
  assumptions: ["The house style guide in docs/style.md is current."],
  openQuestions: [],
  acceptanceCriteria: [
    { id: "ac-1", statement: "All 100 products have a description under 160 characters.", verification: "test" },
    { id: "ac-2", statement: "Saved descriptions read back exactly as approved.", verification: "read_back" },
  ],
  approvals: [{ gate: "before_execution", role: "catalog_owner" }],
  limits: { maxRecords: 100, maxRetries: 2 },
  requiredChecks: ["pnpm typecheck", "pnpm test"],
  recovery: "Restore the previous descriptions from the pre-change snapshot.",
};

export const SAMPLE_VERSIONS = {
  contractVersion: String(SAMPLE_CONTRACT.version),
  policyVersion: "12",
  resourceVersion: "products@etag-41",
} as const;

export const SAMPLE_DESCRIPTION = "Hand-finished walnut, oiled twice.";

export const SAMPLE_ACTION = {
  operation: "products.update",
  target: { collection: "products", count: 100 },
  fields: { description: SAMPLE_DESCRIPTION },
} as const;

export const SAMPLE_CHANGED_FILE = {
  path: "content/products/descriptions.json",
  before: '{\n  "walnut-board": "Walnut board.",\n  "oak-tray": "Oak tray."\n}\n',
  after: `{\n  "walnut-board": "${SAMPLE_DESCRIPTION}",\n  "oak-tray": "Quarter-sawn oak, waxed by hand."\n}\n`,
};

export interface DiffLine {
  kind: "context" | "removed" | "added";
  text: string;
}

export const SAMPLE_DIFF: DiffLine[] = [
  { kind: "context", text: "{" },
  { kind: "removed", text: '  "walnut-board": "Walnut board.",' },
  { kind: "added", text: `  "walnut-board": "${SAMPLE_DESCRIPTION}",` },
  { kind: "removed", text: '  "oak-tray": "Oak tray."' },
  { kind: "added", text: '  "oak-tray": "Quarter-sawn oak, waxed by hand."' },
  { kind: "context", text: "}" },
];

/** A ProofPack in the in-toto Statement v1 shape, built from the samples above. */
export async function buildSampleProofPack() {
  const sampleSubject: ApprovalSubject = { action: SAMPLE_ACTION, ...SAMPLE_VERSIONS };
  const [fileDigest, contractDigest, bindingHash] = await Promise.all([
    sha256Hex(SAMPLE_CHANGED_FILE.after),
    canonicalHash(SAMPLE_CONTRACT),
    approvalBindingHash(sampleSubject),
  ]);

  return {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: SAMPLE_CHANGED_FILE.path, digest: { sha256: fileDigest } }],
    // Placeholder URI from the spec; replaced once Farbaek owns a domain.
    predicateType: "https://farbaek.dev/proofpack/v1",
    predicate: {
      sample: true,
      task: { id: "tsk_sample", outcome: SAMPLE_CONTRACT.outcome },
      contract: { schema: SAMPLE_CONTRACT.schema, version: SAMPLE_CONTRACT.version, sha256: contractDigest },
      policy: { version: SAMPLE_VERSIONS.policyVersion, decision: "REQUIRE_APPROVAL" },
      approval: { state: "approved", bindingSha256: bindingHash },
      checks: [
        { name: "typecheck", command: "pnpm typecheck", exitCode: 0 },
        { name: "unit tests", command: "pnpm test", exitCode: 0 },
      ],
      postconditions: [
        { id: "inv-1", method: "read_back", result: "passed" },
        { id: "ac-2", method: "read_back", result: "passed" },
      ],
      verification: {
        status: "verified",
        notVerified: ["Storefront rendering on real devices"],
        limits: "Shows these commands ran against this exact state with these results. It does not prove the absence of other defects.",
      },
    },
  };
}
