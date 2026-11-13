package com.farbaek.app.mesh;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Copies a checked arrival from Nearby's private storage into Gallery or Downloads (stage 188, ADR 0196), exactly once.
 * Each file is made as a hidden item (IS_PENDING), copied while hashed, flushed to disk, read back and compared, and only
 * then shown. Progress is written to the log in batches, and a private copy is removed only after the batch that
 * published it is written. If Android stops the app midway, the next start deletes our hidden items in that folder and
 * takes over items already shown (same folder, name and size), so nothing is doubled or lost. Peak extra space is one
 * batch of files.
 */
final class MediaSaver {
    /** Our own words for why a copy stopped: shown to the person, so never a system message with paths in it. */
    static final class SaveException extends IOException {
        SaveException(String message) {
            super(message);
        }
    }

    private static final int BATCH = 25;
    private static final long BATCH_MS = 3_000;

    private final ContentResolver resolver;

    @RequiresApi(29)
    MediaSaver(Context context) {
        resolver = context.getContentResolver();
    }

    /** Whether shared storage takes our files without asking for permission: Android 10 and later. */
    static boolean available() {
        return Build.VERSION.SDK_INT >= 29;
    }

    /**
     * Where a Gallery transfer's folder goes. Pictures/Farbaek, except on Android 10 when it holds a video: there,
     * videos may only go in DCIM or Movies, so the whole folder goes to DCIM/Farbaek and stays in one place.
     */
    static String root(ReceivedLog.Entry e) {
        return root(e.place, e.files);
    }

    static String root(SavePlan.Place place, List<ReceivedLog.FileRecord> files) {
        if (place != SavePlan.Place.GALLERY) return place.root;
        if (Build.VERSION.SDK_INT == 29) {
            for (ReceivedLog.FileRecord f : files) if (f.mime.startsWith("video/")) return "DCIM/Farbaek/";
        }
        return place.root;
    }

    /** Saves every file not yet published. Throws a SaveException when one can't be; what was published stays published. */
    @RequiresApi(29)
    void save(ReceivedLog log, ReceivedLog.Entry entry, File privateFolder) throws IOException {
        String root = root(entry);
        Map<String, Uri> finished = tidy(entry, root);
        List<File> batch = new ArrayList<>();
        long flushedAt = System.currentTimeMillis();
        int index = 0;
        for (ReceivedLog.FileRecord f : entry.files) {
            index += 1;
            if (f.published) continue;
            String dir = SavePlan.relativeDir(root, entry.folder, f.path);
            String name = SavePlan.fileName(f.path, index);
            File source = privateFile(privateFolder, f.path);
            Uri done = finished.get(dir + "\n" + name + "\n" + f.bytes);
            if (done != null) {
                // Shown before the app was stopped, but not yet written down: taken over, not copied again.
                f.uri = done.toString();
                f.shown = name;
                f.published = true;
                if (source != null) batch.add(source);
                continue;
            }
            if (source == null || !source.isFile()) throw new SaveException(SavePlan.display(name) + " is no longer on this phone.");

            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, f.mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, dir);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri item;
            try {
                item = resolver.insert(collection(entry.place, f.mime), values);
            } catch (RuntimeException e) {
                item = null;
            }
            if (item == null) throw new SaveException("This phone wouldn't make room for " + SavePlan.display(name) + ".");
            try {
                byte[] written = copy(source, item);
                if (!Arrays.equals(written, hash(item))) throw new SaveException(SavePlan.display(name) + " didn't match after it was copied, so it wasn't saved.");
                ContentValues shown = new ContentValues();
                shown.put(MediaStore.MediaColumns.IS_PENDING, 0);
                if (resolver.update(item, shown, null, null) != 1) throw new SaveException(SavePlan.display(name) + " couldn't be shown in " + entry.place.label + ".");
            } catch (IOException | RuntimeException e) {
                deleteQuietly(item);
                if (e instanceof SaveException) throw (SaveException) e;
                throw new SaveException(SavePlan.display(name) + " couldn't be copied. This phone may be out of space.");
            }
            f.uri = item.toString();
            String given = displayName(item);
            f.shown = given != null ? given : name;
            f.published = true;
            batch.add(source);
            if (batch.size() >= BATCH || System.currentTimeMillis() - flushedAt > BATCH_MS) {
                flush(log, entry, batch);
                flushedAt = System.currentTimeMillis();
            }
        }
        entry.state = ReceivedLog.State.SAVED;
        entry.note = null;
        flush(log, entry, batch);
        removeEmptyFolders(privateFolder);
    }

    /** Writes progress down, then removes the private copies that progress covers. */
    private static void flush(ReceivedLog log, ReceivedLog.Entry entry, List<File> batch) throws IOException {
        log.update(entry);
        for (File f : batch) f.delete();
        batch.clear();
    }

    /**
     * Before carrying on after a stop: our hidden items left in this transfer's folder are deleted, and items already
     * shown are listed (by folder, name and size) so they're taken over instead of copied twice.
     */
    @RequiresApi(29)
    private Map<String, Uri> tidy(ReceivedLog.Entry entry, String root) {
        Map<String, Uri> shown = new HashMap<>();
        boolean any = false;
        for (ReceivedLog.FileRecord f : entry.files) if (!f.published) any = true;
        if (!any) return shown;
        String prefix = root + entry.folder + "/";
        for (Uri collection : collections(entry.place)) {
            String[] columns = {MediaStore.MediaColumns._ID, MediaStore.MediaColumns.RELATIVE_PATH, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE,
                MediaStore.MediaColumns.IS_PENDING};
            try (Cursor c = query(collection, columns, MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ? ESCAPE '\\'", new String[] {like(prefix) + "%"})) {
                while (c != null && c.moveToNext()) {
                    Uri item = Uri.withAppendedPath(collection, String.valueOf(c.getLong(0)));
                    if (c.getInt(4) == 1) deleteQuietly(item);
                    else shown.put(c.getString(1) + "\n" + c.getString(2) + "\n" + c.getLong(3), item);
                }
            } catch (RuntimeException ignored) {
                // Nothing to take over: every file is copied.
            }
        }
        return shown;
    }

    /** Whether a folder name is already used in shared storage, so a new arrival gets its own. */
    @RequiresApi(29)
    boolean folderTaken(SavePlan.Place place, String root, String folder) {
        for (Uri collection : collections(place)) {
            try (Cursor c = query(collection, new String[] {MediaStore.MediaColumns._ID}, MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ? ESCAPE '\\'",
                    new String[] {like(root + folder + "/") + "%"})) {
                if (c != null && c.moveToFirst()) return true;
            } catch (RuntimeException ignored) {
                // Can't tell: the log's own check stands.
            }
        }
        return false;
    }

    /** A query that also sees hidden (pending) items, which only their owner can see. */
    @RequiresApi(29)
    private Cursor query(Uri collection, String[] columns, String selection, String[] args) {
        if (Build.VERSION.SDK_INT >= 30) {
            Bundle q = new Bundle();
            q.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection);
            q.putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args);
            q.putInt(MediaStore.QUERY_ARG_MATCH_PENDING, MediaStore.MATCH_INCLUDE);
            return resolver.query(collection, columns, q, null);
        }
        return resolver.query(MediaStore.setIncludePending(collection), columns, selection, args, null);
    }

    /** A LIKE pattern that matches the text as it is: % and _ in a folder name are taken literally. */
    private static String like(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    @RequiresApi(29)
    private static List<Uri> collections(SavePlan.Place place) {
        String volume = MediaStore.VOLUME_EXTERNAL_PRIMARY;
        List<Uri> out = new ArrayList<>();
        if (place == SavePlan.Place.GALLERY) {
            out.add(MediaStore.Images.Media.getContentUri(volume));
            out.add(MediaStore.Video.Media.getContentUri(volume));
        } else {
            out.add(MediaStore.Downloads.getContentUri(volume));
        }
        return out;
    }

    /** Where a file of this kind lives: photos and videos in their own collections, everything else in Downloads. */
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

    /** Removes the private folder's empty folders once every file has gone; a file that's still there keeps its folder. */
    private static boolean removeEmptyFolders(File dir) {
        File[] kids = dir.listFiles();
        boolean empty = true;
        if (kids != null) {
            for (File k : kids) {
                if (k.isDirectory()) empty &= removeEmptyFolders(k);
                else empty = false;
            }
        }
        return empty && dir.delete();
    }

    /** Copies while hashing, then flushes to the disk before the item can be shown. Returns the SHA-256 of what was written. */
    private byte[] copy(File source, Uri item) throws IOException {
        MessageDigest digest = sha256();
        try (ParcelFileDescriptor pfd = resolver.openFileDescriptor(item, "w")) {
            if (pfd == null) throw new SaveException("This phone wouldn't open a place to save it.");
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
            if (in == null) throw new SaveException("The saved copy couldn't be read back.");
            byte[] buf = new byte[128 * 1024];
            int r;
            while ((r = in.read(buf)) > 0) digest.update(buf, 0, r);
        }
        return digest.digest();
    }

    private void deleteQuietly(Uri item) {
        try {
            resolver.delete(item, null, null);
        } catch (RuntimeException ignored) {
            // Android removes a hidden item it no longer needs on its own, after about a week.
        }
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
            throw new SaveException("This phone can't check the copy.");
        }
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
