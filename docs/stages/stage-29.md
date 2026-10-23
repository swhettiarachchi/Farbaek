# Stage 29: Films that move in every browser, and a hero that moves on phones

After Stage 28 went live, the owner checked again on an iPhone in Low Power Mode, in the Google app's incognito browser:
- the film still waited behind "Play the film";
- the rings around the knight didn't move;
- one screenshot still showed the black square.

They asked for no play button to push, and for films that repeat on their own.

- **Decision record:** `docs/adr/0056-silent-loops-and-hero-motion.md`.
- **Branch:** `feat/films-everywhere`, from `main` after #35. It also carries the build-box fix from Stage 28, which was pushed after #35 merged.

## 2026-10-24

### Done

**Silent loops as animated WebP:**
- `scripts/films/loops.mjs` (`pnpm films:loops`) makes `<film>/<format>-loop.webp` from each recording with ffmpeg and sharp.
- The manifest hashes the loops.
- `filmLoop()` gives their versioned URLs.
- `LOOP_BUDGET_BYTES` caps their sizes.

**The players:**
- **When the loop shows:** on a refused `play()`, or after 3 seconds with no data at all (`QUIET_REFUSAL_MS`).
- **While it shows:** it stays while the film is off screen, and a pause removes it.
- **The big play cover** is only for reduced motion, Save-Data, or a loop that failed.
- **The theater:** "Playing as a silent loop." with "Play with captions"; its pause button stops the loop.

**The hero:**
- the knight floats, and his shadow breathes with him;
- two lights orbit on the rings and pass in front of him on the near side;
- the near half of each ring is drawn in front of him;
- it pauses off screen and stays still under reduced motion.

**The black square:**
- The live CSS for the homepage has no `filter` rule in use (`.blur` exists in the stylesheet but no element uses it), and the page has no SVG filters.
- The screenshot that still showed it was taken at 12:59, as #35 went live (19:29 UTC).

### Verified

**Demo production build, headless Chrome:**
- **Phone with `play()` refused:**
  - every film in sight shows its loop, loaded and moving;
  - loops stay mounted while scrolling;
  - no "Play the film" cover appears;
  - Chrome makes no MP4 request.
- **Pause in loop mode** removes the loop and shows no cover.
- **Phone and desktop with video allowed:** films play as before, and no loop is downloaded.
- **The hero:**
  - both orbit layers move in step, sampled over three seconds;
  - the knight's transform changes;
  - reduced motion leaves no lights and no animation.
- **Screenshots:** the theater in loop mode, mid-typing, and the hero at two moments.
- **Loop quality:** a frame of the build loop next to the same MP4 frame. The framing is the same and the text is readable, with faint compression marks. Quality 60 and mixed mode looked the same at more bytes.

**Audits:**
- `qa:responsive` on `/`, `/pricing`, `/sign-in`, `/app` and `/app/new` at every width: 55 page views, no issues.
- `qa:a11y` on `/`, `/app` and `/app/new`: no findings.
- `qa:vitals` on `/`: LCP 2,064 ms, CLS 0, TBT 229 ms, much as in Stage 25.

**Checks:** `pnpm typecheck` and `pnpm lint` are clean; `pnpm test`: 1,323 passed, 14 skipped.

### Then: the Loom on phones

The owner sent the desktop 3D hero ("i need this"): a tilted ring with stage nodes, packets and motes round the knight.

**Done:**
- **`loom-geometry.ts`:** the Loom's numbers, shared by the 3D scene and a new 2D drawing.
- **`LoomCanvas`:** two canvases, behind and in front of the knight, drawn each frame.
- **The hero uses it on every screen:** phones get the same ring, nodes, packets and motes, with the ring at 78% so the stages stay on screen. Desktops with a mouse still cross-fade to the 3D scene.

**Verified:**
- **Unit tests against three.js:** the world transform, the camera projection and the stage spacing all match.
- **Phone at 393 px:**
  - frames nine seconds apart show the ring turning to the reference's steep diagonal, with the amber node passing in front of the knight;
  - no sideways scroll.
- **Desktop at 1280 px:**
  - the 3D scene loads and the drawing fades out;
  - under reduced motion, the drawing's still frame shows.
- **Cost on a 4× slower CPU:** 60 frames a second, slowest frame 17 ms. The long tasks during start-up match the live site without the Loom.
- **`qa:vitals` on `/`** (five runs): LCP 2,120 ms, CLS 0, TBT 318 ms (229 ms in a three-run sample before). The Loom starts only once the browser is idle, and the start-up long tasks are the same on the live site without it.
- **`qa:responsive` and `qa:a11y` on `/`:** no issues.
- **Checks:** `pnpm typecheck` and `pnpm lint` are clean; `pnpm test`: 1,328 passed, 14 skipped.

### Not verified

- **The owner's iPhone in Low Power Mode** and the Google app: the loops, the hero motion and the black square's absence.

### Next

- The owner reloads www.farbaek.com on the iPhone after the deploy, in Low Power Mode. They check that the films move, the knight's lights orbit, and the header has no square.
