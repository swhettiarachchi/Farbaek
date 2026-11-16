# Stage 198: Importing just works for surveyors

- **Branch:** `feat/stage-198-easy-import`, from main after #260 (stage 197).
- **Migration:** none.
- **Why:** a surveyor uploaded the file they had for the job BANKUWATTA: Sokkia Link's printout of the job (SET650X), not the job file. Farbaek read it as a point file and listed "0 points read, 137 rows can't be read", one error per line. The owner asked to make importing easy for surveyors.

## What was found

- **Printouts:** nothing recognised a printout. It fell through to the space-separated point reader, whose column guess called column 1 "the code", and every heading line failed.
- **The server:** files Farbaek can't read (`unreadableFile`) were named in the browser only; the server never checked.
- **SDR jobs:** the reader takes coordinate (08) and station (02) records. A job of observations only (09, 11) ended with "Farbaek doesn't reduce observations".
- **No published layout:** Sokkia Link's printout layout isn't published (searched 2026-11-16), so reading one, or reducing observations, has to be built against real files.

## Done

1. **Printouts are recognised** (`printoutSource` and `unreadableFile`, `detect.ts`):
   - **Sokkia Link's printout:** known by two of its own marks. It names the job, its `.sdr` file and the folder: "Upload the job file itself instead: bankuwatta.sdr, in E:\SOKKIA Link\Projects\BANKUWATTA.dir."
   - **Any other report** that starts with headings is named as one.
   - XML, JSON and real SDR files are never taken for one.
2. **The panel** shows the job file's full path in mono with **Copy the path**, instead of a list of errors.
3. **The server** refuses a printout or job database with the same sentence.
4. **An SDR job of observations only** says so in a surveyor's words, and what to do.
5. **What to upload from your instrument**, a fold under the upload box, has one line each for:
   - Sokkia (the `.sdr`, not the printout);
   - Leica (GSI);
   - Trimble (JobXML);
   - any other software (LandXML or PNEZC);
   - what won't work.

## Verified

- **Unit:**
  - synthetic printouts built to the real printout's heading lines (job and path made up) give the job, file, folder and path, and the exact sentence;
  - a File Name line naming another file still gives the folder;
  - two marks and no names give the general advice;
  - a report of headings is named, with its headings;
  - CSV (with and without a header row, with colons in codes and times), GSI, SDR, LandXML, JobXML, GeoJSON, a field book, and a CSV mentioning SOKKIA Link once are never taken for a printout;
  - 62 import tests pass.
- **`pnpm typecheck`** and lint pass.
- **The browser, on the dev demo** with a local unlock of the Sample's import (never committed):
  - a pasted synthetic printout shows one sentence, the path and **Copy the path**, with no "can't be read";
  - **What to upload** opens with its five lines;
  - no sideways scroll at 375 px; checked at 1280;
  - a plain CSV still reads as before ("3 points read", "Import 3 points").

## Next

- **The surveyor's own files:** with `bankuwatta.sdr` and the printout copied to this PC:
  - if the job holds coordinates, check the upload end to end;
  - if it holds only observations, reducing them (stations, backsights, heights, scale factor, with each point saying how it was computed) is stage 199, with an ADR and known-answer tests;
  - if the printout has coordinate rows, a printout reader built to its real layout.
- **A CSV with a few heading lines above clean points** could be read by starting at the first point, shown to the surveyor, instead of being refused.
