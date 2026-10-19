# 0027. Prompt-first builds, talking to a running agent, and instant static previews

- Status: accepted
- Date: 2026-10-19

## Context

Research on the leading AI app builders (`reports/AI app builder user experience 2026.md`) found that they win the first hour and Farbaek wins week two. Farbaek already had what rivals lack: refunds for failed steps, hash-bound approvals, ProofPacks and scored security checks. It lacked what makes the first hour feel easy:
- one box where a sentence becomes a plan and then a running agent;
- the cost before and during a run;
- a preview beside the agent;
- a way to steer an agent while it works.

Before this, starting a build meant four pages: create a project, create a task, write or draft the intent contract, approve it, then start a run.

## Decision

### 1. One sentence to a plan card

`startFromPrompt` (`src/server/workspace/start-from-prompt.ts`) chains the use cases a person would otherwise use by hand, through the same rules each one enforces:
1. creates the project from a fitting starter and imports the starter's files;
2. creates the task;
3. drafts the intent contract with AI and saves it as version 1.

**Who and where.** Someone without a workspace gets "My workspace" first; the database applies the email and one-trial rules. The prompt is kept in `localStorage` while they sign in, never in a URL.

**When a step fails.** The result is honest about partial success. If the AI can't draft (not connected, no usage left, a provider failure), the project and task still exist and the plan card says the plan needs writing by hand.

**The plan card** (`/app/new/[taskId]`) shows the plan in plain language:
- what will change and what stays untouched;
- how it will be checked and what happens if something goes wrong;
- open questions;
- an estimated share of the period's usage.

**Its actions:**
- **Approve and build** calls the existing hash-bound `approveContract`, then `startCloudRun`.
- **Edit the plan** opens the full contract editor.
- **Cancel task** cancels it, with a confirmation.

**Follow-ups** ("Keep going" on a finished run, and the project page) name their project:
- The project must be visible to the person in the current workspace and not archived.
- No new project or starter is created.
- The drafter gets the project's real paths (up to 300), so the plan's scope names files that exist. Without them, the drafter guessed folders, and the scope check would then have flagged edits to the real files.

### 2. Talking to a running agent

The person who started a run, or an owner or admin, can send it a message from the run page.

**How a message travels:**
- It queues in the in-process run registry, next to approvals (ADR 0022).
- It's recorded as a run note marked `from: "person"`.
- At the agent's next step, `takeMessages()` in the agent loop adds it to the pending tool results, framed as guidance.

**What a message can't do.** The framing tells the model a message can't widen the approved contract, and the Guard and scope checks still decide what may change. A message is guidance, not permission.

**Limits:**
- 1,000 characters a message, whitespace collapsed;
- 10 unread messages at a time.

**After the run.** Once the run has ended, sending is refused with the reason. A message that arrived after the agent's last step is followed by a note saying it wasn't used.

### 3. Usage in the open

- **Before a run:** the plan card estimates a range from the rate card and step profiles per effort. It's guidance only.
- **During and after:** the run page shows "Used so far", then "Used", as a share of the period's allowance. Both come from the run's own `ai_credit_ledger` rows (task, operation, and the run's time window), and refunded steps are counted.
- **No units on screen.** People see shares and dates, as on Billing.

### 4. Instant previews of static sites

A static site renders beside the run and on the project page without a preview domain.

**How the preview is built** (`src/core/workspace/static-preview.ts`):
- The page's linked styles and scripts are folded into one document, escaping `</style` and `</script`.
- It renders in `<iframe sandbox="allow-scripts" srcdoc>`. Without `allow-same-origin`, the frame has an opaque origin and can't reach Farbaek's cookies, storage or pages.
- A CSP meta tag sets `connect-src`, `frame-src` and `form-action` to `'none'` and `base-uri 'none'`. Images, fonts and media may load from `https:` and `data:`.
- Links to the site's own pages are sent to the parent with `postMessage`. The parent accepts them only from that frame's window, and only for paths in the project.

**What it shows:**
- While a run's change waits for review: Before and "With this change", the project with the proposal's files overlaid.
- Otherwise: the current project.
- Pages and three device widths can be chosen.

**What it doesn't cover:**
- Sites over 3 MB.
- Apps with a server. These preview in a sandbox through the preview gateway (ADR 0023), which needs the preview domain.

## Consequences

- One page now goes from a sentence to a running agent, a live preview and Review and apply. Every step still goes through the contract, the approval binding and the wallet.
- **Messages live in one server's memory.** They're lost if the server restarts mid-run, as approvals already are. That's acceptable with one Railway replica; more replicas need a shared queue (ADR 0022).
- **Messages reach the model provider** as part of the task, like the rest of the conversation.
- **Previews can load `https:` images and fonts.** Projects don't hold binary files, so image files referenced by path don't show yet. A generated page could make image requests to outside hosts. It can't read Farbaek data, but the site's own content could be sent in those requests.
- **A follow-up starts from the project as it is.** A finished run whose change isn't applied says so under Keep going.
