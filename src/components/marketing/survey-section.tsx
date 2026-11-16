import { ArrowRightIcon, CheckCircleIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { DrawWhenSeen } from "@/components/survey/draw-when-seen";
import { samplePlan } from "@/components/survey/sample-plan";
import { SheetSvg } from "@/components/survey/sheet-svg";
import { Container } from "@/components/ui/container";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionHeading } from "./section-heading";
import { BEZEL } from "@/components/ui/surfaces";

const FACTS = [
  "Describe the job in your own words and the AI drafts the lots and the title for you to check. Anything it can't quote from you is left out.",
  "Bearings, distances and the extent in acres, roods and perches, computed from your coordinates by tested code, never by AI.",
  "The SLD99 or Kandawala grid, confirmed by you, never guessed from the numbers.",
  "A vector PDF at an exact scale with a 100 mm check line, and DXF for CAD.",
  "Every plan stays a draft until the licensed surveyor approves it and signs the print.",
];

/**
 * Survey Studio on the home page (stage 190). The picture is a real sheet
 * from the engine (synthetic sample points, labelled), drawing itself once
 * when seen: the whole sheet tilted back in CSS 3D on large screens, and a
 * flat close-up of the lot in front where the bearings can be read.
 */
export function SurveySection() {
  const plan = samplePlan();
  return (
    <section id="survey-studio" aria-labelledby="survey-studio-title" className="overflow-hidden py-14 sm:py-20 lg:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <SectionHeading id="survey-studio-title" title="Survey plans, drawn to scale from your field data.">
              Farbaek Survey Studio turns a surveyor&apos;s points into a land survey plan: checked at every step, laid out on a professional sheet, and printed at the scale it says.
            </SectionHeading>
            <ul className="mt-8 grid gap-3">
              {FACTS.map((f) => (
                <li key={f} className="flex gap-3 text-body leading-relaxed text-ink-2">
                  <CheckCircleIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/survey"
                className="tap group inline-flex min-h-11 items-center gap-3 rounded-full bg-primary py-1.5 pl-5 pr-1.5 text-body font-medium text-on-primary shadow-e1 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary-hover active:scale-[0.98]"
              >
                See Survey Studio
                <span className="flex size-8 items-center justify-center rounded-full bg-on-primary/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-0.5">
                  <ArrowRightIcon size={16} weight="bold" aria-hidden />
                </span>
              </Link>
              <Link href="/app/survey/sample" className="inline-flex min-h-12 items-center rounded-full px-5 text-body font-medium text-ink-2 transition-colors duration-150 hover:text-ink">
                Open the sample plan
              </Link>
            </div>
          </div>

          <figure className="grid gap-4">
            <DrawWhenSeen className="relative sm:pb-12">
              <div className="ml-auto w-full max-w-[28rem] [perspective:1800px]">
                <div className={`transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] lg:[transform:rotateX(7deg)_rotateY(-10deg)_rotateZ(0.8deg)] lg:hover:[transform:none] ${BEZEL}`}>
                  <div className="overflow-hidden rounded-md bg-surface shadow-e3 ring-1 ring-line">
                    <SheetSvg page={plan.page} draw label="A sample land survey plan sheet in the classic Sri Lankan layout: three lots with raised labels, a road with its width, adjoining lands, the Reference, the title and the extent. Synthetic sample data." className="h-auto w-full" />
                  </div>
                </div>
              </div>
              <div className="relative -mt-6 ml-auto w-[86%] rounded-lg bg-surface-raised/80 p-1.5 shadow-e2 ring-1 ring-line backdrop-blur-xl sm:absolute sm:bottom-0 sm:left-0 sm:mt-0 sm:w-[54%] lg:-left-6">
                <div className="overflow-hidden rounded-[calc(var(--radius-lg)-0.375rem)] bg-surface ring-1 ring-line">
                  <SheetSvg page={plan.detailPage} viewBox={plan.detail} draw label="Close-up of the sample sheet's drawing: lots B1, B2 and B3, the road with its width in feet, and the corner marks." className="h-auto w-full" />
                </div>
                <p className="px-3 pb-1.5 pt-2.5 text-sm text-ink-2">The drawing, enlarged from the sheet.</p>
              </div>
            </DrawWhenSeen>
            <figcaption className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
              <StatusBadge status="simulated" label="Sample" />A sheet from Survey Studio&apos;s engine{plan.scale ? ` at 1:${plan.scale}` : ""}, made from synthetic points.
            </figcaption>
          </figure>
        </div>
      </Container>
    </section>
  );
}
