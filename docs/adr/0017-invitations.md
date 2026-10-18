# 0017. Invitations by one-time link

- Status: accepted
- Date: 2026-10-18

## Context

Plans include seats (the trial has 3), and Team collaboration is a Team plan feature, but a workspace had no way to add people. No email provider is connected yet (the owner will choose one before launch).

## Decision

- **Owners and admins create an invitation** for an email address and a role from Settings. Owners invite admins, members or viewers; admins invite members or viewers; nobody is invited as owner. The rules live in `src/core/workspace/invitations.ts` and again in the database (migration 13).
- **A one-time link instead of an email.** The link carries 32 random bytes (base64url). Farbaek stores only the token's SHA-256, so the link is shown once to the person who created it, to send themselves. Browsers can't read the hash column at all (column-level grant).
- **Accepting needs the invited, confirmed address.** The link opens `/invite/<token>`. Signed out, it sends the person through sign-in and back. Signed in with another address, it says so and offers to sign out. The database accepts only when the signed-in user's confirmed email equals the invited one.
- **Seats are counted with open invitations**, from the inviting workspace's plan, when creating and again when accepting, under a row lock on the workspace.
- **Invitations expire after 7 days**, work once, and can be revoked. An expired invitation for the same person is closed when a new one is created.
- Members who joined by invitation are shown to owners and admins by the address they were invited at.

## Consequences

- When an email provider is connected, the same link can be emailed; nothing else changes.
- Not yet accepted live: that needs a second person's email. The database tests cover acceptance, the wrong account, an unconfirmed address, seats, roles, expiry, revoking and privacy, and the creation, link page and revoke flow were checked live.
