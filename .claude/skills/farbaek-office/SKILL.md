---
name: farbaek-office
description: How to build in Office Space, Farbaek's private staff console at officespace.farbaek.com (ADR 0032). Use this whenever you add or change anything under src/app/office, src/components/office, src/server/office or the staff SQL functions (staff_*, app_staff_*), or add a control that lets Farbaek staff change customers' workspaces, sites, usage or the platform, so the work keeps the office's security guarantees and passes its design tests.
---

# Office Space

Office Space is where Farbaek's own staff run the platform. It holds the server key, so each page and action is a security boundary. Read `docs/adr/0032-office-space.md` and `reports/Secure staff office console design.md` first; this skill turns them into working rules.

## The five rules

1. **Check on every page and action, in the code.**
   - Console pages and layouts call `requireStaff()`.
   - Server actions call `staffAction("<office action>")`, which also checks the request's Origin and records refusals.
   - The proxy, a hidden button and the role in the token are never the check.
   - `tests/design/office-guards.test.ts` fails a console page or action without one.
2. **Every write goes through an `app_staff_*` function.** It re-checks the role and the session with `private.require_staff(actor, session, action)` and records exactly one event with `private.record_staff_event(...)` in the same transaction. The server key can only read staff tables, never write them. A new permission goes in both `PERMISSIONS` (`src/core/office/permissions.ts`) and `private.staff_can`; `tests/db/office-permissions.test.ts` keeps them equal.
3. **Grade friction by harm.**
   - Reversible actions need nothing extra.
   - Consequential ones (suspend, take a site offline, add AI usage) need a reason of 10 to 500 characters, using `ReasonField`.
   - Severe ones (staff changes, kill switches, large usage additions) also need a fresh authenticator code, using `StepUpField` and `verifyStepUp(ctx, form.get("totp"), meta)`, checked in the same request. The SQL function refuses them unless `p_auth_strength = 'step_up'`.
4. **Use visible paths.** The office host maps `/x` to `/office/x`:
   - write `href="/staff"` and `redirect("/staff")`, never `/office/...`;
   - highlight nav with `useSelectedLayoutSegment()`, not `usePathname`;
   - refresh after a write with `refresh()` from `next/cache`, not `revalidatePath`.
5. **Keep customer code apart.** Nothing under `src/app/app`, `src/components/app` or `src/server/workspace` imports office code. Customer-facing effects of a staff action (a suspension notice, a paused feature) go through the customer app's own readers and `disabledReason` props.

## Honesty

- **Billing:** live payments are on since 2026-10-29. Revenue figures come from live records only (ADR 0106), never test mode. While live payments are off, or a record can't be read, a figure says so ("Live payments are off"), never $0.
- **AI usage:** staff add it as an `adjustment` grant, labelled "Added by Farbaek". Never call it a payment or a credit (`tests/design/no-credit-wording.test.ts` scans the UI).
- **Cost figures:** say whether they're estimates.
- **Emails:** viewers see them masked (`maskEmail`). Secret values are never shown, only their names.

## UI patterns

- **Shell:** the `(console)` layout gives the dimmed sidebar and the phone bottom bar (`OfficeNav`), the environment pill (`EnvPill`: label and icon, no hatched band, ADR 0183), `RoleBadge`, and the idle warning, which appears at least 20 seconds ahead.
- **Forms:** use `OfficeActionForm` with an outcome-named button ("Remove ada@…", not "Submit"). Danger actions use `tone="danger"` (the failed token), never the accent.
- **Lists and status:** `AdminTable`, `Cell` and `Chip`. A status `Chip` takes a `kind` (ADR 0183), which gives it its icon, words, colour and border; a tag (a role, a plan) has no kind and no icon. Never colour alone.
- **Records:** ids, hashes and timestamps go in Geist Mono. Show relative time with the exact time beside it.
- **Everything else follows `farbaek-ui`:** tokens only, pills, 12px inputs, 20px cards, 28px panels, 44px targets, 16px inputs and no em dashes.

## Checks before you finish

```bash
npx vitest run tests/db/office-staff.test.ts
npx vitest run src/core/office src/server/office src/server/http tests/design
pnpm typecheck
pnpm lint
```

For a change to SQL, add a PGlite test that proves three things:
- the grant: anon and authenticated are refused;
- the role check: the wrong role gets `STAFF_FORBIDDEN`;
- exactly one audit event per successful call, and none per failed one.
