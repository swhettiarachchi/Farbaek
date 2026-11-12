package com.farbaek.mesh;

import static com.farbaek.mesh.Text.hex;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.nio.charset.StandardCharsets;
import org.junit.Test;

/** Noise_XX_25519_AESGCM_SHA256, checked as src/agent-runtime/mesh/noise.test.ts checks the Node version. */
public class NoiseTest {
    // The published vector for this exact suite, from the cacophony test vectors
    // (https://github.com/haskell-cryptography/cacophony, public domain), as noise.test.ts uses it.
    static final String PROLOGUE = "4a6f686e2047616c74";
    static final String INIT_STATIC = "e61ef9919cde45dd5f82166404bd08e38bceb5dfdfded0a34c8df7ed542214d1";
    static final String INIT_EPHEMERAL = "893e28b9dc6ca8d611ab664754b8ceb7bac5117349a4439a6b0569da977c464a";
    static final String RESP_STATIC = "4a3acbfdb163dec651dfa3194dece676d437029c62a408b4c5ea9114246e4893";
    static final String RESP_EPHEMERAL = "bbdb4cdbd309f1a1f2e1456967fe288cadd6f712d65dc7b7793d5e63da6b375b";
    static final String HANDSHAKE_HASH = "1b7aefb1125762aa21a252890d00af54519638b76437444538f9a52f21e2e0dc";
    static final String[][] MESSAGES = {
        {"4c756477696720766f6e204d69736573", "ca35def5ae56cec33dc2036731ab14896bc4c75dbb07a61f879f8e3afa4c79444c756477696720766f6e204d69736573"},
        {"4d757272617920526f746862617264",
            "95ebc60d2b1fa672c1f46a8aa265ef51bfe38e7ccb39ec5be34069f144808843757117acceb05bd7a45733bc22015c97a9d0cbaf41b80446d5988ff5127235d76b79eade70f473d6a4ef521fdcbeda5340d01e028ba793fc059f2724a83af05f12dda0448a7621a926b379a92477fd"},
        {"462e20412e20486179656b", "c90f1cf77eba4e50edb038991565e36c9758943a989229b6051244dc4fbecb6946744b401af2ee1a5881b65fbb87fd07cb6a328ececc9ce6ce84c399dc332d4fd521fa4bb7f467ce909395"},
        {"4361726c204d656e676572", "bc3fa77f6aca3e8466d7dc6bea10013e88a6a29add5132b461806c"},
        {"4a65616e2d426170746973746520536179", "250b01074cdfe0df2ecf8ccbf1737b15a2ddb5b52fd9a396604e9c793cee3b3bb9"},
        {"457567656e2042f6686d20766f6e2042617765726b", "449d4d433b3cdc3d02bf6fc881774b9df54366ebcffb9689bb13f14709822cd7ef42bcdb4d"},
    };

    private static final byte[] MESH = "farbaek-mesh/1".getBytes(StandardCharsets.UTF_8);

    private static XXHandshake[] pair(KeyPair a, KeyPair b, byte[] prologue) throws NoiseException {
        XXHandshake init = new XXHandshake(true, prologue, a);
        XXHandshake resp = new XXHandshake(false, prologue, b);
        resp.readMessage(init.writeMessage());
        init.readMessage(resp.writeMessage());
        resp.readMessage(init.writeMessage());
        return new XXHandshake[] {init, resp};
    }

    @Test
    public void matchesThePublishedTestVectorMessageByMessage() throws Exception {
        XXHandshake init = new XXHandshake(true, hex(PROLOGUE), Noise.keyPairFromPrivate(hex(INIT_STATIC)), Noise.keyPairFromPrivate(hex(INIT_EPHEMERAL)));
        XXHandshake resp = new XXHandshake(false, hex(PROLOGUE), Noise.keyPairFromPrivate(hex(RESP_STATIC)), Noise.keyPairFromPrivate(hex(RESP_EPHEMERAL)));

        // Handshake: initiator, responder, initiator.
        byte[] c1 = init.writeMessage(hex(MESSAGES[0][0]));
        assertEquals(MESSAGES[0][1], hex(c1));
        assertEquals(MESSAGES[0][0], hex(resp.readMessage(c1)));

        byte[] c2 = resp.writeMessage(hex(MESSAGES[1][0]));
        assertEquals(MESSAGES[1][1], hex(c2));
        assertEquals(MESSAGES[1][0], hex(init.readMessage(c2)));

        byte[] c3 = init.writeMessage(hex(MESSAGES[2][0]));
        assertEquals(MESSAGES[2][1], hex(c3));
        assertEquals(MESSAGES[2][0], hex(resp.readMessage(c3)));

        assertEquals(HANDSHAKE_HASH, hex(init.handshakeHash()));
        assertEquals(HANDSHAKE_HASH, hex(resp.handshakeHash()));
        assertTrue(Noise.sameKey(init.remoteStatic(), Noise.keyPairFromPrivate(hex(RESP_STATIC)).publicKey()));
        assertTrue(Noise.sameKey(resp.remoteStatic(), Noise.keyPairFromPrivate(hex(INIT_STATIC)).publicKey()));

        // Transport: the vector keeps alternating, so the responder sends next.
        Transport a = init.result();
        Transport b = resp.result();
        for (int i = 3; i < MESSAGES.length; i++) {
            Transport sender = (i - 3) % 2 == 0 ? b : a;
            Transport receiver = (i - 3) % 2 == 0 ? a : b;
            byte[] c = sender.send.encrypt(hex(MESSAGES[i][0]));
            assertEquals(MESSAGES[i][1], hex(c));
            assertEquals(MESSAGES[i][0], hex(receiver.receive.decrypt(c)));
        }
    }

    @Test
    public void rejectsAChangedReplayedOrReorderedTransportMessage() throws Exception {
        XXHandshake[] hs = pair(Noise.generateKeyPair(), Noise.generateKeyPair(), MESH);
        Transport a = hs[0].result();
        Transport b = hs[1].result();
        byte[] first = a.send.encrypt("one".getBytes(StandardCharsets.UTF_8));
        byte[] second = a.send.encrypt("two".getBytes(StandardCharsets.UTF_8));

        byte[] changed = first.clone();
        changed[0] ^= 1;
        assertThrows(() -> b.receive.decrypt(changed));
        assertThrows(() -> b.receive.decrypt(second)); // out of order
        assertEquals("one", new String(b.receive.decrypt(first), StandardCharsets.UTF_8)); // the counter didn't move on failure
        assertThrows(() -> b.receive.decrypt(first)); // replayed
        assertEquals("two", new String(b.receive.decrypt(second), StandardCharsets.UTF_8));
    }

    @Test
    public void refusesAHandshakeMessageThatWasTamperedWith() throws Exception {
        XXHandshake init = new XXHandshake(true, MESH, Noise.generateKeyPair());
        XXHandshake resp = new XXHandshake(false, MESH, Noise.generateKeyPair());
        resp.readMessage(init.writeMessage());
        byte[] m2 = resp.writeMessage();
        m2[40] ^= 1; // inside the encrypted static key
        assertThrows(() -> init.readMessage(m2));
    }

    @Test
    public void refusesADifferentPrologue() throws Exception {
        XXHandshake init = new XXHandshake(true, MESH, Noise.generateKeyPair());
        XXHandshake resp = new XXHandshake(false, "something-else".getBytes(StandardCharsets.UTF_8), Noise.generateKeyPair());
        resp.readMessage(init.writeMessage());
        byte[] m2 = resp.writeMessage();
        assertThrows(() -> init.readMessage(m2));
    }

    @Test
    public void enforcesTurnsAndMessageSize() {
        XXHandshake init = new XXHandshake(true, "x".getBytes(StandardCharsets.UTF_8), Noise.generateKeyPair());
        assertThrows(() -> init.readMessage(new byte[32]));
        assertThrows(() -> init.writeMessage(new byte[Noise.MAX_MESSAGE]));
    }

    @Test
    public void refusesALowOrderKeyAsNodeDoes() throws Exception {
        XXHandshake init = new XXHandshake(true, MESH, Noise.generateKeyPair());
        XXHandshake resp = new XXHandshake(false, MESH, Noise.generateKeyPair());
        resp.readMessage(init.writeMessage());
        byte[] m2 = resp.writeMessage();
        // An all-zero ephemeral key gives an all-zero shared secret, which X25519 implementations refuse.
        for (int i = 0; i < 32; i++) m2[i] = 0;
        assertThrows(() -> init.readMessage(m2));
    }

    /**
     * Both honest sides end with the same handshake hash and each other's keys.
     * A device in the middle has different hashes on its two legs, but that
     * alone never stopped it matching codes: it chose the caller's last payload
     * on one leg until the codes agreed. PairingTest shows why it no longer can.
     */
    @Test
    public void givesBothHonestSidesTheSameHandshakeHashAndEachOthersKeys() throws Exception {
        KeyPair a = Noise.generateKeyPair();
        KeyPair b = Noise.generateKeyPair();
        XXHandshake[] hs = pair(a, b, MESH);
        assertArrayEquals(hs[0].handshakeHash(), hs[1].handshakeHash());
        assertEquals(32, hs[0].handshakeHash().length);
        assertTrue(Noise.sameKey(hs[0].remoteStatic(), b.publicKey()));
        assertTrue(Noise.sameKey(hs[1].remoteStatic(), a.publicKey()));

        KeyPair mallory = Noise.generateKeyPair();
        XXHandshake left = pair(a, mallory, MESH)[0];
        XXHandshake right = pair(mallory, b, MESH)[1];
        assertNotEquals(hex(left.handshakeHash()), hex(right.handshakeHash()));
    }

    @Test
    public void namesKeysByAStableFingerprint() {
        KeyPair k = Noise.generateKeyPair();
        assertTrue(Noise.fingerprint(k.publicKey()).matches("[0-9a-f]{16}"));
        assertEquals(Noise.fingerprint(k.publicKey()), Noise.fingerprint(k.publicKey().clone()));
        assertFalse(Noise.sameKey(k.publicKey(), Noise.generateKeyPair().publicKey()));
    }

    @Test
    public void derivesTheSamePublicKeysAndFingerprintsAsNode() throws Exception {
        // Public keys from the cacophony vector's private keys, and fingerprints as noise.ts computes them.
        KeyPair init = Noise.keyPairFromPrivate(hex(INIT_STATIC));
        assertArrayEquals(hex(INIT_STATIC), init.privateKey());
        assertEquals(PairingCodeTest.NODE_FINGERPRINTS.get(INIT_STATIC)[0], hex(init.publicKey()));
        assertEquals(PairingCodeTest.NODE_FINGERPRINTS.get(INIT_STATIC)[1], Noise.fingerprint(init.publicKey()));
        KeyPair resp = Noise.keyPairFromPrivate(hex(RESP_STATIC));
        assertEquals(PairingCodeTest.NODE_FINGERPRINTS.get(RESP_STATIC)[0], hex(resp.publicKey()));
        assertEquals(PairingCodeTest.NODE_FINGERPRINTS.get(RESP_STATIC)[1], Noise.fingerprint(resp.publicKey()));
    }

    interface Action {
        void run() throws Exception;
    }

    static void assertThrows(Action action) {
        try {
            action.run();
        } catch (NoiseException expected) {
            return;
        } catch (Exception other) {
            fail("Expected a NoiseException, got " + other);
        }
        fail("Expected a NoiseException");
    }
}
