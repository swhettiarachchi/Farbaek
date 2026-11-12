package com.farbaek.app.mesh;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import com.farbaek.mesh.KeyVault;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The phone's Mesh key (ADR 0193), never stored in the clear: its 32 bytes are
 * sealed with AES-GCM by a key that lives in the Android Keystore and can't be
 * read out of it. The sealed copy is in the app's private files; backups are off
 * (android:allowBackup="false"), so it never leaves the phone.
 */
final class KeystoreVault implements KeyVault {
    private static final String ALIAS = "farbaek-mesh-key-seal";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final int MAX_SEALED = 256;

    private final File file;

    KeystoreVault(File file) {
        this.file = file;
    }

    /**
     * False only when the sealed key can never be opened again: the sealing key is gone (the files were moved to
     * a new phone) or invalidated, or the seal doesn't check out. A passing Keystore error counts as openable, so
     * a busy Keystore never costs the person their pairings.
     */
    synchronized boolean canOpen() {
        if (!file.isFile()) return true;
        try {
            byte[] key = load();
            if (key != null) Arrays.fill(key, (byte) 0);
            return true;
        } catch (IOException e) {
            Throwable cause = e.getCause();
            return !(cause instanceof javax.crypto.AEADBadTagException
                    || cause instanceof android.security.keystore.KeyPermanentlyInvalidatedException
                    || cause instanceof java.security.UnrecoverableKeyException
                    || (cause instanceof GeneralSecurityException && NO_KEY.equals(cause.getMessage()))
                    || cause == null);
        }
    }

    private static final String NO_KEY = "No sealing key";

    @Override
    public synchronized byte[] load() throws IOException {
        if (!file.isFile()) return null;
        byte[] sealed = readAll(file);
        if (sealed.length <= IV_BYTES) throw new IOException("This phone's Mesh key is damaged. Forget it in Nearby and pair again.");
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, sealingKey(false), new GCMParameterSpec(TAG_BITS, sealed, 0, IV_BYTES));
            return cipher.doFinal(sealed, IV_BYTES, sealed.length - IV_BYTES);
        } catch (GeneralSecurityException e) {
            throw new IOException("This phone's Mesh key can't be opened. Forget it in Nearby and pair again.", e);
        }
    }

    @Override
    public synchronized void store(byte[] privateKey) throws IOException {
        byte[] sealed;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            // The Keystore chooses the IV for each seal, so none is ever reused.
            cipher.init(Cipher.ENCRYPT_MODE, sealingKey(true));
            byte[] iv = cipher.getIV();
            byte[] body = cipher.doFinal(privateKey);
            if (iv.length != IV_BYTES) throw new IOException("The Keystore gave an unexpected IV.");
            sealed = new byte[iv.length + body.length];
            System.arraycopy(iv, 0, sealed, 0, iv.length);
            System.arraycopy(body, 0, sealed, iv.length, body.length);
        } catch (GeneralSecurityException e) {
            throw new IOException("This phone couldn't seal its Mesh key.", e);
        }
        File dir = file.getParentFile();
        if (dir != null && !dir.isDirectory() && !dir.mkdirs()) throw new IOException("This phone couldn't save its Mesh key.");
        // Written beside it, then moved over: a crash leaves the old key or the new one, never half of one.
        File next = new File(dir, file.getName() + ".next");
        try (FileOutputStream out = new FileOutputStream(next)) {
            out.write(sealed);
            out.getFD().sync();
        }
        if (!next.renameTo(file)) {
            next.delete();
            throw new IOException("This phone couldn't save its Mesh key.");
        }
        Arrays.fill(sealed, (byte) 0);
    }

    private static SecretKey sealingKey(boolean create) throws GeneralSecurityException, IOException {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        KeyStore.Entry entry = store.getEntry(ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        if (!create) throw new GeneralSecurityException(NO_KEY);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private static byte[] readAll(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[256];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > MAX_SEALED) throw new IOException("This phone's Mesh key is damaged. Forget it in Nearby and pair again.");
            }
            return out.toByteArray();
        }
    }
}
