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
    public void listsAtMost64Devices() {
        long now = System.currentTimeMillis();
        for (int i = 0; i < 100; i++) d.onMessage(announce("here", "Device " + i, fp(i), 40_000), "10.0.0." + i, now);
        assertEquals(Discovery.MAX_FOUND, d.size());
        List<String> listed = fingerprints(d.devices());
        assertTrue(listed.contains(fp(0)));
        assertFalse("past the cap, newcomers wait for room", listed.contains(fp(99)));
        // A device already listed still updates.
        d.onMessage(announce("here", "Device 0", fp(0), 40_001), "10.0.0.0", now);
        for (Discovery.NearbyDevice n : d.devices()) if (n.fingerprint.equals(fp(0))) assertEquals(40_001, n.port);
    }

    @Test
    public void readsOnlySoManyPacketsFromOneAddress() {
        long now = System.currentTimeMillis();
        for (int i = 0; i < 20; i++) d.onMessage(announce("here", "Flood " + i, fp(i), 40_000), "10.0.1.1", now);
        assertEquals(Discovery.PACKETS_PER_WINDOW, d.size());
        // The next window reads some more; others were never at risk.
        for (int i = 20; i < 40; i++) d.onMessage(announce("here", "Flood " + i, fp(i), 40_000), "10.0.1.1", now + Discovery.SOURCE_WINDOW_MS);
        assertEquals(2 * Discovery.PACKETS_PER_WINDOW, d.size());
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
}
