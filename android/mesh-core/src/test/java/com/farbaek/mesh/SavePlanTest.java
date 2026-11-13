package com.farbaek.mesh;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;

import org.junit.Test;

/** Where received files go on a phone, and the words for it (stage 188, ADR 0196). */
public class SavePlanTest {
    @Test
    public void aTransferGoesToOnePlaceSoAFolderStaysWhole() {
        assertEquals(SavePlan.Place.GALLERY, SavePlan.placeFor(Arrays.asList("IMG_1.JPG", "clip.mp4", "b/IMG_2.heic")));
        assertEquals(SavePlan.Place.DOWNLOADS, SavePlan.placeFor(Arrays.asList("IMG_1.jpg", "notes.pdf")));
        assertEquals(SavePlan.Place.DOWNLOADS, SavePlan.placeFor(Arrays.asList("brand/logo.svg")));
        assertEquals(SavePlan.Place.DOWNLOADS, SavePlan.placeFor(Collections.<String>emptyList()));
    }

    @Test
    public void namesCantDisguiseThemselvesOrReadAsAPath() {
        assertEquals("invoicefdp.exe", SavePlan.display("invoice‮fdp.exe"));
        assertEquals("exe", SavePlan.extension("invoice‮fdp.exe"));
        assertFalse(SavePlan.canOpen("invoice‮fdp.exe"));
        assertEquals("a_b_c", SavePlan.clean("a/b\\c", "x"));
        assertEquals("hidden", SavePlan.clean("..hidden.", "x"));
        assertEquals("x", SavePlan.clean("‮​", "x"));
        assertEquals("x", SavePlan.clean("...", "x"));
    }

    @Test
    public void onlyKindsThatOpenInAViewerOpenWithATap() {
        for (String name : new String[] {"a.jpg", "a.PNG", "clip.mov", "song.m4a", "doc.pdf", "notes.txt"}) assertTrue(name, SavePlan.canOpen(name));
        for (String name : new String[] {"app.apk", "setup.exe", "page.html", "logo.svg", "script.js", "README", "archive.zip"}) assertFalse(name, SavePlan.canOpen(name));
        assertEquals("image/jpeg", SavePlan.mime("A.JPEG"));
        assertEquals("application/octet-stream", SavePlan.mime("app.apk"));
    }

    @Test
    public void foldersAreMadeUniqueAndPathsKeepTheirSubfolders() {
        assertEquals("Site photos", SavePlan.uniqueFolder("Site photos", new HashSet<String>()));
        assertEquals("Site photos (3)", SavePlan.uniqueFolder("Site photos", new HashSet<>(Arrays.asList("site photos", "Site photos (2)"))));
        assertEquals("Pictures/Farbaek/Site photos/", SavePlan.relativeDir(SavePlan.Place.GALLERY, "Site photos", "IMG_1.jpg"));
        assertEquals("Download/Farbaek/Brand kit/fonts/web/", SavePlan.relativeDir(SavePlan.Place.DOWNLOADS, "Brand kit", "fonts/web/a.woff2"));
        assertEquals("Download/Farbaek/Kit/a/", SavePlan.relativeDir(SavePlan.Place.DOWNLOADS, "Kit", "../a/./x.txt"));
        assertEquals("DCIM/Farbaek/Trip/", SavePlan.relativeDir("DCIM/Farbaek/", "Trip", "clip.mp4"));
        assertEquals("a.woff2", SavePlan.fileName("fonts/web/a.woff2", 1));
        assertEquals("file-3", SavePlan.fileName("fonts/", 3));
    }

    @Test
    public void saysWhatArrivedAndWhereAsAPersonWould() {
        assertEquals("1 photo", SavePlan.summary(Collections.singletonList("a.jpg"), 1));
        assertEquals("3 photos", SavePlan.summary(Arrays.asList("a.jpg", "b.png", "c.heic"), 3));
        assertEquals("1 photo, 1 video and 2 files", SavePlan.summary(Arrays.asList("a.jpg", "b.mp4", "c.pdf", "d.zip"), 4));
        assertEquals("1,200 files", SavePlan.summary(Collections.singletonList("a.jpg"), 1200));
        assertEquals("Gallery › Farbaek › Site photos", SavePlan.placeLabel(SavePlan.Place.GALLERY, "Site photos"));
        assertEquals("Photo from DESKTOP-9OIQ8KS arrived", SavePlan.arrivalTitle("DESKTOP-9OIQ8KS", Collections.singletonList("Screenshot.png"), 1));
        assertEquals("3 photos from Studio arrived", SavePlan.arrivalTitle("Studio", Arrays.asList("a.jpg", "b.jpg", "c.jpg"), 3));
        assertEquals("File from Studio arrived", SavePlan.arrivalTitle("Studio", Collections.singletonList("deck.pdf"), 1));
        assertEquals("Evilname wants to send Kit", SavePlan.offerTitle("Evil‮name", "Kit"));
        assertFalse(SavePlan.arrivalTitle("A", Collections.singletonList("a.jpg"), 1).contains("—"));
    }
}
