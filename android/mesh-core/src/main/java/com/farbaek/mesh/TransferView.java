package com.farbaek.mesh;

import java.util.Collections;
import java.util.List;

/** A snapshot of one transfer, for the screen and the foreground notification. */
public final class TransferView {
    public final String id;
    /** "in" or "out". */
    public final String direction;
    public final TransferState state;
    public final String peerName;
    public final String peerFingerprint;
    /** The folder's name. */
    public final String name;
    public final long files;
    public final long bytes;
    public final long bytesDone;
    /** The first 50 files left out, with their reasons. */
    public final List<Capsule.Excluded> excluded;
    public final int excludedCount;
    /** Incoming only: files and bytes copied from an earlier copy on this device instead of sent. */
    public final long reusedFiles;
    public final long reusedBytes;
    /** Incoming only: the folder made for it, once accepted. */
    public final String destination;
    /** What happened, in words, or null. */
    public final String message;
    /** Milliseconds since the epoch. */
    public final long updatedAt;

    TransferView(String id, String direction, TransferState state, String peerName, String peerFingerprint, String name, long files, long bytes, long bytesDone,
            List<Capsule.Excluded> excluded, int excludedCount, long reusedFiles, long reusedBytes, String destination, String message, long updatedAt) {
        this.id = id;
        this.direction = direction;
        this.state = state;
        this.peerName = peerName;
        this.peerFingerprint = peerFingerprint;
        this.name = name;
        this.files = files;
        this.bytes = bytes;
        this.bytesDone = bytesDone;
        this.excluded = Collections.unmodifiableList(excluded);
        this.excludedCount = excludedCount;
        this.reusedFiles = reusedFiles;
        this.reusedBytes = reusedBytes;
        this.destination = destination;
        this.message = message;
        this.updatedAt = updatedAt;
    }
}
