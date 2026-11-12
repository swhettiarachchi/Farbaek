import { describe, expect, it } from "vitest";
import { XXHandshake, fingerprint, generateKeyPair, pairingCode, pairingCommit } from "@/agent-runtime/mesh/noise";
import { WebNoiseError, WebXXHandshake, fromHex, generateWebKeyPair, toHex, webFingerprint, webKeyPairFromPrivate, webPairingCode, webPairingCommit } from "./noise";

/** Pairing version 2's test vector (ADR 0194), the same numbers as the agent's noise.test.ts and the Android port. */
const PAIRING_VECTOR = {
  commit: "20be69037d35000e7c441c46ad27fa92aadba8af678f29907f6c2c433e6cc4b3",
  code: "053107",
} as const;
const counting = (from: number) => Uint8Array.from({ length: 32 }, (_, i) => from + i);

// The published vector for this suite, from cacophony (public domain), as the agent's own test uses.
const VECTOR = {
  prologue: "4a6f686e2047616c74",
  init_static: "e61ef9919cde45dd5f82166404bd08e38bceb5dfdfded0a34c8df7ed542214d1",
  init_ephemeral: "893e28b9dc6ca8d611ab664754b8ceb7bac5117349a4439a6b0569da977c464a",
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
  ],
};

describe("Noise on Web Crypto", () => {
  it("matches the published vector byte for byte", async () => {
    const prologue = fromHex(VECTOR.prologue);
    const init = new WebXXHandshake({ initiator: true, prologue, staticKey: await webKeyPairFromPrivate(fromHex(VECTOR.init_static)), ephemeral: await webKeyPairFromPrivate(fromHex(VECTOR.init_ephemeral)) });
    const resp = new WebXXHandshake({ initiator: false, prologue, staticKey: await webKeyPairFromPrivate(fromHex(VECTOR.resp_static)), ephemeral: await webKeyPairFromPrivate(fromHex(VECTOR.resp_ephemeral)) });
    const [m1, m2, m3, m4, m5] = VECTOR.messages;
    const c1 = await init.writeMessage(fromHex(m1!.payload));
    expect(toHex(c1)).toBe(m1!.ciphertext);
    expect(toHex(await resp.readMessage(c1))).toBe(m1!.payload);
    const c2 = await resp.writeMessage(fromHex(m2!.payload));
    expect(toHex(c2)).toBe(m2!.ciphertext);
    await init.readMessage(c2);
    const c3 = await init.writeMessage(fromHex(m3!.payload));
    expect(toHex(c3)).toBe(m3!.ciphertext);
    await resp.readMessage(c3);
    expect(toHex(init.handshakeHash)).toBe(VECTOR.handshake_hash);
    // Transport messages keep alternating: the responder sends the fourth, the initiator the fifth.
    const t4 = await resp.result().send.encrypt(fromHex(m4!.payload));
    expect(toHex(t4)).toBe(m4!.ciphertext);
    expect(toHex(await init.result().receive.decrypt(t4))).toBe(m4!.payload);
    const t5 = await init.result().send.encrypt(fromHex(m5!.payload));
    expect(toHex(t5)).toBe(m5!.ciphertext);
  });

  it("completes a handshake with the Farbaek Agent's own Noise, both ways, with the same pairing code", async () => {
    const prologue = new TextEncoder().encode("farbaek-mesh/1");
    // Browser calls the agent.
    const browserKey = await generateWebKeyPair();
    const agentKey = generateKeyPair();
    const b = new WebXXHandshake({ initiator: true, prologue, staticKey: browserKey });
    const a = new XXHandshake({ initiator: false, prologue, staticKey: agentKey });
    a.readMessage(await b.writeMessage());
    await b.readMessage(a.writeMessage(new TextEncoder().encode("hello")));
    a.readMessage(await b.writeMessage());
    const callerValue = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const answererValue = globalThis.crypto.getRandomValues(new Uint8Array(32));
    expect(await webPairingCommit(callerValue)).toBe(pairingCommit(callerValue));
    expect(await webPairingCode(b.handshakeHash, callerValue, answererValue)).toBe(pairingCode(a.handshakeHash, callerValue, answererValue));
    expect(await webFingerprint(browserKey.publicKey)).toBe(fingerprint(browserKey.publicKey));
    expect(toHex(b.remoteStatic!)).toBe(agentKey.publicKey.toString("hex"));
    const sealed = await b.result().send.encrypt(new TextEncoder().encode("to the agent"));
    expect(a.result().receive.decrypt(Buffer.from(sealed)).toString()).toBe("to the agent");

    // The agent calls the browser.
    const a2 = new XXHandshake({ initiator: true, prologue, staticKey: agentKey });
    const b2 = new WebXXHandshake({ initiator: false, prologue, staticKey: browserKey });
    await b2.readMessage(a2.writeMessage());
    a2.readMessage(await b2.writeMessage());
    await b2.readMessage(a2.writeMessage());
    const back = a2.result().send.encrypt(Buffer.from("to the browser"));
    expect(new TextDecoder().decode(await b2.result().receive.decrypt(back))).toBe("to the browser");
  });

  it("reproduces pairing version 2's test vector, as the agent does (ADR 0194)", async () => {
    const [h, nC, nA] = [counting(0x00), counting(0x20), counting(0x40)];
    expect(await webPairingCommit(nC)).toBe(PAIRING_VECTOR.commit);
    expect(await webPairingCode(h, nC, nA)).toBe(PAIRING_VECTOR.code);
    expect(pairingCode(h, nC, nA)).toBe(PAIRING_VECTOR.code);
    await expect(webPairingCode(h, nC, new Uint8Array(31))).rejects.toThrow(WebNoiseError);
    await expect(webPairingCommit(new Uint8Array(0))).rejects.toThrow(WebNoiseError);
  });

  it("refuses a changed message and an unusable key", async () => {
    const prologue = new Uint8Array([1]);
    const init = new WebXXHandshake({ initiator: true, prologue, staticKey: await generateWebKeyPair() });
    const resp = new WebXXHandshake({ initiator: false, prologue, staticKey: await generateWebKeyPair() });
    await resp.readMessage(await init.writeMessage());
    const m2 = await resp.writeMessage();
    m2[40]! ^= 0xff;
    await expect(init.readMessage(m2)).rejects.toThrow(WebNoiseError);
    const odd = new WebXXHandshake({ initiator: false, prologue, staticKey: await generateWebKeyPair() });
    await odd.readMessage(new Uint8Array(32));
    await expect(odd.writeMessage()).rejects.toThrow(WebNoiseError);
  });
});
