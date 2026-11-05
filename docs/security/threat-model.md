# Threat model (outline)

Version 0.1, 2026-10-13. Grows with each stage. Readiness notes only: this is not a compliance claim.

## What exists today

This first section is the outline from the first stage, kept for history: the sections below cover the product as it is now, with accounts, workspaces, agents, payments and published sites. When it was written: a static marketing site and pricing page. No accounts, no user data, no secrets, no server actions, no third-party scripts. The approval demo runs entirely in the browser on sample data and sends nothing.

Enforced now:

- Security headers on every route (`next.config.ts`): `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera, microphone and geolocation off; payment only for Farbaek's own pages, for Google Play in the Android app, ADR 0154), HSTS, and a CSP limiting `frame-ancestors`, `base-uri`, `form-action` and `object-src`.
- `poweredByHeader` disabled.
- Secrets kept out of git by `.gitignore` (`.env*` except `.env.example`), plus the Claude Code guard hook (`.claude/hooks/guard.mjs`).
- Fonts and images self-hosted; no external origins at runtime.

Known gaps:

- No nonce-based `script-src` yet. It needs the Next.js proxy layer and turns pages dynamic, so it arrives with the authenticated app routes.
- `/.well-known/security.txt` is served by the app (`src/app/.well-known/security.txt/route.ts`) with the support contact, the policy page and an expiry a test renews; a static copy that shadowed it was removed on 2026-10-26.

## Trust boundaries (planned system)

| Boundary | Main threats (STRIDE) | Planned enforcement |
| --- | --- | --- |
| Browser to API | Spoofing (stolen sessions), tampering (forged requests), elevation (IDOR/BOLA) | httpOnly Secure SameSite cookies, CSRF protection, server-side authorization on every request, org-scoped queries, cross-tenant tests |
| API to database | Information disclosure across tenants | `org_id`-first scoping in code, RLS as defence in depth, unique and foreign-key constraints |
| API to model providers | Data exfiltration, prompt injection (LLM01), unbounded consumption (LLM10) | Server-side keys only, bounded context, token and time budgets, model output treated as untrusted |
| Agent to tools / sandbox | Tool misuse (ASI02), unexpected code execution (ASI05), goal hijack (ASI01) | Typed tool schemas, path canonicalization, policy check before every side effect, microVM sandbox with deny-by-default egress |
| Approvals | Replay, stale approval, payload swap | Approval bound to SHA-256 of the RFC 8785 canonical payload plus contract, policy and resource versions (implemented in `src/core/trust/approval.ts`), expiry, server-side reviewer authorization |
| Webhooks (payments) | Spoofing, replay, out-of-order delivery | Signature verification on the raw body, timestamp tolerance, unique `webhook_id`, re-fetch provider state (built, ADR 0100; see Payments below) |
| Desktop / mobile / Mesh | Device spoofing, path traversal on import, archive bombs | PAKE or Noise pairing, short-lived scoped tokens, manifest and hash validation, no auto-execution on import |
| Previews | Credential theft from generated code | Separate registrable domain, restrictive CSP, no shared cookies |

## OWASP mapping (2026-10-23, ADR 0048)

The security evaluation suite maps scenarios to the OWASP Top 10 for Agentic Applications 2026 (ASI01 to ASI10) and the OWASP Top 10 for LLM Applications 2025 (LLM01 to LLM10).
- **Where it lives:**
  - the scenarios are in `tests/security-eval/` and run with every `pnpm test`;
  - the registry, with what each risk leaves untested, is `src/core/security-eval/catalog.ts`;
  - `pnpm security:eval` writes the latest run to `src/content/security-eval-run.json`;
  - `/security` shows it publicly.
- **v1 (24 scenarios; SE-024 came with ADR 0050):**
  - all ten agentic risks have at least one scenario;
  - LLM08 (vector and embedding weaknesses) doesn't apply, because Farbaek has no retrieval or embeddings.
- **What it doesn't do:**
  - it doesn't measure whether a model resists injection: the scenarios script a model that obeys, and check that the boundaries hold;
  - it doesn't test escapes from the sandbox's microVM, Farbaek's infrastructure failing, or how people act on what they see.

## Principles

- Fail closed when authorization, policy, quota or identity checks are unavailable (already true of `checkFeature` and `checkQuota`).
- Emergency pause, revocation, exports and billing stay available in every state (`ALWAYS_AVAILABLE_OPERATIONS`).
- A model never decides safety on its own. Prompts and hidden buttons are not security boundaries.

## Sandbox boundary (2026-10-17, ADR 0013)

What is built and enforced; full details in `docs/sandbox/README.md`.

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Sandbox to host and other tenants | Escape, cross-tenant access (ASI05) | One Firecracker microVM per session (runtime-provided). Code never runs on the app server; Guard blocks execution unless isolation was verified on this deployment | `sandbox.test.ts` (Guard), `runtime.smoke.test.ts` (real runtime, when connected) |
| Sandbox to secrets | Credential exfiltration | No server environment passed in; runtime key only authenticates the SDK | smoke test (no secret names inside) |
| Sandbox to network | SSRF, metadata theft, exfiltration | Deny-all egress, or npm and PyPI hosts plus the Google Fonts CDN that `next/font/google` builds from (ADR 0058); private, link-local, loopback, CGNAT and multicast always denied; allow lists never contain IPs | `sandbox.test.ts` (rules), smoke test (metadata and internet blocked) |
| Browser or API client to sessions | IDOR, guessing ids, cross-tenant reads, unauthorized stop, forged limits | RLS reads; service-role `app_*` writes that re-check creator or owner/admin, contributor role, plan limits under a lock, versions, idempotency; only catalog ids accepted for sizes; another workspace's record is "not found" | `tests/db/sandboxes.test.ts`, `service.test.ts` |
| Cookie-authenticated API | CSRF | Same-origin `Origin` check on changes; bearer clients exempt | `wiring.test.ts` |
| Previews | Cookie theft by generated apps, link reuse, cross-tenant access, SSRF through the gateway, framing the app | Separate preview hosts; one-use 60 s HMAC launch token bound to the person; host-only cookie; preview, membership and session re-checked per request; upstream built from stored ids only; Farbaek and Supabase cookies never forwarded; WebSockets refused | `gateway.test.ts`, `sandbox.test.ts` (tokens, hosts) |
| Resource exhaustion | Runaway processes, endless sessions, cost | Runtime timeout always set, idle stop, per-command timeout with explicit kill, one running command per session, concurrency and period minutes per workspace, output and file caps, rate limits, sweeper and orphan cleanup | `service.test.ts`, `tests/db/sandboxes.test.ts` |
| Evidence | Tampering with results | Receipts are in-toto statements with RFC 8785 digests, append-only (trigger), checked against the session on insert; verdicts only from real exit codes | `sandbox.test.ts`, `tests/db/sandboxes.test.ts` |

Vercel Sandbox (ADR 0016) keeps the same boundaries: microVM per session, no server environment, explicit egress (`deny-all`, or the registry hosts with private and metadata ranges denied), runtime timeout always set, Review Only until the smoke test passes. It exposes no ports, so previews are off there, and its access token is kept server-side for an account used only for sandboxes. Tested by `vercel-runtime.test.ts` (fake SDK) and the smoke test when connected.

Known limits: Vercel's domain allowlist matches the TLS SNI only (domain fronting through the same CDN is possible where the CDN accepts it); E2B domain filtering is HTTP and HTTPS on ports 80 and 443 only, and allows DNS to 8.8.8.8 when domains are allowed; disk size is best effort; in-guest `ulimit` can be raised by sudo inside the VM; isolation depends on the runtime host's kernel and KVM. The smoke test has not yet run against a real runtime (none is connected).

## Agent boundary (2026-10-18, ADR 0018)

The Farbaek Agent desktop app runs model-driven work on the person's own computer. Full details in `docs/agent/README.md`.

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Model output to tools | Goal hijack and prompt injection from project files (ASI01, LLM01), malformed or truncated calls | Zod registry; unknown tools and bad input are errors, never run; calls from a reply cut off at `max_tokens` never run; a refusal ends the run; file contents and command output go back marked as project data | `loop.test.ts`, `agent.test.ts` |
| Tools to the disk | Path traversal, symlink and junction escapes, hard links to outside files, device names, TOCTOU swaps | Lexical rules (`..`, absolute, `:`, device names, trailing dots, 8.3 names); `realpath` root; `lstat` walk refusing links; multi-link files refused; opened handle identity checked; writes through an exclusive temp file and a rename (POSIX adds `O_NOFOLLOW`) | `fs-guard.test.ts` (real junctions and hard links in temp folders) |
| Tools to processes | Shell injection, planted binaries, secret leakage into commands, runaway processes | No shell; bare program names resolved to absolute paths, skipping relative and in-project PATH entries; allowlisted environment (the app's provider keys never reach a command); cmd.exe metacharacters refused for `.cmd`/`.bat`; bounded output; timeout and cancel kill the process tree (`taskkill /T /F`, process groups) | `broker.test.ts` (real processes: both PIDs gone after timeout and cancel) |
| Permissions | Tool misuse (ASI02), unexpected code execution (ASI05) | Modes and contract scope enforced per call; every command on a person's own computer needs their approval, bound to the exact command by `approvalBindingHash` (ADR 0175; in a verified test space read-only commands run on their own); the answer is checked against the pending request | `agent.test.ts`, `loop.test.ts`, `runs.test.ts` |
| Agent to Farbaek | Token theft or replay, acting after removal, cross-tenant writes, forged proposals | Only hashes of codes and tokens stored; codes single-use, 10 minutes, rate-limited; the person's role re-checked per request; proposals re-validated server-side and created by `app_create_agent_proposal`, which checks the agent, the person and the workspace; browsers can't read token hashes or pairing codes; HTTPS only (HTTP to localhost for development) | `tests/db/agents.test.ts`, `service.test.ts`, `farbaek-client.test.ts`, live smoke test |
| Secrets on the computer | Token theft from disk, the token reaching the window | `safeStorage` (DPAPI, Keychain, libsecret or KWallet); nothing stored when only plain-text storage exists; the token never crosses the preload bridge; model keys are no longer stored (ADR 0021), and ones an earlier version stored are deleted on start | Live check: the token file holds ciphertext only |
| The window | XSS reaching Node, remote content, navigation, permission abuse | Context isolation, Chromium sandbox, no Node integration, strict CSP, every page network request cancelled, navigation, new windows, webviews and permissions denied, Zod-validated IPC accepted only from the app's own page | Live check over the DevTools protocol: no `process` or `require`, page fetch blocked, invalid IPC refused |

Known limits: Controlled Development runs commands with the person's own rights (labelled "not isolated"); on Windows a folder swapped for a junction between the parent check and the rename is a remaining window; a background process that outlives its parent on Windows is reported, not guaranteed killed (no job objects in Node); installers are unsigned until certificates exist.

## Model gateway and the usage wallet (2026-10-18, ADR 0020, ADR 0021)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Agent to the model gateway | Using Farbaek as a free model proxy, reaching models the plan doesn't include, smuggling server tools or remote content, oversized requests (LLM10) | Agent token, contributor role and an approved-contract task in the agent's own workspace on every step; the server picks the model (pins honoured only when the plan includes them); only text, tool use, tool results and thinking blocks pass the schema; 6 MB bodies, 30 steps a minute per agent, 32,000 output tokens a step; every step reserved and settled through the wallet | `gateway.test.ts`, `routing.test.ts` |
| Project content to the model provider | Disclosure of project files to a third party | Sent only for the paired person's task, only to the provider this server uses, and said plainly on the Agents page; Farbaek doesn't store the conversation (the ledger keeps model and token counts) | Code review; Agents page copy |
| The usage wallet | Overspending, races between parallel calls, refund abuse, forged grants | Reserve and settle only through service-role functions under the organization lock; grants issued by the server from the catalog (kind, 70-day cap, key prefix checked in SQL); soonest-expiry draw records exactly which grants it touched; free-retry refunds capped over 31 days in the database; browsers can read their own grants only | `tests/db/ai-credits.test.ts`, `wallet.test.ts`, `ai-usage.test.ts` |
| Model choice from the browser | Effort or model values used to reach a stronger model | Effort parsed as an enum and routed on the server after the plan is resolved; unknown values fall back to Balanced | `ai-drafting.test.ts`, `routing.test.ts` |

## Admin console (2026-10-18, ADR 0026)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Who opens `/admin` | Anyone reaching cross-workspace data, guessing the URL, an email changed after listing, a stolen unconfirmed account | `requireAdmin` on every admin page: an `FARBAEK_ADMIN_EMAILS` allowlist (unset or empty: nobody), a valid session, the stored email still listed and confirmed (read with the server key), and the server key set; anyone else gets a 404 | `access.test.ts` (each refusal) |
| The server key in the console | Cross-tenant reads leaking into workspace pages | The key's client is handed out only after the check, and every admin loader takes it as an argument; the loaders only read | Code review; `data.ts` has no writes |
| What the console shows | Secret values on screen | Connections show variable names and on or off only; AI cost is computed from ledger units | Code review |

Known limits: sign-in for the admin is an email link with no second factor yet; whoever controls the hello@farbaek.com mailbox controls the console.

## Prompt-first builds, run messages and instant previews (2026-10-19, ADR 0027)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| A prompt to a plan | Prompt injection widening the plan, a follow-up into another workspace's project, skipping approval | The prompt, project details and paths go to the drafter as data under the existing system prompt; the draft only fills contract version 1, which goes through the same contract checks; a follow-up's project is read through RLS in the current workspace and refused when archived; nothing runs until the person approves the exact version by its hash | `start-from-prompt.test.ts`, `prompt-start.test.ts` |
| Messages to a running agent | Someone else steering a run, a message used to widen the contract (ASI01), flooding | Only the person who started the run, or an owner or admin, in the run's workspace; 1,000 characters, 10 unread at a time; framed to the model as guidance that can't widen the contract, and the Guard and scope checks still decide every action; each message is recorded as a run note | `executor.test.ts`, `loop.test.ts` |
| Static previews in the app | Generated code reading Farbaek cookies, storage or pages, navigating the app, posting forms, or forging navigation messages | `sandbox="allow-scripts"` without `allow-same-origin` (opaque origin); CSP with `default-src 'none'`, `connect-src`, `frame-src`, `form-action` and `base-uri` set to `'none'`; scripts only inline, from the three pinned-library CDNs, or Farbaek Scenes from Farbaek's own origin (ADR 0156); inlined code escaped; the parent accepts navigation messages only from that frame's window and only for paths in the project; 3 MB cap | `static-preview.test.ts` |
| The run page's preview data | One workspace's files shown to another | Files and proposals read through RLS with the person's session, scoped to the run's workspace | Code review; `run-preview.ts` uses the workspace reader |

Known limits: preview pages may load `https:` images and fonts, so a page could make image requests to outside hosts with its own content in the address; it can't read Farbaek data. Farbaek Scenes and the media library (`/kit`, `/media` on www.farbaek.com, ADR 0156) are served with `Access-Control-Allow-Origin: *` so any site can load them; they're public, static files with no cookies or personal data, and the kit only reads the page it runs in. Run messages live in one server's memory and are lost if it restarts mid-run.

## Presence, templates, rescue import and the preview domain (2026-10-19, ADR 0028)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Hosts on the preview domain | A wildcard DNS record serving Farbaek itself (sign-in, app pages) on the domain for people's content, phishing on look-alike names, cookie tossing between subdomains | The proxy serves only `p-<id>` preview hosts there; the bare domain redirects to Farbaek's own address; any other name gets a plain 404 with `noindex` | `sandbox.test.ts` (host classifier), Host-header checks on a production build |
| `/app/agent-status` | Reading another workspace's agent activity, load | A session is required; the query runs as the person under RLS, so another workspace returns nothing; it returns only state, a count and a run id | `inbox.test.ts` (presence), code review |
| Command palette | A crafted command widening what the person can do, prompts leaking into URLs or logs | It only navigates or calls existing server actions, which check everything again; a build prompt is kept in `localStorage`, never in a URL, and still needs the plan card's approval | `command-match.test.ts`, code review |
| Template thumbnails | Template code running inside Farbaek | Thumbnails use `sandbox=""` (no scripts, opaque origin) with the preview CSP; templates are reviewed content that passes import screening and fetches nothing | `starters.test.ts` |
| Rescue import (zip) | Zip bombs, path traversal, secrets uploaded by accident, oversized or malformed archives, encrypted entries | Unpacked in the browser with entry, per-file and total caps counted while inflating, ZIP64 refused, CRC-32 checked, offsets bounds-checked; every path and file screened (traversal, secrets, binaries, dependency folders) before upload, and screened again on the server under the import limits | `unzip.test.ts`, `rescue-zip.test.ts`, `rescue.test.ts`, `files.test.ts` |

## Hosting on the owner's VPS (2026-10-22, ADR 0035)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| The server itself | Password guessing on SSH, unpatched packages, services exposed by accident | ufw allows only 22, 80 and 443; SSH is keys only with root login off; fail2ban on SSH; unattended security upgrades. Only Caddy publishes ports, and the app container is reachable inside Docker's network alone | `scripts/vps/bootstrap.sh`; `ufw status` and a refused password login, checked on the server |
| Production secrets | A secret in the repo, an image layer, a log or a CI system | Values live only in `/opt/farbaek/env/production.env` (mode 600), typed in by the owner. The build mounts the file as a BuildKit secret. Deploy scripts check names only. The sweep runs inside the container that already holds its secret. `.dockerignore` keeps every `.env*` file out of the build context | `Dockerfile`, `.dockerignore`, `scripts/vps/deploy.sh`, code review |
| Deploys | A compromised CI or webhook pushing code to production | Deploys pull: the server fetches `main` with a read-only deploy key. Nothing outside can trigger or push a deploy. An unhealthy build is rolled back | `scripts/vps/deploy.sh`, a deliberately broken ref on the server |

## Payments (2026-10-28, ADR 0100)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| `POST /api/webhooks/dodo` | A forged delivery granting a plan; replays; old deliveries; oversized bodies | Standard Webhooks HMAC-SHA256 on the raw body before anything is parsed, every `v1` entry compared in constant time, timestamps more than 5 minutes off refused, 1 MB cap, 503 while not connected; stored once by `(provider, webhook_id)` | `src/server/billing/billing.test.ts`, SE-035 |
| Webhook to billing state | A genuine webhook carrying a stale or crafted state; out-of-order delivery | State is never taken from the payload: processing reads the subscription back from Dodo with the server's key and applies it with `app_billing_apply_subscription`, where an older read can't overwrite a newer one; the workspace comes from metadata Farbaek set at checkout; an unknown product changes nothing | `tests/db/payments.test.ts`, SE-035 |
| Test mode in production | A Dodo test card buying a real workspace a paid plan | Checkout and webhook processing both require the workspace to be listed in `BILLING_TEST_WORKSPACES`; `BILLING_MODE=live` is refused in code until the go-live checklist is complete | `src/server/billing/billing.test.ts` (config, use cases) |
| Checkout and plan changes | A member buying or changing a plan; a price different from the catalog; a second subscription | Owners and admins only, checked in TypeScript and again in SQL (`private.require_manager`); a product's stored price must equal the catalog's or checkout pauses; one live subscription per workspace; consent words stored with their SHA-256 | `tests/db/payments.test.ts`, `billing.test.ts` |
| Provider keys | Keys in the repo, logs or error messages | Set by the owner over SSH with `scripts/vps/set-dodo.ps1`, typed hidden and checked silently; the client never logs requests; errors become codes; connection lists show names only | Code review, `billingStatus` test |
| Payment records | Customer names and emails kept longer than needed | Webhook payloads are readable only by the server key, never shown in Office Space, and deleted 90 days after processing | `tests/db/payments.test.ts` (grants) |

## Workspace Capsules (2026-10-22, ADR 0037)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Packing a Capsule | Secrets, keys or `.env` files leaving in a download; another workspace's project packed | Every file goes through `screenFile`; credentials files, secret-looking content, dependency and build folders and binaries stay behind, each listed with its reason, and the page says detection isn't guaranteed. The project is read as the person under RLS, so only members get it | `capsule.test.ts` (exclusions), route code review |
| Opening a Capsule | A crafted zip (bomb, traversal, absolute paths, duplicate or case-colliding NFC names, extra entries), a malformed manifest, altered or swapped content, binary or oversized files, code that runs on arrival | Fails closed: `readZip`'s caps, a zod manifest, `checkPath` and `screenPath` on every path, exactly the listed entries, every byte and every 4 MiB chunk hashed again with BLAKE3, UTF-8 text only, `screenFile` again, totals within `CAPSULE_LIMITS`. Nothing runs or installs. The browser's check is a preview; the server opens the upload again and decides, then `importProjectFiles` screens a third time | `capsule.test.ts` (each rejection and tampering) |
| Importing into a project | Silent overwrites, writing into another workspace or an archived project, a role that can't write | Differing files default to keep mine; replacing adds a revision and the old one stays restorable; choices for unknown paths are ignored. The server re-reads the destination in the person's workspace and refuses archived projects; writes go through the `app_*` functions, which check the role | `capsule.test.ts` (`planImport`, `filesToWrite`), `tests/db/project-files.test.ts` |
| The Capsule record | Forged history, flooding the audit log, reading another workspace's transfers | Only `app_record_capsule` (service role) writes; it checks membership, the role for imports, that the project is in the workspace, and a rate limit, and writes an audit event. Members read their own workspace's rows under RLS | `tests/db/capsules.test.ts` |
| Who made a Capsule | Someone passing off a Capsule as coming from a person or project | Not solved in phase A: a Capsule proves its files are intact, not who packed it, and the page shows its source only as the Capsule states it. Phase B adds paired devices | ADR 0037 |

## Mesh nearby transfer (2026-10-22, ADR 0038)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| The local network | Someone on the same network reading or changing a transfer, replaying an old session, or impersonating a paired computer | `Noise_XX_25519_AESGCM_SHA256` for every session: fresh ephemeral keys, AES-GCM with counters (changed, replayed or reordered messages fail), both static keys authenticated, and each side refuses a key it hasn't paired with | `noise.test.ts` (the published vector, tampering, replay, reordering), `mesh.test.ts` (forgotten device refused) |
| Pairing | A relay in the middle during pairing; pairing without the person knowing | Both people must confirm the same six-digit code from the handshake hash within two minutes; a relay holds two hashes, so the codes differ. One pairing at a time; only while visible | `noise.test.ts` (relay gives different codes), `mesh.test.ts` (a "don't match" pairs nothing) |
| Being found and called | Announcements leaking data; strangers connecting at any time | Discovery and the listener run only after the person chooses Be visible or Look, for five minutes. Announcements hold a name, a key fingerprint and a port, nothing secret. A 10-second handshake limit, a 65,535-byte message limit, and any malformed message ends the session | `discovery.ts`, `framing.ts`, `mesh.test.ts` (framing) |
| A hostile sender | Writing outside the chosen folder, overwriting files, sending credentials, filling the disk, or sending something other than what was offered | The manifest's digest and `checkManifest` with the disk path rules (traversal, absolute paths, NFC, case collisions, Windows device names, screened names, chunk layout, limits); the person must accept; a new folder every time; a free-space check; every chunk and file checked by BLAKE3; writes through the folder guard; nothing runs | `mesh.test.ts` (traversal, tampered chunk, no space, decline, new folder) |
| A compromised or careless sender computer | Secrets sent by accident | The sending side screens like an import and lists everything left out; the window says detection isn't guaranteed | `mesh.test.ts` (packing exclusions) |
| The device key | Theft of the key that proves who this computer is | Stored only encrypted with the system keychain (`safeStorage`); without a keychain, Nearby doesn't run. Forget revokes a device on this side | `desktop/src/main/mesh.ts`, code review |

## Portable Proof and Eject Anytime (2026-10-22, ADR 0039)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| The public verify page | A forged or edited evidence file shown as genuine; the page leaking what visitors check | The digest is recomputed from the canonical statement and compared, and any difference shows as "Changed". Missing parts are refused. A match on its own proves the record is unchanged, not who made it, and the page says so; only a valid signature from a key Farbaek publishes makes it say Farbaek recorded it (ADR 0062). Files are read and hashed in the browser; nothing is sent | `inspect.test.ts`, code review (no request carries the file) |
| Samples | A sample passed off as real evidence | Statements marked `sample: true` are labelled "Sample data" and the Seal says "Sample ProofPack"; the sample's first limit says it records no real project | `src/app/(site)/verify/sample.json/route.ts`, `evidence-check.tsx` |
| The full export | Leaking another workspace's data, setting values or people's details | Read through RLS like the plain download (members of the project's workspace only). Setting names come from the Launch Planner, never values. People appear only as the actor ids already in the records | `export.test.ts`, route code review |

## Launch Evidence Gate (2026-10-23, ADR 0050)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Publishing a site | An unverified or failing change going live because the newest ProofPack says "verified" (a check run of an earlier change landing late), or a hand edit, undo or import after the verified change | `private.launch_evidence` reads the latest change ProofPack, refuses to count it if any revision came after it, and takes only a check run of that exact change. `app_publish_site` refuses without verified evidence (`EVIDENCE_REQUIRED`) | `tests/db/sites.test.ts`, `tests/security-eval/database.test.ts` (SE-024) |
| The override | A member, or a prompt in the page, waving a launch through; an override nobody can see later | Only owners and admins, checked in the database (`OVERRIDE_FORBIDDEN`); a 10 to 500 character reason; kept on the version (a constraint makes it present exactly when the evidence isn't verified) and in the `site.published` audit event with the evidence and ProofPack | `tests/db/sites.test.ts`, `src/server/publish/publish.test.ts` |
| What the page shows | The panel saying "verified" when the database disagrees | The panel and the Launch page use the same rule as the database (`launchEvidence`); if they ever differ, the database refuses and the panel explains | `src/core/publish/evidence.test.ts` |

## Signed ProofPacks (2026-10-24, ADR 0062)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| The signing key | Theft, or someone signing evidence Farbaek didn't record | Made on the VPS by the owner's script and kept only in the server's settings, never printed or committed; one key per server; the script refuses to replace a set key | `signing.test.ts`, script review |
| Stored signatures | A signature swapped or rewritten to match an edited record; one workspace reading another's | Written only by the service role through `app_record_proofpack_signature`, first one kept; updates refused by a trigger; members read through RLS | `proofpack-signatures.test.ts` |
| The verify page | A valid signature reused beside different evidence; a look-alike key; keys that don't load | The signed payload must hash to the evidence shown; only keys from `/.well-known/farbaek-keys.json` on Farbaek's own domain count; an unknown key, a bad signature or missing keys each say so, and only a good signature shows "exactly what Farbaek recorded" and keeps the Seal | `dsse.test.ts`, demo build checks |

Known limits: whoever controls the server can sign; the key isn't in a hardware module; there's no rotation yet (retired keys aren't published), so the key isn't replaced.

## Scheduled jobs and trial reminders (2026-10-24, ADR 0063)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| The internal jobs route | Anyone on the internet triggering the job, or flooding owners with reminders | `POST /api/internal/jobs/trial-reminders` needs the scheduler's secret, compared in constant time; it's called only from inside the app container. Each reminder is claimed once per workspace and kind before sending, so a repeated or parallel run sends nothing more | `trial-reminders.test.ts` (token, second run), `tests/db/trial-reminders.test.ts` (claims) |
| Reminder recipients | Emailing people who didn't ask, or another workspace's members | Only the workspace's owners, at their confirmed sign-in address, and only if they haven't turned trial reminders off. Records are readable to the workspace's members only, and written only by the service role | `trial-reminders.test.ts`, `tests/db/trial-reminders.test.ts` (RLS, grants) |
| Email choices | One person changing another's choices | Saved by a server action for the signed-in person only, through a service-role function; each person reads only their own row | `tests/db/trial-reminders.test.ts` |

Known limits: the scheduler's secret is shared with the sandbox sweep. "Accepted" means the mail server took the message, not that it reached the inbox.

## People and accounts (2026-10-24, ADR 0064)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Roles and removal | A member promoting themselves, an admin removing an owner, a workspace left without an owner | Service-role functions decide under the workspace lock: owners change any role, admins only between member and viewer, the last owner can't be demoted or leave. Every change is audited | `tests/db/people-and-accounts.test.ts` |
| Deleting an account | Deleting someone else's account, stranding a team, deleting by accident | The server action uses the signed-in person's own ID only, needs their address typed, and refuses when the plan shows a last-owner or paid-plan block. Staff accounts are kept | `tests/db/people-and-accounts.test.ts`, action code review |
| Repeat trials | Deleting and re-creating an account, or +tag and dotted Gmail variants, for another free trial | `trial_claims` holds a SHA-256 of the normalised address, claimed before the trial starts; nobody but the server can read it | `tests/db/people-and-accounts.test.ts` |

Known limits: other email providers' aliasing schemes aren't normalised; disposable addresses are the next stage.

## Launch guards (2026-10-24, ADR 0065)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Trials | Farming free trials with throwaway addresses | `create_organization` gives no trial to a disposable domain or its subdomains (CC0 list, pinned); one trial per normalised address (ADR 0064) | `tests/db/launch-guards.test.ts` |
| The platform's AI spend | A burst of sign-ups, abuse or a bug spending Farbaek's keys without limit | Every reservation carries the day's platform limit; the database refuses past it under one lock, across all workspaces | `tests/db/launch-guards.test.ts`, `src/server/ai/config.test.ts` |
| `/api/ready` | Leaking infrastructure details | Answers only ok, "unreachable" or "not configured", never hosts, keys or errors | Route review |

Known limits: no CAPTCHA at sign-in yet (Turnstile needs the owner's Cloudflare widget); GoTrue's per-IP limits see the proxy's address until `GOTRUE_RATE_LIMIT_HEADER` is set.

## Legal documents (2026-10-24, ADR 0066)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| What the Privacy Policy promises | A promise drifting from what the server does (backups kept longer, logs kept longer, an access log turned on) | The facts live in `src/config/legal.ts`; a test reads the backup and Docker log settings and the Caddyfile and fails when they disagree | `src/config/legal.test.ts` |
| Abuse reports | No way to report a harmful site, or reports lost among support requests | The Acceptable Use Policy names support@farbaek.com and Help's "Report a site or abuse" topic; Office Space filters abuse reports and staff can take a site offline or suspend a workspace | ADR 0032 tests, page review |

Known limits: the documents are drafts until a lawyer reviews them; no DMCA designated agent or EU representative yet.

## Sign-in protection (2026-10-24, ADR 0067)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Sign-in emails | Floods of sign-in emails to one person, or from one network; scripts creating accounts for trials | The server action counts by hashed email and hashed address (from Caddy's `X-Forwarded-For`) before Auth is asked, and refuses when the limiter can't answer | `src/server/auth/sign-in.test.ts` |
| Calling Auth directly | Skipping the app's form to reach `/auth/v1/otp` | Once switched on, GoTrue requires a Turnstile token it verifies with Cloudflare; only the server's secret key is exempt | GoTrue v2.197.0 source review; first sign-in after `set-turnstile.ps1` |
| Rate limit records | Hashed addresses kept indefinitely | `app_rate_limit` deletes every window older than a day and refuses longer windows | `tests/db/sign-in-guard.test.ts`, `src/config/legal.test.ts` |

Known limits: until the owner sets the keys, only the app's limits apply, and direct calls to Auth meet only Auth's own limits.

## Office Space on trusted devices (2026-10-24, ADR 0069)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| The office from a new browser | Someone with the owner's inbox and authenticator signing in from their own computer | After both codes, an unknown device gets no session, only a code shown on it; it opens once approved from a trusted device with that code and a fresh authenticator code. Every page and action checks the device again | `tests/db/staff-devices.test.ts`, `src/server/office/sign-in.test.ts` |
| Approving a device | Tricking the owner into approving an attacker's device; guessing the code | The code exists only on the new device; approval needs step-up from a trusted device; five wrong codes cancel the request | `tests/db/staff-devices.test.ts` |
| Device records | Forging or reading device secrets | Only SHA-256 hashes are stored; the server key can only read them; writes go through the `app_staff_*device*` functions with one audit event each | `tests/db/staff-devices.test.ts` |

Known limits: a device cookie copied off a trusted device (by malware there) works until removed; losing every trusted device needs SSH to the server.

## Office Space hidden from unknown devices (2026-10-24, ADR 0072)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| The office host | Finding Office Space and probing its sign-in from any device | The proxy answers 404 to unknown devices before any page or action; only `/add-device` answers, and it names nothing | `tests/db/office-hidden.test.ts` |
| Device-add codes | Guessing a code; reusing one | 8 characters from 31, one live code, 15 minutes, once; 5 tries per address per 15 minutes; stored as a hash nobody can read; made only on a trusted device with step-up | `tests/db/office-hidden.test.ts`, `src/core/office/device-codes.test.ts` |

Known limits: while no device is trusted (a new office or after the SSH reset), the office is open to the first device that signs in with both codes.

## GitHub import (2026-10-25, ADR 0074)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Server fetching from GitHub | SSRF: a pasted address or a redirect steering the server to another host, port or repository | The pasted text is parsed into owner, repository and ref by strict patterns; the server fetches only `github.com/<owner>/<repo>/archive/<ref>.zip` (redirects not followed) and the `codeload.github.com` address its redirect names, rebuilt from the checked parts for the same repository and ref; the second request refuses redirects | `github.test.ts`, `github-import.test.ts` |
| The downloaded archive | Zip bombs, oversized repositories, secrets and binaries in the repository, slow responses | 60 MB download cap (declared and counted while streaming), 45-second limit, then the rescue import's unpacking caps and screening, and the server's import limits again on the way in | `github-import.test.ts`, `unzip.test.ts`, `rescue-zip.test.ts` |
| Abuse of the server's bandwidth | One person starting many large downloads | 10 imports per person an hour (`app_rate_limit`) | the shared rate limit tests |

Known limits: public repositories only. Private ones need a GitHub connection, which isn't built.

## Shadow mode (2026-10-25, ADR 0075)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Rehearsal decisions | A simulated "would apply" being taken as real, or acted on | The real outcome stays level 0's; the rehearsal is stored apart, under `policy.shadow`, and shown dashed with a flask icon and "Simulated"; nothing reads it to apply a change | `policy.test.ts`, `rehearsal-record.test.ts` |
| The rehearsal switch | Turning it on without the plan or the role; rehearsal records outside a rehearsal | Owners and admins only, Pro and up (server); `shadow_since` only at level 0; the proposal trigger drops a rehearsal when the workspace isn't rehearsing or the change applies on its own | `autonomy.test.ts`, `tests/db/shadow-mode.test.ts` |

## Future-State Arena (2026-10-25, ADR 0076)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Trials and evidence | A trial's results taken as verification; a trial writing to the project | `trialChecks` writes no receipt, ProofPack or task transition; the change is written only into a disposable sandbox, which stops at the end; the panel says a trial never counts as verification | `service.test.ts`, `runner.test.ts`, `arena-panel.test.ts` |
| Starting and recording trials | Trials of applied or other workspaces' proposals; forged results | `app_start_arena_run` needs a contributor and a pending proposal in the workspace, one running per proposal, stale ones closed after 30 minutes; the session must be the workspace's, for the proposal's project; results are written once by the server, at most 20 named checks each | `tests/db/arena-runs.test.ts` |
| Sandbox use | A trial running commands the person couldn't | The sandbox runs as the person, through the same guard, rate limits and plan limits as their own commands | `service.test.ts` |

## LaunchOS with Vercel (2026-10-25, ADR 0078)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Customers' Vercel tokens | Theft from the database or a browser; a sealed token moved to another workspace; tokens in logs or errors | Sealed with AES-256-GCM on the server, with the workspace and provider as associated data; column grants keep the sealed token from every browser; Vercel's error text is cleaned of the token; deleted on disconnect | `token-vault.test.ts`, `vercel-client.test.ts`, `tests/db/provider-launches.test.ts` |
| Launching | Deploying without evidence; double deploys; deploying other files than shown | One order per key, for exactly the digest of the current files, under `private.launch_evidence` with an owner's or admin's reason when not verified; one launch per project at a time; the project name typed to confirm | `tests/db/provider-launches.test.ts`, `provider-launch.test.ts` |
| Server requests | SSRF through stored or returned addresses | Calls go only to api.vercel.com, without following redirects; only https `*.vercel.app` addresses are stored, linked or fetched for the live check | `vercel.test.ts`, `vercel-client.test.ts` |

## LaunchOS with Netlify (2026-10-26, ADR 0093)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Customers' Netlify tokens | The same as Vercel's; a sealed Vercel token opened as Netlify's | The same vault, with the provider in the associated data, so a token sealed for one provider doesn't open as another's; the email behind a token is never stored | `netlify-launch.test.ts`, `netlify-client.test.ts`, `tests/db/netlify-launches.test.ts` |
| Addresses | A Netlify order pointing at Vercel, a lookalike domain or plain http, then linked or fetched | The database holds each provider's orders to its own domain (`*.netlify.app`, `app.netlify.com`); `launchAddress` and `inspectorAddress` refuse anything else before a link or a check; the address is built from the validated site name | `tests/db/netlify-launches.test.ts`, SE-030, `netlify.test.ts` |
| Calls to Netlify | SSRF; a file uploaded to a path Farbaek didn't choose | Calls go only to api.netlify.com, without following redirects; each path segment is escaped; only files Farbaek sent are uploaded, and a request for any other fails the launch | `netlify-client.test.ts`, `netlify-launch.test.ts` |
| Claiming it's live | A ready deploy shown as live while the site still serves another | Ready counts only when the site's published deploy is this one; a locked site fails the order with that reason | `netlify-launch.test.ts` |

## Installable app and push notifications (2026-10-25, ADR 0079)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Push subscriptions | SSRF through a stored endpoint; another person's devices; keys read by browsers | Endpoints accepted, stored and sent to only on the browsers' push services over https (server and database); one person each, at most ten; browsers read their own labels, never the keys | `send.test.ts`, `tests/db/push-subscriptions.test.ts` |
| Push messages | Content readable in transit; forged sender | RFC 8291 encryption per device (checked against the RFC's example); RFC 8292 VAPID signatures; the payload names only a task title, a sentence and a path | `web-push.test.ts`, `notifier.test.ts` |
| The service worker | Personal data cached on a device; notifications opening other sites | Only `/offline` and an icon are cached; notifications open only paths on Farbaek | `public/sw.js` (reviewed) |

## Outcome watch (2026-10-25, ADR 0080)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Server checks | SSRF through a watched address | Only a live site's own address on the configured site domain, or a stored https `*.vercel.app` address, is fetched; redirects aren't followed | `outcome-watch.test.ts`, `vercel.test.ts` |
| Watch records and alerts | Forged or flapping alerts; another workspace's watches | The state is decided in `app_record_watch_result`, two failures in a row to go down, each change returned once and audited; browsers read their workspace's watches and write nothing; alerts go only to the person who turned the watch on | `tests/db/outcome-watch.test.ts`, `outcome-watch.test.ts` |

## Counterfactual policy replay (2026-10-25, ADR 0081)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Reading past changes | Another workspace's history; file contents leaking into a replay | `app_replay_history` runs as the caller under RLS and returns only paths, kinds, counts and statuses; at most 90 days and 300 changes; not callable signed out | `tests/db/policy-replay.test.ts` |
| Predictions taken as facts | A replay read as what happened | Labelled "Predicted from past changes", dashed, with its assumption stated; nothing is applied | `rehearsal-record.test.ts`, `replay.test.ts` |

## Workspace rules and the policy builder (2026-10-25, ADR 0082)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Rules loosening the policy | A rule written to let more through | Rules only add BLOCK, ESCALATE or a hold on level 2; the built-in rules, contract checks and autonomy limits still apply; nothing lowers an outcome | `policy.test.ts` |
| A path that skips the rules | A proposal created without the active rules: a forgotten caller, a race with an activation, a failed read | The rules are a required input to `evaluateChangePolicy` on every path (web, cloud, desktop agent); a read that fails stops the change; a trigger on `change_proposals` refuses any outcome weaker than the active rules need, whichever path inserted it | `tests/db/workspace-rules.test.ts`, `policy.test.ts` |
| Who changes the rules | A member, a viewer or another workspace activating rules | `app_activate_workspace_rules` is for the service role only and checks an owner or admin of that workspace; every version is kept and audited; members read their own workspace's rules only | `tests/db/workspace-rules.test.ts`, `workspace-rules.test.ts` |
| Activating something other than what was reviewed | A set changed after the test, or tampered with in the browser | Activation sends the set and its SHA-256; the server recomputes it from the canonical JSON and refuses a mismatch, tests the set again itself and stores that result; the database validates the shape and each expression | `workspace-rules.test.ts`, `tests/db/workspace-rules.test.ts` |
| AI drafts | A model inventing rules, unsafe patterns, or following instructions in the request | The request and folder names go as JSON data with a system prompt that treats them as text; output is schema-checked; invalid patterns are dropped and listed; drafts only fill the form, never activate; metered and refunded on failure | `rule-draft.test.ts`, `workspace-rules.test.ts` |
| Patterns as code | A pattern that escapes the project or makes matching slow | Allowed characters only, no `..` or leading `/`, at most 200 characters, 8 wildcards and 3 `**`; the regex is built from tokens and anchored; the database checks each expression when activating | `path-pattern.test.ts`, `tests/db/workspace-rules.test.ts` |

## Emergency pause and incidents (2026-10-25, ADR 0083)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| An agent that won't stop | Runs, desktop agents' proposals or automatic applies carrying on after someone pulls the brake | `app_set_agents_pause` sets the workspace's pause; triggers refuse new `agent_runs`, proposals from desktop agents or cloud runs, and any automatic outcome while it's set; the server aborts live runs on this server; people's own changes carry on | `tests/db/incidents.test.ts`, SE-026, `incidents.test.ts` |
| Who pauses and who resumes | A viewer or another workspace pausing; a member restarting agents an owner stopped | Any contributor of that workspace pauses; only an owner or admin resumes; both audited; browsers can't call the function or write the columns | `tests/db/incidents.test.ts`, SE-026 |
| Overclaiming | A pause read as undoing what happened | Every place the pause is offered, and the banner, says it can't undo changes already applied or anything done outside Farbaek | `pause-control.tsx` copy, ADR 0083 |
| Incident records | Forged or edited incidents; another workspace's incidents; file contents in the replay | Only server functions write incidents and events (service role), each checking the workspace and the person; members read their own workspace's; `app_incident_changes` returns paths, kinds and outcomes only, as the caller under RLS; resolving is final | `tests/db/incidents.test.ts` |
| Blaming the wrong change | The replay presenting timing as cause | Changes found by timing are labelled "Farbaek can't tell which, if any, caused it"; suggested rules go to the policy builder and must be tested on past changes before activation | `incidents.test.ts` (core) |
| Escalation | Repeated or misdirected alerts | Each incident is claimed once before anyone is told; only owners and admins of that workspace, only on plans with incident response tools | `incident-escalation.test.ts`, `tests/db/incidents.test.ts` |

## Autonomy level 3 (2026-10-26, ADR 0086)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Turning level 3 on | A workspace, or a member, letting more through without a record | Owners and admins only; Max 3x checked on the server; the database refuses level 3 unless 10 changes applied on their own passed their checks in 30 days with none failed, on the way in and after a pause | `tests/db/autonomy-level-3.test.ts`, SE-027, `autonomy.test.ts` |
| Volume | A run or a burst of tasks applying many changes on their own in a day | A daily budget the workspace sets (5 to 50): the policy holds changes for a person once it's spent, a count that can't be read counts as spent, and a trigger refuses any automatic proposal past it | `tests/db/autonomy-level-3.test.ts`, SE-027, `policy.test.ts` |
| After a failure | Autonomy carrying on at its widest after a check failed | Any failed or partly passed check after an automatic apply pauses autonomy; the failure keeps level 3 locked for 30 days | `tests/db/autonomy-level-3.test.ts` |

## Permissions per person (2026-10-26, ADR 0087)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Changing permissions | A member giving themselves back what was turned off; a browser writing the column | Only `app_set_member_permissions` (service role) writes it, for an owner or admin acting on a member; browsers have no write grant; a constraint allows only withheld known permissions; every change is audited | `tests/db/member-permissions.test.ts`, SE-028 |
| Acting without the permission | A member approving, publishing, launching or starting runs through another server path | Triggers on `change_proposals` (a person's approval), `site_deployments`, `launch_orders`, `agent_runs` and `arena_runs`, and a check in `app_set_live_deployment`, refuse `PERMISSION_WITHHELD` for the person recorded as acting | `tests/db/member-permissions.test.ts`, SE-028 |
| Stale permissions | A demoted admin keeping old restrictions, or a promoted member keeping them | A role change resets permissions to that role's defaults; owners and admins always have every permission | `tests/db/member-permissions.test.ts` |
| Lapsed plans | A workspace stuck with members who can do less after its plan ends | Turning a permission back on never needs the plan | `member-permissions.test.ts` |

## Model Change Canary (2026-10-26, ADR 0090)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Switching a tier | A compromised or careless staff session moving every workspace to an untested or unpriced model | Owners only (`models.switch`), with a fresh authenticator code, checked in SQL; only to a candidate a finished canary compared in the last 7 days; only priced models take effect on the server; every switch and return records one staff event | `tests/db/model-canary.test.ts`, `office-permissions.test.ts`, `routing.test.ts` |
| Spending | Canaries run repeatedly on Farbaek's key | Owners and admins with a reason; one at a time and three in 24 hours, enforced by the database; the form shows the most it could cost; the platform AI pause stops it | `tests/db/model-canary.test.ts` |
| Customer data | Customer work sent through a candidate model for testing | The canary only runs Farbaek's own sample tasks (`canary-suite.ts`) | `model-canary-runner.test.ts` |
| The tables | Browsers or the server key writing switches or reports directly | No browser grants; the server key reads only; writes only through the v57 functions | `tests/db/model-canary.test.ts`, `browser-grants.test.ts` |

## Governed workflows (2026-10-26, ADR 0092)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Approval | Steps running that no one approved, or that changed after approval | Only owners and admins approve, only once every step's contract is approved; the approval binds the steps, contract hashes and ceiling by hash; a draft, cancelled or halted workflow starts nothing | `tests/db/workflows.test.ts`, SE-029, `use-cases.test.ts` |
| Running on its own | A workflow carrying on past a problem | One step at a time, under a lock; stops at checkpoints, when a change waits for review, on any failure, while agents are paused and at the spend ceiling; never retries | `tests/db/workflows.test.ts`, SE-029, `orchestrator.test.ts` |
| Who a step runs as | A run with more rights than intended, or by someone who left | Each run starts as the approver, whose membership, role and permissions are read again each time; every policy, rule and autonomy limit applies to each step's change | `orchestrator.test.ts` |
| Spend | A workflow spending past what was approved | Each step's run is capped at its share of the ceiling, and the database refuses a step past it | `tests/db/workflows.test.ts` |
| Sandbox without a session | A background run reaching another workspace's sandboxes | The sandbox service checks every session against the run's workspace, as for other background work | `src/server/sandbox` tests |

## Mesh's secure relay (2026-10-26, ADR 0094)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| What the server sees | Reading or changing files on the way | Agents run the Noise XX handshake end to end through the relay; the server holds only transport ciphertext, in memory, and drops it once read or when the session ends | `mesh.test.ts`, SE-031 |
| Who's trusted | The server (or anyone controlling it) introducing a device | A relayed call asking to pair is refused; each side checks the other's static key against devices paired on a shared network; a caller claiming a paired device's fingerprint fails the handshake | `mesh.test.ts`, SE-031 |
| Routing | A call or session reaching another workspace's agent, or a third agent reading a session | Calls reach only a reachable agent of the caller's workspace; only a session's two agents can read, write or close it; revoked agents and people who left are refused on every request | `relay-hub.test.ts`, SE-031 |
| Resources | Filling the server's memory or bandwidth | 8 MiB per direction, 2 MiB per write, 3 sessions per workspace and 20 in all, 5 waiting calls per agent, timeouts for calls, quiet agents and sessions, and 5 GB a day per workspace counted in the database (closing when it can't be counted) | `relay-hub.test.ts`, `tests/db/mesh-relay.test.ts` |
| Records | Keeping more than needed | One audit event per session (the two agents, bytes, how it ended), a daily total per workspace kept 30 days, and each agent's fingerprint and reachability; no file names or contents | `tests/db/mesh-relay.test.ts` |

## Mesh direct over the internet (2026-10-26, ADR 0095)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Signaling through Farbaek | The server swapping the link's DTLS fingerprints to stand in the middle | Noise XX over the data channel proves the other side holds the key paired on a shared network; a swapped link fails before any offer | `mesh.test.ts`, SE-032 |
| What crosses the server | Files on the server during a direct transfer | The relay session carries only checked setup messages (an SDP of at most 16 KB, 64 candidates) and closes when the channel opens | `mesh.test.ts`, `direct-signal.test.ts`, SE-032, the live check |
| Silent fallback | Bytes going through the server when the person chose a direct link | A blocked link stops the transfer; the relay is used only after the person chooses it | `mesh.test.ts` |
| The STUN server | Amplification or reflection attacks, or reaching the rest of the server | Only well-formed Binding requests answered, at most 52 bytes, 30 per address every 10 seconds; its own container, read-only, no capabilities, its own network, no records | `tests/stun/stun-server.test.ts`, SE-032 |
| The WebRTC window | Untrusted code with access to the peer connections | A hidden, sandboxed, context-isolated window with no Node, a page that loads nothing, and a preload that only moves already-encrypted bytes | Live check |
| Addresses | Exposing where a computer is | The other paired computer learns its public and local addresses; the server sees them in the setup messages, as it does for any request | Documented on the privacy page |

## Mesh in the browser (2026-10-26, ADR 0096)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Pairing a phone through Farbaek | The server, or anyone, pairing a device of their own with a person's computer | Only inside a two-minute window the person opens on the computer, one pairing per window; both screens show the code from the Noise handshake hash and both people confirm, so a relayed pairing shows different codes | `browser-mesh.test.ts`, SE-033, the live check |
| The browser's key | A key read out of the browser | Generated by Web Crypto as a non-extractable CryptoKey in IndexedDB; only the public key leaves | Design; `noise.test.ts` |
| Browser routes | Another site driving a person's relay; a browser reaching another workspace | The person's session in the live app, same origin for writes, a device id, 600 requests a minute per person; in the hub the browser belongs to the person's current workspace only | `relay-browser.test.ts`, SE-033 |
| What the phone sends | Credentials or secrets sent by mistake | The agent's rules: names checked, credentials files and secret-looking text left out (not guaranteed), sizes capped; the computer accepts each folder and checks every chunk | `browser-mesh.test.ts` |
| Records | Keeping more than needed | One audit event per session with a browser, as the person, with the two parties, bytes and how it ended (v61) | `tests/db/mesh-relay.test.ts` |

## Receiving on a phone or browser (2026-10-27, ADR 0097)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Being reachable | A browser reachable without the person knowing, or for longer than they meant | A switch, off on every page load; presence only in the relay's memory, gone once the page stops polling; signed-out or lost-workspace sessions stop the loop | `relay-browser.test.ts`, `browser-receive.test.ts` |
| Who can send | Someone else in the workspace, or the server, sending files to a person's phone | Calls from computers the browser didn't pair with are closed unjoined; pair calls closed; after the handshake the key must be the paired one, whatever the call claimed | `browser-receive.test.ts`, SE-034 |
| What's offered | A list of files that climbs out of its folder, or is malformed or too large | The agent's checks: size, Capsule schema, digest, `checkManifest` with disk-path rules, before the person is asked | `browser-receive.test.ts`, SE-034 |
| What's kept | Altered or partial files kept as if they were whole | Every 4 MiB chunk and every file checked against its BLAKE3 hash; a mismatch, cancel or drop removes everything; only a fully checked transfer is sealed, and unsealed folders are removed after a reload | `browser-receive.test.ts`, SE-034, the live check |
| Running what arrives | A received file run or opened by Farbaek | Files are only handed to the browser's download or share sheet; nothing is opened, previewed or run | Design |
| The browser's storage | Filling the device | The Origin Private File System after a space check with 64 MB spare; otherwise memory capped at 200 MB, with Accept unavailable above it | Design; the live check |

## What two audits found (ADR 0175)

| Boundary | Threat | Mitigation | Test |
| --- | --- | --- | --- |
| Proof | A member plants a fake tool in a test space, then runs the checks to mint a verified ProofPack | Only a test space Farbaek reserved before it existed can record proof, and nobody can write to it or run commands in it | `service.test.ts`, SE-037 |
| A person's computer | A hostile repo steers the agent into a command classed read-only whose arguments read a private key | Every command on a person's own computer asks; the approval shows all of it | `agent.test.ts`, `loop.test.ts`, SE-038 |
| Handoffs | A member queues code for someone else's computer | Only a computer the person paired; only known tests and builds; setup can't run the project's code | `agent-handoffs.test.ts`, SE-039 |
| The brakes | A paused or suspended workspace's agent keeps spending AI and reading files | The gateway refuses everything but saying who it is and unpairing | `security-audit.test.ts`, SE-040 |
| Workflows | A member changes a later step's plan and runs it as the approver | The stored hash is compared before a step is claimed, and the workflow stops on a mismatch | `orchestrator.test.ts` |
| Payments | A buyer's own metadata names someone else's workspace | The existing mapping wins, otherwise an owner's or admin's recent checkout must exist | `billing.test.ts`, SE-041 |
| Custom domains | Someone holds a domain by only asking for it | Uniqueness only for verified domains; requests last a week; publish permission needed | `security-audit.test.ts` |
| Leaving | A removed member's computers and invitations keep working | Removal revokes and ends them; the export stops reading that workspace | `security-audit.test.ts` |
| Cost | A small zip costs gigabytes of inflating; a catch-all domain farms trials | Inflated bytes all count, shared streams are refused; five trials a day per private domain | `unzip.test.ts`, `security-audit.test.ts` |

Left for later, with reasons, in ADR 0175: store sandbox purchases, the Public Suffix List, Auth's own limits behind the proxy, and phone sign-in over a custom scheme.
