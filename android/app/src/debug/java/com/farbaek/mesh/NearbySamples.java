package com.farbaek.mesh;

import com.farbaek.app.mesh.MeshActivity;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Debug builds only: Nearby's screen in each of its states, drawn from made-up snapshots, so the Android launch
 * check can screenshot every state on an emulator with no computer to pair with. Opened with
 * `am start -n com.farbaek.app/.mesh.MeshActivity --es sample <name>`. Release builds have a stub that offers none
 * (src/release), so nothing here reaches Google Play. It sits in the mesh core's package to reach its views'
 * constructors, which the core keeps to itself.
 */
public final class NearbySamples {
    private NearbySamples() {}

    public static boolean available() {
        return true;
    }

    private static final String PHONE = "Redmi A5";
    private static final String PHONE_KEY = "0f05804327c028ba9d41e6b3a0c75f12";
    private static final String DESKTOP = "DESKTOP-9OIQ8KS";
    private static final String DESKTOP_KEY = "7a3c19e04bd25f86c1e0a94d3b7f2c58";
    private static final String LAPTOP = "Studio laptop";
    private static final String LAPTOP_KEY = "c41d7e09a2b85f3361d0e8a74f9b2c05";

    /** The snapshot for a sample's name, or null for a name it doesn't know. */
    public static MeshNode.Snapshot snapshot(String name) {
        long now = System.currentTimeMillis();
        long visible = now + 4 * 60_000;
        Discovery.NearbyDevice desktopHere = new Discovery.NearbyDevice(DESKTOP, DESKTOP_KEY, "192.168.1.20", 53367, now);
        Discovery.NearbyDevice laptopHere = new Discovery.NearbyDevice(LAPTOP, LAPTOP_KEY, "192.168.1.31", 53367, now);
        TrustStore.TrustedDevice desktop = new TrustStore.TrustedDevice(DESKTOP_KEY, DESKTOP, "", "2026-11-13T12:08:00Z", "nearby");
        List<Discovery.NearbyDevice> none = Collections.emptyList();
        List<TrustStore.TrustedDevice> nobody = Collections.emptyList();
        List<TransferView> quiet = Collections.emptyList();
        switch (name) {
            case "empty":
                return snap(0, none, nobody, null, quiet);
            case "found":
                return snap(0, list(desktopHere), nobody, null, quiet);
            case "confirming":
                return snap(0, list(desktopHere), nobody, pairing("confirming", "012256", null), quiet);
            case "waiting":
                return snap(0, list(desktopHere), nobody, pairing("waiting", "012256", null), quiet);
            case "paired":
                return snap(visible, list(desktopHere), list(desktop), pairing("paired", "012256", "Paired with " + DESKTOP + "."), quiet);
            case "ready":
                return snap(visible, list(desktopHere, laptopHere), list(desktop), null, quiet);
            case "away":
                return snap(0, none, list(desktop), null, quiet);
            case "transfers":
                return snap(visible, list(desktopHere), list(desktop), null, list(
                        transfer("t1", "in", TransferState.OFFERED, "Site photos", 12, 48_200_000, 0, null),
                        transfer("t2", "out", TransferState.SENDING, "From Redmi A5 13 Nov 17.38", 3, 9_400_000, 5_900_000, null),
                        transfer("t3", "out", TransferState.WAITING, "From Redmi A5 13 Nov 17.31", 1, 3_400_000, 0, null)));
            case "done":
                return snap(visible, list(desktopHere), list(desktop), null, list(
                        transfer("t4", "out", TransferState.DONE, "From Redmi A5 13 Nov 17.38", 1, 3_400_000, 3_400_000, "Delivered."),
                        transfer("t5", "in", TransferState.DONE, "Brand kit", 6, 21_700_000, 21_700_000, "/data/sample/Brand kit"),
                        transfer("t6", "out", TransferState.INTERRUPTED, "From Redmi A5 13 Nov 17.02", 4, 12_000_000, 4_100_000, null)));
            default:
                return null;
        }
    }

    /** The Received card's folders for a sample. */
    public static List<MeshActivity.Received> received(String name) {
        if (!"ready".equals(name) && !"done".equals(name)) return Collections.emptyList();
        long now = System.currentTimeMillis();
        return list(
                new MeshActivity.Received("Brand kit", 6, 21_700_000, now - 6 * 60_000, new File("/data/sample/Brand kit")),
                new MeshActivity.Received("Site photos", 12, 48_200_000, now - 26 * 3_600_000L, new File("/data/sample/Site photos")));
    }

    private static MeshNode.Snapshot snap(long visibleUntil, List<Discovery.NearbyDevice> nearby, List<TrustStore.TrustedDevice> devices, MeshNode.PairingView pairing,
            List<TransferView> transfers) {
        return new MeshNode.Snapshot(PHONE, PHONE_KEY, visibleUntil, visibleUntil > 0 ? 53367 : 0, list("192.168.1.42"), true, nearby, devices, pairing,
                Collections.emptyList(), transfers);
    }

    private static MeshNode.PairingView pairing(String state, String code, String message) {
        return new MeshNode.PairingView("p1", "responder", DESKTOP, DESKTOP_KEY, code, state, System.currentTimeMillis() + 120_000, message);
    }

    private static TransferView transfer(String id, String direction, TransferState state, String name, long files, long bytes, long done, String destinationOrMessage) {
        boolean in = "in".equals(direction);
        String destination = in && state == TransferState.DONE ? destinationOrMessage : null;
        String message = in ? null : destinationOrMessage;
        return new TransferView(id, direction, state, DESKTOP, DESKTOP_KEY, name, files, bytes, done, new ArrayList<>(), 0, 0, 0, destination, message, System.currentTimeMillis());
    }

    @SafeVarargs
    private static <T> List<T> list(T... items) {
        return new ArrayList<>(Arrays.asList(items));
    }
}
