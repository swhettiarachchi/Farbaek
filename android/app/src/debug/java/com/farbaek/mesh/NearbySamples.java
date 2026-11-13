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
            // Stage 188: arrivals, from an offer that says where it will go to what's saved where people look.
            case "offer":
            case "kept":
                return snap(visible, list(desktopHere), list(desktop), null, list(
                        transfer("t1", "in", TransferState.OFFERED, "Site photos", 12, 48_200_000, 0, null)));
            case "saving":
                return snap(visible, list(desktopHere), list(desktop), null, list(
                        transfer("a1", "in", TransferState.DONE, "Site photos", 12, 48_200_000, 48_200_000, "/data/sample/Site photos")));
            case "arrived":
                return snap(visible, list(desktopHere), list(desktop), null, list(
                        transfer("a2", "in", TransferState.DONE, "Site photos", 6, 24_100_000, 24_100_000, "/data/sample/Site photos"),
                        transfer("a3", "in", TransferState.DONE, "Brand kit", 4, 3_900_000, 3_900_000, "/data/sample/Brand kit")));
            case "received":
                return snap(0, none, list(desktop), null, quiet);
            default:
                return null;
        }
    }

    /** The phone's record of arrivals for a sample: saving, saved where people look, kept in Nearby, or since deleted. */
    public static List<ReceivedLog.Entry> entries(String name) {
        long now = System.currentTimeMillis();
        switch (name) {
            case "saving": {
                ReceivedLog.Entry e = photos("a1", "Site photos", 12, now, ReceivedLog.State.SAVING);
                for (int i = 0; i < 5; i++) e.files.get(i).published = true;
                return list(e);
            }
            case "arrived":
                return list(photos("a2", "Site photos", 6, now, ReceivedLog.State.SAVED), brandKit("a3", now, ReceivedLog.State.SAVED));
            case "received": {
                ReceivedLog.Entry kept = brandKit("r3", now - 3 * 86_400_000L, ReceivedLog.State.KEPT);
                kept.note = "Saving to Gallery and Downloads is off, so it stays in Nearby.";
                kept.source = "/data/sample/Old notes";
                ReceivedLog.Entry gone = photos("r4", "Holiday", 2, now - 9 * 86_400_000L, ReceivedLog.State.SAVED);
                for (ReceivedLog.FileRecord f : gone.files) f.uri = "sample:gone";
                return list(photos("r1", "Site photos", 6, now - 20 * 60_000, ReceivedLog.State.SAVED), brandKit("r2", now - 26 * 3_600_000L, ReceivedLog.State.SAVED), kept, gone);
            }
            default:
                return Collections.emptyList();
        }
    }

    private static ReceivedLog.Entry photos(String id, String name, int count, long at, ReceivedLog.State state) {
        List<ReceivedLog.FileRecord> files = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            ReceivedLog.FileRecord f = new ReceivedLog.FileRecord("IMG_20" + (40 + i) + ".jpg", 4_000_000 + i * 17_000, "image/jpeg");
            f.uri = "sample:" + id + ":" + i;
            f.published = state == ReceivedLog.State.SAVED;
            f.shown = f.path;
            files.add(f);
        }
        ReceivedLog.Entry e = new ReceivedLog.Entry(id, name, DESKTOP, at, SavePlan.Place.GALLERY, name, files, state);
        e.notified = true;
        return e;
    }

    private static ReceivedLog.Entry brandKit(String id, long at, ReceivedLog.State state) {
        String[][] items = {{"Brand guide.pdf", "application/pdf", "2400000"}, {"logo.svg", "application/octet-stream", "18000"}, {"fonts/Display.woff2", "application/octet-stream", "96000"},
            {"readme.txt", "text/plain", "2100"}};
        List<ReceivedLog.FileRecord> files = new ArrayList<>();
        for (String[] it : items) {
            ReceivedLog.FileRecord f = new ReceivedLog.FileRecord(it[0], Long.parseLong(it[2]), it[1]);
            if (state == ReceivedLog.State.SAVED) {
                f.uri = "sample:" + id + ":" + it[0];
                f.published = true;
            }
            files.add(f);
        }
        ReceivedLog.Entry e = new ReceivedLog.Entry(id, "Brand kit", "Studio laptop", at, state == ReceivedLog.State.KEPT ? null : SavePlan.Place.DOWNLOADS,
                state == ReceivedLog.State.KEPT ? "/data/sample/Old notes" : "Brand kit", files, state);
        e.notified = true;
        return e;
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
