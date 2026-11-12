package com.farbaek.mesh;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Mesh's only way to touch the disk: one folder, fixed by its canonical path
 * when it opens. A port of ProjectFolder (src/agent-runtime/fs-guard.ts)
 * with java.io, as Android has had it since API 1:
 *
 * - every path is checked lexically first (AgentPaths.checkAgentPath), so
 *   "..", absolute paths, drive letters, device names, control characters
 *   and backslashes never reach the disk;
 * - it's then walked one name at a time, refusing links wherever they
 *   appear (a name whose canonical path isn't its parent's canonical path
 *   plus that name), and the result must still be inside the root;
 * - new files are created exclusively (File.createNewFile, O_CREAT|O_EXCL,
 *   which never follows or replaces anything already there), and moves only
 *   go to names that don't exist yet.
 *
 * java.io can't read a file's hard-link count or its inode, so the checks
 * ProjectFolder makes with them come from a {@link FileProbe} that the app
 * supplies (on Android, with android.system.Os.lstat). Without one, the
 * canonical-path walk is the link check: that works where canonical paths
 * resolve links (Linux, so Android), but not on Windows, whose java.io
 * canonical path leaves junctions and symbolic links unresolved. Pass a
 * probe wherever a link could be planted.
 */
public final class GuardedFolder {
    /** What java.io can't see: an app can answer from lstat. */
    public interface FileProbe {
        /** True when the file is a symbolic link (or a junction). */
        boolean isLink(File file) throws IOException;

        /** The number of hard links; 1 when it can't be known. */
        long linkCount(File file) throws IOException;
    }

    /** The java.io-only probe: a link is a name that doesn't resolve to itself. */
    public static final FileProbe CANONICAL_PROBE = new FileProbe() {
        @Override
        public boolean isLink(File file) throws IOException {
            File parent = file.getParentFile();
            if (parent == null) return false;
            return !file.getCanonicalFile().equals(new File(parent.getCanonicalFile(), file.getName()));
        }

        @Override
        public long linkCount(File file) {
            return 1;
        }
    };

    public static final class GuardException extends IOException {
        /** INVALID_PATH, OUTSIDE_ROOT, LINK, NOT_FOUND, NOT_A_FILE, NOT_A_FOLDER or CHANGED. */
        public final String code;

        GuardException(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    private final File root;
    private final String rootPrefix;
    private final FileProbe probe;

    private GuardedFolder(File root, FileProbe probe) {
        this.root = root;
        this.rootPrefix = root.getPath().endsWith(File.separator) ? root.getPath() : root.getPath() + File.separator;
        this.probe = probe;
    }

    public static GuardedFolder open(File root) throws IOException {
        return open(root, CANONICAL_PROBE);
    }

    public static GuardedFolder open(File root, FileProbe probe) throws IOException {
        File real = root.getCanonicalFile();
        if (!real.isDirectory()) throw new GuardException("NOT_A_FOLDER", "The folder isn't a folder.");
        return new GuardedFolder(real, probe == null ? CANONICAL_PROBE : probe);
    }

    public File root() {
        return root;
    }

    /** Whether `candidate` (canonical) is the root or inside it. */
    boolean isInside(File candidate) {
        String p = candidate.getPath();
        return p.equals(root.getPath()) || p.startsWith(rootPrefix);
    }

    private static final class Resolved {
        final File file;
        final String rel;
        final boolean exists;

        Resolved(File file, String rel, boolean exists) {
            this.file = file;
            this.rel = rel;
            this.exists = exists;
        }
    }

    /** Walks `rel` one name at a time. Links anywhere on the way are refused; a missing name ends the walk. */
    private Resolved resolve(String rel, boolean mustExist) throws IOException {
        AgentPaths.PathCheck checked = AgentPaths.checkAgentPath(rel);
        if (!checked.ok) throw new GuardException("INVALID_PATH", rel + ": " + checked.reason);
        String[] parts = checked.path.split("/", -1);
        File current = root;
        for (int i = 0; i < parts.length; i++) {
            File next = new File(current, parts[i]);
            boolean link = probe.isLink(next);
            if (!link && !next.exists()) {
                if (mustExist) throw new GuardException("NOT_FOUND", checked.path + " doesn't exist.");
                File target = root;
                for (String part : parts) target = new File(target, part);
                return new Resolved(target, checked.path, false);
            }
            if (link) throw new GuardException("LINK", join(parts, i + 1) + " is a link, and Mesh doesn't follow links.");
            if (i < parts.length - 1 && !next.isDirectory()) throw new GuardException("NOT_A_FOLDER", join(parts, i + 1) + " isn't a folder.");
            current = next;
        }
        if (!isInside(current.getCanonicalFile())) throw new GuardException("OUTSIDE_ROOT", checked.path + " resolves outside the folder.");
        return new Resolved(current, checked.path, true);
    }

    private static String join(String[] parts, int count) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < count; i++) {
            if (i > 0) out.append('/');
            out.append(parts[i]);
        }
        return out.toString();
    }

    /** The file at `rel` once checked; it may not exist yet. */
    public File locate(String rel) throws IOException {
        return resolve(rel, false).file;
    }

    public boolean exists(String rel) {
        try {
            Resolved r = resolve(rel, false);
            return r.exists && r.file.isFile();
        } catch (IOException e) {
            return false;
        }
    }

    /** A file of any kind, opened for reading, with its size. The caller closes it. */
    public RandomAccessFile openRead(String rel) throws IOException {
        Resolved r = resolve(rel, true);
        if (!r.file.isFile()) throw new GuardException("NOT_A_FILE", r.rel + " isn't a file.");
        if (probe.linkCount(r.file) > 1) throw new GuardException("LINK", r.rel + " has more than one hard link, so it could be a file outside the folder.");
        RandomAccessFile handle = new RandomAccessFile(r.file, "r");
        // Narrows the window ProjectFolder closes with the handle's inode: the name still resolves to itself, inside.
        if (probe.isLink(r.file) || !isInside(r.file.getCanonicalFile())) {
            handle.close();
            throw new GuardException("CHANGED", r.rel + " changed while it was being opened.");
        }
        return handle;
    }

    /** Opens an existing file this folder holds for reading and writing in place. */
    public RandomAccessFile openUpdate(String rel) throws IOException {
        Resolved r = resolve(rel, true);
        if (!r.file.isFile()) throw new GuardException("NOT_A_FILE", r.rel + " isn't a file.");
        if (probe.linkCount(r.file) > 1) throw new GuardException("LINK", r.rel + " has more than one hard link, so it could be a file outside the folder.");
        return new RandomAccessFile(r.file, "rw");
    }

    /** Creates the missing folders of `rel`'s parent one at a time, refusing links. Returns the parent. */
    private File ensureParent(String rel) throws IOException {
        String[] parts = rel.split("/", -1);
        File current = root;
        for (int i = 0; i < parts.length - 1; i++) {
            current = new File(current, parts[i]);
            if (probe.isLink(current)) throw new GuardException("LINK", join(parts, i + 1) + " is a link, and Mesh doesn't follow links.");
            if (!current.exists() && !current.mkdir() && !current.isDirectory()) throw new IOException("Couldn't make the folder " + join(parts, i + 1) + ".");
            if (probe.isLink(current)) throw new GuardException("LINK", join(parts, i + 1) + " is a link, and Mesh doesn't follow links.");
            if (!current.isDirectory()) throw new GuardException("NOT_A_FOLDER", join(parts, i + 1) + " isn't a folder.");
        }
        if (!isInside(current.getCanonicalFile())) throw new GuardException("OUTSIDE_ROOT", rel + " resolves outside the folder.");
        return current;
    }

    /** Creates a file that doesn't exist yet, for streaming writes. Never replaces or follows anything. The caller closes it. */
    public RandomAccessFile createNew(String rel) throws IOException {
        Resolved r = resolve(rel, false);
        if (r.exists) throw new GuardException("CHANGED", r.rel + " already exists.");
        ensureParent(r.rel);
        if (!r.file.createNewFile()) throw new GuardException("CHANGED", r.rel + " already exists.");
        return new RandomAccessFile(r.file, "rw");
    }

    /** Moves a file to a path that doesn't exist yet, inside the folder. */
    public void moveNew(String fromRel, String toRel) throws IOException {
        Resolved from = resolve(fromRel, true);
        if (!from.file.isFile()) throw new GuardException("NOT_A_FILE", from.rel + " isn't a file.");
        Resolved to = resolve(toRel, false);
        if (to.exists) throw new GuardException("CHANGED", to.rel + " already exists.");
        ensureParent(to.rel);
        if (to.file.exists() || probe.isLink(to.file)) throw new GuardException("CHANGED", to.rel + " already exists.");
        renameRetrying(from.file, to.file);
    }

    /** Writes a small text file through a new temporary file renamed over it. */
    public void write(String rel, String content) throws IOException {
        Resolved r = resolve(rel, false);
        if (r.exists && !r.file.isFile()) throw new GuardException("NOT_A_FILE", r.rel + " isn't a file.");
        File parent = ensureParent(r.rel);
        File tmp = new File(parent, ".farbaek-" + UUID.randomUUID() + ".tmp");
        if (!tmp.createNewFile()) throw new GuardException("CHANGED", "A temporary file already exists.");
        try {
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(content.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            if (r.file.exists() && !r.file.delete()) throw new IOException("Couldn't replace " + r.rel + ".");
            renameRetrying(tmp, r.file);
        } finally {
            if (tmp.exists()) tmp.delete();
        }
    }

    /** Deletes one file. Used to undo a file Mesh created; deleting a link never follows it. */
    public void remove(String rel) throws IOException {
        Resolved r = resolve(rel, true);
        if (!r.file.isFile()) throw new GuardException("NOT_A_FILE", r.rel + " isn't a file.");
        if (!r.file.delete()) throw new IOException("Couldn't remove " + r.rel + ".");
    }

    /**
     * Renames a file. On Windows, antivirus and search indexers briefly lock a
     * file that was just written, so the rename is tried again a few times.
     */
    private static void renameRetrying(File from, File to) throws IOException {
        for (int attempt = 0; ; attempt++) {
            if (from.renameTo(to)) return;
            if (attempt >= 5) throw new IOException("Couldn't move " + from.getName() + " into place.");
            try {
                Thread.sleep(25L << attempt);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("Interrupted while moving a file into place.");
            }
        }
    }

    /** Removes a folder Mesh made and everything in it, without following links out of it. */
    static void removeTree(File folder, FileProbe probe) {
        if (folder == null) return;
        try {
            if (probe.isLink(folder)) {
                folder.delete();
                return;
            }
        } catch (IOException e) {
            return;
        }
        File[] children = folder.listFiles();
        if (children != null) {
            for (File child : children) {
                boolean link;
                try {
                    link = probe.isLink(child);
                } catch (IOException e) {
                    link = true;
                }
                if (!link && child.isDirectory()) removeTree(child, probe);
                else child.delete();
            }
        }
        folder.delete();
    }
}
