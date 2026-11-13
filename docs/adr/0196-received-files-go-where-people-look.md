# ADR 0196: Received files go where people look

- **Status:** accepted
- **Date:** 2026-11-13
- **Stage:** 188
- **Amends:**
  - ADR 0193 (Nearby on Android: received folders stayed in the app's private storage);
  - ADR 0038 (Nearby on the desktop: a folder dialog on every offer).

## Context

On 13 Nov the owner sent their first real photo, from their phone to their computer. It arrived intact, and they couldn't tell or find it:
- the desktop's folder dialog opened in their user folder, and they clicked Save there;
- the received row said only "Checked", with no notification, preview or Show in folder;
- on the phone, received files never leave the app's private storage, so they aren't in Gallery or Downloads, and Share is the only way out.

They asked how a person knows it arrived, and where it went.

## Decision

The arrival is designed as the moment people came for. On both devices the person learns:
- that something is coming;
- that it arrived;
- **what** it is;
- **where** it is, in the words their file manager uses;

and gets one tap to open it.

**The computer (Farbaek Agent):**
- **Saving with one click:** the offer's main button saves into the save folder: Downloads at first, then the folder the person last chose with Choose folder. The offer says where before the click. One click works only while the window is in front, so a person is looking at the offer. The main process works out the folder; the page never sends a path.
- **Notifications** when the window isn't in front:
  - for an offer: "Redmi A5 wants to send you 1 file (130 KB)";
  - for an arrival: "Photo from Redmi A5 arrived. Saved in Downloads › …";
  - the text alone says where, because a notification's click isn't always delivered;
  - the taskbar button flashes, and the taskbar shows progress while files move.
- **An arrival card:** what arrived, up to four photo thumbnails, where it is, then Open, Show in folder, and Done.
- **Recently received:** the last 30 arrivals, kept across restarts. Each says whether its folder is still there.

**The phone (Farbaek for Android, from 1.4.0):**
- **Where files go:** after a transfer is checked, its files are copied into shared storage, one place per transfer:
  - `Pictures/Farbaek/<name>` when every file is a photo or a video;
  - `Download/Farbaek/<name>` otherwise.
  - The folder keeps its structure.
- **Consent:** the offer says where the files will go before Accept, with a switch, "Save to Gallery and Downloads", on by default. Accept is the person's consent to that place. With the switch off, files stay inside Nearby, as before.
- **Safe copying:** each file is copied exactly once and checked, then removed from private storage. A copy cut short by the app being stopped carries on when it starts again.
- **Old Android:** on Android 9 and earlier, files stay in Nearby with Share, and the screen says so.
- **Notifications:** offers and arrivals are announced, privately on the lock screen, and not while Nearby is on screen.

## Rules that keep it safe

- **Nothing received runs.** Open opens a file only when its real extension is a kind that opens in a viewer: photos, video, audio, PDF and plain text. Everything else is shown in its folder or shared. SVG and HTML are left out, because a browser runs their scripts.
- **Names can't disguise themselves.** Invisible formatting characters (Unicode Cf, such as a right-to-left override) are removed from every name the app shows or puts in a notification.
- **Actions name an id, never a path.** Show in folder, Open, thumbnails and the history all name a transfer's id, and the main process checks the folder still exists before acting.

## Consequences

- **The privacy promise changes:** received files are no longer private to the app by default. Gallery and file apps on the phone can see them, as they see any download. The offer says so before Accept, and the switch keeps the old behaviour.
- **Desktop data:** the desktop keeps a small `nearby-received.json` and `nearby-settings.json` (the save folder) in its data folder. Both stay on the computer.
- **Follow-ups:**
  - marking received files as coming from another device (Windows' Zone.Identifier), so Windows asks before running a received program the person opens themselves;
  - asking before the window closes while files are still arriving;
  - telling the sender where the files were saved, which needs a protocol change.
