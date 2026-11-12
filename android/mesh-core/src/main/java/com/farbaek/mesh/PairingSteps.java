package com.farbaek.mesh;

import org.bouncycastle.util.Arrays;
import org.bouncycastle.util.encoders.Hex;

/**
 * Pairing v2's three messages after the handshake, for one side, as a strict
 * sequence. The same wire format as the desktop agent and the browser:
 *
 * <pre>
 *   caller   -> { "t": "pair-commit", "commit": hex(SHA-256("farbaek-pair-commit/2" || nC)) }
 *   answerer -> { "t": "pair-nonce",  "nonce": hex(nA) }   only after a well-formed commit
 *   caller   -> { "t": "pair-reveal", "nonce": hex(nC) }   only after a well-formed nonce
 * </pre>
 *
 * The caller is bound to nC before it learns nA, and the answerer sends nA
 * before it learns nC, so neither side, and no device in the middle running
 * two legs, can choose the code (Noise.pairingCode). The code used to come
 * from the handshake hash alone, which the caller's last handshake payload
 * could steer. Anything out of order, repeated, malformed or extra fails, and
 * nothing is paired. The caller is always the Noise initiator.
 */
final class PairingSteps {
    static final String STEPS = "The other device didn't follow the pairing steps. Nothing was paired.";

    /** The other side broke the sequence: the pairing stops here. */
    static final class Failed extends Exception {
        Failed() {
            super(STEPS);
        }
    }

    private final boolean caller;
    private final byte[] handshakeHash;
    /** This side's own nonce: nC for the caller, nA for the answerer. Made fresh unless a test gives one. */
    private final byte[] own;
    private byte[] callerNonce;
    private byte[] answererNonce;
    private byte[] commit;
    /** How far this side has got: 0 at the start, 1 after its first step, 2 once the code is known. */
    private int step;
    private boolean failed;
    private String code;

    PairingSteps(boolean caller, byte[] handshakeHash, byte[] ownNonce) {
        if (handshakeHash == null || handshakeHash.length != Noise.HASHLEN) throw new IllegalArgumentException("A handshake hash is 32 bytes.");
        if (ownNonce == null || ownNonce.length != Noise.PAIRING_NONCE_BYTES) throw new IllegalArgumentException("A pairing nonce is 32 bytes.");
        this.caller = caller;
        this.handshakeHash = handshakeHash.clone();
        this.own = ownNonce.clone();
    }

    static PairingSteps caller(byte[] handshakeHash) {
        return new PairingSteps(true, handshakeHash, Noise.pairingNonce());
    }

    static PairingSteps answerer(byte[] handshakeHash) {
        return new PairingSteps(false, handshakeHash, Noise.pairingNonce());
    }

    private Failed fail() {
        failed = true;
        return new Failed();
    }

    /** The caller's first message, its commitment. Only the caller sends it, and only once. */
    MeshMessage start() throws Failed {
        if (!caller || failed || step != 0) throw fail();
        callerNonce = own;
        step = 1;
        return MeshMessage.pairCommit(Hex.toHexString(Noise.pairingCommit(callerNonce)));
    }

    /**
     * Takes the other side's next message and returns what to send back, or
     * null when nothing is. Throws for anything but the one message expected
     * next; after that, every message fails, as does anything after a failure.
     */
    MeshMessage receive(MeshMessage m) throws Failed {
        if (failed || code != null || m == null) throw fail();
        if (caller) {
            if (step != 1 || !"pair-nonce".equals(m.t) || !hex64(m.nonce)) throw fail();
            answererNonce = Hex.decode(m.nonce);
            code = Noise.pairingCode(handshakeHash, callerNonce, answererNonce);
            step = 2;
            return MeshMessage.pairReveal(Hex.toHexString(callerNonce));
        }
        if (step == 0 && "pair-commit".equals(m.t) && hex64(m.commit)) {
            commit = Hex.decode(m.commit);
            // The answerer's nonce goes out only now, after the caller is bound to its own.
            answererNonce = own;
            step = 1;
            return MeshMessage.pairNonce(Hex.toHexString(answererNonce));
        }
        if (step == 1 && "pair-reveal".equals(m.t) && hex64(m.nonce)) {
            byte[] revealed = Hex.decode(m.nonce);
            if (!Arrays.constantTimeAreEqual(commit, Noise.pairingCommit(revealed))) throw fail();
            callerNonce = revealed;
            code = Noise.pairingCode(handshakeHash, callerNonce, answererNonce);
            step = 2;
            return null;
        }
        throw fail();
    }

    boolean done() {
        return code != null;
    }

    /** The six digits, once both nonces are known; null before. */
    String code() {
        return code;
    }

    private static boolean hex64(String value) {
        return value != null && MeshProtocol.HEX64.matcher(value).matches();
    }
}
