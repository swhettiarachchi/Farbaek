# Stage 183: Mesh on Android, natively

- **Branch:** `feat/android-mesh`, from `main` (4e393d8).
- **ADR:** 0193.
- **Migration:** none.
- **Installs**, each approved with the plan and pinned:
  - **Gradle 9.8.1,** downloaded from gradle.org and checked against its published SHA-256. The new wrapper pins it by that hash. CI already used 9.8.1.
  - **BouncyCastle `bcprov-jdk18on` 1.86,** released 2026-09-11. 1.87 was a day old, too new to pick.
  - **JUnit 4.13.2.**
- **Skills:**
  - **Phone screen:** `mobile-app-ui-design`: primary actions where a thumb reaches, empty states that say what to do, 48dp targets, and a clear end to each transfer.
  - **Look:** `farbaek-ui` and `farbaek-human-made`: the web app's tokens; status as words in their colour; numbers in sentences; the Wi-Fi icon from the same Phosphor set as the web.
  - **Security:** `ecc-security-review`'s checklist, for the key vault, the receive guard, the exported screen and the FileProvider.

## What the owner asked

"Full phone apps" and "phone-native Mesh" were among the six parts not built. The plan's stage 183 brings Mesh to the Android app natively. The iPhone follows in stage 184.

## What changed

- **`android/mesh-core`:** the `farbaek-mesh/1` protocol in plain Java, ported from the desktop agent's TypeScript with the same names. That covers Noise XX, framing, offers and accepts, BLAKE3 chunks, resume, updating an earlier copy, the canonical-JSON manifest digest, the pairing code, discovery and the receive-side folder guard. 26 classes; BouncyCastle for every primitive.
- **Its tests (89 after the reviews' fixes):**
  - the Noise cacophony vectors and BLAKE3 known answers;
  - canonical JSON and pairing codes matching Node's;
  - the folder guard against about 40 hostile paths;
  - 17 tests against the desktop's real Node Mesh, both ways: pairing, a 9 MiB binary file, resume through a dropped connection, a tampered chunk refused, updating an earlier copy, decline, cancel and discovery.

  `scripts/mesh/node-peer.mjs` bundles the TypeScript Mesh with the repo's esbuild for them.
- **The app** (`com.farbaek.app.mesh`):
  - **`MeshActivity`:** the Nearby screen.
  - **`MeshService`:** a `dataSync` foreground service that handles Android 15's `onTimeout`.
  - **`MeshHub`:** one node per process, plus the multicast lock.
  - **`KeystoreVault`:** the phone's key sealed by an Android Keystore key.
  - **`LstatProbe`:** links and hard links refused when receiving.
  - **Resources:** the manifest's permissions, screen and service; a monochrome notification icon; the FileProvider paths for sharing received folders.
- **Build:** the app depends on `:mesh-core`. The launch address carries the build number (`android_build`, from `versionCode`, now 5, version 1.3.0), and the Gradle wrapper is pinned to 9.8.1 by its hash.
- **Web:**
  - **Open Nearby** on the Mesh page, only inside the Android app from build 5, with an intent link that names Farbaek's own package;
  - the tab remembers the app's build (`androidAppBuild`, `useAndroidAppBuild`).
- **CI:**
  - the Android workflow runs the Mesh core's tests before building the bundle;
  - the emulator launch check also opens Nearby from its link, turns on Visible, and fails if the screen doesn't show, the service doesn't start in the foreground, or anything crashes.
- **Docs:** ADR 0193, and the owner's Play steps for this release in `docs/mobile/android.md`, section 5.

## Verified

- **Independent review:** a fresh agent read the risky files before the PR. It demonstrated a man in the middle on pairing: a device on the Wi-Fi made both six-digit codes match in about 1.5 s, and both devices then trusted it. The flaw was in the protocol, so the desktop app and the browser had it too.
  - The fix, pairing v2 (ADR 0194), is commit then reveal. It's in this Java core and, in its own PR (`fix/mesh-pairing`), in the desktop's and the browser's TypeScript. Both implement one written spec, with a shared test vector (code `053107`).
  - **Its other findings, all fixed here:**
    1. discovery floods that grew memory without limit;
    2. a crash when Android's daily limit ended the service;
    3. a stale "visible" notification;
    4. received files readable by other apps on Android 7 to 10;
    5. Nearby stopping for good after moving phones;
    6. received folders lost after the app closed, and leftover partial folders;
    7. a late "They match" confirming another device;
    8. double taps and cancel races;
    9. errors on background threads ending the app;
    10. a sender's own name shown instead of the paired one;
    11. paired devices lost if a save was cut short.
  - **Left as it is:** the "who" query still carries the phone's name and key fingerprint, because the desktop's parser needs them. That's noted in ADR 0193.
- **A second review of pairing v2** found four more things, all fixed here:
  1. **Retries from the middle:** a device in the middle could quit before revealing, whenever the codes wouldn't match, and try again unseen. After two such runs, this phone answers no pairing call until visibility is turned off and on, and its screen says so.
  2. **Discovery:** only announcements that parse count against an address; one address lists at most four devices; and a full list makes room by dropping the device heard from longest ago, rather than locking newcomers out.
  3. **A slow device** gets its own words: "The other device took too long to answer. Try again."
  4. **A cancel from the other side** ends the transfer as cancelled, even while it is still asking, so it can't be resumed.

- **The Mesh core:** 89 tests, 0 skipped, 0 failed, run here with JDK 21 and Gradle 9.8.1, including pairing v2 against the desktop's v2 TypeScript (`FARBAEK_MESH_SOURCE` set to the pairing branch's worktree). Before that TypeScript merges, the tests against Node fail on purpose: a desktop that can't pair should show up as a failure.
- **The app:** `:app:assembleDebug` builds (a 9.5 MB debug APK; BouncyCastle is 3.3 MB of it compressed). Android lint: 0 errors. Its warnings are the old target API note, the hub's singleton holding the application context, and the platform Switch.
- **Web:** typecheck and lint are clean. The intent link and build-number tests pass.
- **The Open Nearby button**, checked on a production demo build at 375 px:
  - **Where it shows:** absent in an ordinary browser and in app build 4; present in build 5, and on later pages in the same tab;
  - **The link:** names `com.farbaek.app` and falls back to the Mesh page;
  - **Size:** 48 px tall, with nothing scrolling sideways.
- **Workflows:** both parse, and the launch check's shell passes `bash -n`.

## After merging: what the emulator check found (2026-11-13, `fix/android-launch-runner`)

The launch check had failed on every run since run 12, before this stage, with "The emulator didn't start". Reading its summary step by step found one fault in the check and two real faults in Nearby:

1. **The check:** the emulator did start, but adb saw it as "device unauthorized". A Google Play image accepts only an adb key it was given at boot, and adb made its key afterwards. adb now starts first, and the emulator skips the prompt. The job is pinned to Ubuntu 24.04, and a failure puts what adb sees and the emulator's log in the run's summary.
2. **"Farbaek isn't responding" (run 19):** the screen and the notification took the node's snapshot on the main thread, while the node held its lock opening sockets. Snapshots are now taken on the hub's own view thread and handed over whole; the main thread never waits for the node. Run 20 had no such report.
3. **Nearby stayed on "Starting Nearby…" (runs 20 and 21):** its own log showed it had started in 150 ms. On Android, `DatagramSocket.receive()` holds the socket's lock while it waits for a packet, and discovery's send locked the same socket, so on a quiet Wi-Fi the first "who" waited for ever, holding the node's lock. Java 21's `receive()` doesn't, which is why the tests against Node never showed it. Sends now keep their own lock. A new test holds the socket's lock as Android does and checks an announcement still goes out: 3,003 ms before the fix, at once after.

Also: a start slower than 15 s now says so on screen, and starting logs each step's time (`FarbaekNearby`, no paths or contents).

**Verified:** the Mesh core's 90 tests pass (against the desktop's real Node Mesh too). Launch check run 22 passed: the app opened with no crash; the link opened Nearby, which started in 277 ms; the Visible switch appeared after 3 s, and tapping it started the transfer service in the foreground; no "isn't responding" report.

**Version:** 1.3.1, versionCode 6. versionCode 5 was built when this stage merged but never uploaded, and has the third fault, so it must never be.

## Not done

- **A real phone and computer:** the owner's phone and desktop on the same Wi-Fi are the first real check (`docs/mobile/android.md`, section 5, step 4).
- **Not ported:** the relay, direct links over the internet, and the offline queue. The browser page already covers those over the internet.
- **Saving received files** into a folder the person picks (the Storage Access Framework) isn't built; they're shared out from the app instead.
- **R8 shrinking** of the release build.
