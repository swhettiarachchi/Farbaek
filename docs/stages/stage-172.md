# Stage 172: Obsidian and steel

- **Branch:** `feat/premium-system`, from `feat/disclosure` (#218), which starts from `feat/audit-rest` (#217).
- **ADR:** 0183, which replaces ADR 0180's status rule. No migration.
- **Skills:** `farbaek-ui`, `farbaek-human-made`, `premium-app-ui`, `ui-ux-pro-max`, `taste-skill:high-end-visual-design`, `mobile-app-ui-design` and `farbaek-office`, as each area needed.

## What the owner asked

The owner sent a "Needs approval" chip in gold-brown text and asked for three things across the whole platform:

1. **Professional icons.** The AI-looking icons removed in stages 169 and 170 had left gaps. Those gaps need professional icons, with no missing icons or unfinished replacements anywhere.
2. **Private information.** This was done in stage 171.
3. **A premium design system.** No gold, cheap gradients or effects, generic components, or inconsistent colour, type and spacing. One sophisticated system, with every page following it.

## How it was done

- **Audits:** two read-only audits mapped the problem. One covered colour and components, the other every icon removed since stage 169 and every status table drawn half with icons and half blank.
- **Foundation:** the tokens, the status kinds, `CardTitle`, `Notice` and `EmptyState` were rebuilt first.
- **Migration:** six agents then moved disjoint areas onto them in parallel: tasks and approvals; build, test space and files; projects and launch; workspace pages and the staff console; the public site, 3D and films; the desktop and iPhone apps. Each worked from one brief with a fixed icon vocabulary.
- **Checks:** the lead ran every check, one at a time.

## Found and fixed

**Colour.** One token, `approval`, had meant both "your turn" and "warning". Painted brown amber, it made the product's most common state look like gold on a beige wash.

| Now | Means |
| --- | --- |
| Signal blue, the brand's own colour | Your turn |
| Burnt orange (`caution`) | Real warnings: a limit near, a deadline closing, a risk |
| Steel (`info`) | Information, and work in progress |
| Graphite (`simulated`) | A sample, where it used to be purple |

- Shadows are tinted with ink instead of glowing blue.
- The media panel's amber became a soft orange, and failed output there is red.
- The homepage 3D scene's gold node is a pale signal blue.
- The contrast test now rejects any gold, amber or purple token.

**Status.**
- Every status is one of thirteen kinds in `StatusBadge`: its words, a precise filled icon, its colour and its border.
- About 30 status tables on the web, the desktop app and the iPhone app had drawn some states with an icon and others blank. Every one now maps each state to a kind, so "Needs your approval" carries a person-and-clock icon beside "Verified" and its check.
- `stateKind()` gives each task state its kind.
- Blank spacers where icons used to be now draw the kind's icon: a task's history, the lane graph, the launch steps, the security checks, the verify page, the iPhone's stages. A stopped step shows why it stopped.

**Icons restored, as one set.**
- Every section heading in the app uses `CardTitle`: a 20px outlined icon in the quiet ink, the same icon for the same concept on every page.
- The navigation's icons were adjusted, so no two concepts share one.
- Rows that lost their icons have them back: a change's files, paths and tests, the approval wallet's facts, the plan's done-when lines, the why card's facts.
- Every error line has a filled warning icon and every success a filled check.
- Folds can carry an icon too.
- Icons come in five sizes, with filled icons for states and two weights for outlines. Rockets and skulls joined the banned list.

**Cheap effects removed.**
- Hazard stripes on the test mode band, the staff console and the outcome watch.
- The blue glow under panels and behind the featured pricing plan.
- Accent radial washes on the launch page and the bento.
- Tinted icon circles, now neutral tiles.
- Dashed borders on empty states and locked options. Dashes now mean "not yet" and nothing else.
- The beige notice wash: notices sit on a neutral surface with a coloured icon.
- Page-wide bands (sample data, saving off, paused, test mode, announcements) share one quiet style.
- Buttons hover to the new primary and accent tones.

**Desktop and iPhone.**
- The desktop app draws the same kinds from the web's table, with buttons, badges and easing matching the web. A missing ghost button style was added.
- The iPhone's palette is generated from the same tokens. Its `Tone` has the thirteen kinds with SF Symbols, every badge draws its symbol, and the panels' shadow is ink.

### From the independent review

A fresh review read the whole diff, including every Swift line, and found nothing that fails to compile. It found these, all fixed:

- **System work drawn as "your turn".** The project map's "waiting" also covers checks running and a launch building, so it's now pending (steel), on the lanes, the legend and the 3D loom.
- **Mismatched results.**
  - A failed run's core showed a neutral mark beside its red "Stopped" chip. The core now takes the run's own kind.
  - A site that's down showed orange in one card and red in the next. It's "Down" in red in both.
  - A task's history marked "Partly verified" with a plain check. It now shows its needs-a-look mark, on the web and the iPhone alike.
  - Test space checks drew "all passed" with the verified check beside "this doesn't mark the task verified", and "none passed" as a warning. They're now done and failed.
- **The Tasks page grouped by the old tones**, so a plan waiting for its owner sat under "In progress" with a blue chip. Tasks and the phone's filters now group by the same `taskGroup()`, which agrees with every chip.
- **Wording and layout.**
  - The desktop app's check lines had lost a space ("pnpm test:passed").
  - The paused band's link squeezed into a narrow column on phones. Band links now sit inside their sentence.
- **Mixed signals.** A DNS check that simply isn't ready yet looked like a failure, and is now a caution. An escalation to an owner or admin is blue everywhere, since a person decides. The proof thread's proven steps are green, not the accent. An agent's ended access is off, not failed.


| Check | Result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint` | Pass |
| `pnpm test` | 388 files pass, with the new guards |
| Design guards | Every status has its icon, icons at five sizes, no duotone or light weights, no hazard stripes, no gold, amber or purple classes or tokens, no rockets or skulls |
| `node desktop/build.mjs` | Builds |
| `pnpm qa:responsive` on the demo build | 550 page views, no findings and no runtime errors |
| `pnpm qa:a11y` | 96 page views, no findings |

- Approvals, a task's page and Home were looked at on the demo build at 375 px: the approval chip is blue with its person-and-clock icon, every fact row and section title has its icon, and work in progress is steel.
- A fresh review read the whole diff, including every Swift line, since this PC can't compile the iPhone app.

## Not done, and why

- **The iPhone app isn't compiled here, and CI can't run it right now.** GitHub refuses to start the job until the Actions billing is sorted ("recent account payments have failed or your spending limit needs to be increased"). The Swift was read line by line by the agent that wrote it and by the reviewer.
- **The recorded films still show the old chips.** The film stage components are updated, so `pnpm films:record` brings the videos into line; it's heavy and wasn't run here.
- **Arbitrary text sizes and the opacity steps** (22 tint alphas, 36 border alphas) the colour audit counted weren't all folded into named steps. The status colours, chips, notices, bands and inputs that people see most are on the system; the rest is consistent enough not to read as unfinished.
- **The desktop app's own section headings and the iPhone's section titles** have no icons yet. Their states and messages carry the kinds, as on the web.
