"use client";

import { CheckCircleIcon, DownloadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import { importSkillAction, type SkillState } from "@/app/app/projects/[projectId]/skill-actions";
import { buttonClasses } from "@/components/ui/button";
import { AddSkillForm } from "./add-skill-form";
import { LibraryRow, type LibraryCardSkill } from "./skill-library";

const IDLE: SkillState = { status: "idle" };

const WAYS = [
  { id: "library", label: "Library" },
  { id: "link", label: "GitHub" },
  { id: "write", label: "Write one" },
] as const;
type Way = (typeof WAYS)[number]["id"];

/** A skill from a GitHub link (ADR 0179): it arrives for review, like any skill from outside. */
function ImportSkillForm({ projectId, disabledReason }: { projectId: string; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(importSkillAction, IDLE);
  // Kept by hand: a form action clears its fields, and a link that failed is the one worth fixing, not retyping.
  const [link, setLink] = useState("");
  const inputId = useId();
  const helpId = useId();
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor={inputId} className="grid gap-1.5">
        <span className="text-[0.8125rem] font-medium text-ink-3">Link to a skill on GitHub</span>
        <input
          id={inputId}
          name="link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          type="url"
          inputMode="url"
          required
          placeholder="https://github.com/anthropics/skills/tree/main/skills/frontend-design"
          aria-describedby={helpId}
          disabled={Boolean(disabledReason) || pending}
          className="h-11 min-w-0 rounded-sm border border-line bg-surface px-3.5 text-base text-ink outline-none placeholder:text-ink-3 focus:border-accent/60"
        />
      </label>
      <p id={helpId} className="text-xs leading-relaxed text-ink-3">
        Link to its SKILL.md or the folder it&apos;s in. Its licence comes too, if it has one. It waits for you to read and approve it before any build uses it.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary", "sm")}>
          <DownloadSimpleIcon size={16} weight="bold" aria-hidden /> {pending ? "Bringing it in…" : "Bring it in"}
        </button>
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

/**
 * The three ways to give a project a skill (ADR 0179): one step from Farbaek's library, a GitHub link, or
 * writing one. The library comes first because most people want a proven skill, not a blank page.
 */
export function AddSkills({
  projectId,
  library,
  added,
  used,
  max,
  disabledReason,
}: {
  projectId: string;
  library: LibraryCardSkill[];
  /** Library skills this project already has. */
  added: string[];
  used: number;
  max: number;
  disabledReason: string | null;
}) {
  const [way, setWay] = useState<Way>("library");
  const full = used >= max;
  const fullNote = full ? `This project has ${max} skills, the most a build uses. Remove one to add another; you can still update one you have.` : null;
  // A full project can't take another library skill, but its own skills can still be updated by writing them again.
  const reason = disabledReason ?? fullNote;
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="text-[0.9375rem] font-medium">Add a skill</h3>
        <p className="text-sm text-ink-3">
          A project can keep up to {max} skills, and this one has {used}.
        </p>
      </div>
      <div role="group" aria-label="Where the skill comes from" className="grid grid-cols-3 gap-1 rounded-full border border-line bg-surface-sunken p-1 sm:inline-flex sm:w-fit">
        {WAYS.map((w) => (
          <button
            key={w.id}
            type="button"
            aria-pressed={way === w.id}
            onClick={() => setWay(w.id)}
            className={`min-h-11 whitespace-nowrap rounded-full px-2 text-sm font-medium transition-colors duration-150 sm:px-4 ${way === w.id ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}
          >
            {w.label}
          </button>
        ))}
      </div>
      {reason ? <p className="text-sm text-ink-3">{reason}</p> : null}
      {way === "library" ? (
        <div className="grid gap-3">
          <p className="text-sm leading-relaxed text-ink-2">
            Proven design skills from people who share them openly. Each one is shortened to fit a build, and says who made it and under which licence.
          </p>
          <ul className="grid gap-2">
            {library.map((s) => (
              <LibraryRow key={s.id} skill={s} projectId={projectId} added={added.includes(s.id)} disabledReason={added.includes(s.id) ? disabledReason : reason} />
            ))}
          </ul>
        </div>
      ) : way === "link" ? (
        <ImportSkillForm projectId={projectId} disabledReason={disabledReason} />
      ) : (
        <AddSkillForm projectId={projectId} disabledReason={disabledReason} quietReason />
      )}
    </div>
  );
}
