package com.farbaek.mesh;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Sending a nearby transfer to a paired device, as src/agent-runtime/mesh/send.ts
 * does. The sender offers the manifest and waits for the person on the other
 * device to accept; it then streams each file from the chunk the receiver
 * asks for, re-checking every chunk it reads against the manifest (a file
 * edited since packing stops the transfer instead of sending something
 * else). It reports success only when the receiver says every file matched.
 *
 * start() blocks until the transfer ends, is interrupted or is cancelled; the
 * node runs it on one of its threads. Calling it again resumes.
 */
public final class OutgoingTransfer {
    /** Opens a channel to the paired device. */
    public interface Connector {
        SecureChannel connect() throws IOException;
    }

    /** Test seam: changes a piece of file data on its way out, to prove the receiver refuses it. */
    interface PieceFilter {
        byte[] filter(int file, long offset, byte[] piece);
    }

    private static final class SourceChanged extends IOException {
        SourceChanged(String message) {
            super(message);
        }
    }

    public final String id;
    public final Packer.PackedFolder packed;
    public final TrustStore.TrustedDevice device;
    private final Connector connector;
    private final Runnable onUpdate;
    private final ExecutorService executor;
    private final PieceFilter filter;

    private volatile TransferState state = TransferState.CONNECTING;
    private volatile String message;
    private volatile long bytesDone;
    private volatile long updatedAt = System.currentTimeMillis();
    private volatile SecureChannel channel;
    private volatile MeshMessage stopped;
    private volatile Future<MeshMessage> watching;
    private long lastProgress;

    OutgoingTransfer(String id, Packer.PackedFolder packed, TrustStore.TrustedDevice device, Connector connector, Runnable onUpdate, ExecutorService executor, PieceFilter filter) {
        this.id = id;
        this.packed = packed;
        this.device = device;
        this.connector = connector;
        this.onUpdate = onUpdate;
        this.executor = executor;
        this.filter = filter;
    }

    public TransferState state() {
        return state;
    }

    public TransferView view() {
        Capsule.Manifest m = packed.manifest;
        List<Capsule.Excluded> excluded = new ArrayList<>(m.excluded.subList(0, Math.min(50, m.excluded.size())));
        return new TransferView(id, "out", state, device.name, device.fingerprint, packed.name, m.totalFiles, m.totalBytes, bytesDone, excluded, m.excluded.size(), 0, 0, null, message, updatedAt);
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

    /**
     * Claims an interrupted transfer for one resume, in one step: false when
     * it isn't interrupted, as when another tap has already claimed it. The
     * claimer then runs start().
     */
    synchronized boolean claimResume() {
        if (state != TransferState.INTERRUPTED) return false;
        return set(TransferState.CONNECTING, null);
    }

    /**
     * Connects, offers and sends: the first attempt, or a resume that
     * claimResume() claimed, where the receiver says where to carry on.
     */
    public void start() {
        stopped = null;
        watching = null;
        synchronized (this) {
            channel = null;
        }
        final SecureChannel ch;
        try {
            ch = connector.connect();
        } catch (IOException | RuntimeException e) {
            set(TransferState.INTERRUPTED, "Couldn't reach " + device.name + ". Make sure it's visible on the same network, then resume.");
            return;
        } catch (Error e) {
            set(TransferState.INTERRUPTED, "This device couldn't connect just now. Resume to try again.");
            throw e;
        }
        synchronized (this) {
            // Cancelled while connecting: nothing is offered.
            if (state.isFinal()) {
                ch.close();
                return;
            }
            channel = ch;
        }
        if (!Noise.sameKey(ch.peer.publicKey, device.publicKeyBytes())) {
            ch.close();
            set(TransferState.FAILED, "The computer that answered isn't the " + device.name + " you paired with, so nothing was sent.");
            return;
        }

        try {
            byte[] body = packed.manifest.toJsonBytes();
            ch.sendBlob(MeshMessage.offer(id, packed.digest, body.length), body);
            set(TransferState.WAITING, "Waiting for someone on " + device.name + " to accept.");
            MeshMessage answer = ch.receive(MeshProtocol.OFFER_TIMEOUT_MS).message;
            if ("decline".equals(answer.t)) {
                ch.close();
                set(TransferState.DECLINED, device.name + " declined. Nothing was sent.");
                return;
            }
            if ("error".equals(answer.t)) {
                ch.close();
                set(TransferState.FAILED, device.name + ": " + answer.message);
                return;
            }
            if ("verified".equals(answer.t)) {
                // A resume of a transfer the other device had already finished and checked.
                ch.close();
                bytesDone = packed.manifest.totalBytes;
                set(TransferState.DONE, "Delivered. " + device.name + " had already checked every file against its hash.");
                return;
            }
            if (!"accept".equals(answer.t)) throw new SecureChannel.ChannelException("The other computer answered out of order.");
            Map<Integer, Integer> resume;
            try {
                resume = MeshProtocol.ResumePoints.parse(Json.parse(new String(ch.receiveBlob(answer.size, MeshProtocol.OFFER_TIMEOUT_MS), StandardCharsets.UTF_8)));
            } catch (Json.JsonException e) {
                resume = null;
            }
            if (resume == null) throw new SecureChannel.ChannelException("The other computer's answer wasn't readable.");

            set(TransferState.SENDING, null);
            watching = executor.submit(new Callable<MeshMessage>() {
                @Override
                public MeshMessage call() throws IOException {
                    return watch(ch);
                }
            });
            stream(ch, resume);
            if (stopped == null) set(TransferState.FINISHING, "Sent. " + device.name + " is checking every file.");
            MeshMessage last = await(watching, 0);
            ch.close();
            if ("verified".equals(last.t)) {
                set(TransferState.DONE, "Delivered. " + device.name + " checked every file against its hash.");
            } else if ("cancel".equals(last.t)) {
                set(TransferState.CANCELLED, device.name + " cancelled the transfer.");
            } else if ("error".equals(last.t)) {
                set(TransferState.FAILED, device.name + " stopped: " + last.message);
            }
        } catch (SourceChanged e) {
            ch.close();
            set(TransferState.FAILED, e.getMessage());
        } catch (IOException | RuntimeException e) {
            if (state == TransferState.CANCELLED) {
                ch.close();
                return;
            }
            // The receiver may have stopped us on purpose and closed: its last word is still queued to read.
            MeshMessage last = null;
            Future<MeshMessage> w = watching;
            if (w != null) {
                try {
                    last = await(w, 1_000);
                } catch (IOException | RuntimeException ignored) {
                    last = null;
                }
            }
            ch.close();
            if (last != null && "error".equals(last.t)) set(TransferState.FAILED, device.name + " stopped: " + last.message);
            else if (last != null && "cancel".equals(last.t)) set(TransferState.CANCELLED, device.name + " cancelled the transfer.");
            else set(TransferState.INTERRUPTED, "The connection to " + device.name + " dropped. Resume to carry on from the last checked piece.");
        } catch (Error e) {
            // Out of memory or threads: stop here; the receiver keeps what it checked, for a resume.
            ch.close();
            set(TransferState.INTERRUPTED, "The transfer stopped on this device. Resume to carry on from the last checked piece.");
            throw e;
        }
    }

    private static MeshMessage await(Future<MeshMessage> future, long timeoutMs) throws IOException {
        try {
            return timeoutMs > 0 ? future.get(timeoutMs, TimeUnit.MILLISECONDS) : future.get();
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof IOException) throw (IOException) cause;
            throw new IOException(cause);
        } catch (TimeoutException e) {
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted.");
        }
    }

    /** Listens while sending, for the receiver's verdict or an early stop. */
    private MeshMessage watch(SecureChannel ch) throws IOException {
        MeshMessage m = ch.receive(0).message;
        if ("verified".equals(m.t) || "cancel".equals(m.t) || "error".equals(m.t)) {
            if (!"verified".equals(m.t)) stopped = m;
            return m;
        }
        ch.close();
        throw new SecureChannel.ChannelException("The other computer sent something out of order.");
    }

    private void stream(SecureChannel ch, Map<Integer, Integer> resume) throws IOException {
        GuardedFolder folder = GuardedFolder.open(packed.root);
        List<Capsule.FileEntry> files = packed.manifest.files;
        long done = 0;
        for (int f = 0; f < files.size(); f++) {
            Integer from = resume.get(f);
            done += Math.min(files.get(f).bytes, (from == null ? 0 : from) * (long) Capsule.CHUNK_BYTES);
        }
        bytesDone = done;
        byte[] buffer = new byte[MeshProtocol.DATA_PIECE_BYTES];
        for (int f = 0; f < files.size(); f++) {
            final Capsule.FileEntry entry = files.get(f);
            Integer resumeAt = resume.get(f);
            final int from = resumeAt == null ? 0 : resumeAt;
            if (from >= entry.chunks.size()) continue;
            if (stopped != null) return;
            ch.send(MeshMessage.file(f, from));
            if (entry.bytes == 0) continue;

            final String changed = entry.path + " changed on this computer after it was packed, so the transfer stopped. Send the folder again.";
            try (RandomAccessFile handle = folder.openRead(entry.path)) {
                if (handle.length() != entry.bytes) throw new SourceChanged(changed);
                Capsule.ChunkHasher hasher = new Capsule.ChunkHasher(new Capsule.ChunkListener() {
                    @Override
                    public void onChunk(Capsule.Chunk chunk) throws IOException {
                        int at = from + chunk.index;
                        Capsule.Chunk expected = at < entry.chunks.size() ? entry.chunks.get(at) : null;
                        if (expected == null || !expected.blake3.equals(chunk.blake3)) throw new SourceChanged(changed);
                    }
                });
                long offset = (long) from * Capsule.CHUNK_BYTES;
                handle.seek(offset);
                while (offset < entry.bytes) {
                    if (stopped != null) return;
                    int want = (int) Math.min(buffer.length, entry.bytes - offset);
                    int n = handle.read(buffer, 0, want);
                    if (n <= 0) throw new SourceChanged(changed);
                    hasher.update(buffer, 0, n);
                    if (filter != null) {
                        byte[] piece = filter.filter(f, offset, java.util.Arrays.copyOf(buffer, n));
                        ch.send(MeshMessage.data(), piece, 0, piece.length);
                    } else {
                        ch.send(MeshMessage.data(), buffer, 0, n);
                    }
                    offset += n;
                    bytesDone += n;
                    progress();
                }
                hasher.digest();
            } catch (SourceChanged e) {
                try {
                    ch.send(MeshMessage.error("source_changed", e.getMessage()));
                } catch (IOException ignored) {
                    // The connection may already be gone.
                }
                throw e;
            }
        }
    }

    private void progress() {
        long now = System.currentTimeMillis();
        if (now - lastProgress < 200) return;
        lastProgress = now;
        updatedAt = now;
        onUpdate.run();
    }

    /** Ends it in one step; the connection start() is making, if any, then closes without offering anything. */
    public void cancel() {
        SecureChannel ch;
        synchronized (this) {
            if (!set(TransferState.CANCELLED, "Cancelled. The other computer removes what it received.")) return;
            ch = channel;
        }
        if (ch != null) {
            try {
                ch.send(MeshMessage.cancel());
            } catch (IOException ignored) {
                // Already gone.
            }
            ch.close();
        }
    }
}
