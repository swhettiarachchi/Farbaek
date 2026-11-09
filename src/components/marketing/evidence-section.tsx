import { ArrowRightIcon, CheckIcon, MinusIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { JsonView } from "@/components/code/json-view";
import { ProofPackSeal } from "@/components/proof/proofpack-seal";
import { Container } from "@/components/ui/container";
import { SAMPLE_CONTRACT, buildSampleProofPack } from "@/content/samples";
import { canonicalHash } from "@/core/trust/canonical-json";
import { EvidenceTabs } from "./evidence-tabs";
import { SectionHeading } from "./section-heading";

const PROVES = [
  "Which exact files and commit were checked",
  "Which commands ran, and their results",
  "Which plan and approval it ran under",
];

const DOES_NOT_PROVE = ["That the software has no other defects", "Anything a check didn't cover", "Claims from systems Farbaek can't read back"];

export async function EvidenceSection() {
  const proofPack = await buildSampleProofPack();
  const digest = await canonicalHash(proofPack);

  return (
    <section id="evidence" aria-labelledby="evidence-title" className="py-20 lg:py-28">
      <Container>
        <SectionHeading id="evidence-title" title="Proof you can check, not just read.">
          A ProofPack is a signed record of what changed, what ran, and what that does and doesn&apos;t prove. It uses an open format, so anyone can check it.
        </SectionHeading>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_300px] lg:items-start lg:gap-12">
          <EvidenceTabs
            tabs={[
              { id: "proofpack", label: "proofpack.json", content: <JsonView value={proofPack} label="Sample ProofPack JSON" /> },
              { id: "contract", label: "plan.json", content: <JsonView value={SAMPLE_CONTRACT} label="Sample plan, as JSON" /> },
            ]}
          />

          <div className="flex flex-col items-center gap-4 lg:items-start">
            <ProofPackSeal hash={digest} caption="Sample ProofPack" className="w-56 max-w-full sm:w-64" />
            <p className="max-w-[30ch] text-center text-sm text-ink-3 lg:text-left" title={`sha256:${digest}`}>
              Sample written to show the format. This seal is drawn from the sample&apos;s own JSON.
            </p>
            <Link href="/verify" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline">
              Check a ProofPack yourself <ArrowRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-8 border-t border-line pt-8 sm:grid-cols-2">
          <div>
            <h3 className="text-title-4 font-medium">What it proves</h3>
            <ul className="mt-3 grid gap-2 text-body text-ink-2">
              {PROVES.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <CheckIcon size={16} weight="bold" className="mt-1 shrink-0 text-verified" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-title-4 font-medium">What it doesn&apos;t</h3>
            <ul className="mt-3 grid gap-2 text-body text-ink-2">
              {DOES_NOT_PROVE.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <MinusIcon size={16} weight="bold" className="mt-1 shrink-0 text-ink-3" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
