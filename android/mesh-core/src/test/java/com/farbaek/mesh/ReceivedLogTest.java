package com.farbaek.mesh;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/** The phone's record of what arrived and how far each copy got (stage 188): carried on after a stop, never doubled. */
public class ReceivedLogTest {
    @Rule
    public final TemporaryFolder tmp = new TemporaryFolder();

    private static ReceivedLog.Entry entry(String id, ReceivedLog.State state) {
        List<ReceivedLog.FileRecord> files = new ArrayList<>();
        files.add(new ReceivedLog.FileRecord("IMG_1.jpg", 1200, "image/jpeg"));
        files.add(new ReceivedLog.FileRecord("sub/IMG_2.jpg", 800, "image/jpeg"));
        return new ReceivedLog.Entry(id, "Site photos", "DESKTOP-9OIQ8KS", 1_794_576_000_000L, SavePlan.Place.GALLERY, "Site photos", files, state);
    }

    @Test
    public void aCopysProgressSurvivesTheAppBeingStopped() throws Exception {
        File file = new File(tmp.getRoot(), "received.json");
        ReceivedLog log = new ReceivedLog(file);
        ReceivedLog.Entry e = entry("t1", ReceivedLog.State.SAVING);
        log.put(e);
        // The first file: its place recorded before a byte is copied, then published.
        e.files.get(0).uri = "content://media/external/images/media/41";
        log.update(e);
        e.files.get(0).published = true;
        e.files.get(0).shown = "IMG_1 (1).jpg";
        log.update(e);
        // The second: its place recorded, then the app was stopped mid-copy.
        e.files.get(1).uri = "content://media/external/images/media/42";
        log.update(e);

        ReceivedLog.Entry back = new ReceivedLog(file).get("t1");
        assertEquals(ReceivedLog.State.SAVING, back.state);
        assertTrue(back.files.get(0).published);
        assertEquals("IMG_1 (1).jpg", back.files.get(0).shown);
        // The half-made one is known by its place, so it's removed and made again, not doubled.
        assertFalse(back.files.get(1).published);
        assertEquals("content://media/external/images/media/42", back.files.get(1).uri);
        assertEquals("Gallery › Farbaek › Site photos", back.placeLabel());
        assertEquals(2000, back.bytes());
        assertEquals(Arrays.asList("IMG_1.jpg", "sub/IMG_2.jpg"), back.paths());
    }

    @Test
    public void newestFirstOneEntryPerTransferAndOnlyFinishedOnesDropOff() throws Exception {
        File file = new File(tmp.getRoot(), "received.json");
        ReceivedLog log = new ReceivedLog(file);
        log.put(entry("saving", ReceivedLog.State.SAVING));
        for (int i = 0; i < ReceivedLog.MAX + 5; i++) log.put(entry("t" + i, ReceivedLog.State.SAVED));
        List<ReceivedLog.Entry> listed = new ReceivedLog(file).list();
        assertEquals(ReceivedLog.MAX, listed.size());
        assertEquals("t" + (ReceivedLog.MAX + 4), listed.get(0).id);
        // The oldest that are finished dropped off; the one still saving stayed, though it's the oldest of all.
        assertTrue(listed.stream().anyMatch(x -> x.id.equals("saving")));
        assertNull(new ReceivedLog(file).get("t0"));
        // The same transfer again replaces its entry where it is.
        log.put(entry("t20", ReceivedLog.State.KEPT));
        ReceivedLog again = new ReceivedLog(file);
        assertEquals(ReceivedLog.MAX, again.list().size());
        assertEquals(ReceivedLog.State.KEPT, again.get("t20").state);
    }

    @Test
    public void aDamagedFileIsAnEmptyListAndABadEntryIsLeftOut() throws Exception {
        File damaged = new File(tmp.getRoot(), "damaged.json");
        Files.write(damaged.toPath(), "{not json".getBytes(StandardCharsets.UTF_8));
        assertTrue(new ReceivedLog(damaged).list().isEmpty());

        File mixed = new File(tmp.getRoot(), "mixed.json");
        ReceivedLog good = new ReceivedLog(mixed);
        good.put(entry("ok", ReceivedLog.State.SAVED));
        String text = new String(Files.readAllBytes(mixed.toPath()), StandardCharsets.UTF_8);
        String withBad = "[{\"id\":\"\"}," + text.substring(1, text.length() - 1) + ",{\"id\":\"x\",\"state\":\"LOST\"}]";
        Files.write(mixed.toPath(), withBad.getBytes(StandardCharsets.UTF_8));
        List<ReceivedLog.Entry> listed = new ReceivedLog(mixed).list();
        assertEquals(1, listed.size());
        assertEquals("ok", listed.get(0).id);
    }

    @Test
    public void anEntryTakenOffTheListIsntPutBackByTheSaver() throws Exception {
        File file = new File(tmp.getRoot(), "received.json");
        ReceivedLog log = new ReceivedLog(file);
        ReceivedLog.Entry e = entry("t1", ReceivedLog.State.SAVED);
        log.put(e);
        log.remove("t1");
        e.files.get(0).published = true;
        assertFalse(log.update(e));
        assertNull(new ReceivedLog(file).get("t1"));
    }

    @Test
    public void keptInNearbyHasNoPlaceAndRemovesById() throws Exception {
        File file = new File(tmp.getRoot(), "received.json");
        ReceivedLog log = new ReceivedLog(file);
        ReceivedLog.Entry kept = new ReceivedLog.Entry("k", "Brand kit", "Studio", 1L, null, "/data/user/0/com.farbaek.app/files/Nearby/Brand kit", new ArrayList<ReceivedLog.FileRecord>(), ReceivedLog.State.KEPT);
        kept.note = "Saving to Gallery and Downloads is off.";
        log.put(kept);
        ReceivedLog.Entry back = new ReceivedLog(file).get("k");
        assertNull(back.place);
        assertEquals("Nearby", back.placeLabel());
        assertEquals("Saving to Gallery and Downloads is off.", back.note);
        log.remove("k");
        log.remove("nope");
        assertNull(new ReceivedLog(file).get("k"));
    }
}
