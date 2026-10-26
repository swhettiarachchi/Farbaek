# ADR 0090: Model Change Canary

- Status: accepted (2026-10-26).
- Spec §25 "Model Change Canary": "When a configured model is deprecated or changed, run counterfactual replay … and show the differences in tests, scope and cost before switching. Acceptance: no automatic switch; a report is produced; the owner approves." Spec §16 "Model churn".
- Builds on ADR 0021 (Auto routing), ADR 0032 (Office Space) and ADR 0068 (platform alerts).

## Context

Each tier's model is fixed in code: fast, standard, strong and frontier are Claude Haiku 5.5, Sonnet 5.5, Opus 5.5 and Fable 5.1.

Providers retire and replace models on short notice. Until now:
- nothing noticed when that happened;
- there was no way to compare a candidate before using it;
- moving a tier took a deploy.

## Decision

**A daily check.**
- With the hourly jobs, at most once a UTC day, the server lists Anthropic's models through the SDK's Models API.
- It records the list and what it found (`model_checks`):
  - a model in use that isn't listed any more (it may be retired);
  - a later model in the same family (it may be the replacement).
- It emails the owner once per kind per day, through the `platform_alerts` claims.
- It changes nothing.

**A canary, run by staff** (owners and admins, `models.canary`, with a reason).
- **What it runs:** three of Farbaek's own sample tasks (`src/content/canary-suite.ts`): a site section, a code fix with a test, and a two-file rename. It never uses customer work, which keeps it inside the Privacy Policy.
- **How:** each task is proposed by the tier's current model and by the candidate. Both are judged the way a real proposal is: whether the output is usable, the files it changes, contract violations, the policy outcome, tokens, list-price cost and time.
- **The report** says what differed in sentences, and is stored with its canonical hash.
- **Limits:**
  - one canary at a time, and at most three in 24 hours, both enforced by the database;
  - it runs in the background, and the page refreshes until it's done;
  - the form shows the most it could cost at list price: both models, every task, full output, and an unpriced candidate counted at the most expensive rate.

**A switch, made by an owner** (`models.switch`, with a reason and a fresh authenticator code).
- **What it needs:** a finished canary for that exact tier and candidate, from the last 7 days, checked by the database (`CANARY_REQUIRED`).
- **Priced models only.** The candidate must be on the rate card, so no workspace is ever billed at an unknown price.
- **How it takes effect:** the switch (`platform_models`) is cached with the platform switches. It applies within 15 seconds on every server, and at once on the one that made it. Every server-side model choice goes through `routeModel`.
- **What it affects:** every plan that uses the tier. Usage is metered at the new model's real price.
- **Undoing it:** returning a tier to its default takes the same reason and code.
- **The audit log:** every start, switch and return records exactly one staff event.

**Gemini isn't watched or switched.** Office Space says so.

## Consequences

- A retired model is noticed within a day.
- A replacement is compared on the same tasks before anyone commits to it, and the decision and its evidence are on record.
- **The suite is small,** so it shows differences rather than proving a model better. It doesn't run the tasks' checks in a sandbox.
- **Moving to a model that's newer than the rate card is still a code change:** add its price, then switch.
