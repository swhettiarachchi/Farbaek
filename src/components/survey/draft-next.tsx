import { ArrowRightIcon, CameraIcon, CheckCircleIcon, ScribbleIcon } from "@/components/icons";
import Link from "next/link";
import { Card, CardTitle } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";

/** "the lot, 12 lines and the road", and any symbols ("a symbol", "2 symbols"). */
export function drawnWords(lots: number, lines: number, roads: number, symbols = 0): string {
  const parts = [
    lots > 0 ? (lots === 1 ? "the lot" : `${lots} lots`) : null,
    lines > 0 ? `${lines} ${lines === 1 ? "line" : "lines"}` : null,
    roads > 0 ? (roads === 1 ? "the road" : `${roads} roads`) : null,
    symbols > 0 ? (symbols === 1 ? "a symbol" : `${symbols} symbols`) : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
}

/**
 * The Draft step's one next step (stage 300): where the plan stands, said plainly, and the single thing to do now. The ways to draw a
 * plan by hand are below it, folded away. Worked out from the plan itself, never from a model.
 */
export function DraftNext({ base, lots, lines, roads, symbols = 0, sketchRead, fromSketch = false, reading, waiting, codeless }: {
  /** The project's address, such as /app/survey/<id>. */
  base: string;
  lots: number;
  lines: number;
  roads: number;
  symbols?: number;
  /** Whether a sketch has been read into the plan. */
  sketchRead: boolean;
  /** Whether everything on the plan was drawn from the sketch: only then is Farbaek said to have drawn it from the sketch. */
  fromSketch?: boolean;
  /** Whether a sketch is being read right now. */
  reading: boolean;
  /** How many things wait for the surveyor on the Plan step. */
  waiting: number;
  /** Whether none of the points carries a code, so the points alone can't draw the lot. */
  codeless: boolean;
}) {
  if (reading) {
    return (
      <Card>
        <CardTitle icon={ScribbleIcon}>Reading your sketch</CardTitle>
        <p className="mt-1 text-sm text-ink-2">Claude is reading your field sketch, and Farbaek draws the plan from it when it&apos;s done. This can take a minute, and the page shows it when it&apos;s ready.</p>
      </Card>
    );
  }
  if (lots + lines + roads + symbols > 0) {
    return (
      <Card>
        <CardTitle icon={CheckCircleIcon}>{lots > 0 ? "Your plan is drawn" : "Part of your plan is drawn"}</CardTitle>
        <p className="mt-1 text-sm text-ink-2">
          {fromSketch ? `Farbaek drew ${drawnWords(lots, lines, roads, symbols)} from your field sketch.` : `Your plan has ${drawnWords(lots, lines, roads, symbols)}.`}{lots > 0 ? "" : " The lot isn't drawn yet."}{" "}
          {waiting > 0 ? `${waiting} ${waiting === 1 ? "thing waits" : "things wait"} for you to check on the plan.` : "Look it over on the plan."}
          {lots === 0 && sketchRead ? " A clearer photo of the sketch, taken flat and close up, often lets Farbaek close it; or give its corners on the Lots step." : ""}
        </p>
        <div className="mt-4">
          <Link href={`${base}?step=plan`} className={buttonClasses("primary", "md", "w-full sm:w-auto")}>
            Check the plan
            <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </Link>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <CardTitle icon={CameraIcon}>{sketchRead ? "Add a clearer photo of your sketch" : "Add a photo of your field sketch"}</CardTitle>
      <p className="mt-1 text-sm text-ink-2">
        {sketchRead
          ? "Your sketch was read, but nothing on it could be drawn. A clearer photo, taken flat and close up in good light, lets Farbaek draw the lot, walls and road from it."
          : codeless
            ? "Your points carry no codes, so they don't say which points make the lot. Your field sketch does: add a photo of it below, and Farbaek draws the lot, walls and road from it."
            : "Farbaek draws the lot, walls and road from your field sketch: add a photo of it below."}
      </p>
    </Card>
  );
}
