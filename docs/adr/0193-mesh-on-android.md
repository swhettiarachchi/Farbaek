# ADR 0193: Mesh on Android, natively

- **Status:** accepted
- **Date:** 2026-11-12
- **Stage:** 183
- **Builds on:** ADR 0038 (Mesh nearby transfer), ADR 0094 to 0097 (Mesh over the internet and in the browser), ADR 0099 (Android as a Trusted Web Activity), ADR 0192 (projects on the phone).

## Context

On a phone, Mesh only worked through the browser, over the internet: through Farbaek's relay, or directly by WebRTC once both sides could reach Farbaek. The spec asks for sending to a computer on the same Wi-Fi with no internet, as the desktop app does. A web page can't open a TCP socket or join a multicast group, so that needs native code. Android is the website in a Trusted Web Activity (ADR 0099), so the native part has to sit beside it.

## Decision

**A native Nearby screen in the Android app, speaking the desktop's own protocol.**

**The protocol, in plain Java** (`android/mesh-core`, no Android classes):
- **A port of the desktop agent's TypeScript Mesh,** with the same names:
  - `Noise_XX_25519_AESGCM_SHA256` with the `farbaek-mesh/1` prologue;
  - the hellos in handshake messages 2 and 3, and the 2-byte frames;
  - offers, accepts, 4 MiB chunks checked by BLAKE3, resume points, and updating an earlier copy;
  - the manifest digest, BLAKE3 over RFC 8785 canonical JSON;
  - the six-digit pairing code;
  - UDP multicast discovery.
- **Every primitive comes from BouncyCastle 1.86's lightweight API:** X25519, AES-GCM, SHA-256, HMAC and BLAKE3. Android before API 33 has no X25519 of its own, and none has BLAKE3.
- **Pairing is v2 (ADR 0194):** commit, then reveal, then a code no device in the middle can steer. A peer without v2 is refused. The review before this stage found that v1's code could be matched by a device in the middle, in the desktop and the browser too; ADR 0194 fixes all three.
- **A device in the middle gets two tries:** after two pairings that end after this phone's nonce but before a valid reveal, it answers no pairing call until the person turns visibility off and on.
- **It's proved on the developer's PC, against the desktop's real Node Mesh, in both directions.** 89 JUnit tests:
  - the cacophony Noise vectors and BLAKE3 known answers;
  - canonical JSON and pairing codes matching Node's;
  - about 40 hostile paths refused before anything is written;
  - pairing v2: the shared test vector, a man in the middle whose codes never match, and wrong order, repeats and bad reveals failing closed;
  - discovery that a flood of fake devices can't grow, transfers that a double tap or a late cancel can't split, and a device list that survives a save cut short;
  - against the real Node `MeshNode`: pairing, a 9 MiB binary file, resume after a dropped connection, a tampered chunk refused, updating an earlier copy, decline and cancel, and discovery.

  On CI the Node tests skip themselves (no `node_modules`), and the rest run.
- **Receiving is stricter than the desktop:** before writing, it also refuses `.farbaek-` names, a file where a folder is needed, and folder names that differ only in case.
- **Left out for now:** Farbaek's relay, direct links over the internet, and the queue for an offline device (ADRs 0094 to 0096, 0138). The browser page already does those over the internet.

**The app** (`com.farbaek.app.mesh`):
- **`MeshActivity`, the Nearby screen,** in the web app's tokens: pill buttons, 20dp cards, 16sp inputs, 48dp targets. It shows:
  - this phone, with a "Visible to your computers" switch that turns itself off after five minutes;
  - the paired computers, with Send files;
  - unpaired computers on the same Wi-Fi, with Pair, and pairing by address;
  - the six-digit code to compare on both screens;
  - transfers: accept, decline, cancel, resume and share.
- **`MeshService`:** a `dataSync` foreground service, running only while the phone is visible or moving files.
  - Its notification shows progress and opens Nearby.
  - Android 15's daily limit (`onTimeout`) stops it at once, turns off visibility, and says so in a notification.
- **`MeshHub`:** one node per process. It holds the Wi-Fi multicast lock only while the phone looks for or announces itself.
- **The phone's key:** `KeystoreVault` seals its 32 bytes with AES-GCM under an Android Keystore key that can't be read out.
  - Backups are off.
  - Moving to a new phone doesn't copy the Mesh folder (`data_extraction_rules.xml`).
  - A sealed key that can never be opened again (its Keystore key gone, or the seal broken) starts Nearby fresh, and says so; a passing Keystore error doesn't.
- **Receiving:** files go to the app's private storage, which no other app can read on any Android version, guarded with `lstat`, so a link or hard link is never written through.
  - A **Received** list shows every folder still on the phone, with Share and Delete, after the transfer is gone or the app was closed.
  - Sharing them out goes through the FileProvider, one grant at a time.
- **Answers to a pairing** go with that pairing's id, on a queue that never waits behind long work, so a late tap can't confirm a different device.
- **One tap is one action:** buttons turn off when pressed.
- **After Android's daily limit,** the service isn't started again until the person opens Nearby, and a refused start is caught rather than ending the app.
- **Sending:** the files a person picks are copied into a folder named for the phone, so the computer sees where they came from, then packed and sent.

**The way in:** the Mesh page shows **Open Nearby** only inside the Android app, from build 5. That's the first build with the screen, and builds now say which they are in their launch address (`android_build`). The link is `intent://nearby#Intent;scheme=farbaek-mesh;package=com.farbaek.app;…`:
- it names Farbaek's own package, so no other app can answer it;
- without the app, the browser stays on the Mesh page.

The screen takes no action from the link: any page could open it, but nothing is paired, sent or received until the person chooses.

**Checked by CI on a real Android 14 emulator** (`android-launch.yml`):
- the link opens Nearby;
- turning on Visible starts the service in the foreground;
- nothing crashes.

## Consequences

- **Android phones send to a computer on the same Wi-Fi with no internet,** encrypted end to end, every piece checked, the same as two computers.
- **The download grows by about 3 MB:** BouncyCastle is one dex file of 8.1 MB, 3.3 MB compressed, measured in the debug APK. The release build isn't shrunk yet; turning on R8 could take most of that back, and needs its own launch check.
- **Received files live in the app** until the person shares or deletes them. Saving into a folder of their choice (the Storage Access Framework) isn't built.
- **Discovery still names the phone** in its "who" query, because the desktop's parser needs a name and fingerprint there. Changing that needs both sides at once.
- **An interrupted incoming transfer doesn't survive the app being closed,** as on the desktop: the sender resumes it as a new transfer.
- **New Play Console declarations,** which are the owner's: the `dataSync` foreground service, with its reason. Data safety is unchanged, since the files go to the person's own computer and nothing reaches Farbaek.
- **Not yet tried between a real phone and a computer.** The owner's phone and desktop on the same Wi-Fi are the first real check.
- **The iPhone gets the same in stage 184,** with Bonjour for discovery.
