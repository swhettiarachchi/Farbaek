"use client";

import { ArrowRightIcon, CheckCircleIcon, ImageSquareIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { generateImageAction, type FormState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: FormState = { status: "idle" };

/** The shapes offered first; the server accepts these and a few more. */
const SHAPES = [
  { value: "16:9", label: "Wide", hint: "16:9" },
  { value: "4:3", label: "Landscape", hint: "4:3" },
  { value: "1:1", label: "Square", hint: "1:1" },
  { value: "4:5", label: "Portrait", hint: "4:5" },
  { value: "9:16", label: "Tall", hint: "9:16" },
] as const;

/**
 * Describes an image and has Gemini make it, straight into the project
 * (ADR 0109). It counts toward the workspace's AI usage; nothing counts when
 * no image is saved.
 */
export function GenerateImage({ projectId, disabledReason }: { projectId: string; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(generateImageAction, IDLE);
  const prev = state.status === "error" ? state.values : undefined;
  const [shape, setShape] = useState(prev?.aspectRatio ?? "16:9");
  const off = Boolean(disabledReason) || pending;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Describe the image</span>
        <textarea
          name="prompt"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          defaultValue={prev?.prompt ?? ""}
          disabled={off}
          placeholder="A warm bakery storefront at dawn, soft light, fresh bread in the window"
          className="min-h-24 rounded-sm border border-line-strong/60 bg-surface px-3.5 py-2.5 text-base shadow-e1 focus:border-accent"
        />
      </label>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Shape</legend>
        <input type="hidden" name="aspectRatio" value={shape} />
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Shape">
          {SHAPES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={shape === s.value}
              disabled={off}
              onClick={() => setShape(s.value)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${shape === s.value ? "border-accent bg-accent/[0.08] text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`}
            >
              {s.label} <span className="font-mono text-xs text-ink-3">{s.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Name in the project</span>
        <input
          name="name"
          required
          maxLength={300}
          defaultValue={prev?.name ?? "assets/hero"}
          disabled={off}
          className="h-11 rounded-sm border border-line-strong/60 bg-surface px-3.5 font-mono text-base shadow-e1 focus:border-accent sm:text-sm"
        />
        <span className="text-xs text-ink-3">The extension follows the image Google sends. A name that&apos;s taken gets a number.</span>
      </label>

      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={18} weight="bold" className="mt-px shrink-0" aria-hidden /> {state.message}
        </p>
      ) : state.status === "done" ? (
        <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-verified">
          <CheckCircleIcon size={18} weight="fill" className="shrink-0" aria-hidden />
          {state.path ? (
            <>
              <span>
                Saved as <span className="font-mono text-[0.8125rem]">{state.path}</span>.
              </span>
              <Link href={`/app/projects/${projectId}/files?path=${encodeURIComponent(state.path)}`} className="inline-flex min-h-11 items-center gap-1 font-medium text-accent hover:underline">
                Open it <ArrowRightIcon size={14} aria-hidden />
              </Link>
            </>
          ) : (
            state.message
          )}
        </p>
      ) : null}
      {disabledReason ? <p className="text-xs text-ink-3">{disabledReason}</p> : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={off} className={buttonClasses("primary", "sm")}>
          <ImageSquareIcon size={16} aria-hidden /> {pending ? "Making the image…" : "Generate image"}
        </button>
        <p className="text-xs text-ink-3">Counts toward your AI usage. Images carry Google&apos;s SynthID watermark.</p>
      </div>
    </form>
  );
}
