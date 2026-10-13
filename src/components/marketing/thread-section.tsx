import { ProofThread, type ThreadStage } from "@/components/proof/proof-thread";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "./section-heading";

const STAGES: ThreadStage[] = [
  { key: "intent", label: "Intent", body: "A plain request becomes a contract you can edit and approve.", status: "verified" },
  { key: "code", label: "Code", body: "Targeted edits, shown as a diff you review hunk by hunk.", status: "verified" },
  { key: "test", label: "Test", body: "Real commands with real exit codes. Tests that didn't run say so.", status: "verified" },
  { key: "approval", label: "Approval", body: "You approve one exact change, bound to its hash.", status: "approval" },
  { key: "proof", label: "Proof", body: "A ProofPack records what ran and the limits of what it proves.", status: "unverified" },
  { key: "launch", label: "Launch", body: "A deploy needs a verified ProofPack for that exact commit.", status: "unverified" },
];

const LEGEND = [
  { label: "Verified", className: "border-solid border-gold" },
  { label: "Awaiting approval", className: "border-solid border-approval" },
  { label: "Not verified yet", className: "border-dashed border-unverified" },
  { label: "Failed", className: "border-solid border-failed" },
];

export function ThreadSection() {
  return (
    <section id="how-it-works" aria-labelledby="thread-title" className="border-t border-line py-20 lg:py-28">
      <Container>
        <SectionHeading id="thread-title" title="Every change follows one thread.">
          A stage only turns solid when the evidence behind it is real. Here is one task, paused at approval.
        </SectionHeading>

        <div className="mt-14">
          <ProofThread stages={STAGES} label="Illustrative task timeline" />
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 text-sm text-ink-2 lg:flex-row lg:items-center lg:justify-between">
          <ul className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Thread legend">
            {LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span aria-hidden className={`w-6 border-t-[1.5px] ${item.className}`} />
                {item.label}
              </li>
            ))}
          </ul>
          <p className="text-ink-3">Illustrative. In the product, the thread moves only on server-confirmed events.</p>
        </div>
      </Container>
    </section>
  );
}
