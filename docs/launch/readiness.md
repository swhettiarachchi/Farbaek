# Is Farbaek ready to launch?

Written 2026-11-06, from the live site and the store consoles. Update it as these change.

## By platform

| Where | State | What's between it and real users |
| --- | --- | --- |
| **Website** (www.farbaek.com) | Live and working. Sign-in, builds, approvals, checks, publishing and paid plans through Dodo. | A brand-new person signing up, and a real payment, haven't been tried on production. Only the owner can try them. The next real checkout is also the first live test of the subscription rule (ADR 0175). |
| **Windows** | In the Microsoft Store at 0.9.0, and on the website. | 0.10.0 has the safety fix. It needs the owner to drag its package into the open draft, then Microsoft's certification. |
| **Mac and Linux** | On the website at 0.10.0, signed and notarized for Mac. Every download link on the Desktop app page answers with the right size. | Nothing blocks it. A full run on a real second computer hasn't been tried. |
| **iPhone** | 1.0.0 (22) waiting for Apple since Nov 2. 1.1.0 (40) in TestFlight. | Apple's review. Then 1.1.0 with plans sold in the app, which also needs review. |
| **Android** | Closed test live, with 12 testers. | Google requires 14 days with at least 12 testers. The clock restarted around Nov 5, so production can be applied for around Nov 19, then Google reviews it. |

**So:** the website and the desktop apps can open to real people as soon as the owner's few clicks below are done. The iPhone depends on Apple, and Android on Google's 14 days. Nothing can make those two go faster.

## Tested

- **Automatically:** 2,802 tests and 41 security scenarios pass, with responsive and accessibility audits at every width and at the largest text size.
- **On the live site, signed in:** every signed-in page loads with no errors. A real photo uploads in Studio. A real trial ran in a live test space. A new desktop build paired, listed real tasks and unpaired.
- **A whole change, end to end, on production (Nov 6):** an agent built it on the Free plan, the owner approved it, its checks ran in a fresh test space on Vercel Sandbox, and the task reached Verified with a ProofPack. A change that had gone out of date was refused with the true reason. A Fast build on Free finished in 3 steps at 0.7% of its 4% cap, and a link within the page works in the Live preview.
- **From outside:** sign-in codes and passwords can't be guessed at Auth, private pages refuse, and the sign-in pages' security policy reports nothing.
- **iPhone:** builds and passes its tests, and its screens were read by eye on a simulator.

## Not tested, and why

- **A brand-new person signing up on production.** Creating accounts isn't something Claude may do on a live service.
- **A real payment.** Money stays with the owner.
- **An agent's full run on a second computer.**
- **The apps on real phones.** The Android check and TestFlight are the owner's.
- **3D on a mid-range phone.** Phones get the still version by design (ADR 0052), so this matters less.

## What only the owner can do

These are refused for Claude, by the rules of this work or by the tools, because they involve keys, the server, legal declarations or a person's own device.

1. **Try it as a new person:** sign up with an email that has never used Farbaek, and build something small.
2. **Make a real payment:** buy the cheapest plan on that new workspace, then check `/app/billing` and cancel it.
3. **Run `scripts/vps/stop-stuck-retries.ps1` and `scripts/vps/check-approval.ps1`,** so Claude can read that the retries stopped and the sweep for forgotten test spaces works.
4. **Partner Center:** Submission 2 is an open draft. Under Packages, drag in `Farbaek-Agent-0.10.0.appx` from the Desktop folder "Farbaek Store submission", remove 0.9.0, then submit.
5. **Google Play:** run `scripts/vps/set-google-play.ps1`, keep at least 12 testers opted in (15 or more is safer: one leaving at 12 restarts the 14 days), and apply for production around Nov 19.
6. **Apple:** request the App Review appointment for Nov 17-18 once requests open on Nov 8 at 1:30 PM Sri Lanka time. The text is in `docs/mobile/ios.md`.
7. **On your phones:** install iPhone 1.1.0 from TestFlight and open a tool under You. Do the Android check: Help typing and Send on first tap, largest text, 3-button navigation icons, no price flash on Billing.

## Worth doing, not needed to launch

- **`farbaek.si` on the Public Suffix List.** It needs a paid renewal first (`docs/deploy/public-suffix-list.md`).
- **Enforcing the sign-in pages' security policy,** once a real Google and Apple sign-in have been seen through it.
- **Showing the iPhone's other tools in a custom web view,** after Apple's appointment. They already open in the in-app browser, signed in.
