"use client";

import { CheckCircleIcon, PlusIcon, UploadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { addSkillAction, type SkillState } from "@/app/app/projects/[projectId]/skill-actions";
import { buttonClasses } from "@/components/ui/button";
import { LABEL_CLASSES, textareaClasses } from "@/components/ui/field";

const IDLE: SkillState = { status: "idle" };

const EXAMPLE = `---
name: house-style
description: How our brand looks and sounds.
---
- Colours: deep teal #0E4F57 with warm sand #E9D8B4; one accent only.
- Type: a confident geometric sans for headings, a readable sans for text.
- Voice: warm, direct, no jargon. Short sentences.
- Always show opening hours and the phone number in the footer.`;

/** Paste or upload a SKILL.md; the server checks it again and saves it as a project file. */
export function AddSkillForm({ projectId, disabledReason, quietReason = false }: { projectId: string; disabledReason: string | null; quietReason?: boolean }) {
  const [state, action, pending] = useActionState(addSkillAction, IDLE);
  const [content, setContent] = useState("");
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="grid gap-1.5">
        <span className={LABEL_CLASSES}>SKILL.md</span>
        <textarea
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder={EXAMPLE}
          disabled={Boolean(disabledReason) || pending}
          className={textareaClasses("font-mono")}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason) || !content.trim()} className={buttonClasses("primary", "sm")}>
          <PlusIcon size={16} weight="bold" aria-hidden /> {pending ? "Saving…" : "Add skill"}
        </button>
        <label className={`${buttonClasses("secondary", "sm")} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-accent`}>
          <UploadSimpleIcon size={16} weight="bold" aria-hidden /> Load a .md file
          <input
            type="file"
            accept=".md,text/markdown,text/plain"
            className="sr-only"
            disabled={Boolean(disabledReason) || pending}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file && file.size < 64 * 1024) setContent(await file.text());
            }}
          />
        </label>
        {/* Said once above the choices when this sits in Add a skill. */}
        {disabledReason && !quietReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : state.status === "done" ? (
        <p role="status" className="flex items-start gap-2 text-sm text-verified">
          <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </form>
  );
}
