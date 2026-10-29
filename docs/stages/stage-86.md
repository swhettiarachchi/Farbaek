# Stage 86: Images everywhere they belong

Stage 84 left images out of a few places: project thumbnails, a run's preview, and launches to Vercel and Netlify. This stage adds them.

- **Decision record:** `docs/adr/0108-images-in-projects.md` (its "Not yet" list is updated).
- **Branch:** `feat/images-everywhere`.

## 2026-10-29

### Done

- **`server/workspace/preview-images.ts`:**
  - `previewImages` returns every image as a data URL while they total 8 MB;
  - `referencedImageRefs` finds the images a page or stylesheet refers to;
  - `someImages` reads only those, within a budget.
- **Previews:**
  - the project page uses the shared helper;
  - a run's preview (before and after a change) shows the site's images;
  - project thumbnails show the images the home page and its stylesheets refer to (up to 6 images, 1.5 MB).
- **Launches:**
  - `server/launch/files.ts` is one list of what a launch sends: text and images, each hashed over its bytes;
  - the Launch page's fingerprint and the authorized launch both use it;
  - Vercel and Netlify uploads send an image's decoded bytes (`launchBytes`);
  - the "images won't be there" notice is gone.
- **Sandboxes:**
  - the snapshot keeps each file's encoding, and an image is written into the sandbox as its bytes;
  - the Vercel and E2B runtimes take text or bytes; their SDKs accept both (`string | Uint8Array` and `string | ArrayBuffer`);
  - before this, a project with an image would have put it into a sandbox as base64 text.

### Verified

- **Unit:**
  - `preview-images.test.ts` (3);
  - the thumbnail with images (1);
  - `files.test.ts` (1);
  - `launchBytes` (1);
  - a Netlify launch with an image named by the SHA-1 of its bytes, uploaded once (1);
  - a sandbox session gets an image's exact bytes (1).
- **Existing tests:** launch (38) and workspace tests are unchanged.

### Not verified yet

- **A launch with an image to a real Vercel or Netlify account:** the owner's check, with a connected account.
- **Capsules** still carry text only.
