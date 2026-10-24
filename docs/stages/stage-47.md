# Stage 47: Office Space only on trusted devices

The owner asked for Office Space to open only on their computer and phone.

- **Decision record:** `docs/adr/0069-office-trusted-devices.md`.
- **Branch:** `feat/office-trusted-devices`, stacked on `feat/spend-alerts` (#55).

## 2026-10-24

### Done

**Migration v41** (`20261112090000_staff_devices.sql`):
- `staff_devices`: only hashes are stored, and the server key can only read it;
- `app_staff_check_device`: the first device is trusted, later ones wait with a 6-digit code;
- `app_staff_device_trusted`;
- `app_staff_approve_device`: needs step-up, the code, and a trusted approving device; five tries;
- `app_staff_revoke_device`;
- `private.reset_staff_devices(email)`, for the database owner only;
- `devices.own` in `private.staff_can`.

**Server:**
- `src/server/office/devices.ts`: the `__Host-fb-device` cookie, its hash and the device name;
- `openSession` checks the device before any office session, and a waiting device gets its code;
- `getStaff` checks the device on every request, and `checkStaff` passes only an explicit `true`.

**Pages:**
- `/device` shows the code and a Continue button;
- My security > Devices lists trusted and waiting devices, with approve (code and authenticator code) and remove.

**Privacy Policy:** the cookie list includes `__Host-fb-device`.

### Verified

- `tests/db/staff-devices.test.ts` (9):
  - non-staff get no answer;
  - the first device is trusted with one event;
  - a second waits with a stable code;
  - approval needs step-up, a trusted device and the right code, with no event on a wrong one;
  - five wrong codes cancel;
  - removal takes effect, and the device needs approval again;
  - only the database owner can reset;
  - grants are correct;
  - the role check runs.
- `src/server/office/sign-in.test.ts`: no session on a waiting device, fails closed without a device or when the check fails, and `checkStaff` refuses anything but a trusted device.
- `src/core/office/devices.test.ts`: device names.
- The office permission and staff suites still pass.
- `pnpm typecheck` and lint are clean. The full suite run is in the PR.
- **Not seen in a browser:** the office needs a real sign-in, and the demo build has none. The owner's first sign-in after the merge is the check.

### Found after the merge

**What worked:** the owner's first sign-in, read back in the database:
- the authenticator was enrolled;
- Chrome on Windows was trusted as the first device;
- the owner was made (`staff.bootstrapped`);
- the office session opened.

**What went wrong:** the page after it showed the public homepage at officespace.farbaek.com/?welcome=1.

**The cause** is older than this stage:
- after a Server Action's `redirect()`, Next.js fetches the next page itself from its own address (`localhost:3000`), keeping the browser's `X-Forwarded-Host`;
- the proxy routed by Host, so it served the customer app's `/`;
- this was reproduced in production: that request answered 200 with the homepage.

**The fix** (`fix/office-action-redirects`):
- `decideRoute` refuses a request whose `X-Forwarded-Host` is the office but whose Host isn't;
- Next.js then has the browser load the page from the office itself;
- tests are in `src/server/http/hosts.test.ts`.

### The owner's steps after merging

1. On the computer: sign in to Office Space, then select Continue on the device page. As the first device, it's trusted.
2. On the phone: sign in, and the phone shows a 6-digit device code.
3. On the computer: My security > Devices, enter the phone's code and an authenticator code, then Approve.
4. On the phone: Continue.

**If every trusted device is lost:**

```bash
ssh -i ~/.ssh/farbaek_vps farbaek@2.25.88.188 "docker exec -i supabase-db psql -U postgres -d postgres -c \"select private.reset_staff_devices('info@farbaek.com')\""
```
