# ADR 0181: Every press answers, and the hard-to-undo ones ask first

- **Status:** accepted
- **Date:** 2026-11-08
- **Stage:** 169

## Context

The stage 169 audit found eleven controls whose server action returned nothing on failure: revoke a computer, revoke an invitation, remove a domain, remove a skill, disconnect a hosting account, withdraw a handoff, close a support request, take a site offline, make an older version live, and "Fix with the agent". A refusal (a role, a paused workspace, a stale revision, a database rule) re-rendered the page unchanged, so the person pressed again, or gave up. Four of them also changed what visitors or teammates see in one click: a live site offline, an older version live, a domain gone, a paired computer cut off.

The repo already had the right shape in two places: `DeleteFile` and `ArchiveProject` ask first, show the result, and keep the trigger visible but off with a reason. It wasn't shared.

## Decision

1. **A server action never returns `void`.** Every action a form can call answers `{ status: "done" | "error", message }`, or redirects with a key the page turns into a notice. The message is the use case's own (`WriteResult.message`), never a generic line when a specific one exists.
2. **One control for the pattern.** `ConfirmAction` (`src/components/ui/confirm-action.tsx`) takes the action, its hidden fields, the trigger, the question and the two labels. One press shows the question and the real button; the result is said beside it; `disabledReason` keeps the trigger visible but off. Danger tone for anything that removes or cuts off; plain tone for the rest.
3. **Which presses ask first:** anything that changes what visitors see at once (offline, an older version live, a domain removed), anything that cuts a person or a computer off (revoke), and anything that removes a file people rely on (a skill). Withdrawing a handoff and closing a support request ask too, cheaply, because they used to go silent; the question is one line.
4. **Operator-only reasons never reach the screen.** "Supabase isn't connected", "needs the server key (SUPABASE_SECRET_KEY)" and "the server isn't configured for writes" are one sentence a person can act on: "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com." The real reason stays in the server's log and the staff console.

## Consequences

- A stale page can't swallow a refusal: the person reads why, and what to do.
- One-click destruction is gone from the signed-in app. The cost is one extra press on seven controls, each of which used to be a surprise.
- New actions follow the same shape; a `void` server action in `src/app/app/**/actions.ts` is a review finding.
