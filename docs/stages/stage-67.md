# Stage 67: Model Change Canary

Spec Stage 8 and §25 "Model Change Canary": no automatic switch, a report, and the owner approves.

- **Decision record:** `docs/adr/0090-model-change-canary.md`.
- **Branch:** `feat/model-canary`, from `main`.

## 2026-10-26

### Done

**Database: migration v57.**
- Tables:
  - `model_canary_runs` (one running at a time, three in 24 hours);
  - `platform_models` (the switch per tier, tied to the canary it rests on);
  - `model_checks`.
- Row Level Security on all three, no browser grants, and the server key reads only.
- `platform_alerts` gains `model_missing` and `model_newer`.
- `staff_can` gains `models.canary` (owners and admins) and `models.switch` (owners).
- Functions:
  - `app_staff_start_canary` and `app_staff_set_model` (step-up, and a finished canary for that exact candidate in the last 7 days);
  - `app_finish_canary` and `app_record_model_check` (server only).

**Core.**
- `model-watch.ts`: a model that's gone or has a newer one, with the words for each.
- `model-canary.ts`:
  - `pricedModel`;
  - `estimateCanary`, the most it could cost;
  - `compareRuns`, the report with its differences in sentences.
- `routing.ts`: `tierModels` and `overrides` on `route` and `allowedModels`, for Anthropic only.

**Server.**
- `model-catalog.ts`: the Models API through the SDK.
- `platform/state.ts`: switches cached with the platform flags. Only priced models take effect, and the last ones are kept when the table can't be read.
- `ai/routing.ts`: `routeModel`, now used by every server call that picks a model:
  - the gateway;
  - proposals;
  - drafting;
  - the security review;
  - lens suggestions;
  - policy drafts;
  - the plan card;
  - the usage summary.
- `model-canary-runner.ts` and its wiring: runs in the background, judges both sides the same way, and records the report with its hash or why it stopped.
- `jobs/model-watch.ts` and its wiring: in the hourly jobs, once a day.
- The Office store's `startCanary` and `setModel`, with new messages.

**Content.** `canary-suite.ts`: three sample tasks with valid contracts.

**Office Space.** `/models`, in the platform group of the nav, More and search:
- **Tiers:** each tier with its model, default or switched, and listed or not by the last check.
- **Canaries:** a canary form per tier, each candidate showing the most it could cost.
- **The daily check:** its findings.
- **Reports:** the differences, and each task side by side.
- **Switching:** an owner-only switch with step-up, which says it affects every plan on the tier and is metered at the new price. Returning to the default works the same way.

### Verified

- `tests/db/model-canary.test.ts` (5):
  - browsers and the server key can't write;
  - roles, reasons, one at a time and three a day;
  - one event per success and none per refusal;
  - switching needs step-up and a fresh finished canary for that candidate;
  - returning to the default;
  - the check and its alert claims.
- `office-permissions.test.ts` (the matrices match), `browser-grants.test.ts`, `office-staff`, `office-controls`, `platform-alerts`.
- Unit tests:
  - `model-watch.test.ts` (4) and `model-canary.test.ts` (4);
  - the routing overrides;
  - `model-canary-runner.test.ts` (4): suite contracts valid, both sides judged, failures per side, a run that can't finish;
  - `model-watch.test.ts` for the job (3): once a day, email once per kind, no email, a refused send.
- Office, AI, jobs, routing and design suites (36 files, 288 tests), including `office-guards`.
- Database, workspace, agent and security suites (31 files, 230 tests).
- `pnpm typecheck` and `pnpm lint` are clean.
- **v57 applied in production** and read back:
  - Row Level Security is on for all three tables, browsers can't read them, and the server key reads but can't write;
  - the functions are closed to browsers and open to the server;
  - owners may switch, admins run canaries, and support may do neither;
  - the new alert kinds are in place;
  - no switches or runs exist yet.

### Not checked

- **A live canary or check against Anthropic.** It spends Farbaek's credit, so it waits for the owner's go-ahead.
- **The Office page on screen.** Office Space isn't in the demo build; it can be checked after deploy with the owner's sign-in.
