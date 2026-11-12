package com.farbaek.mesh;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

/**
 * Packs a folder for a nearby transfer, as src/agent-runtime/mesh/pack.ts
 * does: every file it may send, hashed with BLAKE3 per 4 MiB chunk and per
 * file while streaming (no file is held in memory), and everything left out
 * with its reason: credentials files, .env files and keys, dependency and
 * build folders, links, and text that looks like a secret. Binary files may
 * travel. Detection is pattern-based and not guaranteed.
 */
public final class Packer {
    private Packer() {}

    /** Text files up to this size are scanned for secrets. */
    private static final int SCAN_TEXT_BYTES = 1024 * 1024;

    public static final class PackException extends IOException {
        PackException(String message) {
            super(message);
        }
    }

    public interface Progress {
        void filesDone(int count);
    }

    /** A folder packed and ready to offer. */
    public static final class PackedFolder {
        public final File root;
        public final String name;
        public final Capsule.Manifest manifest;
        public final String digest;

        public PackedFolder(File root, String name, Capsule.Manifest manifest, String digest) {
            this.root = root;
            this.name = name;
            this.manifest = manifest;
            this.digest = digest;
        }
    }

    /** new Date().toISOString(). */
    static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    /** At most `n` UTF-16 units, never splitting a surrogate pair. */
    static String head(String s, int n) {
        if (s.length() <= n) return s;
        int end = n;
        if (Character.isHighSurrogate(s.charAt(end - 1))) end--;
        return s.substring(0, end);
    }

    public static PackedFolder packFolder(File root) throws IOException {
        return packFolder(root, null, GuardedFolder.CANONICAL_PROBE);
    }

    /**
     * Walks and hashes `root`. Folders and files are visited in sorted order,
     * so the same folder packs to the same manifest (apart from its id and time).
     */
    public static PackedFolder packFolder(File root, Progress progress, GuardedFolder.FileProbe probe) throws IOException {
        GuardedFolder folder = GuardedFolder.open(root, probe);
        List<Capsule.FileEntry> files = new ArrayList<>();
        List<Capsule.Excluded> excluded = new ArrayList<>();
        long total = 0;
        CapsuleLimits limits = MeshProtocol.TRANSFER_LIMITS;
        ArrayDeque<String> queue = new ArrayDeque<>();
        queue.add("");

        while (!queue.isEmpty()) {
            String dir = queue.poll();
            File dirFile = dir.isEmpty() ? folder.root() : new File(folder.root(), dir.replace('/', File.separatorChar));
            String[] names = dirFile.list();
            if (names == null) throw new IOException("Couldn't read the folder " + (dir.isEmpty() ? folder.root().getName() : dir) + ".");
            Arrays.sort(names);
            for (String name : names) {
                if (name.startsWith(".farbaek-")) continue;
                String rel = Normalizer.normalize(dir.isEmpty() ? name : dir + "/" + name, Normalizer.Form.NFC);
                File file = new File(dirFile, name);
                if (probe.isLink(file)) {
                    excluded.add(new Capsule.Excluded(head(rel, 300), "link"));
                    continue;
                }
                if (!AgentPaths.checkAgentPath(rel).ok) {
                    excluded.add(new Capsule.Excluded(head(rel, 300), "invalid_path"));
                    continue;
                }
                if (file.isDirectory()) {
                    if (AgentPaths.IGNORED_FOLDERS.contains(name)) excluded.add(new Capsule.Excluded(head(rel + "/", 300), "ignored_folder"));
                    else queue.add(rel);
                    continue;
                }
                if (!file.isFile()) continue;
                AgentPaths.Screen screened = AgentPaths.screenPath(rel);
                if (!screened.ok) {
                    excluded.add(new Capsule.Excluded(head(rel, 300), screened.reason));
                    continue;
                }
                long size = file.length();
                if (size > limits.maxFileBytes) {
                    excluded.add(new Capsule.Excluded(head(rel, 300), "too_large"));
                    continue;
                }
                if (looksLikeSecret(folder, rel, size)) {
                    excluded.add(new Capsule.Excluded(head(rel, 300), "secret_content"));
                    continue;
                }
                if (files.size() >= limits.maxFiles) throw new PackException("This folder has more than " + String.format(Locale.US, "%,d", limits.maxFiles) + " files to send. Choose a smaller folder.");
                Capsule.FileEntry entry = hashFile(folder, rel);
                total += entry.bytes;
                if (total > limits.maxTotalBytes) throw new PackException("This folder holds more than 4 GB to send. Choose a smaller folder.");
                files.add(entry);
                if (progress != null) progress.filesDone(files.size());
            }
        }

        Collections.sort(files, new Comparator<Capsule.FileEntry>() {
            @Override
            public int compare(Capsule.FileEntry a, Capsule.FileEntry b) {
                return a.path.compareTo(b.path);
            }
        });
        String name = head(folder.root().getName(), 120);
        if (name.isEmpty()) name = "Folder";
        List<Capsule.Excluded> kept = excluded.size() > 50_000 ? excluded.subList(0, 50_000) : excluded;
        Capsule.Manifest manifest = new Capsule.Manifest(Capsule.CAPSULE_FORMAT, UUID.randomUUID().toString(), isoNow(), null, name, null, files, kept, files.size(), total);
        return new PackedFolder(folder.root(), name, manifest, Capsule.manifestDigest(manifest));
    }

    static Capsule.FileEntry hashFile(GuardedFolder folder, String rel) throws IOException {
        Capsule.ChunkHasher hasher = new Capsule.ChunkHasher();
        try (RandomAccessFile handle = folder.openRead(rel)) {
            byte[] buffer = new byte[1024 * 1024];
            int n;
            while ((n = handle.read(buffer)) > 0) hasher.update(buffer, 0, n);
        }
        String blake3 = hasher.digest();
        return new Capsule.FileEntry(rel, hasher.bytes(), blake3, hasher.chunks());
    }

    private static boolean looksLikeSecret(GuardedFolder folder, String rel, long size) throws IOException {
        if (size > SCAN_TEXT_BYTES) return false;
        byte[] bytes;
        try (RandomAccessFile handle = folder.openRead(rel)) {
            long length = handle.length();
            if (length > SCAN_TEXT_BYTES) return false;
            bytes = new byte[(int) length];
            handle.readFully(bytes);
        }
        for (byte b : bytes) {
            if (b == 0) return false;
        }
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
        } catch (CharacterCodingException e) {
            return false;
        }
        return AgentPaths.containsSecret(text);
    }
}
