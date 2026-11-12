# ADR 0192: Projects on the phone, with or without a connection

- **Status:** accepted
- **Date:** 2026-11-12
- **Stage:** 182
- **Builds on:** ADR 0079 (the installable app and its service worker), ADR 0099 (Android as a Trusted Web Activity), ADR 0110 (the phone API), ADR 0110's iPhone companion.
- **Amends:** the spec's recommendation of Expo apps for local projects and editing (section 13).

## Context

The spec asks for local workspaces on the phone: projects that open and can be edited without a connection, with diffs, and files brought in and sent out. The iPhone app is a SwiftUI companion with no files, and Android is the website in a Trusted Web Activity. An Expo rewrite would restart both store reviews and duplicate the website.

## Decision

**Keep the phone apps as they are, and add native code only where the web can't reach.** The website, and so the Android app, gets projects on the device in this stage. The iPhone app gets them in stage 184, through the phone API's new file routes.

**Keep on this device** (a project's Files card):
- The whole project is copied into the browser's own private file storage (the origin private file system), for the signed-in account only. Each file's bytes are checked against the server's hash before they're stored.
- Files are stored under their content's hash. The manifest is written last, so a copy cut short leaves the previous one whole, and no path ever becomes a storage name.
- The browser is asked to keep the storage when space runs low (`storage.persist()`). The page says honestly when it may still clear it.
- **Remove from this device** deletes the copy. If changes are still waiting, it asks first.
- The card says when the copy is out of date, from one hash of every file's revision.

**One account per browser.** The device page shows only the copies of the account that last signed in here, its owner.
- **Signing out** removes the account's project copies and leaves the device with no owner, so the page shows nothing to whoever has the phone next.
- **Another account signing in** removes the previous account's project copies.
- **Unsent saves:** in both cases they stay, unseen, until that account signs in here again. Nothing typed offline is lost, and nobody else sees it in the page.
- **Deleting the account** removes everything, waiting saves too.
- **Read-only copies:** a viewer, an archived project or a paused workspace gets a copy that can be read but not edited, with the reason in the web's own words.

**The device page, `/device`:**
- It's static, with nothing personal in it: everything it shows comes from the browser's storage. That's what lets the service worker keep it.
- It lists the kept projects, opens their files, and edits text in place. Pictures can be viewed but not edited.
- **Share a copy** makes a .zip of the project as the device has it. The system share sheet takes it where the browser can share files; otherwise it downloads.

**Saves made on the device:**
- Saving puts the file in a queue, one save per file. Saving the same file again keeps the revision the edit started from, so Farbaek can still tell whether someone else changed it in between.
- **Send** posts each save to `/app/projects/:id/device/save`, a stable route rather than a server action, so a page loaded before a deploy can still send.
  - It's a cookie write, so it needs a same-origin request, and a session before the body is read.
  - It goes through `saveProjectFile`, the editor's own use case.
  - Each save names the account that made it and the workspace its copy came from. Another account signed in here is refused (`OTHER_ACCOUNT`). The save goes to that workspace whichever one the browser has open, and only while the person is still a member.
- **A stale save** comes back as a 409 with Farbaek's file:
  - if Farbaek already has the same words, it settles by itself;
  - otherwise the person compares the two versions and chooses **Keep mine**, **Keep both** (theirs saved as `name.device.ext`) or **Use Farbaek's**;
  - a file deleted on Farbaek can be saved again or let go;
  - a file Farbaek couldn't read answers 503, never "deleted", so a change is never let go by mistake.
- **After Use Farbaek's or Keep both,** a newer waiting save of that file keeps its old starting revision, so it meets Farbaek's version as a conflict again rather than overwriting it.
- **Signed out, offline or refused:**
  - signed out: it stops and offers sign-in;
  - offline: the rest wait;
  - refused: Farbaek's own words are shown, and the save stays, ready to share.

**The service worker** keeps:
- the offline page, the logo and the icon;
- the device page, together with the built files its HTML names, in a cache that's never trimmed:
  - it's refreshed on each online visit, and a new version replaces the kept one only once every file it names has arrived;
  - a server error opens the kept copy too;
- Next.js's built files under `/_next/static/`, from the cache first, at most 400 of them.

Signed-in pages, the API and anything that isn't a GET still never touch the cache. `tests/security/service-worker.test.ts` runs the worker against fake caches to prove it.

**Files in:** "Choose files" takes a .zip, unpacked in the browser (phones can't choose a folder):
- every entry is screened exactly as a picked file;
- the unpacked size is counted as it inflates, so a zip bomb stops early;
- ZIP64, encrypted and damaged entries are refused with a reason.

**The phone API**, for the iPhone in stage 184:
- `GET projects/:id/files` lists the files;
- `GET projects/:id/file?path=…` reads one;
- `PUT projects/:id/file` saves one through `saveProjectFile`. Its 409 carries the current revision and hash.

The sample answers the reads and refuses the save.

## Consequences

- **Projects on Android work offline:** a project kept in Chrome on Android, or in the Android app, opens and can be edited with no connection, and its changes reach Farbaek when the person sends them.
- **Safari:** it can't save files to its private storage in the versions this was written against. There, the card is visibly unavailable with that reason, and the iPhone app is the way (stage 184).
- **The browser decides what it keeps:** a person can clear site data, and a phone short of space can clear storage that wasn't made persistent. The page says so; Farbaek can't prevent it.
- **Pictures are read-only on the device page.** Editing text was the spec's ask; pictures change through the web as before.
- **Checked in the browser, not yet on a real phone:**
  - the built-in browser at 375 px against a production build: keep, open, edit, save on the device, send;
  - with the server stopped, the device page and the waiting edit opened from the service worker.

  The owner's Android phone is the first real check.
- **Kept copies on a shared browser:** a person who can open the browser's developer tools can read its storage, as with any downloaded file. The page itself never shows another account's copies.
