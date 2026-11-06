# Is Farbaek ready to launch?

Written 2026-11-06, from the live site and the store consoles. Update it as these change.

## By platform

| Where | State | What's between it and real users |
| --- | --- | --- |
| **Website** (www.farbaek.com) | Live and working. Sign-in, builds, approvals, checks, publishing and paid plans through Dodo. | Nothing blocks it. The owner's next real checkout is the first live test of the subscription rule (ADR 0175). |
| **Windows** | In the Microsoft Store at 0.9.0, and on the website. | 0.10.0 has the safety fix. It needs the owner to drag its package into the open draft, then Microsoft's certification. |
| **Mac and Linux** | On the website at 0.9.0, signed and notarized for Mac. | 0.10.0 is built. It needs the owner's script, then a merge. |
| **iPhone** | 1.0.0 (22) waiting for Apple since Nov 2. 1.1.0 (40) in TestFlight. | Apple's review. Then 1.1.0 with plans sold in the app, which also needs review. |
| **Android** | Closed test live, with 12 testers. | Google requires 14 days with at least 12 testers. The clock restarted around Nov 5, so production can be applied for around Nov 19, then Google reviews it. |

**So:** the website and the desktop apps can open to real people as soon as the owner's few clicks below are done. The iPhone depends on Apple, and Android on Google's 14 days. Nothing can make those two go faster.

## Tested

- **Automatically:** 2,785 tests and 41 security scenarios pass, with responsive and accessibility audits at every width and at the largest text size.
- **On the live site, signed in:** every signed-in page loads with no errors. A real photo uploads in Studio. A real trial ran in a live test space. A new desktop build paired, listed real tasks and unpaired.
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

1. **Approve the "opening hours" change on Sunrise Bakery** before it closes at 6:43 PM on Nov 6. Its checks start by themselves, which is the live test of the proof rule (ADR 0175).
2. **Run `scripts/release/publish-desktop.ps1`**, then merge the desktop PR.
3. **Partner Center:** Submission 2 is an open draft. Under Packages, drag in `Farbaek-Agent-0.10.0.appx` from the Desktop folder "Farbaek Store submission", remove 0.9.0, then submit.
4. **Google Play:** run `scripts/vps/set-google-play.ps1`, keep at least 12 testers opted in, and apply for production around Nov 19.
5. **Apple:** request the App Review appointment for Nov 17-18 once requests open on Nov 8 at 1:30 PM Sri Lanka time. The text is in `docs/mobile/ios.md`.
6. **On your phones:** install iPhone 1.1.0 from TestFlight and open a tool under You. Do the Android check: Help typing and Send on first tap, largest text, 3-button navigation icons, no price flash on Billing.

## Worth doing, not needed to launch

- **`farbaek.si` on the Public Suffix List.** It needs a paid renewal first (`docs/deploy/public-suffix-list.md`).
- **Enforcing the sign-in pages' security policy,** once a real Google and Apple sign-in have been seen through it.
- **Showing the iPhone's other tools in a custom web view,** after Apple's appointment. They already open in the in-app browser, signed in.
