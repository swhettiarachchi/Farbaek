# ADR 0058: Apps verify with their own build and tests

- Status: accepted (2026-10-24).
- Builds on ADR 0047 (verification in one step) and ADR 0054 (the site check). Changes the sandbox's package-registry network profile.

## Context

ADR 0054 let a static site whose plan lists no checks be verified by Farbaek's site check. An app with packages (a Next.js or Vite app, for example) still had nothing to run when its plan listed no checks:
- the change waited in "Verifying" for good;
- the task page could only suggest asking for checks next time, or undoing the change;
- since ADR 0050, publishing it needed an owner's reason.

Most apps already say how to check them: a `build` script, and often a `test` script.

## Decision

**When a plan lists no checks, `checksToRun` (now in `app-check.ts`) picks, in order:**
1. **A static site:** Farbaek's site check, as before.
2. **An app with a `package.json`:** its own checks, with the package manager its lockfile names (`corepack pnpm` for `pnpm-lock.yaml`, otherwise `npm`):
   - `CI=1 <pm> run build` when it has a `build` script;
   - `CI=1 <pm> test` when it has a real `test` script: not npm's "no test specified" placeholder, and not one that watches for changes.

   `CI=1` keeps builds and test runners from waiting for a person.
3. **A Python project** (a `.py` file with `requirements.txt` or `pyproject.toml`): `python3 -m compileall -q .`, so every file at least compiles.

Otherwise there's nothing to run, and the task page says so, as before.

**Where it's used:** the verification runner's start check, the sandbox check run's list (`requiredChecks` in the wiring) and the task page all call the same `checksToRun`, reading the project's `package.json`.

**How it runs:** the verification sandbox already installs the packages from the lockfile, with install scripts off (ADR 0047). The checks then run against exactly the applied files, and the receipt names each command.

**The task page says what will run** before anyone presses the button. For example: "The plan lists no checks, so Farbaek runs the app's own build and its tests."

**The site-check script generator** now normalises line endings. A Windows checkout (CRLF) generated a different script from the committed one, so the staleness test failed on any fresh Windows clone.

**The `package_registries` network profile** adds `fonts.googleapis.com` and `fonts.gstatic.com`:
- **Why:** `next/font/google`, Next.js's standard way to load web fonts, downloads them while the app builds. Without these hosts a correct app would fail its own build check.
- **The risk:** both hosts are public, read-only CDNs; anything sent to them only reaches Google.
- **Unchanged:** everything else stays blocked, including other Google hosts. Private, link-local and metadata ranges are always denied.

## Consequences

- **More applied changes can reach Verified,** and publish without an override.
- **A build that needs secrets** (environment variables the sandbox doesn't have) fails its check, honestly. The fix is to make the build work without them, or to list the checks that matter in the plan.
- **Autonomy is unchanged.** It still treats a plan with no checks of its own as not verifiable, so a cloud run never applies one on its own (ADR 0054).
- **Not run against a live sandbox here.** It's tested with the runner's fakes and the rule's unit tests.
