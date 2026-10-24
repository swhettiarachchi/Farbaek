# Threat model (outline)

Version 0.1, 2026-10-13. Grows with each stage. Readiness notes only: this is not a compliance claim.

## What exists today

A static marketing site and pricing page. No accounts, no user data, no secrets, no server actions, no third-party scripts. The approval demo runs entirely in the browser on sample data and sends nothing.

Enforced now:

- Security headers on every route (`next.config.ts`): `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, HSTS, and a CSP limiting `frame-ancestors`, `base-uri`, `form-action` and `object-src`.
- `poweredByHeader` disabled.
- Secrets kept out of git by `.gitignore` (`.env*` except `.env.example`), plus the Claude Code guard hook (`.claude/hooks/guard.mjs`).
- Fonts and images self-hosted; no external origins at runtime.

Known gaps:

- No nonce-based `script-src` yet. It needs the Next.js proxy layer and turns pages dynamic, so it arrives with the authenticated app routes.
- No `/.well-known/security.txt` until the owner provides a real disclosure contact.

## Trust boundaries (planned system)

| Boundary | Main threats (STRIDE) | Planned enforcement |
| --- | --- | --- |
| Browser to API | Spoofing (stolen sessions), tampering (forged requests), elevation (IDOR/BOLA) | httpOnly Secure SameSite cookies, CSRF protection, server-side authorization on every request, org-scoped queries, cross-tenant tests |
| API to database | Information disclosure across tenants | `org_id`-first scoping in code, RLS as defence in depth, unique and foreign-key constraints |
| API to model providers | Data exfiltration, prompt injection (LLM01), unbounded consumption (LLM10) | Server-side keys only, bounded context, token and time budgets, model output treated as untrusted |
| Agent to tools / sandbox | Tool misuse (ASI02), unexpected code execution (ASI05), goal hijack (ASI01) | Typed tool schemas, path canonicalization, policy check before every side effect, microVM sandbox with deny-by-default egress |
| Approvals | Replay, stale approval, payload swap | Approval bound to SHA-256 of the RFC 8785 canonical payload plus contract, policy and resource versions (implemented in `src/core/trust/approval.ts`), expiry, server-side reviewer authorization |
| Webhooks (payments) | Spoofing, replay, out-of-order delivery | Signature verification on the raw body, timestamp tolerance, unique `webhook_id`, re-fetch provider state |
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
| Permissions | Tool misuse (ASI02), unexpected code execution (ASI05) | Modes and contract scope enforced per call; commands beyond read-only need a person's approval bound to the exact command by `approvalBindingHash`; the answer is checked against the pending request | `agent.test.ts`, `loop.test.ts`, `runs.test.ts` |
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
| Static previews in the app | Generated code reading Farbaek cookies, storage or pages, navigating the app, posting forms, or forging navigation messages | `sandbox="allow-scripts"` without `allow-same-origin` (opaque origin); CSP with `default-src 'none'`, `connect-src`, `frame-src`, `form-action` and `base-uri` set to `'none'`; inlined code escaped; the parent accepts navigation messages only from that frame's window and only for paths in the project; 3 MB cap | `static-preview.test.ts` |
| The run page's preview data | One workspace's files shown to another | Files and proposals read through RLS with the person's session, scoped to the run's workspace | Code review; `run-preview.ts` uses the workspace reader |

Known limits: preview pages may load `https:` images and fonts, so a page could make image requests to outside hosts with its own content in the address; it can't read Farbaek data. Run messages live in one server's memory and are lost if it restarts mid-run.

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
