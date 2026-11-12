package com.farbaek.mesh;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.bouncycastle.crypto.digests.Blake3Digest;
import org.bouncycastle.util.encoders.Hex;

/**
 * Capsule manifests as src/core/mesh/capsule.ts defines them: a BLAKE3 hash
 * for every file and every 4 MiB chunk, the ManifestSchema checks, the
 * checks every manifest gets before any byte of it is used, and the
 * manifest's identity (BLAKE3 over its RFC 8785 canonical JSON).
 */
public final class Capsule {
    private Capsule() {}

    public static final String CAPSULE_FORMAT = "farbaek.capsule/1";
    public static final int CHUNK_BYTES = 4 * 1024 * 1024;

    /** BLAKE3-256 (BouncyCastle) of some bytes, as 64 hex characters. */
    public static String blake3Hex(byte[] bytes) {
        return blake3Hex(bytes, 0, bytes.length);
    }

    public static String blake3Hex(byte[] bytes, int offset, int length) {
        Blake3Digest d = new Blake3Digest(256);
        d.update(bytes, offset, length);
        byte[] out = new byte[32];
        d.doFinal(out, 0);
        return Hex.toHexString(out);
    }

    public static final class Chunk {
        public final int index;
        public final long bytes;
        public final String blake3;

        public Chunk(int index, long bytes, String blake3) {
            this.index = index;
            this.bytes = bytes;
            this.blake3 = blake3;
        }

        Map<String, Object> toJson() {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("index", (long) index);
            o.put("bytes", bytes);
            o.put("blake3", blake3);
            return o;
        }
    }

    public static final class FileEntry {
        public final String path;
        public final long bytes;
        public final String blake3;
        public final List<Chunk> chunks;

        public FileEntry(String path, long bytes, String blake3, List<Chunk> chunks) {
            this.path = path;
            this.bytes = bytes;
            this.blake3 = blake3;
            this.chunks = Collections.unmodifiableList(new ArrayList<>(chunks));
        }

        public FileEntry withPath(String newPath) {
            return new FileEntry(newPath, bytes, blake3, chunks);
        }

        Map<String, Object> toJson() {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("path", path);
            o.put("bytes", bytes);
            o.put("blake3", blake3);
            List<Object> list = new ArrayList<>();
            for (Chunk c : chunks) list.add(c.toJson());
            o.put("chunks", list);
            return o;
        }
    }

    public static final class Excluded {
        public final String path;
        public final String reason;

        public Excluded(String path, String reason) {
            this.path = path;
            this.reason = reason;
        }
    }

    public static final class Manifest {
        public final String format;
        public final String id;
        public final String createdAt;
        public final String projectId;
        public final String projectName;
        /** Null when absent. */
        public final String note;
        public final List<FileEntry> files;
        public final List<Excluded> excluded;
        public final long totalFiles;
        public final long totalBytes;

        public Manifest(String format, String id, String createdAt, String projectId, String projectName, String note, List<FileEntry> files, List<Excluded> excluded, long totalFiles, long totalBytes) {
            this.format = format;
            this.id = id;
            this.createdAt = createdAt;
            this.projectId = projectId;
            this.projectName = projectName;
            this.note = note;
            this.files = Collections.unmodifiableList(new ArrayList<>(files));
            this.excluded = Collections.unmodifiableList(new ArrayList<>(excluded));
            this.totalFiles = totalFiles;
            this.totalBytes = totalBytes;
        }

        public Manifest withFiles(List<FileEntry> newFiles) {
            return new Manifest(format, id, createdAt, projectId, projectName, note, newFiles, excluded, totalFiles, totalBytes);
        }

        /** The object JSON.stringify writes for the TypeScript manifest, in the same key order. */
        public Map<String, Object> toJson() {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("format", format);
            o.put("id", id);
            o.put("createdAt", createdAt);
            Map<String, Object> source = new LinkedHashMap<>();
            source.put("projectId", projectId);
            source.put("projectName", projectName);
            o.put("source", source);
            if (note != null) o.put("note", note);
            List<Object> fileList = new ArrayList<>();
            for (FileEntry f : files) fileList.add(f.toJson());
            o.put("files", fileList);
            List<Object> excludedList = new ArrayList<>();
            for (Excluded e : excluded) {
                Map<String, Object> x = new LinkedHashMap<>();
                x.put("path", e.path);
                x.put("reason", e.reason);
                excludedList.add(x);
            }
            o.put("excluded", excludedList);
            Map<String, Object> totals = new LinkedHashMap<>();
            totals.put("files", totalFiles);
            totals.put("bytes", totalBytes);
            o.put("totals", totals);
            return o;
        }

        public byte[] toJsonBytes() {
            return Json.stringify(toJson()).getBytes(StandardCharsets.UTF_8);
        }
    }

    /** A Capsule's identity: BLAKE3 of the RFC 8785 canonical form of its manifest. */
    public static String manifestDigest(Manifest manifest) {
        return blake3Hex(CanonicalJson.canonicalize(manifest.toJson()).getBytes(StandardCharsets.UTF_8));
    }

    private static final String DATE = "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))";
    /** zod 4's z.iso.datetime(): seconds required, any fraction, "Z" only. */
    static final Pattern ISO_DATETIME = Pattern.compile(DATE + "T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))");

    private static boolean hex64(String s) {
        return s != null && MeshProtocol.HEX64.matcher(s).matches();
    }

    private static boolean between(String s, int min, int max) {
        return s != null && s.length() >= min && s.length() <= max;
    }

    /**
     * ManifestSchema: the manifest with only the keys the schema knows, or
     * null when it doesn't match. The digest is taken over this, as the
     * TypeScript receiver takes it over zod's parsed (stripped) output.
     */
    public static Manifest fromJson(Object json) {
        Map<String, Object> o = Json.asObject(json);
        if (o == null) return null;
        if (!CAPSULE_FORMAT.equals(o.get("format"))) return null;
        String id = Json.asString(o.get("id"));
        String createdAt = Json.asString(o.get("createdAt"));
        if (!between(id, 8, 64) || createdAt == null || !ISO_DATETIME.matcher(createdAt).matches()) return null;
        Map<String, Object> source = Json.asObject(o.get("source"));
        if (source == null || !source.containsKey("projectId")) return null;
        Object projectIdValue = source.get("projectId");
        String projectId = Json.asString(projectIdValue);
        if (projectIdValue != null && (projectId == null || projectId.length() > 64)) return null;
        String projectName = Json.asString(source.get("projectName"));
        if (!between(projectName, 1, 120)) return null;
        String note = null;
        if (o.containsKey("note")) {
            note = Json.asString(o.get("note"));
            if (note == null || note.length() > 4000) return null;
        }
        List<Object> fileList = Json.asArray(o.get("files"));
        if (fileList == null || fileList.size() > 10_000) return null;
        List<FileEntry> files = new ArrayList<>(fileList.size());
        for (Object item : fileList) {
            Map<String, Object> f = Json.asObject(item);
            if (f == null) return null;
            String path = Json.asString(f.get("path"));
            Long bytes = Json.asInt(f.get("bytes"), 0, Json.MAX_SAFE_INTEGER);
            String blake3 = Json.asString(f.get("blake3"));
            List<Object> chunkList = Json.asArray(f.get("chunks"));
            if (!between(path, 1, 300) || bytes == null || !hex64(blake3) || chunkList == null || chunkList.isEmpty() || chunkList.size() > 1024) return null;
            List<Chunk> chunks = new ArrayList<>(chunkList.size());
            for (Object c : chunkList) {
                Map<String, Object> chunk = Json.asObject(c);
                if (chunk == null) return null;
                Long index = Json.asInt(chunk.get("index"), 0, Json.MAX_SAFE_INTEGER);
                Long chunkBytes = Json.asInt(chunk.get("bytes"), 0, Json.MAX_SAFE_INTEGER);
                String chunkHash = Json.asString(chunk.get("blake3"));
                if (index == null || chunkBytes == null || !hex64(chunkHash)) return null;
                // An index past int range can't be laid out correctly; checkManifest reports it.
                chunks.add(new Chunk(index > Integer.MAX_VALUE ? -1 : index.intValue(), chunkBytes, chunkHash));
            }
            files.add(new FileEntry(path, bytes, blake3, chunks));
        }
        List<Object> excludedList = Json.asArray(o.get("excluded"));
        if (excludedList == null || excludedList.size() > 50_000) return null;
        List<Excluded> excluded = new ArrayList<>(excludedList.size());
        for (Object item : excludedList) {
            Map<String, Object> x = Json.asObject(item);
            if (x == null) return null;
            String path = Json.asString(x.get("path"));
            String reason = Json.asString(x.get("reason"));
            if (!between(path, 0, 300) || !between(reason, 0, 40)) return null;
            excluded.add(new Excluded(path, reason));
        }
        Map<String, Object> totals = Json.asObject(o.get("totals"));
        if (totals == null) return null;
        Long totalFiles = Json.asInt(totals.get("files"), 0, Json.MAX_SAFE_INTEGER);
        Long totalBytes = Json.asInt(totals.get("bytes"), 0, Json.MAX_SAFE_INTEGER);
        if (totalFiles == null || totalBytes == null) return null;
        return new Manifest(CAPSULE_FORMAT, id, createdAt, projectId, projectName, note, files, excluded, totalFiles, totalBytes);
    }

    private static String head(String s, int n) {
        return s.length() <= n ? s : s.substring(0, n);
    }

    /**
     * The checks every manifest gets wherever a Capsule arrives, before any
     * byte of it is used: counts and sizes within the limits, each file's
     * chunks laid out as packing lays them out, and every path checked as in
     * any import, kept in NFC form, unique even ignoring case, and allowed by
     * the screening. `diskPaths` adds the rules for names on a real disk.
     */
    public static List<String> checkManifest(Manifest manifest, CapsuleLimits limits, boolean diskPaths) {
        List<String> problems = new ArrayList<>();
        if (manifest.files.size() > limits.maxFiles) problems.add("It holds " + manifest.files.size() + " files; the most a Capsule can hold is " + limits.maxFiles + ".");
        if (manifest.totalFiles != manifest.files.size()) problems.add("The manifest's file count doesn't match its file list.");

        long declared = 0;
        Map<String, String> byFolded = new HashMap<>();
        for (FileEntry entry : manifest.files) {
            declared += entry.bytes;
            if (entry.bytes > limits.maxFileBytes) problems.add(head(entry.path, 120) + " is larger than a Capsule file may be.");
            if (!chunksLaidOut(entry)) problems.add(head(entry.path, 120) + ": its chunk list doesn't match its size.");

            if (!Normalizer.normalize(entry.path, Normalizer.Form.NFC).equals(entry.path)) problems.add(entry.path + ": the name isn't in normalised (NFC) form.");
            AgentPaths.PathCheck checked = diskPaths ? AgentPaths.checkAgentPath(entry.path) : AgentPaths.checkPath(entry.path);
            if (!checked.ok || !checked.path.equals(entry.path)) {
                problems.add(head(entry.path, 120) + ": " + (checked.ok ? "the path isn't in its plain form." : checked.reason));
                continue;
            }
            AgentPaths.Screen screened = AgentPaths.screenPath(entry.path);
            if (!screened.ok) problems.add(entry.path + ": " + reasonWords(screened.reason) + " files can't be in a Capsule.");
            String folded = entry.path.toLowerCase(Locale.ROOT);
            String other = byFolded.get(folded);
            if (other != null) problems.add(other.equals(entry.path) ? entry.path + " is listed twice." : entry.path + " and " + other + " differ only in capital letters.");
            byFolded.put(folded, entry.path);
        }
        if (declared != manifest.totalBytes) problems.add("The manifest's byte count doesn't match its files.");
        if (declared > limits.maxTotalBytes) problems.add("The files add up to more than a Capsule may hold.");
        return problems.size() > 50 ? new ArrayList<>(problems.subList(0, 50)) : problems;
    }

    /**
     * Rules this receiver adds before writing anything, beyond the shared
     * checks: no name may use the receiver's own ".farbaek-" working names
     * (in any case), no file may sit where another file needs a folder, and
     * no two folders may differ only in capital letters, all compared
     * ignoring case as a case-insensitive disk (Windows, Android's shared
     * storage) would. The TypeScript receiver would fail on some of these
     * while moving files into place; this refuses them before the first byte.
     */
    public static List<String> checkReceivePaths(Manifest manifest) {
        List<String> problems = new ArrayList<>();
        Map<String, String> folders = new HashMap<>();
        Map<String, String> folderSpelling = new HashMap<>();
        for (FileEntry entry : manifest.files) {
            String[] parts = entry.path.split("/", -1);
            StringBuilder prefix = new StringBuilder();
            for (int i = 0; i < parts.length; i++) {
                if (parts[i].toLowerCase(Locale.ROOT).startsWith(".farbaek-")) {
                    problems.add(head(entry.path, 120) + ": names starting with .farbaek- are kept for Farbaek's own use.");
                    break;
                }
                if (i < parts.length - 1) {
                    if (prefix.length() > 0) prefix.append('/');
                    prefix.append(parts[i]);
                    String folded = prefix.toString().toLowerCase(Locale.ROOT);
                    folders.put(folded, entry.path);
                    String spelled = folderSpelling.get(folded);
                    if (spelled == null) folderSpelling.put(folded, prefix.toString());
                    else if (!spelled.equals(prefix.toString())) problems.add(head(prefix.toString(), 120) + "/ and " + head(spelled, 120) + "/ differ only in capital letters.");
                }
            }
        }
        for (FileEntry entry : manifest.files) {
            String inside = folders.get(entry.path.toLowerCase(Locale.ROOT));
            if (inside != null) problems.add(head(entry.path, 120) + " is a file, but " + head(inside, 120) + " needs a folder there.");
        }
        List<String> unique = new ArrayList<>(new LinkedHashSet<>(problems));
        return unique.size() > 50 ? new ArrayList<>(unique.subList(0, 50)) : unique;
    }

    /** Chunks as packing makes them: numbered from 0, each CHUNK_BYTES but the last, adding up to the file. An empty file has one empty chunk. */
    static boolean chunksLaidOut(FileEntry entry) {
        long count = entry.bytes == 0 ? 1 : (entry.bytes + CHUNK_BYTES - 1) / CHUNK_BYTES;
        if (entry.chunks.size() != count) return false;
        for (int i = 0; i < count; i++) {
            Chunk c = entry.chunks.get(i);
            long expected = i < count - 1 ? CHUNK_BYTES : entry.bytes - (long) CHUNK_BYTES * (count - 1);
            if (c.index != i || c.bytes != expected) return false;
        }
        return true;
    }

    static String reasonWords(String reason) {
        switch (reason) {
            case "invalid_path": return "the path isn't allowed";
            case "ignored_folder": return "dependency and build";
            case "secret_file": return "credentials";
            case "secret_content": return "it contains what looks like a secret";
            case "binary": return "it isn't a text file";
            case "too_large": return "it's too large";
            default: return reason;
        }
    }

    /** Hears each 4 MiB chunk as it completes. May throw to stop the transfer. */
    public interface ChunkListener {
        void onChunk(Chunk chunk) throws IOException;
    }

    /**
     * Hashes a file as it streams past, without holding it: BLAKE3 of each
     * 4 MiB chunk and of the whole file, laid out exactly as packing lays
     * them out.
     */
    public static final class ChunkHasher {
        private final Blake3Digest whole = new Blake3Digest(256);
        private Blake3Digest part = new Blake3Digest(256);
        private int inPart;
        private long total;
        private boolean done;
        private String wholeHex;
        private final List<Chunk> chunks = new ArrayList<>();
        private final ChunkListener onChunk;

        public ChunkHasher() {
            this(null);
        }

        public ChunkHasher(ChunkListener onChunk) {
            this.onChunk = onChunk;
        }

        public long bytes() {
            return total;
        }

        public void update(byte[] bytes, int offset, int length) throws IOException {
            if (done) throw new IllegalStateException("This file has already been hashed.");
            int at = offset;
            int end = offset + length;
            while (at < end) {
                int take = Math.min(end - at, CHUNK_BYTES - inPart);
                whole.update(bytes, at, take);
                part.update(bytes, at, take);
                inPart += take;
                total += take;
                at += take;
                if (inPart == CHUNK_BYTES) closePart();
            }
        }

        public void update(byte[] bytes) throws IOException {
            update(bytes, 0, bytes.length);
        }

        /** Finishes the file: its whole-file hash; chunks() and bytes() then hold the rest. */
        public String digest() throws IOException {
            if (!done) {
                if (inPart > 0 || chunks.isEmpty()) closePart();
                done = true;
                byte[] out = new byte[32];
                whole.doFinal(out, 0);
                wholeHex = Hex.toHexString(out);
            }
            return wholeHex;
        }

        public List<Chunk> chunks() {
            return Collections.unmodifiableList(chunks);
        }

        private void closePart() throws IOException {
            byte[] out = new byte[32];
            part.doFinal(out, 0);
            Chunk chunk = new Chunk(chunks.size(), inPart, Hex.toHexString(out));
            chunks.add(chunk);
            part = new Blake3Digest(256);
            inPart = 0;
            if (onChunk != null) onChunk.onChunk(chunk);
        }
    }
}
