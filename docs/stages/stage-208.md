# Stage 208, part 1: the rules for an agent that acts on a person's computer

- **Date:** 2026-11-21
- **Branch:** `feat/stage-207-chat-memory` (on top of stage 207)
- **Decision:** ADR 0225
- **Migration:** none. **New dependency:** none.

## What the owner asked

The brief for stages 206 to 208 ends with the AI's brain connected to the desktop agent: a request in Chat carried out on the person's computer, inside permission boundaries, with nothing claimed that wasn't done. After stage 206's report listed it as not done, the owner asked for everything left to be finished in the same session.

## What was decided, and why it isn't the whole thing

Giving a model hands on someone's computer is the most dangerous thing Farbaek could build, and the published record of what has gone wrong elsewhere (below) is long. So this stage does not ship anything that can act. It ships what must exist, and be reviewed, before anything can:

- **A threat model** (ADR 0225): twelve things that can go wrong, what stops each, and where that is enforced.
- **The tools of the first slice** (`src/core/agent/computer/tools.ts`): a browser window the agent owns, with none of the person's logins, and files inside folders the person chose. Twelve tools, each with a schema. There is no tool for the screen, the mouse, the keyboard in other apps, a terminal or a download: a tool that doesn't exist can't be called.
- **The policy** (`src/core/agent/computer/policy.ts`): for every call, allow, ask the person, or refuse, with the reason in plain words. It reads the call and facts the runtime reports. It never reads what a page, a file or the model says should be allowed.
- **The approval binding**: what a person approves is tied to the exact call, the risk they were asked about, and everything they were shown, so a page that changes afterwards breaks the approval.
- **The instructions for the model** (`prompt.ts`), which help and are never the boundary.

Nothing calls any of it. Chat's own list of what the computer side can do (`COMPUTER_CAPABILITIES`) is unchanged, a test holds it there, and Chat still tells people plainly that it can't act on their computer.

## The rules, in short

- Reading the agent's own window, going back and finishing: allowed.
- Opening a site: asks once per site in a task. A site is its name and whether it is https or http. Never this computer, a private network, an address written as a number, a port, credentials, or anything that isn't the web.
- A plain link to another page of an approved site: allowed, by loading its screened address (the link is never pressed). Once anything has been typed or pressed on a site, its links ask too.
- Every other press: asks. Words such as pay, delete, send or log out mark it as consequential; no words make it less careful.
- Typing: always asks, with the exact text, and says that typing is sending. Password, card, code and identity fields, file pickers and hidden fields: refused. A secret in the text: refused.
- Acting on a page of a site that wasn't approved (a redirect took the window there): refused until the site is opened by name.
- Files: only inside the chosen folders, every change asked for. Plain text files can be written; documents and pictures can be opened; anything can be shown in its folder, which runs nothing. Removing means the recycle bin. A move can't change a file's ending. Hidden folders, a program's own folder, a chosen folder itself and whatever holds one: refused.

## A fresh review, and what it found

Before this record was written, a reviewer that hadn't written the code read stages 207 and 208 as an attacker would. Every check had passed before it started. It found real faults in both.

**In the computer policy (twelve, all fixed, each with a test in `computer.test.ts`):** a separator after a file name hid a program from the check; programs were a list of what isn't allowed, which always misses something (now short lists of what is); renaming could make a program; a link to the page it is on was followed as a plain link though it is a button; a site was only its name, so https approved http; only the first 200 characters of a label were read and bound; an allowed link was pressed rather than loaded; signing out, emptying and cancelling weren't consequential words; off Windows a backslash was read as a separator, on Windows every letter was folded, and a chosen folder nested in another could be removed through its parent; the autocomplete hint was compared whole, field names weren't read, and file pickers and hidden fields could be typed into; a broken character in a label made the approval impossible to compute; and the reason shown for typing didn't say that typing is sending.

None of these was reachable, because nothing calls the policy. That is the reason for building it first.

**In stage 207 (seven, all fixed, in `docs/stages/stage-207.md` and ADR 0224):** the most serious were a pressed choice being saved as the person's own words, remembered lines being sent with the instructions, and a settings action that a single request could tie up for minutes.

## What was read first

Read on 2026-11-20 and 2026-11-21. The ADR says what each one changed in the design.

- Johann Rehberger: "ZombAIs" (2024-10-24, a page had an agent download and run a program); the ChatGPT Operator exploits (2025-02-17, typing into a form that captured keystrokes, with nothing submitted); "AI ClickFix" (2025-05-24).
- Brave: indirect prompt injection in Perplexity Comet (2025-08-20) and "unseeable" injections in screenshots (2025-10-21). LayerX: "CometJacking" (2025-10-04). Zenity: "PerplexedBrowser" (2026-03-05).
- arXiv 2411.02391 (agents pressed hostile pop-ups 86% of the time; telling them not to didn't help) and arXiv 2510.09023, "The Attacker Moves Second" (adaptive attacks against twelve published defences).
- Benchmarks: AgentDojo, InjecAgent, WASP, VPI-Bench.
- Designs: Meta's "Agents Rule of Two" (2025-10-31); CaMeL (arXiv 2503.18813); OWASP LLM01:2025 (prompt injection) and LLM06:2025 (excessive agency).
- The model makers' own guidance: Anthropic's computer use and browser tool documents; OpenAI's computer tool guidance ("typing sensitive data into a form counts as transmission").
- Electron's security documents (deny permission requests, deny new windows, an in-memory session, cancel downloads). Electron 45.4.1 was one day old when read, so no upgrade is proposed.
- Input libraries for a later slice: `robotjs` 0.9.1 (MIT, revived August 2026); nut.js (prebuilt packages are paid); its community fork (no release in 20 months).
- Store rules: Microsoft Store policies 10.2, 10.5.1 and 10.5.2; Apple's guideline 2.5.14.

## Verified

- `src/core/agent/computer/computer.test.ts`, 35 tests: the tools are the first slice only and refuse anything else; which addresses may be opened and which never (23 that must be refused, including an address written as a number in each way a browser accepts); each rule above, with the ways around it that the review found; a page's words make a press more careful and never less; file paths by every spelling tried, on Windows and on a Mac; approvals change when the label, the page, a field's hints or the kind of risk changes, and survive a broken character; a label of a million characters is decided at once.
- A test holds Chat's list of what the computer side can do at "not available" for the browser, files, apps, screen, input and terminal.
- The type check, lint and the whole suite: at the end of this record.

## Not verified, and not built

- **Anything running.** No window, no file operation, no approval card, no log. The policy has only ever been called by its tests.
- **The rules against a real hostile page.** A review and unit tests are not a red team. The runtime needs one before any release.
- **Whether a person can follow the approvals** without learning to press yes. That needs the real card and real tasks.
- **The server side**: a gateway mode for a computer task, its lease and pinned tool names.
- Reading files, seeing the screen, and the mouse and keyboard in other apps are later slices, each with its own review (ADR 0225).

## What's next: the runtime for slice 1 (the owner's decision to start)

About the size of stage 206, with no new dependency (Electron's own window, session and shell). In order:

1. The agent's window in the desktop app: its own in-memory session, every permission request denied, new windows denied, downloads cancelled, navigation checked on every hop and the connected address checked against private ranges.
2. Reading a page as text with numbered controls from one snapshot (whole labels; a field's type, hint and name), and reporting the page's real address and the sites acted on.
3. The approval card in the main process, bound with `computerApprovalAction`, and an append-only log of every call, decision, approval and result.
4. File operations with paths resolved on disk and refused through links; the recycle bin; "show in folder" by the file manager's own select.
5. The gateway mode and lease on the server; Chat's hand-off to the desktop app; `COMPUTER_CAPABILITIES` changed in the same release.
6. A red-team pass with hostile pages before it is offered to anyone.

## Decisions for the owner

1. Whether to start that runtime. Recommended: yes, as its own stage, after stages 206 and 207 are live and checked.
2. The mouse and keyboard library, when that slice comes: decide then.
3. Store listings and the privacy policy need updating before any slice that sees the screen. Slice 1 touches neither.

## Checks at the end

See `docs/stages/stage-207.md`, "Checks at the end": the two stages were checked together on this branch.
