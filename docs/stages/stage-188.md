# Stage 188: "It arrived, and here it is"

- **Branches:**
  - `feat/nearby-arrival-desktop` (the computer);
  - `feat/nearby-arrival-android` (the phone).
  - Both start from `main` at 33f2ce5.
- **ADR:** 0196, "Received files go where people look". It amends ADR 0193 and ADR 0038.
- **Migration:** none.
- **Skills:**
  - **`premium-app-ui`:** the peak and the end of a flow; success that's brief, then the next step.
  - **`mobile-app-ui-design`:** the peak-end rule and the thumb zone.
  - **`ui-ux-pro-max`:** confirm success, never finish silently; haptics only to confirm.
  - **`farbaek-ui` and `farbaek-human-made`:** StatusBadge's kinds, plain words, mono only for paths.
  - **`ecc-security-review`:** nothing received runs; ids instead of paths over IPC.

## What the owner asked

After their first real send from phone to computer: how does a person know it arrived, and where did it go? "Think deeply and design it, using the skills."

## The design

The full design, in the person's words and with its safety rules, is in ADR 0196. In short:
1. **Something is coming:** a notification on the computer and the phone, an offer that says where it will go, and one-click save on the computer.
2. **On its way:** taskbar progress on the computer, and the ongoing notification on the phone.
3. **It arrived:**
   - a check, what it is, and thumbnails;
   - "Saved in Downloads › …";
   - Open (safe kinds only) and Show in folder;
   - a notification whose words say where it went.
4. **Later:** Recently received on the computer, kept across restarts. Received on the phone, with where each arrival went.

An independent planning review changed the first draft in six places:
- Open only for kinds that open in a viewer;
- one-click save only while the window is in front;
- each transfer kept whole in one place;
- consent at the offer;
- saving counted as busy work on the phone;
- changes detected on every update.

## The computer (Farbaek Agent), done

**New plain modules, with tests:**
- **`desktop/src/main/nearby-words.ts`:** where a folder is, in words (most specific known folder first, without regard to letter case on Windows, OneDrive included). It also:
  - removes invisible characters from names;
  - holds the Open allow-list;
  - says what arrived ("1 photo and 1 file");
  - writes the notification words.
- **`desktop/src/main/nearby-events.ts`:** what changed since the last update: offers waiting, offers ended, arrivals seen done for the first time, and taskbar progress.
- **`desktop/src/main/received-log.ts`:** the last 30 arrivals, checked with zod when read and written whole. A damaged file is an empty history.

**`desktop/src/main/mesh.ts`:**
- **Watching:** changes are checked on every update, window or not.
- **Notifications:** for an offer when the window isn't in front; closed when the offer stops waiting; for an arrival.
- **The taskbar:** it flashes and shows progress.
- **One-click save:** into the save folder, while the window is in front. Choose folder… remembers the folder.
- **New handlers:** `mesh:show-in-folder`, `mesh:open-received` (the file only when its kind opens in a viewer, otherwise the folder), `mesh:arrival` (files and up to four thumbnails, on Windows and macOS) and `mesh:forget-received`. Each takes a transfer's id, never a path.
- **Supporting changes:**
  - `src/agent-runtime/mesh/node.ts` adds `receivedFiles(id)`;
  - `main.ts` sets the app's id for Windows notifications, stops the flashing on focus, and brings Nearby forward when a notification is clicked.

**The page (`nearby.tsx`, `app.tsx`, `styles.css`):**
- **The offer:** "It goes into a new folder in Downloads", then Save to Downloads, Choose folder…, Update an earlier copy, and Decline.
- **The arrival card:** a check that pops once (not with reduced motion), "Arrived from …", Saved, what and how much, thumbnails, "Saved in …", then Open photo or Open folder, Show in folder, and Done.
- **Recently received:** each entry has its place, Open, Show in folder and Remove from list. A folder that has gone says so and offers only Remove from list.
- **The nav:** Nearby shows how many offers are waiting.
- **Wording:** a send that finished now says "Delivered", not "Checked".

## Verified (the computer)

- **Tests:** `nearby-words`, `nearby-events` and `received-log` (16 new). `pnpm typecheck` passes, lint is clean, and the desktop, design and mesh tests pass (283).
- **A live check with two scratch copies of the app** (separate data folders, driven over the DevTools protocol through the app's own bridge; the owner's own app and data untouched):
  - **Pairing:** both showed code 006462.
  - **One photo:**
    - the receiver, in the background, logged exactly one offer notification ("DESKTOP-9OIQ8KS wants to send you 1 file (1.4 MB)"), closed it on accept, and logged exactly one arrival ("Photo from DESKTOP-9OIQ8KS arrived. Saved in …");
    - the arrival card showed "Arrived from DESKTOP-9OIQ8KS", Saved, "1 photo, 1.4 MB", one thumbnail, "Saved in …", and Open photo, Show in folder and Done;
    - screenshots at 1200 and 760 px.
  - **A photo and a `setup.exe`:**
    - the card said "1 photo and 1 file" and offered **Open folder**, not Open;
    - the file list marked the `.exe` as not openable;
    - one offer and one arrival notification again.
  - **History:** after both were dismissed and the app restarted, Recently received still listed both. After one received folder was deleted, it said "It's no longer in … It may have been moved or deleted." and offered only Remove from list.
- **An independent review of the desktop change** found these, and all are fixed in the second commit:
  - **Windows notifications:** they stayed in the notification centre, because Windows says "close" when a notification moves there. They now stay referenced until Nearby takes them back.
  - **One-click save's boundary:** it now also needs a real click or key press in the last five seconds, input the page can't make up. There's one accept per offer, in the main process and in `IncomingTransfer.accept`.
  - **Thumbnails:** at most six tries, photos up to 20 MB.
  - **A stale snapshot:** the state is built arrivals first.
  - **The history:** one that can't be read just now is never overwritten, and an arrival is still announced if its history can't be written.
  - **Names:** received folder names lose invisible characters, and a name ending like a package or shell location (`.app`, `.pkg`, `.{CLSID}`) gets a hyphen, so Open folder opens a folder. Names on the page and in notifications are shown without disguising characters.
  - **The closed window:** it's let go, and the timer checks it's still there.
  - **Screen readers:** the Nearby count is read out.
  - **Tests:** `pnpm typecheck` and lint pass, and the desktop, design and mesh tests pass (284).
- **Not checked here:**
  - **Real Windows notifications:** they need the installed app (NSIS or Store), so the check used the notification log instead.
  - **One-click save's focus rule:** it's bypassed when testing with a fixed save folder.
  - **Show in folder and Open:** they call Windows itself, and weren't clicked here.

## The phone (Farbaek for Android 1.4.0), done

**Plain Java in the mesh core, with JUnit tests:**
- **`SavePlan`:** where a transfer goes, as one place so a folder stays whole: Gallery (`Pictures/Farbaek`) when every file is a photo or a video, otherwise Downloads (`Download/Farbaek`). It also:
  - gives MIME types from real extensions;
  - cleans names (no invisible characters, nothing that reads as a path);
  - decides which kinds open with a tap;
  - makes folder names unique;
  - writes the words for offers and arrivals.
- **`ReceivedLog`:** what arrived and how far each copy has got. It's written whole, a damaged file reads as empty, and an entry taken off the list is never put back.

**`MediaSaver` makes each copy exactly once:**
- each item is made hidden (IS_PENDING), copied while hashed, flushed to disk, read back and compared, then shown;
- progress is written in batches, and a private copy goes only after the batch that published it is written;
- after a stop, it deletes our hidden items in that folder and takes over items already shown (same folder, name and size);
- on Android 10, a Gallery transfer with a video goes to `DCIM/Farbaek`, where Android allows videos.

**`MeshHub`:**
- offers and arrivals are found in each snapshot, off every lock, and arrivals are handed once to a saver thread of their own;
- saving counts as busy work for the foreground service;
- the switch is read when the person presses Accept;
- copies resume after a restart.

**`NearbyNotices`:** a new "Files from your computers" channel for offers and arrivals. Notifications are private on the lock screen, one per transfer, and not posted while Nearby is on screen.

**The screen:**
- **The offer:** it says where the files will go, with the "Save to Gallery and Downloads" switch beside Accept.
- **The arrival:** a check that pops once, "Arrived from …", Saved, Saving or Kept in Nearby, thumbnails, "Saved in Gallery › Farbaek › …", file rows that open (safe kinds only), and Open Downloads, Share, Try again and Done.
- **Received:** saved arrivals, and ones since deleted in Gallery ("Removed from this phone").
- **The Receive card:** it says when notifications are off, with a way to turn them on.

**Samples and version:** new debug samples (`offer`, `kept`, `saving`, `arrived`, `received`) and a notification screenshot in the launch check. Version 1.4.0, versionCode 9.

## Verified (the phone)

- **Build and tests:**
  - mesh-core JUnit: the new `SavePlanTest` and `ReceivedLogTest` pass, and so do all earlier tests;
  - `:app:assembleDebug`, the release compile, `:app:assembleRelease` locally, and Android lint pass, with no errors and no new-API, accessibility or unused warnings.
- **The launch check** (run 43443941741, Android 14 emulator):
  - the release app opens, Nearby opens, Visible starts the service, and nothing crashed;
  - 39 screenshots, looked at by eye:
    - **the offer:** where it goes, with the switch;
    - **the arrival:** "6 photos, 23.0 MB", sample thumbnails, "Saved in Gallery › Farbaek › Site photos", file rows, Share and Done;
    - **Received**, and **the not-visible computer** ("Not visible now");
    - **the notification shade:** "DESKTOP-9OIQ8KS wants to send…" with "12 files, 46.0 MB. Open Nearby to accept…", and "6 photos from DESKTOP-9OIQ8KS arrived" with "In Gallery › Farbaek › Site photos."
- **The switch:** the screenshots showed the "on" switch cut off on the right, because Android's switch counted the thumb's insets as padding. The thumb is now a layer with no padding.
- **An independent review of the phone change** found these, and all are fixed:
  - offer notifications never fired (a new offer only says "changed");
  - the log was rewritten two or three times per file, while the main thread waited on it;
  - Android 10 doesn't allow videos in Pictures;
  - Remove from list while saving was undone;
  - a thumbnail that couldn't be drawn read as "deleted";
  - Share after a partial save sent only part of it;
  - a private folder could be removed when not fully listed;
  - folder names were checked only against the log;
  - the switch was read at the wrong moment;
  - two targets were under 48dp.
- **Two launch check runs failed** for GitHub's own reasons: once packaging, once a DNS lookup when uploading. Neither was in the app. The next run passed.
- **Not checked here:**
  - a real copy into MediaStore, which needs a real phone or an Android 10+ emulator with files sent to it;
  - the resume after a stop;
  - Android 10's DCIM route.
  
  These are the owner's checks on their phone through Internal testing, listed in `docs/mobile/android.md`.
