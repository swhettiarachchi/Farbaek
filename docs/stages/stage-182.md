# Stage 182: Projects on the phone

- **Branch:** `feat/phone-projects`, from `main` (0d9f9b9).
- **ADR:** 0192.
- **Migration:** none.
- **Skills:**
  - **Screens:** `farbaek-ui` and `farbaek-human-made` for the device page and the Keep on this device card. Status is `StatusBadge`'s kinds, numbers are in sentences, there are no new eyebrows or chips, and the icons name the action.
  - **Phone screens:** `mobile-app-ui-design`, to check the device page:
    - primary actions low on the screen (the save bar is pinned to the bottom and stays above the keyboard);
    - empty states that say what to do next, and a clear success line after sending;
    - 44px targets and 16px inputs;
    - the back button walks back through views.
  - **Security:** `ecc-security-review`'s checklist (loaded earlier in this session) for the save route, the storage and the service worker. That covers the same-origin check, the body cap, what may be cached, and one account per browser.

## What the owner asked

"Full phone apps" was one of the six parts not built, and the owner said "setup all and use skills". The plan splits it in three: this stage (the website and the Android app), 183 (Mesh on Android) and 184 (the iPhone).

## What changed

- **Core** (`src/core/workspace/device-copy.ts`):
  - what a kept copy and a waiting save are, read defensively from storage;
  - one waiting save per file, keeping the revision the edit started from;
  - settling when Farbaek already has the same words;
  - the "keep both" name, `name.device.ext`;
  - the compare lines;
  - one hash of a project's revisions.
- **Storage** (`src/components/device/device-store.ts`):
  - the browser's private file storage, files stored under their content hash, the manifest written last;
  - one account per browser, with a lock across tabs;
  - asking the browser to keep the storage.
- **Server:**
  - `GET /app/projects/:id/device/copy` sends the project with each file's revision and hash, checked against the contents;
  - `POST /app/projects/:id/device/save` sends one save through `saveProjectFile`, with a same-origin check and a 3 MB body cap. A stale save gets a 409 with Farbaek's file (`src/server/workspace/device-saves.ts`, `device-wiring.ts`).
- **Keep on this device**, on a project's Files card: keep, update, open on the device page, and remove (asking first when changes are waiting). It says when the copy is out of date.
- **The device page, `/device`:**
  - kept projects, a file list with a search box, an editor, and pictures to view;
  - changes waiting, sent one at a time;
  - the compare, with Keep mine, Keep both and Use Farbaek's;
  - Share a copy as a .zip (the share sheet, or a download);
  - Remove from this device.
- **Accounts:**
  - the device page shows only the copies of the account that last signed in here;
  - signing out removes the project copies and leaves no owner, so the page shows nothing;
  - another account signing in removes the previous one's copies;
  - unsent saves stay unseen until their account signs in here again;
  - deleting the account removes everything.
- **Each save names its account and workspace:** another account can't send it, and it goes to the workspace its copy came from.
- **Read-only copies** for viewers, archived projects and paused workspaces, with the reason.
- **Service worker:** the device page and the built files it names are kept for offline use, in a cache that's never trimmed. A new version replaces the kept one only once all its files have arrived, and a server error opens the kept one. Other built files are served from the cache once fetched. Signed-in pages, the API and writes never touch the cache. The offline page links to the device page.
- **Zip import:** "Choose files" takes a .zip, unpacked in the browser and screened like any picked file. The existing zip reader (`unzip.ts`, shared with Capsules and the rescue and GitHub imports) gained an injected inflate, a streamed limit, and the option to strip one top folder. Two of its refusals changed for the other imports too: an entry with ZIP64 markers now refuses the whole archive, and broken deflate data is "Damaged in the zip".
- **Phone API** (for stage 184):
  - `GET projects/:id/files` and `GET projects/:id/file?path=…`;
  - `PUT projects/:id/file`, whose 409 carries the current revision and hash, with a 3 MB cap for this route only;
  - the sample answers the reads and refuses the save.

## Verified

- **Independent review:** a fresh agent read the risky files before the PR, as for stages 157, 158 and 181. It found a privacy problem: signing out with a change still waiting kept every project copy visible on the device page to whoever had the phone next. It also found eleven smaller ones. All twelve are fixed here:
  1. sign-out now removes the copies and the owner;
  2. saves are tied to their account and workspace;
  3. "Use Farbaek's" and "Keep both" no longer move a newer waiting save onto Farbaek's revision;
  4. the copy no longer retries against a reader that cached its first list;
  5. saves go to the copy's own workspace;
  6. the device page is replaced only when all its files arrive;
  7. one image under `build/` no longer hides a whole copy;
  8. copies are read-only where nothing can be saved;
  9. another account signing in keeps the previous one's unsent saves;
  10. a byte order mark is kept;
  11. an unreadable file is never called deleted;
  12. the session is checked before a large body is read.
- **Unit tests:**
  - the core (14);
  - sending saves (6): saved, settled, conflict, refused, offline, signed out, another account;
  - the copy and save route logic (9): a copy refused when a save lands in between, the save reason, conflicts with Farbaek's file, an unreadable file, refusals in the editor's words;
  - the service worker against fake caches (9): what install keeps, nothing signed in cached, the device page offline, built files from the cache, the device page's files never trimmed, an older page's files let go, a newer page with a missing file not taken, a server error, other sites left alone;
  - the zip reader (21) and the import's zip step (6);
  - the phone API's file routes (in `api.test.ts`).
- **In the browser:** the built-in browser at 375 px against a production demo build:
  - Keep on this device kept 8 files and said "It matches Farbaek";
  - the device page listed the project, opened README.md, and saved an edit on the device;
  - sending it was refused in the demo's own words, and the change stayed;
  - with the server stopped, the device page and the waiting edit opened from the service worker, and any other page showed the offline page with its link;
  - after the review's fixes, the demo's copy opened read-only with the demo's reason, at 375 and 1280 px.
- **Audits** on `/device`, `/offline` and a project page: `qa:a11y` found nothing (6 page views), and `qa:responsive` found nothing scrolling sideways, cut off, too small to tap or logging errors (33 page views, 320 to 1440 px).
- **Whole suite:** 2,974 tests pass (17 skipped). Typecheck and lint are clean.

## Not done

- **A real phone:** the owner's Android phone, in the Android app: keep a project, turn on flight mode, edit a file, turn it off, send.
- **Safari** can't write files to its private storage in the versions this targets. The card says so there; the iPhone app gets files in stage 184.
- **The iPhone fixtures** (`fixtures.test.ts` and `ios/FarbaekTests/Fixtures`) don't include the new file routes yet; stage 184 adds them with the app's screens.
- **Pictures** can be viewed on the device page, not edited.
