# Stage 40: People and accounts

The first of the launch stages. Teams couldn't change roles, remove people or leave, accounts couldn't be deleted, and deleting an account would have started a fresh trial.

- **Decision record:** `docs/adr/0064-people-and-accounts.md`.
- **Branch:** `feat/people-and-accounts`, stacked on `feat/trial-reminders` (#47), since both change Settings.

## 2026-10-24

### Done

**Migration v37** (`20261108090000_people_and_accounts.sql`):
- `app_set_member_role` and `app_remove_member`, under the workspace lock;
- `app_account_deletion_plan` and `app_delete_account_data`;
- `trial_claims`, with the normalised-address hash and a backfill;
- `create_organization` claims the address before starting a trial.

**Server** (`src/server/workspace/account.ts`):
- the plan, the staff check, and the words for each outcome and refusal;
- three server actions in `src/app/app/actions.ts`:
  - `setMemberRoleAction`;
  - `removeMemberAction`: leaving clears the workspace cookie and opens `/app`;
  - `deleteAccountAction`: the typed-address confirmation, the plan check, data, then the sign-in record, then sign-out.

**Settings:**
- each person's row has role and remove controls following the database's rules, and your own row has Leave. Removing asks once more ("Remove …" or "Keep");
- "Delete your account" lists every workspace with an icon and words for what happens to it;
- `/account-deleted` (not indexed) says what was deleted and how backups age out.

### Verified

- **`tests/db/people-and-accounts.test.ts` (8):**
  - address normalisation;
  - no second trial after deleting the account and signing up again with a +tag variant;
  - who sets which role;
  - the last owner stays;
  - removing, leaving, and the accepted invitation going with the person;
  - the deletion plan's outcomes, paid and last-owner blocks, and what remains;
  - server-only functions.
- **All database tests (269)** pass with the new `create_organization`.
- **Checks:** `pnpm typecheck` and `pnpm lint` are clean.

**Production database:**
- v37 applied with the hash-verified pattern (`999dbeea…ca168c6`);
- read back:
  - `trial_claims` holds 1 claim, the owner's existing trial, backfilled;
  - the four new functions are executable by `service_role` only, and `create_organization` stays callable by signed-in users, as before;
  - the owner's deletion plan reads "Far001: deleted".

The owner is Farbaek staff, so Settings refuses to delete that account, by design.

### Next

- **Abuse guards:** disposable-address check before a trial, a daily AI spend cut-off, and a readiness check that touches the database.
- **Trial sandbox shape** for Vercel Pro.
- **Legal pages.**
