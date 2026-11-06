# Stage 166: A refusal that never arrived

- **Branch:** `fix/endless-retries`, from `main`.
- **Migration:** v89, `supabase/migrations/20261230090000_no_endless_retries.sql`. It's applied to production (SHA-256 `74a7cd75…`), and it doesn't depend on this branch's code.
- **Skills used:** `ecc-security-review` for what the bug allows, `chrome-browser` to read the failing page's timing.

## What happened

The owner's "Approve and apply 5 files" failed twice, after about 31 seconds each time, with "Something went wrong". I first blamed a deploy competing for the server, and said so. The second failure had no deploy running, which ruled that out.

`scripts/vps/check-approval.ps1`, run by the owner, showed all five files had moved on since the change was made. So the right answer was `FILE_CHANGED`, and it never reached the page. ADR 0178 has the chain: PostgREST retries error code `40001` for ever, and 18 functions raised it on purpose.

## What was done

- **v89:** every function's refusals use `P0001`, with the same words. It's rewritten from each function's live definition.
- **A guard:** `tests/db/no-endless-retries.test.ts` fails if any function mentions these codes again.
- **The page says a change is out of date before anyone presses anything.** With the refusal fixed, the owner pressed the button three more times and said it was "still like this": a correct red line beside the same black button still looks broken. Now the next-step card says "This change is out of date", the chip says "Out of date", and a notice says why. The main button is Discard, with no Approve. The approval deadline and the trial tools are gone too, because neither applies. The phone API's next step says the same.
- **An unknown database error is logged** (`database.unknown_error`), because production's database logs only fatal errors.
- **Forgotten test spaces can be found again.** The same log showed the sweep failing every 15 minutes: it asked Vercel for 100 sandboxes per page, and Vercel allows 50, so forgotten ones were never cleaned up. Now it asks for 50.
- **Fast runs on Free can get past their first step.** Discarding that change and starting a fresh Fast run on production stopped after one step, at 0.4% of a 4% cap, having changed nothing: the check assumed a full 32,000-token reply, which is about 3% of Free's month by itself. A step's reply is now limited to what's left of the cap, so the promise holds and the run carries on (ADR 0040's update).
- **A link within the page works in a preview.** Clicking "Opening hours" in the Live preview blanked it with "This content is blocked", in every preview. Since ADR 0169 the site is a `srcdoc` frame inside `/preview-frame`, and a `srcdoc` document has no address of its own. So `#hours` meant `/preview-frame#hours`, which refuses to be framed by a sandboxed parent. The preview's script now scrolls there itself. Tried in real Chrome on a template, with the sticky header working. A site's `:target` styles and `hashchange` listeners don't fire in a preview, and they do on the published site.
- **`publish-desktop.ps1` carries on when the connection drops** (found in stage 165).
- **`stop-stuck-retries.ps1` and `check-approval.ps1`,** for the owner to run.

## Checked

- The new database tests fail without v89 and pass with it. All 543 database tests pass, and typecheck and lint are clean.
- PostgREST v14.17's and hasql-transaction's source were read, along with the pinned Supabase commit's Envoy route timeout (30 seconds), which matches the delay.
- v89 went to production with its fingerprint checked, in one transaction, and it stops if any mention remains: it exited cleanly.
- **On production, the owner's press:** before v89 it took 31.7 seconds and said "Something went wrong". After v89 it took 0.5 seconds, three times, and said "A file changed after this was made."
- **The out-of-date page,** on the demo workspace at phone width, with the check temporarily forced on and then removed: the card, chip, notice and Discard read correctly, nothing overflows, and the ordinary state is unchanged.
- **A whole change, end to end, on production:** the owner approved a fresh change on the opening hours task. It applied in 1.5 seconds, its check ran at 1:07 PM on Nov 6 in a fresh test space on Vercel Sandbox (exit 0), every applied file matched inside it, and the task reached Verified with ProofPack `sha256:02cdc5…88b5`. That's the live test of ADR 0175's proof rule.
- The run cap, with Free's real numbers in a test: a prompt of 30,000 tokens with 182 units left gets a reply of over 20,000 tokens, and its worst case stays inside. `pnpm security:eval` was re-recorded for SE-018.

## Not checked yet

- **That real retries were running.** The evidence is indirect: two PostgREST sessions at the start of a transaction in one snapshot. The owner's run of `stop-stuck-retries.ps1` measures it.
- **The sweep against Vercel.** The fake in the test refuses over 50, like Vercel. The real test is production's log after this deploys.

## What's next

- **The sweep for forgotten test spaces works again.** `sandbox.orphan_scan_failed` was logged every 15 minutes before the fix. In 19 minutes of the app's log after it, which spans at least one sweep, it wasn't logged, and no leftover test space was reported as destroyed.
- **The retries have stopped.** The owner's `stop-stuck-retries.ps1` measured 0 transactions undone each second and 0 open. The gateway's log shows the whole story for this one button: 504 twice (the 30-second timeout), 400 four times after v89 (the true refusal), then 200 when the owner approved a fresh change.
- **One thing to look at before enforcing the sign-in policy:** the first report on `/sign-in`, at 10:13 UTC on Nov 6, says script `eval` would have been blocked. It's report-only, so nobody was stopped. The report doesn't say what asked for it, and a browser extension or Turnstile's challenge could each be why.

## After the merge (#211, live as `7c4c7142649f`)

- **A real Fast build on Free** finished in 3 steps at 0.7% of its 4% cap. It's the same effort and cap that stopped after one step before the fix. The test task was then discarded and cancelled, so nothing from it reached the site.
- **A link within the page** in the Live preview scrolls to the section on production, and the agent's change shows there, with Friday marked Today.
- **The desktop upload finished,** after two more bugs in my script, both found by the owner's run. A question to the server had no time limit, so a stalled connection sat for an hour with nothing on screen. Then stopping a connection left its child process holding a temporary file, which stopped the next connection. Every call now has a time limit, each connection sends for 5 minutes and a fresh one carries on, and the whole process tree stops. Each file's SHA-256 matched on the server, and every link on the Desktop app page answers 200 with the right size.
- **Not done by me:** a real download opened on a Mac or Linux computer from production. The same builds were opened on GitHub's runners (stage 165).
