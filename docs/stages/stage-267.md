# Stage 267: AutoSurvey, least squares for a traverse

- **Date:** 2026-11-24
- **Branch:** `feat/stage-267-least-squares`, on stage 266's
- **Decision:** ADR 0274
- **Migration:** none (the instrument's precision is JSON in the office profile's existing body). **New dependency:** none.
- **Skills used:** `farbaek-survey-studio` (rule 7: an adjustment only by the method the surveyor chooses, with residuals reported; rule 13: proved twice), `farbaek-ui` and `farbaek-human-made` for the profile's fields.

## What was built

- **`core/survey/adjust.ts`:** least squares beside the compass and transit rules. It uses Gauss-Newton on distances, the first direction and angles, each weighted by the instrument's precision, and gives σ0, a χ² test, the largest residuals and the stations' standard deviations.
- **`core/survey/import/closure.ts`:** the closure note says what least squares weighed by and how well the observations fit, naming the office profile's instrument when its precision was used.
- **`core/survey/profile.ts`:** a total station in an office profile may state its precision (`precisionSchema`); `profilePrecision` picks the one for a file (the total station exporting its format, else the only one stating one, never a guess between two); `precisionFromText` reads the form's three figures, all or none. The profile's summary shows it.
- **The path:** `readSurveyFile` → `readPoints` → `parseSdr` → `closeTraverse` carry the precision; Generate Plan loads the chosen profile before reading the files and passes it.
- **`components/survey/office-profile-form.tsx`:** three fields for a total station's precision, with Save off and the reason while only some are given.
- **`components/survey/autosurvey-start.tsx`:** a file adjusted by least squares is read with the profile's precision, so what's shown is what Generate sends.
- **`components/survey/traverse-choice.tsx`:** "Least squares" among the rules; on the start screen its hint names the profile's instrument and figures, or says where to give them.

## Verified

- `least-squares.test.ts` (5 cases, with an independent recomputation).
- `traverse.test.ts`: the note says "typical" without a precision and names the instrument with one; a finer instrument fits the same misclosure worse; the compass rule never reads it.
- `profile.test.ts`: kept with a total station, older profiles read, bad figures refused, all-or-none from the form, the choice between instruments.
- `generate.test.ts`: Generate weighs by the chosen profile's total station, read on the server, and records it; without a profile, the typical one, unnamed.
- Survey and design tests (1,245), `tsc --noEmit` with a 4 GB heap, lint on the changed files.
- **Looked at:** the profile's precision fields on the demo workspace at phone and desktop widths; the three fields line up after the first label wraps on a phone.

## Next

- The profile's precision for a file imported into an existing plan: the project would need to record the profile it started from.
