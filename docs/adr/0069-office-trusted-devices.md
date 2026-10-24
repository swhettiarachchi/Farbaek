# ADR 0069: Office Space only on trusted devices

- Status: accepted (2026-10-24).
- Builds on ADR 0032 (Office Space sign-in: an email code, then an authenticator code).

## Context

The owner asked for Office Space to open only on their own computer and phone.

Until now, anyone with both codes could sign in from any browser. That means access to the info@ inbox plus the authenticator app on the owner's phone.

**An address allowlist doesn't fit.** Home and mobile data addresses change, and an attacker can borrow one.

**Passkeys would bind to the device,** but Supabase passkeys are still in beta (ADR 0032).

## Decision

**A device cookie per browser:**
- `__Host-fb-device` holds 32 random bytes;
- it's Secure, HttpOnly, SameSite=Strict, on the office host only, and lives 400 days;
- the database stores only `sha256("office-device:" + secret)`, in `staff_devices` (migration v41), one row per person and device.

**The first device is trusted.** After both codes, a person with no trusted device has the one they're on trusted (`device.trusted`, via `first_device`).

**Every later device waits:**
- it gets a 6-digit code, shown only on that device (`/device`), and no office session;
- it stays out until the person approves it from a device they already trust (My security > Devices) with that code and a fresh authenticator code (`app_staff_approve_device`, step-up only, also checking the approving device is trusted);
- five wrong codes cancel the request, and the device asks again for a new code;
- because the code only appears on the new device, approving someone else's request by mistake is impossible.

**Checked on every page and action:**
- `getStaff` asks `app_staff_device_trusted` for this browser's device;
- `checkStaff` lets only an explicit `true` through, and refuses with `device`;
- pages redirect to `/device`, and actions answer "This device isn't trusted for Office Space";
- removing a device (`app_staff_revoke_device`) takes effect at its next request, and it can come back only by approval.

**The way back in:** `private.reset_staff_devices(email)` removes all of a person's devices. Only the database owner can run it, over SSH, so the next device they sign in on is trusted. Recorded as `device.reset`.

**A new permission,** `devices.own`, for every role: your own devices only. It is in both `PERMISSIONS` and `private.staff_can`.

**Office codes are sent with the server's key** (ADR 0067). The device check comes after both codes, so a stolen inbox and authenticator still meet it.

## Consequences

- **Office Space opens only on the owner's computer and phone,** once the phone is approved from the computer.
- **A copied device cookie still works.** The cookie can't be read by scripts (HttpOnly), but malware on a trusted device is out of scope.
- **Clearing the browser's cookies makes it a new device,** which needs approval again.
- **Losing every trusted device** needs SSH to the server.
