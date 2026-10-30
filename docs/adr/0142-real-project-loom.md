# ADR 0142: The Real-Project Loom in 3D

- Status: accepted (2026-10-30).
- From master spec §25: "Real-Project Loom (Frontier). Solution: An optional 3D view of a project's actual intent-to-proof graph for executive and demo use, built only from real data, with a full 2D accessible equivalent. Acceptance: every node links to a real record; usability testing shows a measurable benefit, or the feature stays off."

## Decision

**Built from the lanes the page already lists.**
- On the project graph page (ADR 0089), a project's real lanes are placed in 3D (`project-loom-layout.ts`). Each task is a row in depth, newest in front, and its five stages run left to right: intent, contract, change, proof, live.
- Every node is a stage with its state's colour, and the legend gives each colour's word. It keeps the link of the record it came from.
- Lines are solid where the work got to the next stage and faint where it hasn't. At most the 24 newest tasks are shown; the 2D lanes list every one.

**What it does:**
- Pointing at a node names it: task, stage, state and what happened.
- Clicking opens its record.
- Dragging turns the field; otherwise it turns slowly by itself.

**Off unless the person turns it on, and only where it works well.**
- **The switch:** **Show the 3D view** sits above the lanes, labelled experimental. Nothing loads until it's pressed.
- **Where it's offered:** only where Farbaek's other 3D runs (ADR 0052): a mouse or trackpad, WebGL, at least 4 GB and 4 cores where the browser says, no Save-Data, and motion allowed. Everywhere else, one sentence says the lanes below show everything.
- **While it runs:** the scene is lazy-loaded and pauses off-screen and in hidden tabs. If frames come too slowly, it turns itself off and says why.

**The 2D lanes stay the full view.** The 3D frame is labelled as a view of the list below, which has the same information, every link, and keyboard and screen-reader access.

## Consequences

- It's useful for demos and for seeing a project's shape at a glance, with every node backed by a real record.
- **It stays experimental and off by default.** Without usability testing, there's no evidence it helps more than the lanes, which is what the spec asks for before it's on by default.

## Not done

- **Usability testing:** it needs real people. Until then the switch stays opt-in.
- **Incidents as nodes in 3D:** they show in the 2D lanes.
