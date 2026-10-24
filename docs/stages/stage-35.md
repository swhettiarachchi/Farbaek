# Stage 35: Signed ProofPacks

A ProofPack's digest showed nothing in it changed, but not who recorded it. "Signed ProofPacks" was on the homepage's Next list.

- **Decision record:** `docs/adr/0062-signed-proofpacks.md`.
- **Branch:** `feat/signed-proofpacks`, from `main` after #42.

## 2026-10-24

### Done

**DSSE in the core** (`src/core/trust/dsse.ts`):
- the pre-authentication encoding;
- base64;
- key ids;
- building an envelope;
- Ed25519 verification with Web Crypto.

The payload is the statement's canonical JSON, so its SHA-256 is the ProofPack's digest.

**Signing on the server:**
- `src/server/proof/signing.ts` reads `PROOFPACK_SIGNING_KEY` (Ed25519, base64 PKCS#8 DER) and signs;
- `record.ts` stores the signature;
- both apply paths call it: applying a change (`supabase-writer.ts`) and recording a check run's verification ProofPack (`sandbox/wiring.ts`);
- without a key nothing happens, and a failure is logged without touching the apply.

**Migration v34** (`20261105090000_proofpack_signatures.sql`):
- `proofpack_signatures`, with key id and signature shapes checked;
- members read it under RLS;
- it can't be updated;
- `app_record_proofpack_signature` is for the service role only and keeps the first signature.

**What people see:**
- downloads carry `dsse`;
- `/.well-known/farbaek-keys.json` publishes the public key;
- the verify page checks signatures against it, and accepts a bare envelope too.

**The verdict only names Farbaek when a signature proves it:**

| Case | Verdict | Seal |
| --- | --- | --- |
| Signed | "Intact. This ProofPack is exactly what Farbaek recorded." | Yes, when verified |
| Unsigned | "Intact. This ProofPack matches its digest, so nothing in it changed." | Yes, when verified |
| A valid signature over different evidence | "Not what Farbaek signed. Don't rely on this ProofPack." | No |
| A key Farbaek doesn't publish | A warning line | No |

**ProofPacks moved to Farbaek's domain:** new ones carry `https://farbaek.com/proofpack/v1`, as ADR 0012 required before signing (nobody has registered `farbaek.dev`). The inspector still reads the old type.

**The owner's script** `scripts/vps/set-signing-key.ps1`:
- makes the key on the VPS with `openssl`;
- stores it with `farbaek-set-env` and restarts the app;
- refuses to replace a key that's set.

### Verified

**Tests:**
- DSSE (6), including the DSSE spec's own PAE example;
- signing (2);
- the old predicate type still reads (1);
- PGlite database tests for v34 (4):
  - recorded once;
  - members only;
  - the service role only;
  - immutable;
  - shapes.
- `pnpm typecheck`, `pnpm lint` and the full `pnpm test` (1,362 tests) pass. One mesh packing test timed out once under full-suite load, then passed on a full rerun and three runs on its own.

**On the demo production build with a throwaway key** (made for the run, deleted after), in headless Chrome at 393 and 1280 px:
- the key endpoint publishes it;
- a signed sample shows "Signed by Farbaek" and the Seal;
- the same signature beside a swapped statement shows "Not what Farbaek signed" with no Seal;
- a bare envelope shows "Signed by Farbaek";
- a key Farbaek doesn't publish shows its warning;
- an unsigned file shows "Not signed";
- no page errors.

**Audits on `/verify`:** `qa:responsive` and `qa:a11y` found nothing.

**The owner's key script:** its server part was run locally against a scratch settings file, with stand-ins for `farbaek-set-env` and `farbaek-deploy`, and fed Windows line endings as a CRLF checkout sends them.
- The first run set the key and restarted.
- The second run refused (exit 3) and left the key alone.
- Other settings were untouched.
- The key parsed as Ed25519 PKCS#8, the form the app reads. It was deleted after.

**Production database:**
- v34 applied before merging with the hash-verified pattern (`c632cc70…22c5ae`); the reader asks for signatures with each ProofPack, so the table must exist first;
- read back:
  - the table, with RLS on;
  - the members-read policy;
  - `authenticated` can only `SELECT`;
  - `app_record_proofpack_signature` is executable by `service_role` only;
  - the immutability trigger;
  - no rows;
- PostgREST reloaded its schema cache at 05:58:43 UTC.

### Not verified

- **A real signed ProofPack in production.** It needs the owner to run `set-signing-key.ps1` after this merges, then one applied change. Until then the key list is empty and nothing is signed.

### Next

- **Move "Signed ProofPacks" off the homepage's Next list** once a production ProofPack shows "Signed by Farbaek".
- **Key rotation:** publish retired keys.
- **Signatures in Workspace Capsules.**
- **A page at the predicate URI** describing the format.
