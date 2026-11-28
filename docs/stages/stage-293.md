# Stage 293: AutoSurvey's start, fixed for a real run

The owner ran AutoSurvey's start with a real job (an SDR, its Sokkia Link printout, a DXF and a sketch saved as a PNG) on a Windows 7 PC and sent a screenshot: the sketch "couldn't be opened", all "119 of 119" points fell outside SLD99, and the files and name weren't shown properly. Decision: ADR 0300.

## What was done

- `src/components/survey/photo.ts`: `decodePhoto` tries `imageOrientation: "from-image"`, then an `<img>`, then a plain decode; PNGs are laid on white before JPEG. This was the cause: Chrome before about 112 (109 is the last for Windows 7) refuses `"from-image"`, so every photo failed.
- `src/core/survey/autosurvey/start.ts`: `gridProblem` counts each point once and says which grids the points do fit; `gridsThatFit` offers them (or local coordinates) as one press each on the start screen. `FileRead` carries `job`.
- `src/core/survey/autosurvey/job-facts.ts`: `jobFacts` reads the job, project, instrument, serial, scale factor and stations from SDR and Sokkia Link printouts; `startName` names the project from them (moved here from `start.ts`, used by the server too).
- `src/components/survey/start-preview.tsx` and `preview-layout.ts`: "What's in your files", the points drawn north up with numbers that never overlap, stations, a scale bar, the job's facts in sentences, and every point in a fold.
- `src/components/survey/sheet-svg.tsx` and `import-panel.tsx`: two SVG fills written with `color-mix()`, which Chrome before 111 can't read and draws black (a selected lot on the plan would have turned solid black on the owner's PC), are now the accent with a fill opacity.
- `src/components/survey/autosurvey-start.tsx`: the preview, the grid buttons, the name filled in, and the carried sheet's plan name in quotes ("laid out like your plan “my”").

## Verified

- `vitest` on `tests/design`, `src/components/survey`, `src/core/survey` and `src/app/app/survey`: 1,316 passed. New: `photo.test.ts` (a stand-in for Chrome 109's refusal), `job-facts.test.ts`, `preview-layout.test.ts`, and grid cases in `start.test.ts`. All synthetic. The owner's real-job reader check (`real-files.test.ts`, env-gated, local files) passed too.
- `tsc --noEmit` and `eslint` on every changed file.
- A fresh review of the change found 8 faults, all fixed with tests where they can be: a "Use WGS 84 / UTM zone 44N" button offered under a swapped-columns warning (SLD99 points read northing first land in UTM's box), which would have hidden the swap; stations not found in real SDR files (zero-filled numbers, SDR2x's 4-character numbers, checksum lines); the list of points judging codes by the wrong list; numbers drawn over the north arrow or scale bar; a scale bar wider than a tiny survey; everything recomputed on each key typed in the name; the name's note read twice by screen readers and focus lost after "Use local coordinates"; "1 of 5 points fall" and "They" for one point.
- In the browser (dev server, demo workspace) with the owner's job files as a local copy, never committed, and `createImageBitmap` made to refuse `"from-image"` as Chrome 109 does: the PNG sketch opened; SLD99 showed "All 40 points fall outside…" with "Use local coordinates", which cleared it; the name filled as the printout's project; the preview drew 40 points with station 100. Checked at 375 px (no sideways scroll, 12 px numbers) and in the dark theme.

## Not verified

- A real Chrome 109 on Windows 7: the refusal was stood in for. The owner's next run is the check.
- Reading the sketch in production after the fix (the demo workspace can't read sketches).

## Next

- The owner reruns the job on the Windows 7 PC: the sketch should open, "Use local coordinates" clears the warning, and Generate Plan draws it.
