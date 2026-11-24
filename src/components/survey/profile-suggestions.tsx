"use client";

import { CheckCircleIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { answerProfileSuggestionAction, type ProfileState } from "@/app/app/survey/actions";
import type { Suggestion } from "@/core/survey/learning";
import { buttonClasses } from "@/components/ui/button";

/**
 * What the surveyor's recent plans suggest for one office profile (stage 270, ADR 0277): each in a sentence, with the plans it came
 * from, added only when they press Add, or turned down so it isn't offered again. Each answer is a new version of the profile.
 */
export function ProfileSuggestions({ profileId, version, suggestions, disabledReason }: { profileId: string; version: number; suggestions: Suggestion[]; disabledReason: string | null }) {
  const router = useRouter();
  const [result, setResult] = useState<ProfileState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const answer = (key: string, accept: boolean) =>
    startTransition(async () => {
      const r = await answerProfileSuggestionAction({ profileId, baseVersion: version, key, accept }).catch((): ProfileState => ({ status: "error", message: "The connection dropped. Nothing was saved. Try again." }));
      setResult(r);
      if (r.status === "done") router.refresh();
    });
  if (suggestions.length === 0 && result.status === "idle") return null;
  return (
    <div className="grid gap-3 rounded-md border border-line p-3 sm:p-4">
      <div>
        <p className="text-label font-medium text-ink">Learned from your plans</p>
        <p className="text-sm text-ink-3">Nothing changes until you add it. Each answer saves a new version of the profile.</p>
      </div>
      <ul className="grid gap-3">
        {suggestions.map((s) => (
          <li key={s.key} className="grid gap-2">
            <p className="text-sm text-ink">{s.sentence}</p>
            <p className="text-xs text-ink-3">From {s.from.join(", ")}.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={Boolean(disabledReason) || pending} onClick={() => answer(s.key, true)} className={buttonClasses("secondary", "sm")}>
                <PlusIcon size={16} weight="bold" aria-hidden /> Add to the profile
              </button>
              <button type="button" disabled={Boolean(disabledReason) || pending} onClick={() => answer(s.key, false)} className={buttonClasses("ghost", "sm")}>
                Not for this profile
              </button>
            </div>
          </li>
        ))}
      </ul>
      {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      {result.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
          {result.message}
        </p>
      ) : result.status === "done" ? (
        <p role="status" className="flex items-start gap-2 text-sm text-verified">
          <CheckCircleIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
