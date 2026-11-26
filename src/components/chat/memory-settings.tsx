"use client";

/**
 * Memory, in Chat's settings (stage 207, ADR 0224): everything the person asked Farbaek AI to remember, in their own words.
 * They can add something here, forget any one of them, forget everything, and switch memory off. Nothing is ever worked out
 * about a person and added on its own: the list only holds what they said to remember.
 */
import { WarningCircleIcon } from "@/components/icons";
import { useEffect, useState, useTransition } from "react";
import { forgetAllMemoriesAction, forgetMemoryAction, listMemoriesAction, rememberAction } from "@/app/app/chat/actions";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmAction, type ActionState } from "@/components/ui/confirm-action";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { MEMORY_LIMITS } from "@/core/chat/memory";
import { setChatPrefs, useChatPrefs } from "./prefs";

interface Remembered {
  id: string;
  content: string;
}

export function MemorySettings() {
  const { useMemory } = useChatPrefs();
  const [items, setItems] = useState<Remembered[] | null>(null);
  // The list couldn't be read: said so, and never shown as an empty list.
  const [unread, setUnread] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();

  // Read once when the settings open. The answer arrives later, so the state is set from the reply, never in the effect itself.
  useEffect(() => {
    let live = true;
    void listMemoriesAction().then((r) => {
      if (!live) return;
      if (r.ok) setItems(r.value);
      else {
        setItems([]);
        setUnread(true);
        setProblem(r.message);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const apply = (result: Awaited<ReturnType<typeof rememberAction>>) => {
    if (result.ok) {
      setItems(result.value);
      setUnread(false);
      setProblem(null);
    } else setProblem(result.message);
    return result.ok;
  };
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    start(async () => {
      if (apply(await rememberAction(text))) setDraft("");
    });
  };
  const forget = (id: string) => start(async () => void apply(await forgetMemoryAction(id)));
  const forgetAll = async (): Promise<ActionState> => {
    const result = await forgetAllMemoriesAction();
    if (result.status === "done") {
      setItems([]);
      setUnread(false);
    }
    return result;
  };

  const count = items?.length ?? 0;
  return (
    <section aria-labelledby="chat-set-memory">
      <h3 id="chat-set-memory" className={LABEL_CLASSES}>
        Memory
      </h3>
      <label className="mt-2 flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={useMemory} onChange={(e) => setChatPrefs({ useMemory: e.target.checked })} className="mt-1 size-4 accent-[var(--accent)]" />
        <span className="text-sm">
          Remember what I ask Farbaek AI to remember
          <span className="block text-xs text-ink-3">
            Say &ldquo;remember that &hellip;&rdquo; in a chat, or add it here. Only what you ask for is kept, in your own words, and used in your chats in this workspace. Switched off, nothing is used or
            saved in this browser.
          </span>
        </span>
      </label>

      {items === null ? (
        <p className="mt-3 text-sm text-ink-3" role="status">
          Reading what&apos;s remembered
        </p>
      ) : unread ? (
        <p className="mt-3 text-sm text-ink-3">The list isn&apos;t available. Anything remembered is still kept.</p>
      ) : count === 0 ? (
        <p className="mt-3 text-sm text-ink-3">Nothing is remembered yet.</p>
      ) : (
        <ul className="mt-3 grid gap-1 rounded-md border border-line bg-surface p-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-2 rounded-sm py-1 pl-2.5 pr-1">
              <span className="min-w-0 py-2 text-sm leading-snug text-ink [overflow-wrap:anywhere]">{item.content}</span>
              <button type="button" onClick={() => forget(item.id)} disabled={pending} aria-label={`Forget: ${item.content}`} className="tap inline-flex min-h-10 shrink-0 items-center rounded-full px-3 text-sm font-medium text-ink-2 hover:bg-surface-raised hover:text-ink disabled:opacity-50 pointer-coarse:min-h-11">
                Forget
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="chat-memory-add" className="block text-sm">
            Add something to remember
          </label>
          <input id="chat-memory-add" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MEMORY_LIMITS.item} placeholder="I'm vegetarian and I live in Kandy" className={`${inputClasses()} mt-1`} autoComplete="off" />
        </div>
        <button type="submit" disabled={pending || draft.trim().length < 3 || count >= MEMORY_LIMITS.items} className={buttonClasses("secondary", "md")}>
          {pending ? "Saving" : "Remember"}
        </button>
      </form>
      {count >= MEMORY_LIMITS.items ? <p className="mt-1 text-xs text-ink-3">{MEMORY_LIMITS.items} things are remembered, which is the most. Forget one to add another.</p> : null}
      {problem ? (
        <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-ink-2">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>{problem}</span>
        </p>
      ) : null}

      {count > 0 ? (
        <ConfirmAction
          action={forgetAll}
          fields={{}}
          trigger="Forget everything"
          triggerVariant="ghost"
          question={`Forget all ${count === 1 ? "of it" : `${count} things`}? This can't be undone.`}
          confirmLabel="Forget everything"
          pendingLabel="Forgetting"
          className="mt-3"
        />
      ) : null}
      <p className="mt-2 text-xs leading-relaxed text-ink-3">What&apos;s remembered goes to the AI model with your messages, to answer you. It&apos;s in your data download, and it goes when you delete it or leave the workspace.</p>
    </section>
  );
}
