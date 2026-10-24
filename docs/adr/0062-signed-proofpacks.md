# ADR 0062: Signed ProofPacks

- Status: accepted (2026-10-24).
- Builds on ADR 0012 (ProofPacks) and ADR 0039 (Portable Proof, the verify page).

## Context

**A ProofPack's digest proves the record is unchanged, not who made it.** Anyone can write an in-toto statement in Farbaek's shape and compute its SHA-256, and the verify page would call it intact. The page says so plainly. ADR 0012 left signing for later.

**The homepage lists "Signed ProofPacks" under Next.** It's the step that turns "this file is internally consistent" into "Farbaek recorded this".

**ADR 0012 made one condition:** the placeholder predicate URI (`https://farbaek.dev/proofpack/v1`) must be replaced with an owned domain before any signing. Nobody has registered `farbaek.dev`.

## Decision

**The format is DSSE, the envelope in-toto and Sigstore tools read:**
- the payload type is `application/vnd.in-toto+json`;
- the payload is the statement's RFC 8785 canonical JSON, so the payload's SHA-256 is the ProofPack's digest;
- the signature is Ed25519 over DSSE's pre-authentication encoding (`DSSEv1 <len> <type> <len> <payload>`);
- `src/core/trust/dsse.ts` encodes and verifies it with Web Crypto, so the server, the verify page and the future apps share one implementation.

**One Ed25519 key, made on the server:**
- `PROOFPACK_SIGNING_KEY` holds the private key as base64 PKCS#8 DER (`src/server/proof/signing.ts`);
- the owner's `scripts/vps/set-signing-key.ps1` makes it on the VPS with `openssl genpkey`, stores it with `farbaek-set-env` and restarts the app, so the private key never leaves the server and nobody sees it;
- the script refuses to replace a key that's set, since evidence signed with the old key would stop checking out;
- the key id is `farbaek-` and the first 16 hex characters of the SHA-256 of the raw public key.

**The public key is published** at `/.well-known/farbaek-keys.json`: issuer, use, and `keys: [{ keyid, type: "ed25519", publicKey }]`, open to any origin and cached for five minutes. An empty list means the server isn't signing.

**When signing happens:**
- right after a ProofPack is recorded: when a change is applied (`applyProposal`) and when a check run records its verification ProofPack;
- the signature is stored beside the ProofPack in `proofpack_signatures` (migration v34) through `app_record_proofpack_signature`, which only the service role can call;
- members read it with the ProofPack under RLS; a signature never changes once written, and a second one for the same ProofPack is ignored;
- signing never blocks or undoes the work: without a key nothing happens, and a failure is logged while the ProofPack stays unsigned.

**What people get:**
- a downloaded ProofPack carries `dsse` beside `digest`, `status` and `statement`;
- the verify page loads Farbaek's keys and says, with an icon and words:
  - "Signed by Farbaek with key …";
  - "Signature doesn't check out", including when a valid signature belongs to different evidence than the file holds;
  - "Signed with a key Farbaek doesn't publish";
  - "Not signed", with what the digest still proves;
  - "Signed, but Farbaek's keys couldn't be loaded";
- the page also accepts a bare DSSE envelope.

**ProofPacks move to Farbaek's domain:**
- new ProofPacks carry `https://farbaek.com/proofpack/v1`;
- ones recorded before keep `https://farbaek.dev/proofpack/v1`, and the inspector still reads them;
- other evidence types (check receipts, recovery receipts, security reports) aren't signed and keep their URIs for now. Two database functions check those exactly, so they move when they're signed.

**Not Sigstore yet.** Keyless signing needs an OIDC identity for the server and a transparency log on every signature. One published key is enough to say who recorded a ProofPack. DSSE is the envelope cosign reads, so moving later keeps the format.

## Consequences

- **A signed ProofPack shows who recorded it.** A record edited in the database no longer matches its signature, and evidence written by someone else can't carry Farbaek's.
- **Nothing is signed until the owner sets the key.** ProofPacks recorded before then stay unsigned and aren't signed afterwards. Signing an old record would vouch for what's in the database now, not what was recorded then.
- **Whoever controls the server can sign.** The key sits in the server's settings like the other secrets, and isn't in a hardware module.
- **Trust in the key rests on HTTPS to www.farbaek.com.** The key list is the anchor, so it's served from Farbaek's own domain and nowhere else.
- **No rotation yet.** Replacing the key needs the old public key kept in the published list, marked retired. The script refuses until that exists.
- **Not yet:**
  - signatures in a Workspace Capsule;
  - a page at the predicate URI describing the format;
  - signing the other evidence types.
