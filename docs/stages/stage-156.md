# Stage 156: Replacing pictures in Studio works with your own photos

- **Branch:** `fix/studio-photo-replace`, from `main` after PR #200.
- **Skills used** (the owner asks for them on every build): `chrome-browser` to reproduce it in the owner's Studio, and `premium-app-ui` / `farbaek-ui` rules for honest, no-dead-end controls.

## What the owner hit

"I try to replace this image but I can't replace images." That was the milk bread photo in Sunrise Bakery's menu.

## What was wrong

1. **Uploading your own photo threw the draft away.**
   - The Studio page keyed both editors on every project file and its revision (`key={files.map(…)}`).
   - **Upload a photo** saves the image to the project at once, and the server action refreshes the page.
   - The new image file changed the key, so React mounted a fresh editor from the saved files.
   - The draft was lost, and so was the step that puts the uploaded photo in the picture. The photo was saved, but the picture never changed, and any other unsaved edits vanished.
   - Picking a **Real photo** uploads nothing, so it worked. That's why it looked random.
2. **Real photos opened on the wrong subject.**
   - Replace opens on the subject of the photo being replaced. When that isn't a library photo (the agent's Picsum stand-ins), it fell back to "Laptops, desks and notebooks".
   - The owner's draft showed the result: the Fish bun card got a laptop photo, and the hero's still got a pool photo.

## What changed

- **`studioEditorKey`** (`src/core/studio/editor-key.ts`): the editors are keyed on the files they edit (text), not on images.
  - A save still starts them over from the saved files.
  - An upload no longer does, so the photo lands in the picture and the rest of the draft stays.
  - Used for both the visual editor and the component editor (`src/app/app/projects/[projectId]/design/page.tsx`).
- **`subjectForText`** (`src/core/media/photos.ts`): the subject a site's own words point to, most specific first. Replace opens on the photo's own subject, then the picture's description, then the page's title, then the old default.
  - "A soft bun with a spiced fish filling" and "Sunrise Bakery" open on bakery photos.
  - The inspector passes the picture's description and the page title (`src/components/studio/media-replace.tsx`, `visual-editor.tsx`).

## Verified

- **New tests:**
  - An uploaded or replaced image keeps the editor key, and a new text revision or new page changes it.
  - Bakery words in descriptions and titles open on bread. Café, restaurant, hotel, resort, spa, salon and software words find their subjects. Empty or vague words return nothing.
- **Checks:** typecheck and lint are clean, and the full suite passes 2,649 tests.
- **Reproduced first in the owner's Studio:**
  - Picking a Real photo for the milk bread picture changes it at once. I undid it to leave the owner's draft as it was.
  - The owner's draft held the laptop and pool photos described above.
  - The upload's page refresh and key change were confirmed in the code.

## Not checked yet

- **Uploading a real photo on production.** It adds a file to the owner's project, so it's for the owner to do after the merge, with their own bakery photo.

## Next

- After the merge, ask the owner to upload their photo for the milk bread picture. Then check that it shows at once and that the draft's other changes stay.
