import { describe, expect, it } from "vitest";
import { MAX_MESSAGE, NoiseError, XXHandshake, fingerprint, generateKeyPair, keyPairFromPrivate, pairingCode, sameKey } from "./noise";

// The published vector for this exact suite, from the cacophony test vectors
// (https://github.com/haskell-cryptography/cacophony, public domain).
const VECTOR = {
  protocol_name: "Noise_XX_25519_AESGCM_SHA256",
  init_prologue: "4a6f686e2047616c74",
  init_static: "e61ef9919cde45dd5f82166404bd08e38bceb5dfdfded0a34c8df7ed542214d1",
  init_ephemeral: "893e28b9dc6ca8d611ab664754b8ceb7bac5117349a4439a6b0569da977c464a",
  resp_prologue: "4a6f686e2047616c74",
  resp_static: "4a3acbfdb163dec651dfa3194dece676d437029c62a408b4c5ea9114246e4893",
  resp_ephemeral: "bbdb4cdbd309f1a1f2e1456967fe288cadd6f712d65dc7b7793d5e63da6b375b",
  handshake_hash: "1b7aefb1125762aa21a252890d00af54519638b76437444538f9a52f21e2e0dc",
  messages: [
    { payload: "4c756477696720766f6e204d69736573", ciphertext: "ca35def5ae56cec33dc2036731ab14896bc4c75dbb07a61f879f8e3afa4c79444c756477696720766f6e204d69736573" },
    {
      payload: "4d757272617920526f746862617264",
      ciphertext:
        "95ebc60d2b1fa672c1f46a8aa265ef51bfe38e7ccb39ec5be34069f144808843757117acceb05bd7a45733bc22015c97a9d0cbaf41b80446d5988ff5127235d76b79eade70f473d6a4ef521fdcbeda5340d01e028ba793fc059f2724a83af05f12dda0448a7621a926b379a92477fd",
    },
    {
      payload: "462e20412e20486179656b",
      ciphertext: "c90f1cf77eba4e50edb038991565e36c9758943a989229b6051244dc4fbecb6946744b401af2ee1a5881b65fbb87fd07cb6a328ececc9ce6ce84c399dc332d4fd521fa4bb7f467ce909395",
    },
    { payload: "4361726c204d656e676572", ciphertext: "bc3fa77f6aca3e8466d7dc6bea10013e88a6a29add5132b461806c" },
    { payload: "4a65616e2d426170746973746520536179", ciphertext: "250b01074cdfe0df2ecf8ccbf1737b15a2ddb5b52fd9a396604e9c793cee3b3bb9" },
    { payload: "457567656e2042f6686d20766f6e2042617765726b", ciphertext: "449d4d433b3cdc3d02bf6fc881774b9df54366ebcffb9689bb13f14709822cd7ef42bcdb4d" },
  ],
};

const hex = (s: string) => Buffer.from(s, "hex");

function pair(prologue = Buffer.from("farbaek-mesh/1")) {
  const a = generateKeyPair();
  const b = generateKeyPair();
  const init = new XXHandshake({ initiator: true, prologue, staticKey: a });
  const resp = new XXHandshake({ initiator: false, prologue, staticKey: b });
  resp.readMessage(init.writeMessage());
  init.readMessage(resp.writeMessage());
  resp.readMessage(init.writeMessage());
  return { a, b, init, resp };
}

describe("Noise_XX_25519_AESGCM_SHA256", () => {
  it("matches the published test vector, message by message", () => {
    const init = new XXHandshake({ initiator: true, prologue: hex(VECTOR.init_prologue), staticKey: keyPairFromPrivate(hex(VECTOR.init_static)), ephemeral: keyPairFromPrivate(hex(VECTOR.init_ephemeral)) });
    const resp = new XXHandshake({ initiator: false, prologue: hex(VECTOR.resp_prologue), staticKey: keyPairFromPrivate(hex(VECTOR.resp_static)), ephemeral: keyPairFromPrivate(hex(VECTOR.resp_ephemeral)) });

    // Handshake: initiator, responder, initiator.
    const [m1, m2, m3, ...transport] = VECTOR.messages;
    const c1 = init.writeMessage(hex(m1!.payload));
    expect(c1.toString("hex")).toBe(m1!.ciphertext);
    expect(resp.readMessage(c1).toString("hex")).toBe(m1!.payload);

    const c2 = resp.writeMessage(hex(m2!.payload));
    expect(c2.toString("hex")).toBe(m2!.ciphertext);
    expect(init.readMessage(c2).toString("hex")).toBe(m2!.payload);

    const c3 = init.writeMessage(hex(m3!.payload));
    expect(c3.toString("hex")).toBe(m3!.ciphertext);
    expect(resp.readMessage(c3).toString("hex")).toBe(m3!.payload);

    expect(init.handshakeHash.toString("hex")).toBe(VECTOR.handshake_hash);
    expect(resp.handshakeHash.toString("hex")).toBe(VECTOR.handshake_hash);
    expect(sameKey(init.remoteStatic!, keyPairFromPrivate(hex(VECTOR.resp_static)).publicKey)).toBe(true);
    expect(sameKey(resp.remoteStatic!, keyPairFromPrivate(hex(VECTOR.init_static)).publicKey)).toBe(true);

    // Transport: the vector keeps alternating, so the responder sends next.
    const a = init.result();
    const b = resp.result();
    transport.forEach((m, i) => {
      const [sender, receiver] = i % 2 === 0 ? [b, a] : [a, b];
      const c = sender.send.encrypt(hex(m.payload));
      expect(c.toString("hex")).toBe(m.ciphertext);
      expect(receiver.receive.decrypt(c).toString("hex")).toBe(m.payload);
    });
  });

  it("rejects a changed, replayed or reordered transport message", () => {
    const { init, resp } = pair();
    const a = init.result();
    const b = resp.result();
    const first = a.send.encrypt(Buffer.from("one"));
    const second = a.send.encrypt(Buffer.from("two"));

    const changed = Buffer.from(first);
    changed[0]! ^= 1;
    expect(() => b.receive.decrypt(changed)).toThrow(NoiseError);
    expect(() => b.receive.decrypt(second)).toThrow(NoiseError); // out of order
    expect(b.receive.decrypt(first).toString()).toBe("one"); // the counter didn't move on failure
    expect(() => b.receive.decrypt(first)).toThrow(NoiseError); // replayed
    expect(b.receive.decrypt(second).toString()).toBe("two");
  });

  it("refuses a handshake message that was tampered with", () => {
    const prologue = Buffer.from("farbaek-mesh/1");
    const init = new XXHandshake({ initiator: true, prologue, staticKey: generateKeyPair() });
    const resp = new XXHandshake({ initiator: false, prologue, staticKey: generateKeyPair() });
    resp.readMessage(init.writeMessage());
    const m2 = resp.writeMessage();
    m2[40]! ^= 1; // inside the encrypted static key
    expect(() => init.readMessage(m2)).toThrow(NoiseError);
  });

  it("refuses a different prologue, so another protocol's handshake can't be replayed into this one", () => {
    const init = new XXHandshake({ initiator: true, prologue: Buffer.from("farbaek-mesh/1"), staticKey: generateKeyPair() });
    const resp = new XXHandshake({ initiator: false, prologue: Buffer.from("something-else"), staticKey: generateKeyPair() });
    resp.readMessage(init.writeMessage());
    expect(() => init.readMessage(resp.writeMessage())).toThrow(NoiseError);
  });

  it("enforces turns and message size", () => {
    const prologue = Buffer.from("x");
    const init = new XXHandshake({ initiator: true, prologue, staticKey: generateKeyPair() });
    expect(() => init.readMessage(Buffer.alloc(32))).toThrow(NoiseError);
    expect(() => init.writeMessage(Buffer.alloc(MAX_MESSAGE))).toThrow(NoiseError);
  });

  it("gives both honest sides the same pairing code, and a relay in the middle different ones", () => {
    const { a, b, init, resp } = pair();
    expect(pairingCode(init.handshakeHash)).toMatch(/^\d{6}$/);
    expect(pairingCode(init.handshakeHash)).toBe(pairingCode(resp.handshakeHash));
    expect(sameKey(init.remoteStatic!, b.publicKey)).toBe(true);
    expect(sameKey(resp.remoteStatic!, a.publicKey)).toBe(true);

    // A relay runs its own handshake with each side: each side's hash differs.
    const mallory = generateKeyPair();
    const prologue = Buffer.from("farbaek-mesh/1");
    const left = new XXHandshake({ initiator: true, prologue, staticKey: a });
    const relayIn = new XXHandshake({ initiator: false, prologue, staticKey: mallory });
    relayIn.readMessage(left.writeMessage());
    left.readMessage(relayIn.writeMessage());
    relayIn.readMessage(left.writeMessage());
    const relayOut = new XXHandshake({ initiator: true, prologue, staticKey: mallory });
    const right = new XXHandshake({ initiator: false, prologue, staticKey: b });
    right.readMessage(relayOut.writeMessage());
    relayOut.readMessage(right.writeMessage());
    right.readMessage(relayOut.writeMessage());
    expect(pairingCode(left.handshakeHash)).not.toBe(pairingCode(right.handshakeHash));
  });

  it("names keys by a stable fingerprint", () => {
    const k = generateKeyPair();
    expect(fingerprint(k.publicKey)).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint(k.publicKey)).toBe(fingerprint(Buffer.from(k.publicKey)));
    expect(sameKey(k.publicKey, generateKeyPair().publicKey)).toBe(false);
  });
});
