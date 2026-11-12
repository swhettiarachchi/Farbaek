package com.farbaek.mesh;

/** A raw X25519 key pair: 32-byte private and public keys. */
public final class KeyPair {
    private final byte[] privateKey;
    private final byte[] publicKey;

    KeyPair(byte[] privateKey, byte[] publicKey) {
        this.privateKey = privateKey.clone();
        this.publicKey = publicKey.clone();
    }

    /** A copy of the raw private key. Hand it only to a KeyVault. */
    public byte[] privateKey() {
        return privateKey.clone();
    }

    public byte[] publicKey() {
        return publicKey.clone();
    }

    byte[] privateKeyRef() {
        return privateKey;
    }

    byte[] publicKeyRef() {
        return publicKey;
    }
}
