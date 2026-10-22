import { SAMPLE_CHANGED_FILE, SAMPLE_CONTRACT, SAMPLE_VERSIONS } from "@/content/samples";
import { buildProofPack } from "@/core/proof/proofpack";
import { canonicalHash, sha256Hex } from "@/core/trust/canonical-json";

/**
 * A sample ProofPack to try on /verify, built by the real ProofPack builder
 * from the homepage's sample data. It's marked `sample: true` inside the
 * statement, so the page labels it, and its first limit says it records no
 * real project.
 */
export async function GET() {
  const [fileDigest, contractDigest] = await Promise.all([sha256Hex(SAMPLE_CHANGED_FILE.after), canonicalHash(SAMPLE_CONTRACT)]);
  const built = buildProofPack({
    task: { id: "tsk_sample", organizationId: "org_sample", projectId: "prj_sample" },
    contract: { version: SAMPLE_CONTRACT.version, sha256: contractDigest },
    proposal: { id: "prop_sample", sha256: fileDigest, model: null },
    policy: { outcome: "REQUIRE_APPROVAL", version: SAMPLE_VERSIONS.policyVersion, findings: [] },
    approval: { approvedBy: "usr_sample", approvedAt: "2026-10-12T10:00:00.000Z", appliedSha256: fileDigest },
    files: [{ path: SAMPLE_CHANGED_FILE.path, kind: "edit", baseRevision: 1, sha256: fileDigest }],
    checks: [
      { name: "typecheck", command: "pnpm typecheck", exitCode: 0 },
      { name: "unit tests", command: "pnpm test", exitCode: 0 },
    ],
    execution: { mode: "sandboxed", provider: "a sample sandbox" },
    createdAt: "2026-10-12T10:00:05.000Z",
    previous: null,
  });
  const statement = { ...built, predicate: { ...built.predicate, sample: true, limits: ["Sample data, written to show the format. It records no real project.", ...built.predicate.limits] } };
  const digest = await canonicalHash(statement);
  return new Response(JSON.stringify({ digest, status: statement.predicate.status, statement }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="sample-proofpack.json"',
      "cache-control": "public, max-age=3600",
    },
  });
}
