# Stage 50: Office Space invisible to unknown devices

The owner asked that Office Space show itself only on their computer and phone.

- **Decision record:** `docs/adr/0072-office-hidden.md`.
- **Branch:** `feat/office-hidden`, from `main` at `630bf24`.

## 2026-10-24

### Done

**Migration v44** (`20261115090000_office_hidden.sql`):
- `staff_device_invites`, whose hashes not even the server key can read;
- `app_office_device_known`;
- `app_staff_create_device_invite`, needing step-up from a trusted device, with one live code;
- `app_staff_redeem_device_invite`;
- `approved_via` can now be `invite`.

**The proxy** answers 404 to unknown devices for every office path but `/add-device`.

**`/add-device`:** a code box that names nothing. 5 tries per address per 15 minutes, and the same answer for every refusal.

**My security > Devices > Add a device:** a fresh authenticator code makes the code, shown once with when it stops working.

**Helpers:**
- `src/core/office/device-codes.ts`: codes without look-alikes, made by rejection sampling;
- `src/server/office/device-token.ts`: hashes usable from the proxy.

### Verified

- `tests/db/office-hidden.test.ts` (6):
  - open while no device is trusted;
  - then only known devices pass;
  - codes need step-up and a trusted device, work once, expire, and only one is live;
  - removed devices are forgotten;
  - the SSH reset reopens;
  - the codes can't be read.
- `src/core/office/device-codes.test.ts` (2).
- The device, staff, permission and design suites still pass.
- `pnpm typecheck`, lint and a production build are clean.
- **Not seen in a browser:** the gate needs the office host and real devices. The owner's check is below.

### The owner's check after merging

- **Computer and Android phone:** the office as before.
- **Any other phone:** officespace.farbaek.com shows only "There's nothing at this address".
