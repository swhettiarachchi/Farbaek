# 0028. Agents present everywhere, templates and rescue import

- Status: accepted
- Date: 2026-10-19

## Context

Stage 6 asks for a platform that feels like a live, futuristic workspace on every page, and that is easy to start with. The owner chose meaningful 3D: depth and motion only where something real happens. The research (`reports/AI app builder user experience 2026.md`) found two gaps in how people start: rivals offer templates, and many people arrive with an app already made elsewhere that they're unsure is safe.

## Decision

### 1. The agent, present on every page

**Agent inbox on Mission Control.** Recent runs sit in four lanes, decided in `src/core/agent/inbox.ts`:

| Lane | Runs in it |
| --- | --- |
| Needs you | Waiting on an approval |
| Working | Starting or working |
| Ready for review | Finished, with the proposal pending or blocked |
| Done | Everything else, the latest few |

A proposal whose state can't be read never counts as waiting for review.

**Presence orb** in the sidebar and the phone header: a small CSS Agent Core (`CoreMark`) with words beside it.
- It reads `/app/agent-status?org=<id>`. That route makes one session check and one query under Row Level Security, so it returns nothing for a workspace the person isn't in.
- It checks every 8 seconds while an agent is live, every 30 seconds otherwise, and never while the tab is hidden.

**Command palette** on Ctrl or Cmd+K:
- Go to a page or project, plan a build from what's typed, or switch workspace.
- It only navigates or calls the same server actions the pages use.
- A build prompt is kept in `localStorage`, never in a URL, and still goes through the plan card and approval.

**The verified Seal forms once.** The first time a person sees a verified ProofPack on screen, its Seal tilts up out of perspective and draws in. This is CSS 3D on the existing SVG, remembered per digest in the browser. Under reduced motion it's simply drawn.

**3D budget.** WebGL stays only on the Agent Core of the Build and run pages (ADR 0025). Everything else uses CSS, so many agents can be shown cheaply.

### 2. Templates

Six static templates (`src/content/starters/templates/`) are ordinary starters marked `kind: "template"`:
- **What's in them:** plain HTML and CSS, system fonts, nothing installed or fetched, and sample content labelled as sample. (Changed by ADR 0030: they're now built to the Studio standard, with a `DESIGN.md` and a small `script.js`, still fetching nothing.)
- **The gallery** draws live thumbnails of each home page in a frame with `sandbox=""` (no scripts) and a CSP blocking network requests.
- **"Use this template"** passes the template's id with the prompt. The server accepts only known starter ids, and a follow-up never takes one.

### 3. Rescue import

"Check an app you built elsewhere" takes a `.zip`.

**It's unpacked in the browser** (`src/core/workspace/unzip.ts`), with the platform's `DecompressionStream` and no package:
- the single top folder is dropped;
- every file is screened like a folder import, so secrets, binaries and dependency folders never leave the computer.

**The reader defends itself:**
- ZIP64 and too many entries are refused;
- encrypted and oversized entries are skipped;
- every offset is bounds-checked and every CRC-32 verified;
- inflation is capped per file and in total, counted as it runs, so a zip bomb stops early.

**On the server**, `rescueImport` creates a project through the normal rules, imports the files (screened again, under the same limits) and starts a security check. If the import fails or the check can't start, the page it lands on says so.

## Consequences

- People see what their agents are doing from any page, and reach the run that needs them in one click.
- **Cost of the orb.** One light request per open tab every 8 to 30 seconds. With more users, a push channel (server-sent events) could replace it.
- **Templates are content, not code paths.** Adding one is a file and a catalog entry, covered by the starter tests.
- **Rescue imports are bounded.**
  - They're limited by the one-import size (4 MB of text) and the project file count.
  - Large apps need their source folder zipped on its own.
  - Package checks need a lockfile, and the report says when it's missing.
