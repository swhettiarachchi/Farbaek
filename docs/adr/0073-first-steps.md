# ADR 0073: First steps on Mission Control

- Status: accepted (2026-10-25).
- Replaces Mission Control's "Your first verified change" checklist from Stage 1.
- Spec Stage 1: "the onboarding checklist from real events".

## Context

Mission Control had a five-item checklist from Stage 1: create a workspace, create a project, describe a task, approve an intent contract, get a verified ProofPack. It followed the flow before prompt-first builds (ADR 0027) and publishing (ADR 0029). It read only the five newest ProofPacks, so an older verified one went unseen, and it sat at the bottom of the page, under the stats, where a new person never looked.

## Decision

**The steps are Farbaek's loop:** describe what to build, approve the plan, review and apply the change, get it verified, publish your site. `src/core/workspace/first-steps.ts` decides each one from records only:
- a task exists;
- a task has passed plan approval (rejected and cancelled tasks prove nothing, since they may have ended before it);
- a ProofPack exists, or a task is in a state after applying;
- a verified ProofPack exists, or a task is `VERIFIED`;
- a site is live and not blocked.

The loop runs in order, so the furthest step reached marks every one before it.

**Exactly one step is "next".** It opens below the track with one action that goes to the right place: the plan card for a drafted plan, the change waiting for approval, the task whose change isn't verified yet, or the publish panel of the verified project. While nothing has been described, the build box itself sits in that step.

**Steps this server can't offer** (no verified sandbox, no site domain) show a lock and the reason. They don't block the steps after them, and they don't keep the steps open.

**Placement.** The steps go at the top of Mission Control, under the build box, as a double-bezel panel. When every step that can happen here is done, the panel goes away.

**Hiding.** "Hide" puts the steps away for that workspace on this browser, in the `fb_steps` cookie (workspace ids only, at most 20). It's listed in the Privacy Policy. A quiet line at the bottom of Mission Control brings them back.

## Consequences

- One more read per Mission Control view: three single-row queries (the newest ProofPack, the newest verified one, a live site), all under RLS.
- A person who never publishes, for example because they build an app rather than a static site, can hide the steps. Nothing nags.
- The demo workspace has no ProofPacks or sites, so its steps come from task states alone.
