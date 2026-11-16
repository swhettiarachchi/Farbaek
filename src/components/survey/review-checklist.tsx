import { ArrowRightIcon, CaretDownIcon, ListChecksIcon } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import Link from "next/link";
import { itemLabel } from "@/core/survey/compare";
import { lotName, unreviewed, type SurveyDocument } from "@/core/survey/document";
import type { Finding } from "@/core/survey/qc";
import { Card, CardTitle } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

/** Where an item waiting for the surveyor is checked, and what to call it. */
function itemOf(doc: SurveyDocument, key: string): { label: string; step: "boundary" | "plan" } {
  const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  if (kind === "lot") {
    const lot = doc.lots.find((l) => l.id === id);
    return { label: `Lot ${lot ? lotName(lot) || "without a label" : ""}: its corners`, step: "boundary" };
  }
  if (kind === "road") return { label: `The road${doc.roads.find((r) => r.id === id)?.name ? ` (${doc.roads.find((r) => r.id === id)!.name})` : ""}: its two edges`, step: "boundary" };
  if (kind === "adjoining") return { label: `Adjoining land: ${doc.adjoining.find((a) => a.id === id)?.text ?? ""}`, step: "boundary" };
  if (kind === "feature") return { label: "A drawn line", step: "boundary" };
  if (key === "notes") return { label: "The notes", step: "plan" };
  if (key === "codes") return { label: "The code list", step: "plan" };
  if (key.startsWith("sheet.")) return { label: itemLabel(key) ?? "A title field", step: "plan" };
  return { label: key, step: "plan" };
}

/**
 * What stands between this version and the surveyor's approval, in order: the items drawn from the field data or read by the AI that
 * wait for a check, then what the checks still ask for. One list, so after an upload the surveyor knows exactly what's left.
 */
export function ReviewChecklist({ doc, findings, base, approved }: { doc: SurveyDocument; findings: readonly Finding[]; base: string; approved: boolean }) {
  if (approved) return null;
  // Lines drawn from the codes are checked together on the Lots step, so they're one item here.
  const keys = unreviewed(doc);
  const lines = keys.filter((k) => k.startsWith("feature:"));
  const waiting = [
    ...keys.filter((k) => !k.startsWith("feature:")).map((k) => ({ key: k, source: doc.provenance[k]!.source, ...itemOf(doc, k) })),
    ...(lines.length > 0 ? [{ key: "features", source: doc.provenance[lines[0]!]!.source, label: `${lines.length} ${lines.length === 1 ? "line" : "lines"} joined from the field codes`, step: "boundary" as const }] : []),
  ];
  // Everything that holds approval or the export back, beyond the items above.
  const needed = findings.filter((f) => (f.blocks.includes("approval") || f.blocks.includes("export")) && f.code !== "AI_ITEMS_UNREVIEWED" && f.code !== "AUTO_ITEMS_UNREVIEWED");
  const shown = needed.slice(0, 6);
  const ready = waiting.length === 0 && needed.length === 0;
  return (
    <Card>
      <CardTitle icon={ListChecksIcon}>{ready ? "Ready for your approval" : "Check the plan, then approve it"}</CardTitle>
      {ready ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-2">Everything drawn for you is checked and no check holds the plan back. Look over the sheet once more, then approve this version on the Export step.</p>
          <Link href={`${base}?step=export`} className={buttonClasses("primary", "md")}>
            Go to approval
            <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </Link>
        </div>
      ) : (
        <ChecklistBody count={waiting.length + needed.length}>
        <div className="grid gap-4">
          {waiting.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium text-ink">
                {waiting.length} {waiting.length === 1 ? "item" : "items"} drawn for you to check
              </h3>
              <ul className="grid gap-2">
                {waiting.map((w) => (
                  <li key={w.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink">
                    <StatusBadge status="approval" label={w.source === "auto" ? "From the field data" : w.source === "ai_photo" ? "Read from a photo" : "From your description"} />
                    <span>{w.label}</span>
                    <Link href={`${base}?step=${w.step}`} className="text-accent underline-offset-2 hover:underline">
                      Check it on the {w.step === "boundary" ? "Lots" : "Plan"} step
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {needed.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium text-ink">Still needed before approval or export</h3>
              <ul className="grid list-disc gap-1 pl-5 text-sm text-ink-2">
                {shown.map((f) => (
                  <li key={`${f.code}-${f.target.id ?? ""}-${f.message}`}>
                    <span className="text-ink">{f.message}</span> {f.action}
                  </li>
                ))}
              </ul>
              {needed.length > shown.length ? (
                <Link href={`${base}?step=check`} className="text-sm text-accent underline-offset-2 hover:underline">
                  See all {needed.length} on the Check step
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        </ChecklistBody>
      )}
    </Card>
  );
}

/**
 * On a large screen the list shows as it is. Below that it folds to one line saying how many things are left, so the sheet isn't
 * pushed below the fold on a phone (stage 196); a tap opens it.
 */
function ChecklistBody({ count, children }: { count: number; children: ReactNode }) {
  return (
    <>
      <details className="group mt-2 lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm text-ink-2 [&::-webkit-details-marker]:hidden">
          <span>
            {count} {count === 1 ? "thing is" : "things are"} left before approval.
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span>
            <CaretDownIcon size={14} weight="bold" className="transition-transform duration-150 group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="pt-2">{children}</div>
      </details>
      <div className="mt-3 hidden lg:block">{children}</div>
    </>
  );
}
