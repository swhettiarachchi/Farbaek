package com.farbaek.mesh;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The folders this device made for transfers it hasn't finished receiving,
 * in a small list in its data folder (mesh-receiving.json). A transfer adds
 * its folder when the person accepts and takes it off once the folder's
 * hidden .farbaek-incoming is gone: delivered, failed, cancelled or
 * discarded. Transfers live in memory only, so after the app stops mid-way
 * the next start finds what's left here, and only here: nothing else on the
 * device is looked through.
 */
final class ReceivingFolders {
    /** More than this many unfinished transfers isn't expected; past it, the oldest entries are dropped. */
    static final int MAX = 200;

    private final File file;
    private final Set<String> folders = new LinkedHashSet<>();

    ReceivingFolders(File file) {
        this.file = file;
    }

    synchronized void load() {
        folders.clear();
        try {
            byte[] bytes = AtomicFile.read(file);
            Object json = bytes == null ? null : Json.parse(new String(bytes, StandardCharsets.UTF_8));
            List<Object> list = Json.asArray(json);
            if (list == null) return;
            for (Object item : list) {
                String path = Json.asString(item);
                if (path != null && new File(path).isAbsolute()) folders.add(path);
            }
        } catch (IOException | IllegalArgumentException e) {
            // Nothing to clean up that can be read.
        }
    }

    synchronized List<File> list() {
        List<File> out = new ArrayList<>();
        for (String path : folders) out.add(new File(path));
        return out;
    }

    /** A transfer made this folder and is receiving into it. */
    synchronized void add(File folder) {
        String path = folder.getAbsolutePath();
        if (!folders.add(path)) return;
        while (folders.size() > MAX) {
            Iterator<String> it = folders.iterator();
            it.next();
            it.remove();
        }
        save();
    }

    /** The folder's transfer has finished with it, one way or another. */
    synchronized void remove(File folder) {
        if (folders.remove(folder.getAbsolutePath())) save();
    }

    /**
     * Removes the .farbaek-incoming folder from each listed folder no live
     * transfer owns, and the listed folder too when that leaves it empty
     * (Mesh made it, and files only move into it at the very end). Links are
     * never followed. Returns how many leftovers were removed.
     */
    synchronized int cleanUp(Set<String> live, GuardedFolder.FileProbe probe) {
        int removed = 0;
        for (Iterator<String> it = folders.iterator(); it.hasNext(); ) {
            String path = it.next();
            if (live.contains(path)) continue;
            it.remove();
            File folder = new File(path);
            try {
                if (probe.isLink(folder) || !folder.isDirectory()) continue;
                File incoming = new File(folder, IncomingTransfer.INCOMING);
                if (probe.isLink(incoming) || incoming.exists()) {
                    GuardedFolder.removeTree(incoming, probe);
                    removed += 1;
                }
                String[] left = folder.list();
                if (left != null && left.length == 0) folder.delete();
            } catch (IOException e) {
                // Left as it is: it can't be checked safely.
            }
        }
        save();
        return removed;
    }

    private void save() {
        List<Object> list = new ArrayList<Object>(folders);
        try {
            AtomicFile.write(file, Json.stringify(list).getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            // Only cleanup after a crash depends on it; receiving carries on.
        }
    }
}
