import { Container } from "@/components/ui/container";
import { ApprovalDemo } from "./approval-demo";
import { SectionHeading } from "./section-heading";

export function DemoSection() {
  return (
    <section id="demo" aria-labelledby="demo-title" className="overflow-x-clip py-20 lg:py-28">
      <Container>
        <SectionHeading id="demo-title" title="Approvals bind to the exact change.">
          Approve the payload, then edit it. The approval stops matching, because it was tied to a hash of exactly what you saw.
        </SectionHeading>
        <div className="aurora mt-14 rounded-[28px] border border-line bg-canvas-2/80 p-3 backdrop-blur-sm sm:p-5 lg:p-6">
          <ApprovalDemo />
        </div>
        <p className="mt-6 max-w-[62ch] text-sm text-ink-3">
          Demo with sample data. It runs Farbaek&apos;s own canonical JSON, hashing and contract-check code in your browser. Nothing is
          executed, stored or sent.
        </p>
      </Container>
    </section>
  );
}
