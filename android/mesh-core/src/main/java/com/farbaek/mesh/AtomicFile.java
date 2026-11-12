package com.farbaek.mesh;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * A small file replaced whole, never left half-written or missing. The new
 * content goes to a temporary file, synced, then renamed over the old one:
 * on Android and Linux rename(2) replaces it atomically. java.io's rename
 * won't replace a file on Windows (and java.nio.file needs Android 8, past
 * this module's API 24), so there the old file is first renamed aside to
 * `.bak`, the new one renamed into place, and the backup deleted; read()
 * falls back to the backup if a crash came between the two renames.
 */
final class AtomicFile {
    private AtomicFile() {}

    static void write(File file, byte[] content) throws IOException {
        File parent = file.getAbsoluteFile().getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("Couldn't make " + parent + ".");
        File tmp = new File(file.getPath() + ".tmp");
        try {
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(content);
                out.getFD().sync();
            }
            File backup = backup(file);
            // Replaces the old file in one step where the platform can (Android, Linux, macOS).
            if (tmp.renameTo(file)) {
                // A backup left by a save cut off earlier is out of date now.
                if (backup.exists()) backup.delete();
                return;
            }
            if (!file.exists()) throw new IOException("Couldn't save " + file + ".");
            // Windows: keep the old file as the backup until the new one is in place.
            if (backup.exists() && !backup.delete()) throw new IOException("Couldn't replace " + file + ".");
            if (!file.renameTo(backup)) throw new IOException("Couldn't replace " + file + ".");
            if (!tmp.renameTo(file)) {
                // Put the old one back rather than leave nothing.
                backup.renameTo(file);
                throw new IOException("Couldn't save " + file + ".");
            }
            backup.delete();
        } finally {
            if (tmp.exists()) tmp.delete();
        }
    }

    /** The file's bytes; its backup's when a save was cut off between its two renames; null when there's neither. */
    static byte[] read(File file) throws IOException {
        File source = file.isFile() ? file : backup(file);
        if (!source.isFile()) return null;
        try (InputStream in = new FileInputStream(source)) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) bytes.write(buffer, 0, n);
            return bytes.toByteArray();
        }
    }

    static File backup(File file) {
        return new File(file.getPath() + ".bak");
    }
}
