package com.farbaek.mesh;

import com.farbaek.app.mesh.MeshActivity;

import java.util.Collections;
import java.util.List;

/**
 * Release builds have no sample screens: Nearby always draws the real node. The debug build's samples
 * (src/debug) exist only for the Android launch check's screenshots.
 */
public final class NearbySamples {
    private NearbySamples() {}

    public static boolean available() {
        return false;
    }

    public static MeshNode.Snapshot snapshot(String name) {
        return null;
    }

    public static List<MeshActivity.Received> received(String name) {
        return Collections.emptyList();
    }

    public static List<ReceivedLog.Entry> entries(String name) {
        return Collections.emptyList();
    }
}
