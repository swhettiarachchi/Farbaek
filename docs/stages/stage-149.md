# Stage 149: The software site as a direction

- **Branch:** `feat/software-direction`.
- **Migration:** none.
- **ADR:** 0165.

## 2026-11-04

### Asked

"Use D drive and continue": C: was nearly full, so heavy temporary work moved to D:, and the build continued with the next planned step (stage 146): the software site as a direction, carrying over its working product demo.

### Done

- **The disk:**
  - The 5,540 leftover test folders (19 GB) moved from `%TEMP%` to `D:\FarbaekWork\old-test-temp`, which took C: from 1.4 GB to 22 GB free.
  - New scratch work goes to `D:\FarbaekWork\tmp`. The tests that left those folders are fixed in PR #192.
- **Ledgerly, the software site, rebuilt on the Studio kit** (ADR 0165):
  - **Brand:** the signal look tuned warm with burnt orange. Sora, DM Sans and JetBrains Mono for figures.
  - **The hero:** the working ledger tilted in 3D, with the Paid notice and the next reminder floating in front at their own depth. It leans toward the pointer and drifts slowly.
  - **A dark chapter over a Farbaek Scenes horizon:** the follow-ups pass as you scroll, the slider drives the same email, and the late fee shows on the final notice.
  - **Features:** a bento with a payment sheet, a tone switch, a late fee that counts up, a log and a team photo.
  - **The rest:** a quote beside a photo (labelled as a sample), two plans with a monthly and yearly switch, questions, and an honest sign-up.
- **Prompts about software map to it:** software, startups, B2B, developer tools, productivity, invoicing and accounting tools, and tools or platforms for teams, freelancers, businesses, studios or agencies. They're checked before the shop and launch words.

### Verified

- **In a browser, from the template's own files:**
  - **At 1280 px:** the hero, the 3D ledger, sending a reminder and marking it paid (the outstanding total went from $7,220 to $5,070 and the notice changed), the dark chapter (scrolling moved the email from day 7 to day 14 with the late fee), the features bento and the yearly switch ($10 and $24).
  - **At 375 px:** no sideways scroll, and the full ledger is readable with working buttons.
- **Found and fixed on the way:**
  - the photo tile's frame kept its 4:3 ratio and pushed 20 px past its column at 1280 px;
  - the Paid notice was cut off at the right edge.
- **Tests:** the routing, template and site review tests pass (33). The software site passes every premium site check, with only its placeholder photos left.

### Next

- Studio: styles for phones only.
