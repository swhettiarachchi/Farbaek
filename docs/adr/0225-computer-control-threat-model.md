# ADR 0225: Computer control: what could go wrong, what stops it, and what is built first

- **Status:** accepted for the policy core (stage 208, part 1, 2026-11-21), as changed by a fresh review the same day (last section). The runtime that would use it is proposed here and not built: it is the owner's decision to start it.
- **Builds on:** ADR 0018 (the agent runtime), ADR 0021 (the model gateway), ADR 0117 (leases), ADR 0133 (tool pins), ADR 0175 (nothing runs on a person's computer without them), ADR 0223 (Chat is honest about what the computer side can do)

## Context

The owner's picture of Farbaek ends in a desktop agent that controls the screen, mouse and keyboard, the file system, apps, a terminal and a browser. Today the desktop app does none of that outside a copy of a project (audited 2026-11-20): eight tools on the copy, every command approved on the computer, no way for Chat to send it a request.

Giving a model hands on someone's computer is the most dangerous thing Farbaek could build. What has gone wrong elsewhere, read before deciding (sources and dates in `docs/stages/stage-208.md`):

- A web page told an agent to download and run a program, and it did (Rehberger, October 2024).
- A page sent an agent to a signed-in settings page and had it type what it found into a form that captured keystrokes. The confirmation was on Submit; nothing was ever submitted (Rehberger, February 2025). **Typing is sending.**
- Hidden text on a page being summarised drove an agent into the person's other signed-in tabs (Brave, August 2025). Text invisible to people worked from a screenshot (Brave, October 2025).
- A link's own address carried instructions, and data left encoded in an address (LayerX, October 2025). A calendar invite had an agent read local files and send them out (Zenity, March 2026).
- Agents pressed hostile pop-ups 86% of the time, and telling them not to did not help (arXiv 2411.02391). Adaptive attacks got past twelve published defences (arXiv 2510.09023). Both model makers say prompt injection is not solved.

So nothing here trusts the model to refuse. The model is treated as something that will, sooner or later, do what a page says.

## What can go wrong, and what stops it

| What can go wrong | What stops it | Where it is enforced |
| --- | --- | --- |
| A page, file or screen tells the agent what to do | Its words never reach a decision: the policy reads the call and facts the runtime reports, never what content says should be allowed. A page's words can only add caution | The policy (`src/core/agent/computer/policy.ts`), in the desktop app's main process |
| The agent leaks the person's private data | In the first slice it has none to leak: a browser of its own with none of their logins, no reading of files, no sight of the screen (at most two of untrusted input, private data and a way out: Meta's "rule of two") | What tools exist (`tools.ts`): a tool that doesn't exist can't be called |
| It presses something that buys, sends, posts, deletes or agrees | Every press that isn't a plain link to another page of a site the person approved waits for them; words like "pay", "delete" or "log out" mark it consequential, a label too long to show whole is treated the same, and no words unmark it. A plain link is followed by loading its screened address, never by pressing it. Once anything has been typed or pressed on a site in the task, its links wait too (the window may be signed in by then) | The policy; the approval card |
| It types something it shouldn't | All typing waits for the person, who sees the exact text and the page, and is told that typing is sending. Password, card, code and identity fields are refused, whether the page says so in the field's type, its autocomplete hint, its name or its label; so are file pickers and hidden fields. The person does those themselves | The policy |
| It reaches this computer or the local network | Public sites by name only: no numbers, ports, credentials, local names or non-web schemes. A site is its name and whether it is https or http, so approving one never approves the unencrypted other. The runtime checks again where a name resolves to, after every redirect | The policy for the words; the runtime for the connection |
| The window is taken somewhere the person didn't approve (a redirect, a script) | The agent can only press or type on a page of an approved site. Anywhere else it must open the site by name, which asks | The policy; the runtime reports the page's real address |
| It downloads or runs a program | No download tool, downloads cancelled in the window. Only plain text files are written (`.txt`, `.md`, `.csv`, `.tsv`, `.log`) and only documents and pictures are opened, both from short lists of what is allowed rather than a list of what isn't. Renaming can't change a file's ending. Anything else can only be shown in the file manager, selected, which runs nothing. Nothing in a hidden folder (`.git`, `.ssh`) or inside a program's own folder is touched | The policy; the window's settings |
| It changes or removes the wrong files | Only inside folders the person chose for the task; each change asked for; removing means the recycle bin; a chosen folder, and anything that holds one, can't be moved or removed. A whole drive is never a chosen folder. The runtime checks what a path really is on disk | The policy for the words; the runtime for links and real paths |
| The page changes between the person looking and the action running | An approval is bound to the exact call, the kind of risk the person was asked about, the address the step goes to, and everything shown about its target, whole (the page's address, the control's kind, full label, target, and a field's type, hint and name). Anything different, and the approval no longer fits | `computerApprovalAction` with the existing approval binding |
| The person approves without reading | No "approve all", no unattended runs, a step limit and a time limit, a stop button. Approvals that never vary teach people to stop reading, so plain links inside an approved site don't ask | The runtime |
| It says it did something it didn't | The model is told to read the page again and report only what it saw; the report keeps "done" apart from "not done"; every action has a receipt the person can read | The prompt (a help, not a boundary) and the log |
| Farbaek's own server is the attacker's way in | The server never pushes work to a computer: the desktop app asks. A task starts on the computer, by the person. Tool definitions stay pinned (ADR 0133) | The gateway and the lease |

## Decision

**Build in slices, each useful alone, each adding one kind of power, and none without its own review.**

1. **A browser the agent owns, and files inside folders the person chose.** The policy and the tools for this are built and tested now. The runtime is not.
2. **Reading files in the chosen folders.** This gives the agent private data, so a task that reads files either has no browser, or asks for every navigation.
3. **Seeing the screen.** With the person's consent each time, a visible sign while it happens, and plain words that the picture goes to the AI model.
4. **Mouse and keyboard in other apps.** Last. It needs a native library (a decision for the owner, below) and the operating system's accessibility permission.

A general terminal outside a project copy is not a slice of its own: the existing command runner, with its approval for every command, can be pointed at a chosen folder when slice 1 is in use.

**What the runtime for slice 1 must do that words can't.** A window with its own in-memory session; every permission request denied; new windows denied; downloads cancelled; no page script run by the agent; navigation checked by a URL parser on every hop, and the connected address checked against private ranges (the page reader's address rules, ADR 0222, already do this); the page read as visible text with its controls numbered from one snapshot, each with its whole label and, for a field, its type, autocomplete hint and name; a step the policy gives an address for (`navigate`) done by loading that address, never by pressing the link; the sites acted on in the task reported to the policy (`actedOn`), including when the person types in the window themselves; the page's real address reported after every load; file paths resolved on disk and refused through links; "show in folder" done with the file manager's own select, never by opening the path; approvals asked and checked in the main process, never the page or the renderer; an append-only log of every call, decision, approval and result; 40 steps and 30 minutes at most; Stop always works.

**What the server needs.** A second mode of the model gateway for a computer task (today it only serves an approved Farbaek task), under a lease that names the capability, with the new tool names pinned, metered like any other step. No request travels from Chat to a computer until the desktop app that can run it has shipped: Chat's list (`COMPUTER_CAPABILITIES`) changes in the same release, not before.

## Decisions for the owner

1. **Whether to start the runtime for slice 1.** Recommended: yes, as its own stage, about the size of stage 206. It adds no dependency (Electron's own window, session and shell). It can be tested with stand-in models and by hand in the desktop app; a real run needs the gateway on production and a desktop release.
2. **Mouse and keyboard library, when slice 4 comes.** `robotjs` 0.9.1 (MIT, revived August 2026, still before 1.0) is the only free, maintained choice found; nut.js prebuilt packages are paid ($20 a month) and its community fork has had no release in 20 months. Recommended: decide then, not now.
3. **Store review.** Apple asks for explicit consent and a clear sign when the screen or inputs are recorded (guideline 2.5.14); Microsoft asks for opt-in consent before personal information goes to a third party (policy 10.5.2), which covers a screenshot sent to a model. Slice 1 touches neither. Slices 3 and 4 need the listings and privacy policy updated first.

## Consequences

- Slice 1 will feel slow: most steps wait for a press on the computer. That is the price of being the first thing Farbaek builds that can act outside a sandbox, and it can be loosened later with evidence, never tightened after an accident.
- The policy core is in the repository with no caller. It is there so the rules are reviewed and tested before any code can act on them, and it changes nothing a person can do today.

## Changed after a fresh review (2026-11-21)

A reviewer who hadn't written the policy read it as an attacker would. Twelve ways around it were found, none reachable (nothing calls the policy yet), all fixed with a test each:

- **A separator after the name hid a program.** `run.bat\` passed the check for programs, which looked at the end of the text. The rules now read the last part of the path.
- **A list of what isn't allowed will always miss something.** Writing and opening now go by short lists of what is allowed. Opening a path was split into opening a document (`open_file`) and showing something in its folder (`show_in_folder`), which can't run anything whatever it is.
- **Renaming could make a program.** `notes.txt` to `notes.bat` was caught, but not every ending was known. A move now can't change the ending at all.
- **A link to the page it is on is a button.** `href="#"` with a script was followed as a plain link. It now waits like any press.
- **A site was only its name.** Approving `https://example.org` approved `http://example.org`, which anyone on the network can answer for. The scheme is now part of the site.
- **Only the first 200 characters of a label were read,** so "Pay" could hide after padding, and the approval covered only that part. Labels are now read and bound whole, and one too long to show is treated as the most careful kind.
- **Pressing a link runs the page's script.** An allowed link now comes with its screened address for the runtime to load.
- **Words for signing out, emptying and cancelling were missing** from the consequential list.
- **Paths.** Off Windows a backslash is part of a name, so `chosen\x` is beside the chosen folder, not in it: refused. On Windows only A to Z are folded. A chosen folder nested in another could be removed through its parent: refused. Device names (`NUL`), marks that make a name read backwards, and whole drives as chosen folders: refused.
- **Secret fields.** The autocomplete hint is a list of words and was compared whole; names such as `cardnumber` weren't read; file pickers and hidden fields could be typed into. All fixed.
- **A broken character in a label made the approval impossible to compute.** Labels are mended before binding, and a call with broken text is refused when it is parsed.
- **The reason shown for typing didn't say that typing is sending.** It does now.

Two things were added that the review didn't ask for, because fixing the above showed them: the agent may only act on a page of an approved site (a redirect can't carry it elsewhere), and links on a site wait for the person once anything has been typed or pressed there.

What a review can't settle: whether these rules hold against a real hostile page in a real window. That needs the runtime, and a red-team pass over it, before any release.
