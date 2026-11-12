package com.farbaek.mesh;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Receiving a nearby transfer, as src/agent-runtime/mesh/receive.ts does.
 * Nothing is written until the person accepts and chooses where it goes, and
 * then only into a new folder made for it. Every path was checked when the
 * offer was read, and every write goes through a GuardedFolder. Files arrive
 * in a hidden .farbaek-incoming folder inside it, each 4 MiB chunk checked
 * against its BLAKE3 hash the moment it completes and each file against its
 * whole-file hash. A checkpoint records every verified chunk, so a dropped
 * connection resumes where it stopped. Only when every file has matched are
 * they moved into place and the sender told `verified`. A mismatch stops the
 * transfer and removes everything it wrote. Nothing received is ever run.
 */
public final class IncomingTransfer {
    /** How long a receiver waits for the next piece before treating the connection as dropped. */
    static final long IDLE_MS = 60_000;
    static final String INCOMING = ".farbaek-incoming";
    /** Free space kept beyond the transfer's size. */
    private static final long SPACE_MARGIN = 64L * 1024 * 1024;

    /** Why an offer can't be accepted, in words, with the problems found. */
    public static final class OfferException extends Exception {
        public final List<String> problems;

        public OfferException(String message) {
            this(message, new ArrayList<String>());
        }

        public OfferException(String message, List<String> problems) {
            super(message);
            this.problems = problems;
        }
    }

    /** The files didn't match what was offered: never treated as a dropped connection. */
    static final class Mismatch extends IOException {
        final String code;

        Mismatch(String message) {
            this(message, "protocol");
        }

        Mismatch(String message, String code) {
            super(message);
            this.code = code;
        }
    }

    /** Errors that mean the connection was lost or tampered with, not that the files were wrong. */
    static boolean dropped(Throwable error) {
        return error instanceof FramedSocket.FrameException || error instanceof NoiseException || error instanceof SecureChannel.ChannelException;
    }

    /** Reads and checks an offer's manifest. Throws OfferException, in words, when it can't be accepted. */
    static Capsule.Manifest readOffer(SecureChannel channel, MeshMessage offer) throws IOException, OfferException {
        byte[] body = channel.receiveBlob(offer.size, IDLE_MS);
        Object json;
        try {
            json = Json.parse(new String(body, StandardCharsets.UTF_8));
        } catch (Json.JsonException e) {
            throw new OfferException("The list of files wasn't readable.");
        }
        if (body.length > MeshProtocol.MAX_MANIFEST_BYTES) throw new OfferException("The list of files is too large.");
        Capsule.Manifest manifest = Capsule.fromJson(json);
        if (manifest == null) throw new OfferException("The list of files isn't in the Capsule format.");
        String digest;
        try {
            digest = Capsule.manifestDigest(manifest);
        } catch (CanonicalJson.CanonicalizationException e) {
            throw new OfferException("The list of files isn't in the Capsule format.");
        }
        if (!digest.equals(offer.digest)) throw new OfferException("The list of files doesn't match its digest.");
        List<String> problems = Capsule.checkManifest(manifest, MeshProtocol.TRANSFER_LIMITS, true);
        if (problems.isEmpty()) problems = Capsule.checkReceivePaths(manifest);
        if (!problems.isEmpty()) throw new OfferException("Some files in this transfer can't be accepted.", problems);
        return manifest;
    }

    /** Guards `running` and `channel` while a receive starts or a sender reconnects. */
    private final Object lock = new Object();
    /** Guards the folder: making, writing a checkpoint, moving into place and removing never overlap. */
    private final Object files = new Object();
    private volatile SecureChannel channel;
    public final String id;
    public final String digest;
    public final Capsule.Manifest manifest;
    private final Runnable onUpdate;
    private final GuardedFolder.FileProbe probe;
    private final ReceivingFolders receiving;
    private final int[] verified;
    private final boolean[] complete;
    /** The name saved when the person paired with the sender, not whatever its hello says this time. */
    private final String peerName;
    final byte[] peerKey;
    private volatile TransferState state = TransferState.OFFERED;
    private volatile String message;
    private volatile long bytesDone;
    private volatile long updatedAt = System.currentTimeMillis();
    private volatile File destination;
    private volatile GuardedFolder folder;
    /** True while one thread receives: an accept or a resume claims it, so two taps never run two receives. */
    private boolean running;
    private long reusedFiles;
    private long reusedBytes;
    private String reuseProblem;
    private long lastProgress;

    IncomingTransfer(SecureChannel channel, String id, String digest, Capsule.Manifest manifest, String peerName, Runnable onUpdate, GuardedFolder.FileProbe probe,
            ReceivingFolders receiving) {
        this.channel = channel;
        this.id = id;
        this.digest = digest;
        this.manifest = manifest;
        this.onUpdate = onUpdate;
        this.probe = probe;
        this.receiving = receiving;
        this.peerKey = channel.peer.publicKey.clone();
        this.peerName = peerName;
        this.verified = new int[manifest.files.size()];
        this.complete = new boolean[manifest.files.size()];
        channel.onClose(new Runnable() {
            @Override
            public void run() {
                move(TransferState.OFFERED, TransferState.CANCELLED, IncomingTransfer.this.peerName + " stopped waiting. Nothing was written.");
            }
        });
    }

    public TransferState state() {
        return state;
    }

    String temp() {
        return INCOMING + "/" + id;
    }

    /** The folder made for it, once accepted, until it's removed. */
    File destination() {
        return destination;
    }

    public TransferView view() {
        List<Capsule.Excluded> excluded = new ArrayList<>(manifest.excluded.subList(0, Math.min(50, manifest.excluded.size())));
        File dest = destination;
        return new TransferView(id, "in", state, peerName, Noise.fingerprint(peerKey), manifest.projectName, manifest.totalFiles, manifest.totalBytes, bytesDone,
                excluded, manifest.excluded.size(), reusedFiles, reusedBytes, dest == null ? null : dest.getPath(), message, updatedAt);
    }

    /** Moves to `next` unless the transfer has ended: a final state is never left, whatever a slower thread does after it. */
    private synchronized boolean set(TransferState next, String words) {
        if (state.isFinal()) return false;
        state = next;
        message = words;
        updatedAt = System.currentTimeMillis();
        onUpdate.run();
        return true;
    }

    /** Moves from `from` to `next` only if it's still there, in one step: of two taps, one wins. */
    private synchronized boolean move(TransferState from, TransferState next, String words) {
        if (state != from) return false;
        return set(next, words);
    }

    /** Says why an action didn't work, without changing where the transfer is. */
    synchronized void note(String words) {
        message = words;
        updatedAt = System.currentTimeMillis();
        onUpdate.run();
    }

    /**
     * Accepts into a new folder inside `parent`, then receives; blocks until
     * the transfer ends or the connection drops. With `earlier`, a folder
     * holding an earlier copy on this device, files and leading chunks that
     * match the offer's hashes are copied from it instead of sent; the
     * earlier copy is only read.
     */
    public void accept(File parent, File earlier) throws IOException, OfferException {
        // Checked before anything changes: a wrong folder leaves the offer as it was.
        if (!parent.isAbsolute() || !parent.isDirectory()) throw new OfferException("Choose a folder that exists.");
        if (earlier != null && (!earlier.isAbsolute() || !earlier.isDirectory())) throw new OfferException("Choose an earlier copy that exists.");
        final SecureChannel ch = channel;
        // One step from offered to receiving: a second tap finds it already taken and does nothing.
        synchronized (lock) {
            if (ch == null || running || !move(TransferState.OFFERED, TransferState.RECEIVING, null)) return;
            running = true;
        }
        try {
            long usable = parent.getUsableSpace();
            // 0 with no total means the size couldn't be read: carry on, as the desktop does when statfs fails.
            if ((usable > 0 || parent.getTotalSpace() > 0) && usable < manifest.totalBytes + SPACE_MARGIN) {
                try {
                    ch.send(MeshMessage.error("no_space", "The receiving computer doesn't have enough free space."));
                } catch (IOException ignored) {
                    // Already gone.
                }
                ch.close();
                set(TransferState.FAILED, "There isn't enough free space in that folder's drive for this transfer.");
                return;
            }
            File made;
            GuardedFolder guarded;
            try {
                made = makeFolder(parent);
            } catch (IOException e) {
                stillOffered(ch);
                throw e;
            }
            if (receiving != null) receiving.add(made);
            try {
                guarded = GuardedFolder.open(made, probe);
            } catch (IOException e) {
                GuardedFolder.removeTree(made, probe);
                if (receiving != null) receiving.remove(made);
                stillOffered(ch);
                throw e;
            }
            synchronized (files) {
                if (state.isFinal()) {
                    // Cancelled while the folder was being made: it goes too.
                    GuardedFolder.removeTree(made, probe);
                    if (receiving != null) receiving.remove(made);
                    return;
                }
                destination = made;
                folder = guarded;
            }
            if (earlier != null) {
                set(TransferState.RECEIVING, "Checking the earlier copy for files this computer already has.");
                try {
                    seedFrom(earlier);
                } catch (IOException | RuntimeException e) {
                    // Reuse saves time but isn't needed: anything it couldn't check is sent instead.
                    reusedFiles = 0;
                    reusedBytes = 0;
                    Arrays.fill(verified, 0);
                    Arrays.fill(complete, false);
                    synchronized (files) {
                        File dest = destination;
                        if (dest != null) GuardedFolder.removeTree(new File(dest, INCOMING), probe);
                    }
                    reuseProblem = "The earlier copy couldn't be used (" + (e.getMessage() != null ? e.getMessage() : "it couldn't be read") + "), so every file was sent.";
                }
            }
            run();
        } finally {
            release();
        }
    }

    /** Nothing was made after all: back to offered, so another folder can be chosen, unless the sender went meanwhile. */
    private void stillOffered(SecureChannel ch) {
        if (move(TransferState.RECEIVING, TransferState.OFFERED, null) && ch.isClosed()) {
            move(TransferState.OFFERED, TransferState.CANCELLED, peerName + " stopped waiting. Nothing was written.");
        }
    }

    private void release() {
        synchronized (lock) {
            running = false;
            lock.notifyAll();
        }
    }

    /** The sender called again after a dropped connection: carry on from the last verified chunk. */
    void reattach(SecureChannel next) throws IOException, OfferException {
        synchronized (lock) {
            // The old connection may not have been noticed as dead yet: let it go first.
            if (running) {
                SecureChannel old = channel;
                if (old != null) old.close();
                while (running) {
                    try {
                        lock.wait();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new IOException("Interrupted.");
                    }
                }
            }
            // Claimed in one step, as accept is: a second call finds it receiving and is refused.
            if (folder == null || !move(TransferState.INTERRUPTED, TransferState.RECEIVING, null)) throw new OfferException("There's nothing to resume.");
            running = true;
            channel = next;
        }
        try {
            run();
        } finally {
            release();
        }
    }

    public void decline() {
        if (!move(TransferState.OFFERED, TransferState.DECLINED, "You declined this transfer. Nothing was written.")) return;
        SecureChannel ch = channel;
        if (ch != null) {
            try {
                ch.send(MeshMessage.decline());
            } catch (IOException ignored) {
                // Already gone.
            }
            ch.close();
        }
    }

    /**
     * Ends it first, then tells the sender and removes the folder: whatever
     * the receiving thread does next (a dropped connection, a checkpoint) can't
     * bring it back to interrupted or make the folders again.
     */
    public void cancel() {
        if (!set(TransferState.CANCELLED, "Cancelled. Everything received was removed.")) return;
        SecureChannel ch = channel;
        if (ch != null) {
            try {
                ch.send(MeshMessage.cancel());
            } catch (IOException ignored) {
                // Already gone.
            }
            ch.close();
        }
        removeAll();
    }

    /** Once interrupted, the person can give up on it here too. */
    public void discard() {
        if (!move(TransferState.INTERRUPTED, TransferState.CANCELLED, "Discarded. Everything received was removed.")) return;
        removeAll();
    }

    static String folderName(String raw) {
        String cleaned = Normalizer.normalize(raw, Normalizer.Form.NFC).replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "-").replaceAll("[. ]+\\z", "");
        cleaned = Packer.head(Json.jsTrim(cleaned), 80);
        return !cleaned.isEmpty() && AgentPaths.checkAgentPath(cleaned).ok ? cleaned : "Farbaek transfer";
    }

    private File makeFolder(File parent) throws IOException {
        String base = folderName(manifest.projectName);
        for (int n = 1; n < 100; n++) {
            File candidate = new File(parent, n == 1 ? base : base + " (" + n + ")");
            if (candidate.mkdir()) return candidate.getCanonicalFile();
            if (!candidate.exists()) throw new IOException("Couldn't make a folder in " + parent + ".");
        }
        File candidate = new File(parent, base + " " + UUID.randomUUID().toString().substring(0, 8));
        if (!candidate.mkdir()) throw new IOException("Couldn't make a folder in " + parent + ".");
        return candidate.getCanonicalFile();
    }

    /**
     * How many leading chunks of `entry` the same path in `source` already
     * has, by BLAKE3. Every chunk, when the file matches whole; 0 when it's
     * missing, unreadable or differs from the start.
     */
    private static int matchingChunks(GuardedFolder source, final Capsule.FileEntry entry) throws IOException {
        RandomAccessFile handle;
        try {
            handle = source.openRead(entry.path);
        } catch (IOException e) {
            return 0;
        }
        final int[] matched = {0};
        final boolean[] differs = {false};
        Capsule.ChunkHasher hasher = new Capsule.ChunkHasher(new Capsule.ChunkListener() {
            @Override
            public void onChunk(Capsule.Chunk chunk) {
                Capsule.Chunk expected = chunk.index < entry.chunks.size() ? entry.chunks.get(chunk.index) : null;
                if (!differs[0] && expected != null && expected.blake3.equals(chunk.blake3) && expected.bytes == chunk.bytes) matched[0] = chunk.index + 1;
                else differs[0] = true;
            }
        });
        try {
            // Never more than the offered size: a longer earlier file can still match up to it.
            long toRead = Math.min(handle.length(), entry.bytes);
            byte[] buffer = new byte[1024 * 1024];
            long read = 0;
            while (read < toRead && !differs[0]) {
                int n = handle.read(buffer, 0, (int) Math.min(buffer.length, toRead - read));
                if (n <= 0) break;
                hasher.update(buffer, 0, n);
                read += n;
            }
            if (differs[0]) return matched[0];
            String blake3 = hasher.digest();
            // The last chunk only counts when the whole file is exactly the offered one.
            return hasher.bytes() == entry.bytes && blake3.equals(entry.blake3) ? entry.chunks.size() : Math.min(matched[0], entry.chunks.size() - 1);
        } finally {
            handle.close();
        }
    }

    /**
     * Copies what the earlier copy already has into the incoming files: a
     * whole file when every chunk and the whole-file hash match, otherwise its
     * leading chunks that match, so the sender carries on after them.
     */
    private void seedFrom(File earlier) throws IOException {
        GuardedFolder source = GuardedFolder.open(earlier, probe);
        for (int f = 0; f < manifest.files.size(); f++) {
            Capsule.FileEntry entry = manifest.files.get(f);
            int matched = matchingChunks(source, entry);
            if (matched == 0) continue;
            boolean whole = matched == entry.chunks.size();
            long keep = whole ? entry.bytes : (long) matched * Capsule.CHUNK_BYTES;
            RandomAccessFile created;
            synchronized (files) {
                created = liveFolder().createNew(temp() + "/" + f + ".part");
            }
            try (RandomAccessFile from = source.openRead(entry.path); RandomAccessFile to = created) {
                byte[] buffer = new byte[1024 * 1024];
                long at = 0;
                while (at < keep) {
                    int n = from.read(buffer, 0, (int) Math.min(buffer.length, keep - at));
                    if (n <= 0) break;
                    to.write(buffer, 0, n);
                    at += n;
                }
                if (at != keep) throw new IOException(entry.path + " changed while it was copied");
            }
            verified[f] = matched;
            if (whole) {
                complete[f] = true;
                reusedFiles += 1;
            }
            reusedBytes += keep;
        }
        saveCheckpoint();
    }

    private static final class Part {
        final int f;
        final RandomAccessFile handle;
        final Capsule.ChunkHasher hasher;
        long received;

        Part(int f, RandomAccessFile handle, Capsule.ChunkHasher hasher, long received) {
            this.f = f;
            this.handle = handle;
            this.hasher = hasher;
            this.received = received;
        }
    }

    private boolean allComplete() {
        for (boolean c : complete) {
            if (!c) return false;
        }
        return true;
    }

    private void run() {
        SecureChannel ch = channel;
        // A file whose chunks all checked but which wasn't confirmed whole is sent again from its last chunk.
        long done = 0;
        List<long[]> resume = new ArrayList<>();
        for (int f = 0; f < manifest.files.size(); f++) {
            Capsule.FileEntry entry = manifest.files.get(f);
            if (!complete[f]) verified[f] = Math.min(verified[f], entry.chunks.size() - 1);
            done += complete[f] ? entry.bytes : Math.min(entry.bytes, (long) verified[f] * Capsule.CHUNK_BYTES);
            if (verified[f] > 0) resume.add(new long[] {f, verified[f]});
        }
        bytesDone = done;
        byte[] body = MeshProtocol.ResumePoints.encode(resume);
        if (!set(TransferState.RECEIVING, null)) {
            // Cancelled or discarded before this receive began.
            ch.close();
            return;
        }
        Part current = null;
        try {
            ch.sendBlob(MeshMessage.accept(body.length), body);
            while (!allComplete()) {
                SecureChannel.Received r = ch.receive(IDLE_MS);
                MeshMessage m = r.message;
                if ("cancel".equals(m.t)) {
                    ch.close();
                    closeQuietly(current);
                    current = null;
                    removeAll();
                    set(TransferState.CANCELLED, peerName + " cancelled. Everything received was removed.");
                    return;
                }
                if ("error".equals(m.t)) {
                    ch.close();
                    closeQuietly(current);
                    current = null;
                    removeAll();
                    set(TransferState.FAILED, peerName + " stopped: " + m.message + " Nothing was kept.");
                    return;
                }
                if ("file".equals(m.t)) {
                    if (current != null || m.f >= complete.length || complete[m.f] || m.from != verified[m.f]) throw new Mismatch("The sender skipped ahead of what was checked.");
                    current = openPart(m.f, m.from);
                    if (manifest.files.get(m.f).bytes == 0) current = finishFile(current);
                    continue;
                }
                if ("data".equals(m.t) && current != null) {
                    Capsule.FileEntry entry = manifest.files.get(current.f);
                    byte[] piece = r.body;
                    if (current.received + piece.length > entry.bytes) throw new Mismatch(entry.path + " is longer than its listed size.");
                    // Explicit positions: what's hashed is exactly what lands at that place on disk.
                    current.handle.seek(current.received);
                    current.handle.write(piece);
                    current.hasher.update(piece);
                    current.received += piece.length;
                    bytesDone += piece.length;
                    progress();
                    if (current.received == entry.bytes) current = finishFile(current);
                    continue;
                }
                throw new Mismatch("The sender sent something out of order.");
            }

            set(TransferState.FINISHING, null);
            File dest;
            synchronized (files) {
                GuardedFolder live = liveFolder();
                for (int f = 0; f < manifest.files.size(); f++) live.moveNew(temp() + "/" + f + ".part", manifest.files.get(f).path);
                dest = destination;
                GuardedFolder.removeTree(new File(dest, INCOMING), probe);
            }
            if (receiving != null) receiving.remove(dest);
            // Done once the files are in place; a lost "verified" can't undo that, and a resume just hears it again.
            String kept = reusedFiles > 0
                    ? " " + reusedFiles + " of them " + (reusedFiles == 1 ? "was" : "were") + " already on this computer and copied from the earlier copy."
                    : reuseProblem != null ? " " + reuseProblem : "";
            set(TransferState.DONE, "Every file matched its hash." + kept + " Saved in " + dest.getPath() + ".");
            try {
                ch.send(MeshMessage.verified(manifest.totalFiles, manifest.totalBytes));
            } catch (IOException ignored) {
                // The sender hears it again when it resumes.
            }
            ch.close();
        } catch (IOException | RuntimeException error) {
            closeQuietly(current);
            if (!dropped(error)) {
                String reason = error instanceof Mismatch ? error.getMessage() : "The receiving computer couldn't write the files.";
                try {
                    ch.send(MeshMessage.error(error instanceof Mismatch ? ((Mismatch) error).code : "internal", reason));
                } catch (IOException ignored) {
                    // Already gone.
                }
                ch.close();
                removeAll();
                set(TransferState.FAILED, reason + " The transfer stopped and nothing was kept.");
                return;
            }
            ch.close();
            try {
                saveCheckpoint();
            } catch (IOException | RuntimeException ignored) {
                // The checkpoint only helps; the chunks verified so far are kept in memory too.
            }
            set(TransferState.INTERRUPTED, "The connection dropped. " + peerName + " can resume from where it stopped.");
        } catch (Error error) {
            // Out of memory or threads: stop here, keep what was checked, and let the sender resume later.
            closeQuietly(current);
            ch.close();
            set(TransferState.INTERRUPTED, "The transfer stopped on this device. " + peerName + " can resume from where it stopped.");
            throw error;
        }
    }

    /** The folder, for a step that makes or moves something in it. Call while holding `files`. */
    private GuardedFolder liveFolder() throws IOException {
        GuardedFolder f = folder;
        if (f == null || state.isFinal()) throw new IOException("The transfer has ended.");
        return f;
    }

    private static void closeQuietly(Part part) {
        if (part == null) return;
        try {
            part.handle.close();
        } catch (IOException ignored) {
            // Nothing more to do.
        }
    }

    /** Opens the file's partial copy at a verified chunk boundary, re-checking what's already there. */
    private Part openPart(final int f, int from) throws IOException {
        final Capsule.FileEntry entry = manifest.files.get(f);
        String rel = temp() + "/" + f + ".part";
        Capsule.ChunkHasher hasher = new Capsule.ChunkHasher(new Capsule.ChunkListener() {
            @Override
            public void onChunk(Capsule.Chunk chunk) throws IOException {
                Capsule.Chunk expected = chunk.index < entry.chunks.size() ? entry.chunks.get(chunk.index) : null;
                if (expected == null || !expected.blake3.equals(chunk.blake3) || expected.bytes != chunk.bytes) {
                    throw new Mismatch(entry.path + " didn't match its hash at chunk " + (chunk.index + 1) + ".", "chunk_mismatch");
                }
                verified[f] = chunk.index + 1;
            }
        });
        long keep = (long) from * Capsule.CHUNK_BYTES;
        RandomAccessFile handle;
        synchronized (files) {
            GuardedFolder live = liveFolder();
            if (from == 0) {
                if (live.exists(rel)) live.remove(rel);
                return new Part(f, live.createNew(rel), hasher, 0);
            }
            handle = live.openUpdate(rel);
        }
        try {
            handle.setLength(keep);
            handle.seek(0);
            byte[] buffer = new byte[1024 * 1024];
            long read = 0;
            while (read < keep) {
                int n = handle.read(buffer, 0, (int) Math.min(buffer.length, keep - read));
                if (n <= 0) throw new Mismatch(entry.path + " was shorter than its checked chunks.");
                hasher.update(buffer, 0, n);
                read += n;
            }
        } catch (IOException | RuntimeException e) {
            handle.close();
            throw e;
        }
        return new Part(f, handle, hasher, keep);
    }

    private Part finishFile(Part current) throws IOException {
        Capsule.FileEntry entry = manifest.files.get(current.f);
        String blake3 = current.hasher.digest();
        current.handle.close();
        if (!blake3.equals(entry.blake3)) throw new Mismatch(entry.path + " didn't match its whole-file hash.", "file_mismatch");
        complete[current.f] = true;
        verified[current.f] = entry.chunks.size();
        saveCheckpoint();
        return null;
    }

    private void progress() {
        long now = System.currentTimeMillis();
        if (now - lastProgress < 200) return;
        lastProgress = now;
        updatedAt = now;
        onUpdate.run();
    }

    /** Records the verified chunks; never once the transfer has ended or its folder was removed, which would make the folders again. */
    private void saveCheckpoint() throws IOException {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("session", id);
        json.put("digest", digest);
        List<Object> v = new ArrayList<>();
        for (int n : verified) v.add((long) n);
        List<Object> c = new ArrayList<>();
        for (boolean b : complete) c.add(b);
        json.put("verified", v);
        json.put("complete", c);
        synchronized (files) {
            GuardedFolder f = folder;
            if (f == null || state.isFinal()) return;
            f.write(temp() + "/checkpoint.json", Json.stringify(json));
        }
    }

    /** Removes the folder made for this transfer, with everything received into it. */
    private void removeAll() {
        File dest;
        synchronized (files) {
            dest = destination;
            destination = null;
            folder = null;
            if (dest != null) GuardedFolder.removeTree(dest, probe);
        }
        if (dest != null && receiving != null) receiving.remove(dest);
    }
}
