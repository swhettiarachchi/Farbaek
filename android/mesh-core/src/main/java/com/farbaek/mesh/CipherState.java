package com.farbaek.mesh;

import org.bouncycastle.crypto.InvalidCipherTextException;
import org.bouncycastle.crypto.engines.AESEngine;
import org.bouncycastle.crypto.modes.GCMBlockCipher;
import org.bouncycastle.crypto.modes.GCMModeCipher;
import org.bouncycastle.crypto.params.AEADParameters;
import org.bouncycastle.crypto.params.KeyParameter;

/**
 * One direction's key and counter, AES-256-GCM through BouncyCastle.
 * Messages must be decrypted in the order they were sent; a failed
 * decryption leaves the counter where it was, as the specification requires.
 */
public final class CipherState {
    /** 2^64 - 1 as an unsigned long: Noise reserves it, so it's never used. */
    private static final long MAX_NONCE = -1L;
    private byte[] key;
    private long n;

    synchronized void initializeKey(byte[] key) {
        this.key = key == null ? null : key.clone();
        this.n = 0;
    }

    public synchronized boolean hasKey() {
        return key != null;
    }

    /** AES-GCM's nonce in Noise: four zero bytes, then the counter as a big-endian 64-bit number. */
    private static byte[] nonce(long n) {
        byte[] out = new byte[12];
        for (int i = 0; i < 8; i++) out[4 + i] = (byte) (n >>> (56 - 8 * i));
        return out;
    }

    private GCMModeCipher cipher(boolean encrypt, byte[] ad) {
        GCMModeCipher gcm = GCMBlockCipher.newInstance(AESEngine.newInstance());
        gcm.init(encrypt, new AEADParameters(new KeyParameter(key), Noise.TAGLEN * 8, nonce(n), ad));
        return gcm;
    }

    public synchronized byte[] encryptWithAd(byte[] ad, byte[] plaintext, int offset, int length) throws NoiseException {
        if (key == null) return java.util.Arrays.copyOfRange(plaintext, offset, offset + length);
        if (n == MAX_NONCE) throw new NoiseException("This session has sent all the messages it can. Start a new one.");
        GCMModeCipher gcm = cipher(true, ad);
        byte[] out = new byte[gcm.getOutputSize(length)];
        int written = gcm.processBytes(plaintext, offset, length, out, 0);
        try {
            written += gcm.doFinal(out, written);
        } catch (InvalidCipherTextException e) {
            throw new NoiseException("A message couldn't be encrypted.");
        }
        n++;
        return written == out.length ? out : java.util.Arrays.copyOf(out, written);
    }

    public byte[] encryptWithAd(byte[] ad, byte[] plaintext) throws NoiseException {
        return encryptWithAd(ad, plaintext, 0, plaintext.length);
    }

    public synchronized byte[] decryptWithAd(byte[] ad, byte[] ciphertext) throws NoiseException {
        if (key == null) return ciphertext.clone();
        if (n == MAX_NONCE) throw new NoiseException("This session has received all the messages it can. Start a new one.");
        if (ciphertext.length < Noise.TAGLEN) throw new NoiseException("A message was too short to be genuine.");
        GCMModeCipher gcm = cipher(false, ad);
        byte[] out = new byte[gcm.getOutputSize(ciphertext.length)];
        int written;
        try {
            written = gcm.processBytes(ciphertext, 0, ciphertext.length, out, 0);
            written += gcm.doFinal(out, written);
        } catch (InvalidCipherTextException | RuntimeException e) {
            // The counter stays put, as the specification requires.
            throw new NoiseException("A message failed its integrity check: it was changed, replayed or arrived out of order.");
        }
        n++;
        return written == out.length ? out : java.util.Arrays.copyOf(out, written);
    }

    /** Transport messages carry no associated data. */
    public byte[] encrypt(byte[] plaintext) throws NoiseException {
        return encryptWithAd(new byte[0], plaintext);
    }

    public byte[] encrypt(byte[] plaintext, int offset, int length) throws NoiseException {
        return encryptWithAd(new byte[0], plaintext, offset, length);
    }

    public byte[] decrypt(byte[] ciphertext) throws NoiseException {
        return decryptWithAd(new byte[0], ciphertext);
    }
}
