package com.farbaek.mesh;

import java.util.List;

/**
 * What a MeshNode tells the app. Every call comes from one of Mesh's own
 * threads: an Android service posts to its main thread before touching the
 * screen or the notification, and never blocks here.
 */
public interface MeshListener {
    /** Something changed; MeshNode.snapshot() has the whole picture. */
    void onChanged();

    /** A transfer changed state, or made progress (at most every 200 ms while bytes flow). */
    default void onTransfer(TransferView transfer) {}

    /** The pairing changed: a code to show, a confirmation, or how it ended. */
    default void onPairing(MeshNode.PairingView pairing) {}

    /** The devices discovery sees on the local network changed. */
    default void onNearby(List<Discovery.NearbyDevice> devices) {}

    /**
     * Something failed on one of Mesh's threads that the code didn't expect,
     * such as running out of memory or threads. Mesh caught it and carries
     * on; this is for logs. Never throws back into Mesh.
     */
    default void onBackgroundError(Throwable error) {}
}
