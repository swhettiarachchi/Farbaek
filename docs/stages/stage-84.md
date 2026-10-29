# Stage 84: Images in projects

The first half of image generation, which the owner approved on 2026-10-29 ("do what you recommend most"). Projects held text only: imports skipped images, and the preview said image files by path didn't show. Now a project can hold images, and a generated image will be saved the same way (stage 85).

- **Decision record:** `docs/adr/0108-images-in-projects.md`.
- **Branch:** `feat/project-images`.

## 2026-10-29

### Done

- **Migration v68** (`20261209090000_project_images.sql`):
  - `encoding` on revisions and current files;
  - `private.image_path`;
  - the text write refuses image paths (`IMAGE_PATH`);
  - `private.put_project_image` and `app_save_binary_file` decode, hash and size in the database;
  - `get_project_file` returns the encoding;
  - search reads text only.
- **`core/workspace/images.ts`:** image paths, the 2 MB limit, signature sniffing (PNG, JPEG, GIF, WebP, AVIF, icon), and `checkImage`, which refuses renamed files.
- **Server:**
  - `saveProjectImage`, and text saves refuse image paths;
  - the writer's `saveImage`;
  - the reader lists the encoding, `getProjectContents` returns text only, and `getProjectImages` reads images;
  - restoring an image revision goes through the image write.
- **Files page:**
  - "Add an image", which shows the picture first, names it `assets/<name>` and says how to link it;
  - an image shows as a picture with its own "Replace image";
  - no line-by-line history for images.
- **Previews:** the static preview inlines the project's images as data URLs (HTML `src`, `href`, `poster` and `srcset`, and CSS `url()` from the stylesheet's own folder). On the project page, text and images are counted apart, so photos don't turn the instant preview off.
- **Publishing:** the site server returns an image's bytes with its image type.
- **Downloads:** the zip download and Export everything include images as bytes.
- **Launch page:** says when images won't be sent to Vercel or Netlify yet.

### Verified

- **PGlite** (`tests/db/project-images.test.ts`, 5):
  - stored as base64 with sha256 and size over the bytes;
  - unchanged bytes are a no-op, and a stale revision is refused;
  - no text on image paths, and no image on text paths, SVG included;
  - bad base64, empty images, over the file limit and over the project limit are refused;
  - search skips images;
  - only the server can write.
- The existing project-file tests (14) are unchanged.
- **Unit:**
  - image rules (3);
  - `saveProjectImage` and text saves (3);
  - the site server returns an image's bytes and type (1);
  - preview inlining (3);
  - a zip round trip of an image's bytes (1).
- **Full suite:** 2,039 tests; typecheck and lint clean.
- **Demo production build:** the Files page with "Add an image" and the project page at 320 to 1280 pixels, 12 page views with no sideways scroll, cut-off content, small targets or errors.

- **Migration v68 applied in production** (2026-10-29), before the code. The SHA-256 (`b34dbfef…4def0c`) was checked on the server, and it ran in one transaction. Read back:
  - both encoding columns default to `utf8`, and every existing revision is text;
  - `app_save_binary_file` is server only, and `get_project_file` and search are open to members as before;
  - the schema cache was reloaded, and the live site stayed up.

### Not verified yet

- **Adding an image on the live site:** the demo is read-only. After the merge: Files > Add an image, then the project page preview, then Publish, and the image on farbaek.si.

### Next

- **Stage 85:** generate images with Gemini, saved through `saveProjectImage`, with AI usage counted.
