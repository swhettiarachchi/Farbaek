package com.farbaek.mesh;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Before;
import org.junit.Test;

/** Discovery's limits: what anyone on the network can make it hold, sort and send, fed packets directly. */
public class DiscoveryTest {
    private Discovery d;
    private final AtomicInteger changes = new AtomicInteger();

    @Before
    public void setUp() {
        d = new Discovery(MeshProtocol.DISCOVERY_GROUP, 53_399, () -> new MeshProtocol.Announcement("here", "Me", "ffffffffffffffff", 0), changes::incrementAndGet);
        d.startForTest();
    }

    static String fp(int i) {
        return String.format(Locale.ROOT, "%016x", i);
    }

    static String announce(String kind, String name, String fingerprint, int port) {
        return new String(new MeshProtocol.Announcement(kind, name, fingerprint, port).encode(), StandardCharsets.UTF_8);
    }

    static List<String> fingerprints(List<Discovery.NearbyDevice> devices) {
        List<String> out = new ArrayList<>();
        for (Discovery.NearbyDevice n : devices) out.add(n.fingerprint);
        return out;
    }

    @Test
    public void listsAtMost64DevicesAndMakesRoomForANewcomer() {
        long now = System.currentTimeMillis();
        for (int i = 0; i < 100; i++) d.onMessage(announce("here", "Device " + i, fp(i), 40_000), "10.0.0." + i, now + i);
        assertEquals(Discovery.MAX_FOUND, d.size());
        List<String> listed = fingerprints(d.devices());
        // The devices heard from longest ago made room: a flood can't lock a real device out.
        assertFalse(listed.contains(fp(0)));
        assertFalse(listed.contains(fp(35)));
        assertTrue(listed.contains(fp(36)));
        assertTrue(listed.contains(fp(99)));
        // A device already listed updates without pushing anyone out.
        d.onMessage(announce("here", "Device 50", fp(50), 40_001), "10.0.0.50", now + 200);
        assertEquals(Discovery.MAX_FOUND, d.size());
        for (Discovery.NearbyDevice n : d.devices()) if (n.fingerprint.equals(fp(50))) assertEquals(40_001, n.port);
        assertTrue(fingerprints(d.devices()).contains(fp(36)));
    }

    @Test
    public void listsAtMostFourDevicesFromOneAddress() {
        long now = System.currentTimeMillis();
        for (int i = 0; i < 6; i++) d.onMessage(announce("here", "Same host " + i, fp(i), 40_000 + i), "10.0.1.1", now);
        assertEquals(Discovery.MAX_PER_ADDRESS, d.size());
        // Those four still update, and a device moving to that address doesn't get past the cap either.
        d.onMessage(announce("here", "Same host 0", fp(0), 41_000), "10.0.1.1", now);
        d.onMessage(announce("here", "Elsewhere", fp(100), 40_000), "10.0.1.2", now);
        d.onMessage(announce("here", "Elsewhere", fp(100), 40_000), "10.0.1.1", now + 1);
        List<Discovery.NearbyDevice> list = d.devices();
        assertEquals(Discovery.MAX_PER_ADDRESS + 1, list.size());
        for (Discovery.NearbyDevice n : list) {
            if (n.fingerprint.equals(fp(0))) assertEquals(41_000, n.port);
            if (n.fingerprint.equals(fp(100))) assertEquals("10.0.1.2", n.address);
        }
    }

    @Test
    public void readsOnlySoManyAnnouncementsFromOneAddressAndNoiseDoesntCount() {
        long now = System.currentTimeMillis();
        // Garbage first: it isn't an announcement, so it uses up nothing.
        for (int i = 0; i < 100; i++) d.onMessage(i % 2 == 0 ? "not json" : "{\"p\":\"farbaek-mesh/1\",\"kind\":\"here\"}", "10.0.1.1", now);
        // One device changing its port on every packet: only the first few in the window are read.
        for (int i = 0; i < 20; i++) d.onMessage(announce("here", "Chatty", fp(1), 40_000 + i), "10.0.1.1", now);
        assertEquals(1, d.size());
        assertEquals(40_000 + Discovery.PACKETS_PER_WINDOW - 1, d.devices().get(0).port);
        // The next window reads again; other addresses were never at risk.
        d.onMessage(announce("here", "Chatty", fp(1), 45_000), "10.0.1.1", now + Discovery.SOURCE_WINDOW_MS);
        assertEquals(45_000, d.devices().get(0).port);
        d.onMessage(announce("here", "Honest", fp(1000), 40_000), "10.0.1.2", now);
        assertTrue(fingerprints(d.devices()).contains(fp(1000)));
    }

    @Test
    public void answersWhoAtMostOnceASecondPerAddressAndFourTimesASecondInAll() {
        long now = System.currentTimeMillis();
        for (int i = 0; i < 5; i++) d.onMessage(announce("who", "Asker", fp(1), 0), "10.0.2.1", now);
        assertEquals(1, d.replies);
        d.onMessage(announce("who", "Other", fp(2), 0), "10.0.2.2", now + 300);
        assertEquals(2, d.replies);
        d.onMessage(announce("who", "Asker", fp(1), 0), "10.0.2.1", now + 500);
        assertEquals("the same address within a second", 2, d.replies);
        d.onMessage(announce("who", "Third", fp(3), 0), "10.0.2.3", now + 400);
        assertEquals("anyone within 250 ms of the last reply", 2, d.replies);
        d.onMessage(announce("who", "Asker", fp(1), 0), "10.0.2.1", now + 1_000);
        assertEquals(3, d.replies);
        // A "who" lists nothing.
        assertEquals(0, d.size());
    }

    @Test
    public void countsABoundedNumberOfAddressesAndForgetsThem() {
        long then = System.currentTimeMillis() - 5_000;
        for (int i = 0; i < 300; i++) d.onMessage(announce("here", "Device " + i, fp(i), 40_000), "10.1." + (i / 250) + "." + (i % 250), then);
        assertEquals(Discovery.MAX_SOURCES, d.sourcesCounted());
        assertEquals(Discovery.MAX_FOUND, d.size());
        d.expire();
        assertEquals("forgotten once they no longer limit anything", 0, d.sourcesCounted());
    }

    @Test
    public void sortsByNameOnlyWhenTheListChanges() {
        long now = System.currentTimeMillis();
        String[] names = {"b desk", "A phone", "c laptop"};
        for (int i = 0; i < names.length; i++) d.onMessage(announce("here", names[i], fp(i), 40_000), "10.0.3." + i, now);
        assertEquals(java.util.Arrays.asList(fp(1), fp(0), fp(2)), fingerprints(d.devices()));
        assertEquals(1, d.sorts);
        int changed = changes.get();
        // Each device announcing again, round after round: nothing listed changes, so nothing is sorted or reported.
        for (int round = 1; round <= 50; round++) {
            for (int i = 0; i < names.length; i++) d.onMessage(announce("here", names[i], fp(i), 40_000), "10.0.3." + i, now + round * Discovery.SOURCE_WINDOW_MS);
            d.devices();
        }
        assertEquals(1, d.sorts);
        assertEquals(changed, changes.get());
        // A new name is sorted once.
        d.onMessage(announce("here", "0 tablet", fp(0), 40_000), "10.0.3.0", now + 60 * Discovery.SOURCE_WINDOW_MS);
        assertEquals(java.util.Arrays.asList(fp(0), fp(1), fp(2)), fingerprints(d.devices()));
        d.devices();
        assertEquals(2, d.sorts);
    }

    /**
     * On Android, DatagramSocket.receive() holds the socket's own lock while it waits for a packet (Java 21's doesn't,
     * so the tests against Node never showed it). Sending mustn't take that lock: when it did, starting Nearby on a
     * quiet Wi-Fi waited for a packet that never came, holding the node's lock, and the screen stayed on "Starting
     * Nearby…" (the emulator launch check, run 21). This holds the socket's lock as receive() does and sends.
     */
    @Test
    public void sendingNeverWaitsForTheSocketsOwnLockAsAndroidsReceiveHoldsIt() throws Exception {
        Discovery real = new Discovery(MeshProtocol.DISCOVERY_GROUP, 53_398, () -> new MeshProtocol.Announcement("here", "Me", "eeeeeeeeeeeeeeee", 4242), () -> { });
        try {
            real.start();
        } catch (java.io.IOException e) {
            org.junit.Assume.assumeTrue("No multicast on this machine: " + e.getMessage(), false);
        }
        try {
            java.lang.reflect.Field field = Discovery.class.getDeclaredField("socket");
            field.setAccessible(true);
            final Object socket = field.get(real);
            final java.util.concurrent.CountDownLatch held = new java.util.concurrent.CountDownLatch(1);
            Thread receiving = new Thread(() -> {
                synchronized (socket) {
                    held.countDown();
                    try {
                        Thread.sleep(3_000);
                    } catch (InterruptedException ignored) {
                        // Done holding.
                    }
                }
            });
            receiving.start();
            held.await();
            long started = System.nanoTime();
            real.announce();
            long ms = (System.nanoTime() - started) / 1_000_000;
            receiving.interrupt();
            receiving.join();
            assertTrue("announcing waited " + ms + " ms for the socket's lock", ms < 1_000);
        } finally {
            real.stop();
        }
    }
}
