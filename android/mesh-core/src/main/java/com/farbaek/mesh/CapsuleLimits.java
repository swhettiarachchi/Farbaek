package com.farbaek.mesh;

/** How much a Capsule may hold. */
public final class CapsuleLimits {
    /** Most files. */
    public final int maxFiles;
    /** Largest single file. */
    public final long maxFileBytes;
    /** Most bytes across every file. */
    public final long maxTotalBytes;

    public CapsuleLimits(int maxFiles, long maxFileBytes, long maxTotalBytes) {
        this.maxFiles = maxFiles;
        this.maxFileBytes = maxFileBytes;
        this.maxTotalBytes = maxTotalBytes;
    }
}
