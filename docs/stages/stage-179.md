# Stage 179: Images in Capsules

- **Branch:** `feat/capsule-images`, from `main` (e0f64fb). It doesn't depend on stage 178.
- **ADR:** 0189.
- **Migration:** none.
- **Skills:**
  - **Screens:** `farbaek-ui` and `farbaek-human-made`.
  - **Security:** `ecc-security-review`, for an untrusted upload and its size.
  - **Building:** `tdd-workflow`.

## What the owner asked

"Images in Capsules" was one of the six parts not built, and the owner said "setup all and use skills". A Capsule left a project's images behind.

## What changed

- **Packing (`src/core/mesh/capsule.ts`, `src/server/mesh/capsules.ts`):**
  - a project's images go in as their bytes, only when they're the kind their name says;
  - other binaries are listed as left out, as before.
- **Opening:**
  - an image path is let in only when its bytes pass `checkImage`;
  - every byte is hashed again, as before;
  - old text-only Capsules open unchanged.
- **Importing:**
  - images are saved through the upload's own path, over the revision they replace;
  - they compare by their bytes' hash;
  - keep both makes `name.capsule.png`;
  - the compare view shows both pictures.
- **Upload:**
  - `POST /app/mesh/import` replaces the server action;
  - it checks the origin, then the size before reading the body;
  - Capsules can be up to 9 MB, under the proxy's 10 MB body buffer, and images up to 2 MB each.
- **Words:** the Move projects page says images are included. A verified Capsule says how many images it holds, each "the kind its name says".

## Verified

- **Core** (`src/core/mesh/capsule.test.ts`, 6 new tests):
  - an image packs and opens byte for byte;
  - an `.exe` named `.png`, a PNG named `.jpg` and a stray binary are left out with reasons;
  - a forged Capsule listing an exe's true hashes under an image name is refused;
  - an image changed after packing is refused;
  - an old text-only Capsule opens;
  - images compare and copy like text.
- **Server** (`src/server/mesh/capsules.test.ts`, 3 new tests, with fakes):
  - packing includes images;
  - importing writes new images and kept copies through the image path at revision 0;
  - a differing image is replaced over its current revision only when chosen.
- **Existing suites:** Mesh, agent transfer and Capsule database tests all still pass.
- **Static checks:** typecheck and lint.

## Not done

- **A real Capsule with photos** moved between two real workspaces. The first production use is the check.
- **Fonts, videos and other binaries:** projects don't hold them yet either.
