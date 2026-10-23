# Office Space recovery

What to do when someone can't get into Office Space (ADR 0032). The office can't recover itself, so these steps use the server: Supabase Studio or `psql` for the database (ADR 0036), and `farbaek-set-env` with `farbaek-deploy` for settings (ADR 0035). Every step that changes something leaves a trace, and the next office sign-in should check the audit chain.

## A staff member lost their authenticator

1. An owner confirms who they are on a video call. An email from their address isn't proof.
2. In Office Space, under Staff, Manage, the owner chooses **Let them add a new authenticator**, with a reason and the owner's own fresh code.
3. Their old authenticators are removed and their sessions end. Within 24 hours they sign in with an email code and set up a new authenticator.

## The only owner lost their authenticator

There's no second owner to do the step above, so it's done in the database on the server, by the person who holds the server's SSH key.

1. **Open Studio:** on your computer, `ssh -L 54323:127.0.0.1:54323 farbaek@2.25.88.188`, then http://localhost:54323.
2. **Authentication, Users:** open the owner's user and delete their MFA factors.
3. **SQL Editor:** run this, with the owner's email:
   ```sql
   update public.staff_members set mfa_reset_until = now() + interval '24 hours'
   where email = 'info@farbaek.com' and removed_at is null;
   ```
   The table's triggers allow this; it changes no role.
4. The owner signs in at the office with an email code and sets up a new authenticator. The log records `factor.enrolled`.
5. Afterwards, add a second owner or a second authenticator, so this isn't needed again.

## Nobody is an owner any more

The database refuses to remove or demote the last owner, so this only happens through direct database changes.

1. **On the server,** set the person who should become owner, then redeploy:
   ```bash
   echo "OFFICE_OWNER_EMAIL=person@example.com" | farbaek-set-env
   farbaek-deploy --again
   ```
2. **They sign in at the office.** The first-owner bootstrap runs only while there's no active owner, and only for a confirmed email matching that address.
3. **Clear it and redeploy:** `echo "OFFICE_OWNER_EMAIL=" | farbaek-set-env`, then `farbaek-deploy --again`.

## Turning the office off at once

On the server, `echo "OFFICE_HOST=" | farbaek-set-env`, then `farbaek-deploy --again`. The office host then answers 404, every office page and action refuses, and nothing else changes.

## Checking nothing was tampered with

In Office Space, under Audit log, choose **Check the chain now**. A break names the first bad event. Tell the owner, and don't use the office until it's understood.
