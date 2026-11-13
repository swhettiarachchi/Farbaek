package com.farbaek.app.mesh;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;

import androidx.annotation.RequiresApi;

import com.farbaek.mesh.ReceivedLog;
import com.farbaek.mesh.SavePlan;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;

/**
 * Copies a checked arrival from Nearby's private storage into Gallery or Downloads (stage 188, ADR 0196), exactly once:
 * for each file, its MediaStore item is made hidden (IS_PENDING) and recorded in the log before a byte is copied; the
 * copy is hashed as it's written, flushed to disk, read back and compared; only then is it shown, recorded as
 * published, and the private copy removed. If Android stops the app midway, the next start finds the recorded item,
 * removes the half-made one and copies it again, so nothing is doubled or lost. Peak extra space is one file.
 */
final class MediaSaver {
    private final ContentResolver resolver;

    @RequiresApi(29)
    MediaSaver(Context context) {
        resolver = context.getContentResolver();
    }

    /** Saves every file not yet published. Throws when one can't be saved; what was published stays published. */
    @RequiresApi(29)
    void save(ReceivedLog log, ReceivedLog.Entry entry, File privateFolder) throws IOException {
        int index = 0;
        for (ReceivedLog.FileRecord f : entry.files) {
            index += 1;
            if (f.published) continue;
            File source = privateFile(privateFolder, f.path);
            // A half-made item from a copy that was cut short: removed, then made again.
            if (f.uri != null) {
                try {
                    resolver.delete(Uri.parse(f.uri), null, null);
                } catch (RuntimeException ignored) {
                    // Already gone.
                }
                f.uri = null;
                log.update(entry);
            }
            if (source == null || !source.isFile()) throw new IOException(f.path + " is no longer on this phone.");

            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, SavePlan.fileName(f.path, index));
            values.put(MediaStore.MediaColumns.MIME_TYPE, f.mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, SavePlan.relativeDir(entry.place, entry.folder, f.path));
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri item = resolver.insert(collection(entry.place, f.mime), values);
            if (item == null) throw new IOException("This phone wouldn't make room for " + SavePlan.fileName(f.path, index) + ".");
            f.uri = item.toString();
            log.update(entry);

            byte[] written = copy(source, item);
            if (!Arrays.equals(written, hash(item))) {
                throw new IOException(SavePlan.fileName(f.path, index) + " didn't match after it was copied, so it wasn't saved.");
            }
            ContentValues shown = new ContentValues();
            shown.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(item, shown, null, null);
            f.shown = displayName(item);
            f.published = true;
            log.update(entry);
            // The private copy goes only once the shared one is checked and visible.
            source.delete();
        }
        entry.state = ReceivedLog.State.SAVED;
        entry.note = null;
        log.update(entry);
        MeshHub.delete(privateFolder);
    }

    /** Where a file of this kind lives: photos and videos in their own collections in Pictures, everything else in Downloads. */
    @RequiresApi(29)
    private static Uri collection(SavePlan.Place place, String mime) {
        String volume = MediaStore.VOLUME_EXTERNAL_PRIMARY;
        if (place == SavePlan.Place.GALLERY && mime.startsWith("video/")) return MediaStore.Video.Media.getContentUri(volume);
        if (place == SavePlan.Place.GALLERY) return MediaStore.Images.Media.getContentUri(volume);
        return MediaStore.Downloads.getContentUri(volume);
    }

    /** A file inside the private folder, or null if the path would lead out of it. */
    static File privateFile(File folder, String relative) throws IOException {
        File f = new File(folder, relative).getCanonicalFile();
        String root = folder.getCanonicalPath() + File.separator;
        return f.getPath().startsWith(root) ? f : null;
    }

    /** Copies while hashing, then flushes to the disk before the item can be shown. Returns the SHA-256 of what was written. */
    private byte[] copy(File source, Uri item) throws IOException {
        MessageDigest digest = sha256();
        try (ParcelFileDescriptor pfd = resolver.openFileDescriptor(item, "w")) {
            if (pfd == null) throw new IOException("This phone wouldn't open a place to save it.");
            try (InputStream in = new FileInputStream(source); FileOutputStream out = new FileOutputStream(pfd.getFileDescriptor())) {
                byte[] buf = new byte[128 * 1024];
                int r;
                while ((r = in.read(buf)) > 0) {
                    digest.update(buf, 0, r);
                    out.write(buf, 0, r);
                }
                out.flush();
                pfd.getFileDescriptor().sync();
            }
        }
        return digest.digest();
    }

    /** The SHA-256 of what's actually in the item now. */
    private byte[] hash(Uri item) throws IOException {
        MessageDigest digest = sha256();
        try (InputStream in = resolver.openInputStream(item)) {
            if (in == null) throw new IOException("The saved copy couldn't be read back.");
            byte[] buf = new byte[128 * 1024];
            int r;
            while ((r = in.read(buf)) > 0) digest.update(buf, 0, r);
        }
        return digest.digest();
    }

    private String displayName(Uri item) {
        try (Cursor c = resolver.query(item, new String[] {MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (RuntimeException ignored) {
            // The name it was given stands.
        }
        return null;
    }

    private static MessageDigest sha256() throws IOException {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IOException("This phone can't check the copy.");
        }
    }

    /** Whether shared storage takes our files without asking for permission: Android 10 and later. */
    static boolean available() {
        return Build.VERSION.SDK_INT >= 29;
    }

    /** Whether an item we published is still there (the person may have deleted it in Gallery or Files). */
    static boolean exists(ContentResolver resolver, String uri) {
        if (uri == null) return false;
        try (Cursor c = resolver.query(Uri.parse(uri), new String[] {MediaStore.MediaColumns._ID}, null, null, null)) {
            return c != null && c.moveToFirst();
        } catch (RuntimeException e) {
            return false;
        }
    }

}
