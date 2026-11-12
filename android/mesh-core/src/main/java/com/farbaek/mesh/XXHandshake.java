package com.farbaek.mesh;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * One Noise XX handshake:
 *
 *   -> e
 *   <- e, ee, s, es
 *   -> s, se
 *
 * The initiator writes messages 1 and 3, the responder message 2. After the
 * third message both sides have a Transport and the other side's verified
 * static public key. Follows src/agent-runtime/mesh/noise.ts step by step.
 */
public final class XXHandshake {
    private final SymmetricState ss;
    private final boolean initiator;
    private final KeyPair s;
    private final KeyPair presetEphemeral;
    private KeyPair e;
    private byte[] re;
    private byte[] rs;
    private int step;
    private Transport transport;

    public XXHandshake(boolean initiator, byte[] prologue, KeyPair staticKey) {
        this(initiator, prologue, staticKey, null);
    }

    /** With a fixed ephemeral key: only for the published test vectors. */
    public XXHandshake(boolean initiator, byte[] prologue, KeyPair staticKey, KeyPair ephemeral) {
        this.ss = new SymmetricState(Noise.PROTOCOL_NAME);
        this.ss.mixHash(prologue);
        this.initiator = initiator;
        this.s = staticKey;
        this.presetEphemeral = ephemeral;
    }

    /** Whose turn it is to write. */
    public boolean myTurn() {
        return step < 3 && ((step % 2 == 0) == initiator);
    }

    public boolean complete() {
        return transport != null;
    }

    /** The handshake hash: identical on both sides only when no one sat in the middle. */
    public byte[] handshakeHash() throws NoiseException {
        if (!complete()) throw new NoiseException("The handshake hasn't finished.");
        return ss.h.clone();
    }

    /** The other side's static public key, once it has been received and verified. */
    public byte[] remoteStatic() {
        return rs == null ? null : rs.clone();
    }

    public Transport result() throws NoiseException {
        if (transport == null) throw new NoiseException("The handshake hasn't finished.");
        return transport;
    }

    public byte[] writeMessage() throws NoiseException {
        return writeMessage(new byte[0]);
    }

    public byte[] writeMessage(byte[] payload) throws NoiseException {
        if (!myTurn()) throw new NoiseException("It isn't this side's turn to write.");
        ByteArrayOutputStream parts = new ByteArrayOutputStream();
        if (step == 0) {
            writeE(parts);
        } else if (step == 1) {
            writeE(parts);
            ss.mixKey(Noise.dh(e, re));
            byte[] encryptedStatic = ss.encryptAndHash(s.publicKeyRef());
            parts.write(encryptedStatic, 0, encryptedStatic.length);
            ss.mixKey(Noise.dh(s, re));
        } else {
            byte[] encryptedStatic = ss.encryptAndHash(s.publicKeyRef());
            parts.write(encryptedStatic, 0, encryptedStatic.length);
            ss.mixKey(Noise.dh(s, re));
        }
        byte[] body = ss.encryptAndHash(payload);
        parts.write(body, 0, body.length);
        byte[] message = parts.toByteArray();
        if (message.length > Noise.MAX_MESSAGE) throw new NoiseException("That handshake message is too large.");
        advance();
        return message;
    }

    public byte[] readMessage(byte[] message) throws NoiseException {
        if (myTurn() || step >= 3) throw new NoiseException("A handshake message arrived out of turn.");
        if (message.length > Noise.MAX_MESSAGE) throw new NoiseException("A handshake message was too large.");
        int[] at = {0};
        if (step == 0) {
            readE(message, at);
        } else if (step == 1) {
            readE(message, at);
            ss.mixKey(Noise.dh(e, re));
            rs = ss.decryptAndHash(take(message, at, Noise.DHLEN + Noise.TAGLEN));
            ss.mixKey(Noise.dh(e, rs));
        } else {
            rs = ss.decryptAndHash(take(message, at, Noise.DHLEN + Noise.TAGLEN));
            ss.mixKey(Noise.dh(e, rs));
        }
        byte[] payload = ss.decryptAndHash(java.util.Arrays.copyOfRange(message, at[0], message.length));
        advance();
        return payload;
    }

    private static byte[] take(byte[] message, int[] at, int n) throws NoiseException {
        if (message.length - at[0] < n) throw new NoiseException("A handshake message was cut short.");
        byte[] head = java.util.Arrays.copyOfRange(message, at[0], at[0] + n);
        at[0] += n;
        return head;
    }

    private void writeE(ByteArrayOutputStream parts) {
        e = presetEphemeral != null ? presetEphemeral : Noise.generateKeyPair();
        parts.write(e.publicKeyRef(), 0, Noise.DHLEN);
        ss.mixHash(e.publicKeyRef());
    }

    private void readE(byte[] message, int[] at) throws NoiseException {
        re = take(message, at, Noise.DHLEN);
        ss.mixHash(re);
    }

    private void advance() {
        step++;
        if (step == 3) {
            CipherState[] pair = ss.split();
            transport = initiator ? new Transport(pair[0], pair[1]) : new Transport(pair[1], pair[0]);
        }
    }

    private static final class SymmetricState {
        private byte[] ck;
        byte[] h;
        final CipherState cipher = new CipherState();

        SymmetricState(String protocolName) {
            byte[] name = protocolName.getBytes(StandardCharsets.US_ASCII);
            h = name.length <= Noise.HASHLEN ? java.util.Arrays.copyOf(name, Noise.HASHLEN) : Noise.hash(name);
            ck = h.clone();
        }

        void mixKey(byte[] inputKeyMaterial) {
            byte[][] out = Noise.hkdf(ck, inputKeyMaterial, 2);
            ck = out[0];
            cipher.initializeKey(out[1]);
        }

        void mixHash(byte[] data) {
            h = Noise.hash(h, data);
        }

        byte[] encryptAndHash(byte[] plaintext) throws NoiseException {
            byte[] ciphertext = cipher.encryptWithAd(h, plaintext);
            mixHash(ciphertext);
            return ciphertext;
        }

        byte[] decryptAndHash(byte[] ciphertext) throws NoiseException {
            byte[] plaintext = cipher.decryptWithAd(h, ciphertext);
            mixHash(ciphertext);
            return plaintext;
        }

        CipherState[] split() {
            byte[][] keys = Noise.hkdf(ck, new byte[0], 2);
            CipherState c1 = new CipherState();
            CipherState c2 = new CipherState();
            c1.initializeKey(keys[0]);
            c2.initializeKey(keys[1]);
            return new CipherState[] {c1, c2};
        }
    }
}
