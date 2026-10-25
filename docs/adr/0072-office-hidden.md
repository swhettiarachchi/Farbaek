# ADR 0072: Office Space is invisible to unknown devices

- Status: accepted (2026-10-24).
- Builds on ADR 0069 (trusted devices) and ADR 0032 (Office Space).

## Context

After ADR 0069, unknown devices couldn't get into Office Space, but they could still see its sign-in page, and the owner saw that from another phone. The owner asked for the office to show itself only on their computer and phone.

## Decision

**Hidden from unknown devices:**
- Before any office page or action, the proxy asks `app_office_device_known` whether this browser's device cookie belongs to a device the office knows (trusted or waiting).
- If not, it answers 404 "There's nothing at this address", the same answer as a name nothing uses. It fails closed.

**One exception: `/add-device`.** It names nothing (no product, no sign-in): just a box for an 8-character code.

**Adding a device:**
- On a trusted device, My security > Devices > Add a device, with a fresh authenticator code, makes a one-time code (`app_staff_create_device_invite`).
- The code has no look-alike characters and is stored only as a hash. It lasts 15 minutes, and only one code is live at a time.
- Typed on the new device (`app_staff_redeem_device_invite`), it trusts that device (`approved_via = 'invite'`). The device then sees the sign-in page, and still needs both codes.
- Every refusal reads the same, with 5 tries per network address per 15 minutes.

**While no device is trusted at all** (a new office, or after `private.reset_staff_devices` over SSH), the office is open, so the first device can sign in.

## Consequences

- Other devices can't tell Office Space exists. Only `/add-device`, which reveals nothing, answers.
- A lost device is removed from the list. A replacement is added with a code from the remaining one, and losing both needs the SSH reset.
- One more database call per office request, which is negligible at the office's traffic.
