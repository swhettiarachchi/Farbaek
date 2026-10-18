import { Container } from "@/components/ui/container";
import { SAMPLE_ACTION, SAMPLE_CHANGED_FILE, SAMPLE_DIFF, SAMPLE_VERSIONS, buildSampleProofPack } from "@/content/samples";
import { approvalBindingHash } from "@/core/trust/approval";
import { canonicalHash } from "@/core/trust/canonical-json";
import { ConceptFilm } from "./concept-film";

export async function FilmSection() {
  const [proofDigest, bindingHash] = await Promise.all([
    buildSampleProofPack().then(canonicalHash),
    approvalBindingHash({ action: SAMPLE_ACTION, ...SAMPLE_VERSIONS }),
  ]);

  return (
    <section aria-label="Concept film" className="pb-20 lg:pb-28">
      <Container>
        <ConceptFilm data={{ proofDigest, bindingHash, diff: SAMPLE_DIFF, diffPath: SAMPLE_CHANGED_FILE.path }} />
      </Container>
    </section>
  );
}
