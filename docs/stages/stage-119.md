# Stage 119: The Real-Project Loom in 3D

The project graph page has an optional, experimental 3D view of the same lanes. It's built only from real records, and every node links to its record. It's off until the person turns it on, offered only on capable desktops, and the 2D lanes stay the full view.

- **Decision record:** `docs/adr/0142-real-project-loom.md`.
- **Branch:** `feat/loom-3d` (from `feat/launch-costs`).
- **Migration:** none.

## 2026-10-30

### Done

- **`src/components/three/project-loom-layout.ts`:** lanes to positions, colours, labels, links and edges, pure and tested.
- **`src/components/three/project-loom-scene.tsx`:** the React Three Fiber scene.
  - Nodes name themselves when pointed at and open their record when clicked.
  - Dragging turns the field.
  - It pauses when not running, and the frame governor falls back to 2D on a slow device.
- **`src/components/insights/project-loom.tsx`:**
  - the capability gate;
  - **Show the 3D view** and **Hide the 3D view**;
  - a lazy load;
  - an observer that pauses it off-screen and in hidden tabs;
  - the legend and hover card;
  - the "not available here" sentence.
- **The graph page** shows it above the 2D lanes.

### Verified

- `src/components/three/project-loom-layout.test.ts` (2):
  - nodes keep their record's link;
  - stages run across and tasks in depth;
  - lines are solid only where the work got there;
  - labels don't repeat the state;
  - at most the newest 24 tasks.
- **A demo production build in the built-in browser at 1280px:**
  - the switch appears once the page hydrates;
  - the scene draws the demo project's lanes;
  - pointing at a node names it from its record ("Validate postcodes at checkout: Intent, reached. Asked");
  - clicking it opened that task's page.
- `pnpm typecheck`, lint, full `pnpm test`.

### Not verified

- **Usability testing:** the spec's condition for turning it on by default. It stays opt-in.
