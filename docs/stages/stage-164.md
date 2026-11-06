# Stage 164: Plain words everywhere, and the iPhone's other tools

- **Branch:** `feat/plain-everywhere`, from `feat/launch-setup`.
- **Decision:** ADR 0177.
- **Skills used:** `farbaek-ui` for the words, `mobile-app-ui-design` and `premium-app-ui` for the iPhone, `deep-research` earlier for the store rules this follows.

## What was done

**The public site and films speak like the app.**
- "Modules" and "Evidence" in the menu are "What's inside" and "Proof".
- Contract, proposal, sandbox, evidence, lease and lifecycle are gone from the home page's sections, the approval demo, the FAQ, the pricing teaser, the showroom and the films.
- Mesh, LaunchOS and RealityLoop aren't names a newcomer has to learn on the home page any more.
- `tests/design/plain-words.test.ts` now guards the public site and films too. Legal pages and the ProofPack specification stay exact.
- The proof film was re-recorded, because its screens and captions said "sandbox" and "proposed".

**The desktop app's own screens** say plan, change, access and test space. It reaches people with the next release.

**The iPhone's other tools open signed in, inside the app.** Test space, Desktop app, Move projects, Workflows, Rules, Problems and pause, History, Connections, Who can do what and Settings used to open the browser and ask people to sign in again. They now open in the system's in-app browser, signed in by a one-time link, with nothing to buy on those pages. See ADR 0177.

**The iPhone's approval screens** fold the technical fingerprint away, as the web does. The card doesn't show it at all.

**Plans in the iPhone app.** Decided: they'll be sold there from the next version, as the research recommends. A free test purchase from Apple's sandbox only counts for workspaces named for testing, so turning it on is safe.

**Apple's consultation.** The next two dates are full. Requests for Nov 17-18 open on Nov 8. The text is ready in `docs/mobile/ios.md`.

## What was verified

- `pnpm check`: all tests pass, with the wider words guard.
- The iPhone app compiles and its tests pass on GitHub's macOS runner.
- `tests/design/films.test.ts`: the proof film's captions and chapters match its script.

**Not verified here:** the in-app browser on a real iPhone. That needs a TestFlight build.

## What's next

- Upload a TestFlight build with these changes.
- The desktop release, on its own branch.
