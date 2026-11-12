package com.farbaek.mesh;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import org.bouncycastle.crypto.digests.SHA256Digest;
import org.bouncycastle.crypto.macs.HMac;
import org.bouncycastle.crypto.params.KeyParameter;
import org.bouncycastle.math.ec.rfc7748.X25519;
import org.bouncycastle.util.Arrays;
import org.bouncycastle.util.encoders.Hex;

/**
 * The Noise Protocol Framework (revision 34) building blocks for
 * Noise_XX_25519_AESGCM_SHA256, as src/agent-runtime/mesh/noise.ts uses
 * them: X25519, SHA-256 and HMAC-SHA256 from BouncyCastle, and Noise's HKDF
 * built from HMAC exactly as the specification writes it.
 */
public final class Noise {
    public static final String PROTOCOL_NAME = "Noise_XX_25519_AESGCM_SHA256";
    /** The largest Noise message, handshake or transport. */
    public static final int MAX_MESSAGE = 65_535;
    static final int DHLEN = 32;
    static final int HASHLEN = 32;
    static final int TAGLEN = 16;

    private static final SecureRandom RANDOM = new SecureRandom();

    private Noise() {}

    /** The key pair for a raw 32-byte private key (clamped inside X25519, as Node's is). */
    public static KeyPair keyPairFromPrivate(byte[] raw) throws NoiseException {
        if (raw == null || raw.length != DHLEN) throw new NoiseException("An X25519 private key is 32 bytes.");
        byte[] pub = new byte[DHLEN];
        X25519.generatePublicKey(raw, 0, pub, 0);
        return new KeyPair(raw, pub);
    }

    public static KeyPair generateKeyPair() {
        byte[] raw = new byte[DHLEN];
        RANDOM.nextBytes(raw);
        try {
            return keyPairFromPrivate(raw);
        } catch (NoiseException e) {
            throw new IllegalStateException(e);
        } finally {
            java.util.Arrays.fill(raw, (byte) 0);
        }
    }

    static byte[] dh(KeyPair own, byte[] remotePublic) throws NoiseException {
        if (remotePublic == null || remotePublic.length != DHLEN) throw new NoiseException("The other side sent an unusable key.");
        byte[] out = new byte[DHLEN];
        // false for an all-zero result (a low-order point), which OpenSSL and so Node refuse too.
        if (!X25519.calculateAgreement(own.privateKeyRef(), 0, remotePublic, 0, out, 0)) throw new NoiseException("The other side sent an unusable key.");
        return out;
    }

    static byte[] hash(byte[]... parts) {
        SHA256Digest d = new SHA256Digest();
        for (byte[] p : parts) d.update(p, 0, p.length);
        byte[] out = new byte[HASHLEN];
        d.doFinal(out, 0);
        return out;
    }

    static byte[] hmac(byte[] key, byte[]... parts) {
        HMac mac = new HMac(new SHA256Digest());
        mac.init(new KeyParameter(key));
        for (byte[] p : parts) mac.update(p, 0, p.length);
        byte[] out = new byte[HASHLEN];
        mac.doFinal(out, 0);
        return out;
    }

    /** HKDF as Noise defines it: HMAC-SHA256 with an empty info string, two or three outputs. */
    static byte[][] hkdf(byte[] chainingKey, byte[] inputKeyMaterial, int outputs) {
        byte[] tempKey = hmac(chainingKey, inputKeyMaterial);
        byte[] one = hmac(tempKey, new byte[] {1});
        byte[] two = hmac(tempKey, one, new byte[] {2});
        if (outputs == 2) return new byte[][] {one, two};
        return new byte[][] {one, two, hmac(tempKey, two, new byte[] {3})};
    }

    /** Pairing v2's labels, as ASCII bytes before the values they bind. */
    private static final byte[] COMMIT_LABEL = "farbaek-pair-commit/2".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] CODE_LABEL = "farbaek-pair-code/2".getBytes(StandardCharsets.US_ASCII);
    /** The size of each pairing nonce. */
    public static final int PAIRING_NONCE_BYTES = 32;

    /** A fresh pairing nonce: 32 random bytes. */
    static byte[] pairingNonce() {
        byte[] out = new byte[PAIRING_NONCE_BYTES];
        RANDOM.nextBytes(out);
        return out;
    }

    /** The caller's commitment to its nonce: SHA-256("farbaek-pair-commit/2" || nC). */
    public static byte[] pairingCommit(byte[] callerNonce) {
        if (callerNonce == null || callerNonce.length != PAIRING_NONCE_BYTES) throw new IllegalArgumentException("A pairing nonce is 32 bytes.");
        return hash(COMMIT_LABEL, callerNonce);
    }

    /**
     * The six-digit code both people compare when pairing (v2): HMAC-SHA256
     * keyed with the handshake hash over "farbaek-pair-code/2" || nC || nA,
     * its first four bytes as an unsigned big-endian 32-bit number
     * (Buffer.readUInt32BE), modulo 1,000,000, zero-padded. The caller commits
     * to nC before it sees nA, and the answerer sends nA before it sees nC, so
     * neither side, and no device in the middle, can choose the code.
     */
    public static String pairingCode(byte[] handshakeHash, byte[] callerNonce, byte[] answererNonce) {
        if (handshakeHash == null || handshakeHash.length != HASHLEN) throw new IllegalArgumentException("A handshake hash is 32 bytes.");
        if (callerNonce == null || callerNonce.length != PAIRING_NONCE_BYTES || answererNonce == null || answererNonce.length != PAIRING_NONCE_BYTES) {
            throw new IllegalArgumentException("A pairing nonce is 32 bytes.");
        }
        byte[] mac = hmac(handshakeHash, CODE_LABEL, callerNonce, answererNonce);
        long n = ((mac[0] & 0xffL) << 24) | ((mac[1] & 0xffL) << 16) | ((mac[2] & 0xffL) << 8) | (mac[3] & 0xffL);
        String code = Long.toString(n % 1_000_000L);
        StringBuilder padded = new StringBuilder();
        for (int i = code.length(); i < 6; i++) padded.append('0');
        return padded.append(code).toString();
    }

    /** A short, stable name for a device's public key: the first 8 bytes of its SHA-256, in hex. */
    public static String fingerprint(byte[] publicKey) {
        return Hex.toHexString(hash(publicKey), 0, 8);
    }

    /** Compares two public keys without leaking where they differ. */
    public static boolean sameKey(byte[] a, byte[] b) {
        return a != null && b != null && a.length == b.length && Arrays.constantTimeAreEqual(a, b);
    }
}
