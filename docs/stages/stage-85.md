# Stage 85: Image generation

The second half of image generation. Built on stage 84 (images in projects); approved by the owner on 2026-10-29 ("do what you recommend most").

- **Decision record:** `docs/adr/0109-image-generation.md`.
- **Branch:** `feat/image-generation`, stacked on `feat/project-images`.

## 2026-10-29

### Done

- **`server/ai/gemini-image.ts`:**
  - `generateContent` for an image, falling back to the Interactions API once;
  - `findImage` reads either answer;
  - `wasBlocked` and `usageOf` (never below the price of one image);
  - the key goes in a header.
- **`server/ai/image-config.ts`:** needs `GEMINI_API_KEY`, and takes an optional `GEMINI_IMAGE_MODEL`.
- **`server/workspace/image-generation.ts`:**
  - checks the person, the prompt (3 to 1,000 characters), the shape and the name;
  - reserves `image_generation` usage;
  - checks the bytes are an image, names it from its real kind, and adds a number to a taken name;
  - saves through the upload path, then settles, or refunds on any failure.
- **Rate card:** `gemini-3.1-flash-lite-image` at $0.25 input and $30 output per million tokens.
- **Usage:** `image_generation` is an operation.
- **Migration v69:** the ledger accepts it.
- **Files page:** "Or generate one" under Add an image:
  - a description, a shape (Wide, Landscape, Square, Portrait or Tall, as pills) and a name;
  - "Generate image";
  - a link to open what was saved;
  - the reason when it's unavailable.
- **Privacy:** the Google processor entry names image generation.

### Verified

- **Unit:**
  - `gemini-image.test.ts` (4): the request shape, the key in the header, the Interactions fallback, safety, busy and empty answers, and the usage floor;
  - `image-generation.test.ts` (4): reserve, save and settle at 337 units, a taken name, JPEG as .jpg, a refund for every failure including a save that fails, nothing reserved for a bad request, and name handling.
- **PGlite:** the ledger accepts `image_generation` and refuses unknown operations.
- **Typecheck, lint, and the design, billing, AI and workspace tests** (437) are clean.

- **Migration v69 applied in production** (2026-10-29). The SHA-256 (`95024830…993a07`) was checked on the server, it ran in one transaction, and the ledger check was read back with `image_generation` in it.

### Not verified yet

- **A real image from Google.** Claude never handles API keys. After the merge:
  1. In Files > Add an image > Or generate one, describe an image and generate it.
  2. If the form says it isn't connected, set `GEMINI_API_KEY` on the server.
  3. If Google refuses the request shape, the message says nothing was counted, and the client is adjusted from that answer.
