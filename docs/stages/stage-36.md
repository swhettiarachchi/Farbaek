# Stage 36: The ProofPack format page, and the bare domain

Signed ProofPacks (stage 35) name `https://farbaek.com/proofpack/v1` as their type. That address went nowhere useful.
- `www.farbaek.com/proofpack/v1` was a 404.
- `farbaek.com` itself is answered by Spaceship's URL forwarding, which sends every path to the homepage. Any `farbaek.com/...` link anyone shares lands there too.

- **Builds on:** ADR 0062 (its "a page at the predicate URI" item).
- **Branch:** `feat/proofpack-format`, from `main` after #43.

## 2026-10-24

### Production, before this branch

- **The signing key is set.** The owner ran `set-signing-key.ps1`; it set the key and restarted the app.
- **`/.well-known/farbaek-keys.json` publishes `farbaek-e8ba74d4b1da3559`:**
  - a 32-byte Ed25519 key, whose id matches its SHA-256;
  - open to any origin, cached five minutes.
- **No ProofPack is signed yet.** The next change recorded in production will be the first.

### Done

**`/proofpack/v1`, the format page.** It covers:
- the statement, digest, signature and key list, with the values read from the code's own constants;
- every predicate field `buildProofPack` writes;
- four steps to check a signed ProofPack with a shell, curl, jq and OpenSSL 3;
- what a ProofPack does and doesn't prove.

The verify page links to it.

**`CommandBlock`:**
- a command with a Copy button in a bar above it;
- lines never wrap, since a break at a hyphen would read as two words; long lines scroll inside the block.

**The bare domain.** The Caddyfile gains a `farbaek.com` block that redirects every path to the same path on www. `docs/deploy/vps.md` gives the order to switch:
1. deploy this block;
2. at Spaceship, swap the `@` forwarding for an A record to the server;
3. reload Caddy so it fetches the certificate.

### Verified

**The page's four commands, taken verbatim from the rendered page and run in bash:**
- on a ProofPack signed the way the server signs, with a throwaway key: the hash equals the digest, and OpenSSL prints "Signature Verified Successfully";
- on the same envelope with a changed payload: the hash differs, and OpenSSL prints "Signature Verification Failure";
- the key list held two keys, the right one second, so the lookup by key id was exercised.

What ran for real and what stood in:
- OpenSSL 3.5.5, base64, sha256sum, printf and wc ran for real;
- jq isn't installed on this PC, so a stand-in answered exactly the four jq filters;
- `curl` was replaced by the local key list.

The octal key prefix also prints the right 12 bytes under `sh`.

**The Caddyfile** passes `caddy validate` in the server's own image (caddy 2.10.2).

**On the demo production build, at 375 and 1280 px:**
- no page errors;
- no sideways page scroll;
- the copy button copies the command exactly and says "Copied".

`qa:responsive` and `qa:a11y` on `/proofpack/v1` and `/verify` found nothing. `pnpm typecheck`, `pnpm lint` and the design tests pass.

### Not verified

- **The bare-domain redirect.** It needs the owner's DNS change at Spaceship. Until then, Caddy logs that it can't get a certificate for `farbaek.com` and retries; other names are unaffected.
- **The jq filters with real jq.**
