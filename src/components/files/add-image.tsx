"use client";

import { CheckCircleIcon, ImageIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useEffect, useRef, useState } from "react";
import { addImageAction, type FormState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { IMAGE_ACCEPT, imagePathFor } from "@/core/workspace/images";

const IDLE: FormState = { status: "idle" };

/**
 * Adds an image to the project, or replaces one (ADR 0108). Shows the picture
 * before it's saved; the server checks the bytes are the kind the name says.
 */
export function AddImage({ projectId, replacePath, disabledReason }: { projectId: string; replacePath?: string; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(addImageAction, IDLE);
  const [preview, setPreview] = useState<string | null>(null);
  const [path, setPath] = useState(replacePath ?? "");
  const named = useRef(Boolean(replacePath));

  // The picture's object URL is released when it's replaced or the form goes away.
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const pick = (file: File | undefined) => {
    setPreview(file ? URL.createObjectURL(file) : null);
    if (file && !named.current) setPath(imagePathFor(file.name));
  };

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      {replacePath ? <input type="hidden" name="replace" value="1" /> : null}
      <label className="group relative grid min-h-36 cursor-pointer place-items-center overflow-hidden rounded-md border border-dashed border-line-strong/70 bg-canvas-2 p-4 text-center transition-colors hover:border-accent/60 focus-within:border-accent">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, shown before it's uploaded
          <img src={preview} alt="The chosen image" className="max-h-48 max-w-full rounded-sm object-contain shadow-e1" />
        ) : (
          <span className="grid justify-items-center gap-2 text-sm text-ink-2">
            <span className="flex size-11 items-center justify-center rounded-full bg-surface text-ink-2 shadow-e1 ring-1 ring-line">
              <ImageIcon size={24} aria-hidden />
            </span>
            <span className="font-medium text-ink">{replacePath ? "Choose the new image" : "Choose an image"}</span>
            <span className="text-xs text-ink-3">PNG, JPEG, GIF, WebP, AVIF or icon, up to 2 MB</span>
          </span>
        )}
        <input
          type="file"
          name="image"
          accept={IMAGE_ACCEPT}
          required
          disabled={Boolean(disabledReason) || pending}
          onChange={(e) => pick(e.target.files?.[0])}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={replacePath ? "The new image" : "The image to add"}
        />
      </label>

      {replacePath ? (
        <input type="hidden" name="path" value={replacePath} />
      ) : (
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Name in the project</span>
          <input
            name="path"
            value={path}
            onChange={(e) => {
              named.current = true;
              setPath(e.target.value);
            }}
            placeholder="assets/photo.jpg"
            maxLength={300}
            required
            disabled={Boolean(disabledReason) || pending}
            className="h-11 rounded-sm border border-line-strong/60 bg-surface px-3.5 font-mono text-base shadow-e1 focus:border-accent sm:text-sm"
          />
          <span className="text-xs text-ink-3">Use it in a page by its path.</span>
        </label>
      )}

      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {state.message}
        </p>
      ) : state.status === "done" ? (
        <p role="status" className="flex items-start gap-2 text-sm text-verified">
          <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden /> {state.message}
        </p>
      ) : null}
      {disabledReason ? <p className="text-xs text-ink-3">{disabledReason}</p> : null}

      <div>
        <button type="submit" disabled={Boolean(disabledReason) || pending} className={buttonClasses("primary", "sm")}>
          {pending ? "Saving…" : replacePath ? "Replace image" : "Add image"}
        </button>
      </div>
    </form>
  );
}
