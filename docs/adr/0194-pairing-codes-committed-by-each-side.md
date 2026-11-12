# ADR 0194: Pairing codes from a value committed by each side

- **Status:** accepted
- **Date:** 2026-11-12
- **Amends:** ADR 0038 (nearby pairing) and ADR 0096 (pairing a phone or browser through Farbaek).
- **Code:** `src/core/mesh/pairing.ts` (the steps), `src/agent-runtime/mesh/noise.ts` and `src/core/mesh/web/noise.ts` (the hashing), `node.ts` (`PairingSession`, and the limits on answering) and `web/pair.ts` (`WebPairing`).

## Context

Mesh pairing compares a six-digit code on both screens. Until now the code came only from the Noise XX handshake hash `h` (HKDF, label `farbaek-mesh/1 code`). ADR 0038 and ADR 0096 said a relay in the middle would hold two different hashes, so the codes would differ. That was wrong.

**The attack, demonstrated by an independent review.** In XX the caller (the Noise initiator) writes message 3, and its payload, the caller's hello, is the last thing hashed into `h`. A device in the middle, Mallory, runs two legs:
- with the real caller, Mallory answers, which fixes that leg's code;
- with the real answerer, Mallory calls, and tries message-3 payloads until that leg's code matches. JSON whitespace and unknown hello keys cost nothing to vary.

A plain Java brute force found a match in about 186,000 tries, in 1.5 seconds, well inside the 10-second handshake timeout. Both people then saw the same code, confirmed, and both devices trusted Mallory.

Getting in the middle was easy:
- **on the local network:** discovery announcements aren't authenticated, so Mallory announces a paired device's fingerprint at its own address;
- **through Farbaek's relay:** the relay, or anyone who controls it, is already in the middle of a phone or browser pairing.

## Decision

**Pairing version 2: commit, then reveal, then the code.** After the handshake and before any code exists, three messages travel in the existing message envelope, the same one the confirmations use:
1. The caller makes `nC`, 32 random bytes, and sends `{ "t": "pair-commit", "commit": hex(SHA-256("farbaek-pair-commit/2" || nC)) }`.
2. The answerer, only after a well-formed commit, makes `nA`, 32 random bytes, and sends `{ "t": "pair-nonce", "nonce": hex(nA) }`.
3. The caller, only after a well-formed nonce, sends `{ "t": "pair-reveal", "nonce": hex(nC) }`.

The answerer checks the reveal against the commit. Both then compute `HMAC-SHA256(key = h, "farbaek-pair-code/2" || nC || nA)`, and the code is its first four bytes as a big-endian number, mod 1,000,000, padded to six digits. The confirmations follow unchanged: both people confirm, as before. The caller is always the Noise initiator: the device that dialled nearby, and the phone or browser through Farbaek.

**What the steps give.** The caller is bound to `nC` before it learns `nA`, and the answerer sends `nA` before it learns `nC`. Neither side chooses the code. Mallory can still choose `h` on the leg where it calls, and its own value on each leg, but every leg's code also depends on a value from the honest device that Mallory can't predict when it has to commit to its own. Each try matches with probability one in a million.

**What the steps don't give, and what bounds the tries.** A caller knows the answerer's code before it sends its reveal. So Mallory, having finished one leg, can keep calling the other device, compute each code, and quit every try whose code doesn't match. A second review measured about 138 such tries a second, around 1.5% success per two-minute window, while the answering screen showed nothing. The steps alone can't stop this; the answering computer does:
- **A pairing stays on screen until the person dismisses it,** whether it finished, failed or was declined. A new incoming pairing never replaces it; the caller is told the computer is busy.
- **After two runs that end after its nonce without a valid reveal** (a disconnect, an error or a timeout once `pair-nonce` was sent), the computer stops answering pairing calls until the person turns Be visible off and on. The second failure says so on screen.
- **Through Farbaek,** a pairing window answers one call, so the relay gets one try per window the person opens.

That leaves a handful of tries per visible window, each needing the person, at one in a million each.

**A click confirms only the pairing it was meant for.** Confirming and dismissing in the desktop app carry the pairing's id; the agent refuses them for any other pairing. The pairing card is drawn afresh for each pairing, and "Codes match" stays unavailable for two seconds after a code appears, so a click aimed at the last pairing can't land on a new one.

**Everything else fails closed.** These end the pairing with "The other device didn't follow the pairing steps. Nothing was paired.", with no code shown:
- a reveal that doesn't match its commit;
- a message out of order, repeated, or extra, including another pairing step once the code is shown;
- a value that isn't exactly 64 lowercase hex characters;
- the connection closing partway.

Steps that take too long end with "The other device took too long to answer. Try again." The limit is the 10-second handshake timeout nearby, and 30 seconds through Farbaek's relay, where each message is a round trip through the server. If the other device answers with its own error, such as busy, its words are shown instead.

**Older versions are refused.** Every hello now carries `"pairing": 2`, whatever its purpose. Older parsers ignore unknown keys, so this disturbs nothing. When pairing, a device whose hello doesn't carry `pairing` of at least 2 is refused at once: no steps, no code and no fallback to version 1. This device shows "Update Farbaek on {name} to pair: pairing changed to keep it safe." The older device is sent one error message saying the same from its side, so its own screen explains it.

**Both devices must be on version 2.** An updated device is not protected when the person pairs it with a device that hasn't updated. Mallory claims version 2 to the updated device, which pairs; on the leg to the older device it runs version 1 and searches handshake payloads offline until the codes match, as before. Refusing older versions makes a direct pairing fail loudly, but it can't tell a person that the device they meant to reach is old when Mallory answers in its place.

**Existing pairings keep working.** Transfers check the other device's static key against the one stored when they were paired; they never used the code. Nothing stored changes, and nobody has to pair again. Pairings made before this change were only as safe as version 1, so a person who suspects someone was in the middle when they paired should forget the device and pair it again.

**The protocol is one definition.** The order of the steps and their checks live once, in `src/core/mesh/pairing.ts`, used by the agent and the browser. Each platform supplies its own hashing: `node:crypto` on the agent, Web Crypto in the browser. The Android port follows the same spec. A test vector pins all three:
- `h` = bytes 0x00 to 0x1f, `nC` = 0x20 to 0x3f, `nA` = 0x40 to 0x5f;
- commit `20be69037d35000e7c441c46ad27fa92aadba8af678f29907f6c2c433e6cc4b3`;
- code `053107`.

Version 1's `pairingCode(h)` is gone: no code is shown from it any more.

## Also fixed from the same reviews

- **Discovery can't be flooded.**
  - "Found" holds at most 64 devices, and a new one takes the place of the one heard from longest ago.
  - One address lists at most four devices, and is heard at most 20 times in 10 seconds, counting only valid announcements.
  - Answers to "who" go out at most once a second.
  - The agent remembers addresses only for paired devices, and forgets one with the device.
- **Cancelling really cancels.** A transfer cancelled before its connection opened used to offer the files once it did. It now closes the connection, and a transfer cancelled on either side never changes state again.
- **An incoming offer shows the trusted name.** It used to show whatever name the sender's hello gave on that connection. It now shows the name saved when the device was paired.

## Consequences

- A device in the middle, the relay included, matches two pairing codes with probability one in a million per try, and gets a handful of tries per visible window, each needing the person: one per window through Farbaek.
- Pairing needs Farbaek with this change on both devices, and only then is it protected. A phone or browser picks it up when the page reloads; a computer needs the updated app.
- A finished pairing must be dismissed before the computer answers another, and two abandoned runs pause pairing calls until visibility is turned off and on.
- Pairing takes three more small messages, a few round trips, before the code appears.
- Tests (`noise.test.ts`, `mesh.test.ts`, `src/core/mesh/web/noise.test.ts`, `browser-mesh.test.ts`, SE-033):
  - the vector on both implementations, and agreement between them in both roles;
  - pairing between two computers, and between a browser and a computer;
  - refusal of older versions both ways, before any code exists;
  - each fail-closed case, and the timeout's own wording;
  - a middle device that calls again and again and quits every try: refused after the limit;
  - SE-033: the relay running the real steps on both sides, held to one try per window;
  - a confirmation for an earlier pairing that doesn't reach a newer one;
  - the discovery limits and the other fixes.
