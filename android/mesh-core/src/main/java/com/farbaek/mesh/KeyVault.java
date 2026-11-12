package com.farbaek.mesh;

import java.io.IOException;

/**
 * Where the device key's private half lives. The Android app implements
 * this with a key from the Android Keystore wrapping the 32 raw bytes, so
 * they're never stored in the clear; tests use {@link Memory}.
 */
public interface KeyVault {
    /** The stored private key, or null when there's none yet. */
    byte[] load() throws IOException;

    /** Stores a new private key. */
    void store(byte[] privateKey) throws IOException;

    /** Keeps the key in memory only: for tests and throwaway devices. */
    final class Memory implements KeyVault {
        private byte[] value;

        public Memory() {}

        public Memory(byte[] privateKey) {
            this.value = privateKey == null ? null : privateKey.clone();
        }

        @Override
        public synchronized byte[] load() {
            return value == null ? null : value.clone();
        }

        @Override
        public synchronized void store(byte[] privateKey) {
            value = privateKey.clone();
        }
    }
}
