"use client";

import { CheckCircleIcon, FloppyDiskIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import {
  acceptGuestInvitationAction,
  guestCreateTaskAction,
  guestSaveFileAction,
  type AcceptGuestState,
  type GuestFileState,
  type GuestTaskState,
} from "@/app/shared/actions";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";

function ErrorLine({ message, id }: { message: string; id?: string }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-2 text-sm text-failed">
      <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

function DoneLine({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 text-sm text-verified">
      <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const IDLE_ACCEPT: AcceptGuestState = { status: "idle" };

/** Joins one project. The server checks the invitation, the signed-in address and the seats again. */
export function AcceptGuestInvitationForm({ token, projectName }: { token: string; projectName: string }) {
  const [state, action, pending] = useActionState(acceptGuestInvitationAction, IDLE_ACCEPT);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {state.status === "error" ? <ErrorLine message={state.message} /> : null}
      <div>
        <button type="submit" disabled={pending} className={buttonClasses("primary")}>
          {pending ? "Opening…" : `Open ${projectName}`}
        </button>
      </div>
    </form>
  );
}

const IDLE_TASK: GuestTaskState = { status: "idle" };

/** Adds a task for the workspace's people to plan. */
export function GuestTaskForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(guestCreateTaskAction, IDLE_TASK);
  const id = useId();
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor={id} className={LABEL_CLASSES}>
        What should change?
      </label>
      <input id={id} name="title" required maxLength={200} placeholder="Add opening hours to the footer" className={inputClasses()} />
      {state.status === "error" ? <ErrorLine message={state.message} /> : null}
      {state.status === "created" ? <DoneLine>Added. The workspace&apos;s people plan it and decide what changes.</DoneLine> : null}
      <div>
        <button type="submit" disabled={pending} className={buttonClasses("secondary", "sm")}>
          <PlusIcon size={16} weight="bold" aria-hidden /> {pending ? "Adding…" : "Add task"}
        </button>
      </div>
    </form>
  );
}

const IDLE_FILE: GuestFileState = { status: "idle" };

/**
 * Edits one text file, or makes a new one when `revision` is 0. Saving
 * writes a new revision under the guest's name; the history keeps the old one.
 */
export function GuestFileEditor({ projectId, path, content, revision }: { projectId: string; path: string | null; content: string; revision: number }) {
  const [state, action, pending] = useActionState(guestSaveFileAction, IDLE_FILE);
  const [text, setText] = useState(content);
  const pathId = useId();
  const textId = useId();
  const saved = state.status === "saved";
  const expected = saved ? state.revision : revision;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="expectedRevision" value={expected} />
      {path === null ? <input type="hidden" name="isNew" value="1" /> : null}
      {path === null ? (
        <div className="grid gap-2">
          <label htmlFor={pathId} className={LABEL_CLASSES}>
            File path
          </label>
          <input id={pathId} name="path" required maxLength={300} placeholder="docs/notes.md" className={inputClasses("font-mono")} spellCheck={false} autoCapitalize="off" />
        </div>
      ) : (
        <input type="hidden" name="path" value={path} />
      )}
      <label htmlFor={textId} className={path === null ? LABEL_CLASSES : "sr-only"}>
        {path === null ? "Text" : `Text of ${path}`}
      </label>
      <textarea
        id={textId}
        name="content"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={22}
        spellCheck={false}
        autoCapitalize="off"
        className={inputClasses("min-h-[50dvh] resize-y font-mono text-sm leading-relaxed")}
      />
      {state.status === "error" ? <ErrorLine message={state.message} /> : null}
      {saved ? (
        <DoneLine>
          Saved as revision {state.revision}.{" "}
          {path === null ? (
            <Link href={`/shared/${projectId}/file?path=${encodeURIComponent(state.path)}`} className="font-medium underline underline-offset-2">
              Open the file
            </Link>
          ) : null}
        </DoneLine>
      ) : null}
      <div>
        <button type="submit" disabled={pending || (path !== null && text === content && !saved)} className={buttonClasses("primary", "sm")}>
          <FloppyDiskIcon size={16} weight="bold" aria-hidden /> {pending ? "Saving…" : path === null ? "Create file" : "Save"}
        </button>
      </div>
    </form>
  );
}
