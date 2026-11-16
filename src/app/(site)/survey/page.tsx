import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  FileArrowUpIcon,
  GlobeHemisphereEastIcon,
  LayoutIcon,
  ListChecksIcon, MicrophoneIcon,
  PenNibIcon,
  SignatureIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { samplePlan } from "@/components/survey/sample-plan";
import { SheetSvg } from "@/components/survey/sheet-svg";
import { Container } from "@/components/ui/container";
import { StatusBadge } from "@/components/ui/status-badge";
import { PART_TITLE, PUBLIC_TITLE, SECTION_TITLE } from "@/components/ui/titles";
import { BEZEL } from "@/components/ui/surfaces";

export const metadata: Metadata = {
  title: "Survey Studio",
  description:
    "Land survey plans from a surveyor's field points, drafted from your own description: lots, roads and the extent in hectares and acres, roods and perches worked out by tested code, laid out in the classic Sri Lankan sheet, and exported as a true-scale vector PDF and DXF.",
  alternates: { canonical: "/survey" },
};

const STEPS: { icon: Icon; title: string; body: string }[] = [
  {
    icon: FileArrowUpIcon,
    title: "Upload the field data",
    body: "The file from your total station or GNSS controller: CSV or DAT in PNEZC or any column order, Leica GSI, Sokkia SDR, LandXML or Trimble JobXML. No file? Type the coordinates, or the bearings and distances from your field book: a leg that closes on a known point shows its misclosure, never adjusted. Farbaek reads the columns itself and says why, shows the points and the lot on a small map, and draws the plan as it imports: the lot through the boundary marks, the walls and buildings from their codes, and the road. Everything it draws waits for your check. Nothing imports half way, and the points never change after.",
  },
  {
    icon: GlobeHemisphereEastIcon,
    title: "Confirm the grid",
    body: "Choose SLD99, Kandawala, UTM zone 44N or local coordinates, and confirm it. Farbaek records who confirmed it and checks that the points fit, but never picks the grid for you.",
  },
  {
    icon: PenNibIcon,
    title: "Describe the job, or draw it yourself",
    body: "Write each lot's corner points, the roads, what adjoins between which points and the title in your own words, or photograph the earlier plan. The AI reads only what you wrote, asks about what's missing and marks every item for you to check. Or type each lot's corners yourself: areas and widths appear as you go. For a sub division, Farbaek works out where the dividing lines fall for the areas or widths you give, or for lines through one corner, and how far along the boundary to peg each new corner. Check the shares against the UDA minimums or your own Development Plan figures, then print the block-out plan.",
  },
  {
    icon: LayoutIcon,
    title: "Lay out the sheet",
    body: "The classic Sri Lankan layout: surveyor's block, plan number, north point, lots with raised labels, roads with their width in feet, adjoining lands, the Reference of codes used, the title, bounded as follows and the extent, with the boundaries schedule overleaf. Paper and scale are picked for you, and you can drag labels and undo anything.",
  },
  {
    icon: MicrophoneIcon,
    title: "Talk or type to the plan",
    body: "With the sheet in front of you, say or type what you want: lot B4 from points 1 to 4, A3 landscape, show the dimensions, what is the total area. Hold to talk in the field, or talk hands-free in the office, in English or Sinhala where your browser hears it. The assistant never writes a value of its own: every number and point is read from your words and checked, the change is shown on the sheet, and nothing is kept until you apply it, one step you can undo. Areas come from the survey engine, not the AI.",
  },
  {
    icon: ListChecksIcon,
    title: "Check it",
    body: "Every problem is listed with what to do about it. A problem that would make the plan wrong stops the export until it's fixed. Lots that nearly meet are named with the distance, for you to fix or keep as surveyed, and the deed's extent is set beside the one computed from your points.",
  },
  {
    icon: SignatureIcon,
    title: "Approve, print and sign",
    body: "The surveyor approves one exact version in Farbaek. The PDF prints at true scale with a 100 mm check line, and DXF, CSV and GeoJSON go on to CAD and GIS.",
  },
];

const RULES = [
  {
    title: "Areas from coordinates",
    body: "The area is computed from the boundary coordinates on the grid, in square metres, and shown in hectares and in acres, roods and perches. An extent stated in a deed stays a separate field.",
  },
  {
    title: "Bearings that say what they are",
    body: "Whole-circle bearings, clockwise from grid north of the confirmed grid, in degrees, minutes and seconds. The plan's notes say so.",
  },
  {
    title: "Nothing changes quietly",
    body: "Points are never snapped, moved or rounded. Dragging a label is a presentation edit: the numbers it shows stay where they are.",
  },
  {
    title: "Proved by tests, not by AI",
    body: "The calculations are tested against worked answers. DXF files are read back by an independent reader in the tests, and PDFs are measured for page size and line length. AI never calculates.",
  },
  {
    title: "Nothing the AI drafts goes unchecked",
    body: "Each item the AI fills in quotes the words it came from, and anything it can't quote is left out. Every item stays marked until you mark it right or change it, and the plan can't be approved before then. A photo fills in the title only, never points or measurements.",
  },
];

const SRI_LANKA = [
  {
    title: "The licensed surveyor certifies",
    body: "Under section 13 of the Survey Act, a plan is admissible in a Sri Lankan court only when it's certified by a registered licensed surveyor, or made by or for the Surveyor General. Survey Studio prepares and checks the drawing. Approving it in Farbaek records the surveyor's review, and the surveyor signs the printed plan.",
    source: "Survey Act No. 17 of 2002",
    href: "https://landsurveycouncil.org/pdf/Survey_Act/Survey%20Act%20English.pdf",
  },
  {
    title: "SLD99 or Kandawala, chosen by you",
    body: "Both national grids are Transverse Mercator on the Everest 1830 (1937 Adjustment) ellipsoid, in metres, easting first. Their eastings don't overlap but their northings do, so a range check can only question a choice, never make it.",
    source: "EPSG:5235 and EPSG:5234",
    href: "https://epsg.io/5235",
  },
  {
    title: "Perches from the exact definition",
    body: "One square perch is 25.29285264 m² exactly, 40 perches make a rood and 4 roods an acre. Farbaek rounds the perches once, then carries, so 40.00 P becomes 1 R.",
    source: "NIST Handbook 44, Appendix C",
    href: "https://www.nist.gov/document/2026-nist-handbook-44-appendix-c",
  },
  {
    title: "A development permit box when you need one",
    body: "In UDA-declared areas, regulation 9 asks plans for subdivision, amalgamation or resurvey for a 7.5 cm by 5 cm development permit box on the front page, and for previous plans to be referenced. The sheet has both.",
    source: "UDA Planning and Development Regulations",
    href: "https://www.uda.gov.lk/attachments/act/mcK3c2YfvS.pdf",
  },
];

const ON_THE_SHEET = [
  "The lots, sharing their partition legs, with corner marks from your field codes.",
  "The road drawn from both surveyed edges, its width measured square across.",
  "The land adjoining each side, with an arrow to the leg it lies beside.",
  "The title sentence, district and province, bounded as follows and the extent.",
  "Every leg's bearing and distance, and the corner coordinates, overleaf.",
];

const NOT_YET = [
  "Land survey (cadastral boundary) plans only, for now. Subdivision, topographic, engineering and road plans come later, each with its own tested engine.",
  "No traverse adjustment and no conversion between grids: points stay exactly as they were imported.",
  "Sinhala and Tamil text on the sheet comes later. Today the sheet is in English, and descriptions are read in English.",
  "It doesn't submit plans to the Survey Department or the UDA, and approving a plan in Farbaek isn't a certification.",
];

const PRIMARY =
  "group inline-flex min-h-12 items-center gap-3 rounded-full bg-primary py-2 pl-6 pr-2 text-body font-medium text-on-primary shadow-e1 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary-hover active:scale-[0.98]";
const SECONDARY = "inline-flex min-h-12 items-center rounded-full px-5 text-body font-medium text-ink-2 ring-1 ring-line transition-colors duration-150 hover:bg-surface hover:text-ink";

function Actions() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/app/survey/new" className={PRIMARY}>
        Start a survey plan
        <span className="flex size-8 items-center justify-center rounded-full bg-on-primary/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-0.5">
          <ArrowRightIcon size={16} weight="bold" aria-hidden />
        </span>
      </Link>
      <Link href="/app/survey/sample" className={SECONDARY}>
        Open the sample plan
      </Link>
    </div>
  );
}

export default function SurveyStudioPage() {
  const plan = samplePlan();
  return (
    <>
      <section className="pt-14 pb-16 sm:pt-20 lg:pt-24 lg:pb-20">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-end lg:gap-16">
            <h1 className={`max-w-[15ch] ${PUBLIC_TITLE}`}>Land survey plans, drawn to scale from field data.</h1>
            <div className="grid gap-6">
              <p className="text-lg leading-relaxed text-ink-2">
                Survey Studio is Farbaek&apos;s module for licensed surveyors and the people who draw their plans. Import the points, confirm the grid, describe the job in your own words or set the lots yourself, and get a plan sheet in the classic Sri Lankan layout with every extent and width worked out by tested code. Print it at the scale it says, or take it into CAD.
              </p>
              <Actions />
              <p className="text-sm text-ink-3">You&apos;ll sign in first. The sample plan is in every workspace.</p>
            </div>
          </div>

          <figure className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start lg:gap-12">
            <div data-survey-draw="on" className={`mx-auto w-full max-w-[28rem] shadow-e2 ${BEZEL}`}>
              <div className="overflow-hidden rounded-md bg-surface ring-1 ring-line">
                <SheetSvg page={plan.page} draw label="The sample land survey plan sheet in the classic Sri Lankan layout: three lots of a sub division with raised labels, a road with its width, adjoining lands, the north point, the Reference, the title, bounded as follows and the extent. Synthetic sample data." className="h-auto w-full" />
              </div>
            </div>
            <div className="grid content-start gap-5">
              <div className={BEZEL}>
                <div className="overflow-hidden rounded-md bg-surface ring-1 ring-line">
                  <SheetSvg page={plan.detailPage} viewBox={plan.detail} label="Close-up of the sample sheet's drawing: lots B1, B2 and B3, the road with its width in feet, and the corner marks." className="h-auto w-full" />
                </div>
              </div>
              <ul className="grid list-disc gap-1.5 pl-5 text-body leading-relaxed text-ink-2">
                {ON_THE_SHEET.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
              <StatusBadge status="simulated" label="Sample" />
              <span>
                The sample plan from synthetic points{plan.scale ? `, at 1:${plan.scale} on ${plan.paper}` : ""}.{" "}
                <a href="/survey/sample-plan.pdf" className="font-medium text-accent underline-offset-4 hover:underline">
                  Open it as a PDF
                </a>{" "}
                and print it at actual size: the check line measures 100 mm.
              </span>
            </figcaption>
            </div>
          </figure>
        </Container>
      </section>

      <section aria-labelledby="steps-title" className="border-t border-line bg-surface py-12 sm:py-16 lg:py-24">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 id="steps-title" className={`max-w-[18ch] ${SECTION_TITLE}`}>
                From field points to a signed plan.
              </h2>
              <p className="mt-4 max-w-[38ch] text-body leading-relaxed text-ink-2">The steps follow the way a plan is made in the office, and each one can be checked before the next.</p>
            </div>
            <ol className="grid gap-3">
              {STEPS.map((s) => (
                <li key={s.title} className="flex gap-4 rounded-md bg-canvas p-5 ring-1 ring-line sm:p-6">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-line">
                    <s.icon size={20} className="text-ink-2" aria-hidden />
                  </span>
                  <div className="grid gap-1.5">
                    <h3 className="text-title-4 font-medium tracking-[-0.01em] text-ink">{s.title}</h3>
                    <p className="text-body leading-relaxed text-ink-2">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </section>

      <section aria-labelledby="numbers-title" className="border-t border-line py-12 sm:py-16 lg:py-24">
        <Container>
          <h2 id="numbers-title" className={`max-w-[22ch] ${SECTION_TITLE}`}>
            The numbers come from tested code.
          </h2>
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
              {RULES.map((r) => (
                <div key={r.title} className="grid gap-1.5 border-t border-line pt-4">
                  <dt className="text-title-4 font-medium tracking-[-0.01em] text-ink">{r.title}</dt>
                  <dd className="text-body leading-relaxed text-ink-2">{r.body}</dd>
                </div>
              ))}
            </dl>

            <div className={`self-start ${BEZEL}`}>
              <div className="rounded-md bg-surface p-5 shadow-e1 ring-1 ring-line sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-title-4 font-medium tracking-[-0.01em] text-ink">The sample plan, worked out</h3>
                  <StatusBadge status="simulated" label="Sample" />
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[18rem] text-left text-sm">
                    <caption className="sr-only">Each lot of the sample plan with its extent</caption>
                    <thead>
                      <tr className="border-b border-line text-ink-3">
                        <th scope="col" className="py-2 pr-3 font-medium">Lot</th>
                        <th scope="col" className="py-2 pr-3 text-right font-medium">Hectares</th>
                        <th scope="col" className="py-2 text-right font-medium">Acres, roods, perches</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.lots.map((l) => (
                        <tr key={l.name} className="border-b border-line">
                          <td className="py-2 pr-3 text-ink">
                            {l.label}
                            <sup>{l.sup}</sup>
                          </td>
                          <td className="py-2 pr-3 text-right tabular text-ink">{l.ha}</td>
                          <td className="py-2 text-right tabular text-ink">{l.arp}</td>
                        </tr>
                      ))}
                      {plan.total ? (
                        <tr>
                          <td className="py-2 pr-3 font-medium text-ink">Entire land</td>
                          <td className="py-2 pr-3 text-right tabular font-medium text-ink">{plan.total.ha}</td>
                          <td className="py-2 text-right tabular font-medium text-ink">{plan.total.arp}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                {plan.lots[0] ? (
                  <p className="mt-4 text-body leading-relaxed text-ink-2">
                    Lot {plan.lots[0].label}
                    <sup>{plan.lots[0].sup}</sup>&apos;s first leg runs from point {plan.lots[0].legs[0]!.from} to {plan.lots[0].legs[0]!.to} on a bearing of{" "}
                    <span className="tabular font-medium text-ink">{plan.lots[0].legs[0]!.bearing}</span> for <span className="tabular font-medium text-ink">{plan.lots[0].legs[0]!.distance} m</span>. The schedule overleaf lists every leg.
                  </p>
                ) : null}
                <p className="mt-3 text-sm text-ink-3">Computed by the coordinate method on the SLD99 grid, from synthetic points. The lots add up to the entire land exactly.</p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="sri-lanka-title" className="border-t border-line bg-canvas-2 py-12 sm:py-16 lg:py-24">
        <Container>
          <h2 id="sri-lanka-title" className={`max-w-[22ch] ${SECTION_TITLE}`}>
            Made for Sri Lankan plans, from the sources.
          </h2>
          <p className="mt-4 max-w-[60ch] text-body leading-relaxed text-ink-2">
            Each rule Survey Studio follows comes from a text we read and link to. Where no official source sets a convention, such as the layout of the title block, it&apos;s a starting template the surveyor can change.
          </p>
          <ul className="mt-10 grid gap-4 md:grid-cols-2">
            {SRI_LANKA.map((f) => (
              <li key={f.title} className="grid content-between gap-5 rounded-md bg-surface p-5 shadow-e1 ring-1 ring-line sm:p-6">
                <div className="grid gap-2">
                  <h3 className="text-title-4 font-medium tracking-[-0.01em] text-ink">{f.title}</h3>
                  <p className="text-body leading-relaxed text-ink-2">{f.body}</p>
                </div>
                <a href={f.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 justify-self-start text-sm font-medium text-accent underline-offset-4 hover:underline">
                  {f.source}
                  <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-[70ch] text-sm leading-relaxed text-ink-3">
            Sources read on 15 November 2026. Farbaek doesn&apos;t claim that any plan meets a law or regulation: the licensed surveyor decides that.
          </p>
        </Container>
      </section>

      <section aria-labelledby="not-yet-title" className="border-t border-line py-12 sm:py-16 lg:py-24">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
            <h2 id="not-yet-title" className={`max-w-[18ch] ${SECTION_TITLE}`}>
              What it doesn&apos;t do yet.
            </h2>
            <ul className="grid list-disc gap-3 pl-5 text-body leading-relaxed text-ink-2 marker:text-ink-3">
              {NOT_YET.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section aria-labelledby="start-title" className="pb-20 lg:pb-28">
        <Container>
          <div className={BEZEL}>
            <div className="grid gap-6 rounded-md bg-surface px-6 py-10 shadow-e1 ring-1 ring-line sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:py-12">
              <div className="grid gap-3">
                <h2 id="start-title" className={`max-w-[24ch] ${PART_TITLE}`}>
                  Start with the sample plan, then bring your own points.
                </h2>
                <p className="max-w-[56ch] text-body leading-relaxed text-ink-2">Survey Studio is in your Farbaek workspace, next to your projects. Your points stay in your workspace and only its members can see them.</p>
              </div>
              <Actions />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
