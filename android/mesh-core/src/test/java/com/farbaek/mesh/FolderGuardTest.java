package com.farbaek.mesh;

import static com.farbaek.mesh.Fixtures.javaNode;
import static com.farbaek.mesh.Fixtures.pairJava;
import static com.farbaek.mesh.Fixtures.waitFor;
import static com.farbaek.mesh.Text.u;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * The receive side's folder guard: every path in an offer is checked before
 * anything is written, nothing lands outside the folder made for the
 * transfer, and a hostile sender gets a refusal and an empty folder.
 */
public class FolderGuardTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private static final String H = "0000000000000000000000000000000000000000000000000000000000000000";

    static Capsule.FileEntry entry(String path) {
        return new Capsule.FileEntry(path, 1, H, Collections.singletonList(new Capsule.Chunk(0, 1, H)));
    }

    static Capsule.Manifest manifest(String... paths) {
        List<Capsule.FileEntry> files = new ArrayList<>();
        for (String p : paths) files.add(entry(p));
        return new Capsule.Manifest(Capsule.CAPSULE_FORMAT, "00000000-0000-4000-8000-000000000001", "2026-11-12T09:30:00.000Z", null, "x", null, files,
                Collections.<Capsule.Excluded>emptyList(), files.size(), files.size());
    }

    /** What the receiver says about these paths: the shared checks, then its own. */
    static String problems(String... paths) {
        Capsule.Manifest m = manifest(paths);
        List<String> problems = Capsule.checkManifest(m, MeshProtocol.TRANSFER_LIMITS, true);
        if (problems.isEmpty()) problems = Capsule.checkReceivePaths(m);
        return String.join(" | ", problems);
    }

    static void assertRefused(String why, String... paths) {
        String found = problems(paths);
        assertTrue(Arrays.toString(paths) + " should be refused (" + why + ")", !found.isEmpty());
        assertTrue(Arrays.toString(paths) + ": expected " + why + ", got " + found, found.contains(why));
    }

    @Test
    public void refusesTraversalAbsoluteAndDiskTricks() {
        assertRefused("\".\" or \"..\"", "../outside.txt");
        assertRefused("\".\" or \"..\"", "a/../../outside.txt");
        assertRefused("\".\" or \"..\"", "a/./b.txt");
        assertRefused("relative to the project root", "/etc/passwd");
        assertRefused("Windows doesn't allow", "C:/Windows/win.ini");
        assertRefused("Windows doesn't allow", "notes.txt:hidden");
        assertRefused("backslash", u("..%B..%Boutside.txt"));
        assertRefused("backslash", u("a%u0000b.txt"));
        assertRefused("backslash", "a\nb.txt");
        assertRefused("reserved device name", "docs/con.txt");
        assertRefused("reserved device name", "LPT1");
        assertRefused("reserved device name", u("com%u00b9.txt"));
        assertRefused("ends with a dot or a space", "secret.");
        assertRefused("ends with a dot or a space", "folder /x.txt");
        assertRefused("short 8.3 name", "ENVLOC~1/x.txt");
        assertRefused("empty folder name", "a//b.txt");
        assertRefused("plain form", "./a.txt");
        StringBuilder deep = new StringBuilder();
        for (int i = 0; i < 25; i++) deep.append("d/");
        assertRefused("folders deep", deep + "x.txt");
        StringBuilder longName = new StringBuilder();
        for (int i = 0; i < 121; i++) longName.append('n');
        assertRefused("longer than 120", longName.toString());
    }

    @Test
    public void refusesCaseAndUnicodeTricks() {
        assertRefused("differ only in capital letters", "a.txt", "A.txt");
        // The Kelvin sign lowercases to k, so a case-insensitive disk could treat these as one name.
        assertRefused("differ only in capital letters", u("%u212a.txt"), "k.txt");
        assertRefused("listed twice", "same.txt", "same.txt");
        // The same name in decomposed form (e + combining acute) isn't accepted.
        assertRefused("NFC", u("cafe%u0301.txt"));
        assertRefused("differ only in capital letters", "Src/a.txt", "src/b.txt");
        assertRefused("needs a folder there", "a", "a/b.txt");
        assertRefused("needs a folder there", "A", "a/b.txt");
        assertRefused("kept for Farbaek's own use", ".farbaek-incoming/x/0.part");
        assertRefused("kept for Farbaek's own use", ".FARBAEK-x/y.txt");
    }

    @Test
    public void refusesWhatMustNeverTravel() {
        assertRefused("credentials files can't be in a Capsule", ".env");
        assertRefused("credentials files can't be in a Capsule", "deploy/id_ed25519");
        assertRefused("credentials files can't be in a Capsule", "certs/server.PEM");
        assertRefused("dependency and build files can't be in a Capsule", "node_modules/x/index.js");
        assertRefused("dependency and build files can't be in a Capsule", ".GIT/config");
        assertRefused("dependency and build files can't be in a Capsule", "Thumbs.db");
    }

    @Test
    public void acceptsOrdinaryNames() {
        assertEquals("", problems("README.md", "src/app.ts", u("docs/caf%u00e9.md"), ".env.example", "deploy/id_ed25519.pub", u("%uff0e%uff0e/fullwidth dots are a name.txt"), "a b/c-d_e.f"));
    }

    @Test
    public void theFolderRefusesPathsOutsideItAndNeverReplacesAFile() throws Exception {
        File root = tmp.newFolder("dest");
        GuardedFolder folder = GuardedFolder.open(root);
        for (String bad : new String[] {"../x.txt", "/x.txt", "C:/x.txt", u("..%Bx.txt"), "a/../../x.txt", "nul"}) {
            try {
                folder.createNew(bad).close();
                fail("should refuse " + bad);
            } catch (GuardedFolder.GuardException e) {
                assertEquals(bad, "INVALID_PATH", e.code);
            }
        }
        try (RandomAccessFile f = folder.createNew("a/b.txt")) {
            f.write(1);
        }
        try {
            folder.createNew("a/b.txt").close();
            fail("should refuse an existing file");
        } catch (GuardedFolder.GuardException e) {
            assertEquals("CHANGED", e.code);
        }
        try (RandomAccessFile f = folder.createNew("c.txt")) {
            f.write(2);
        }
        try {
            folder.moveNew("c.txt", "a/b.txt");
            fail("should refuse to move over a file");
        } catch (GuardedFolder.GuardException e) {
            assertEquals("CHANGED", e.code);
        }
        try {
            folder.createNew("a/b.txt/c.txt").close();
            fail("should refuse a file used as a folder");
        } catch (GuardedFolder.GuardException e) {
            assertEquals("NOT_A_FOLDER", e.code);
        }
        assertArrayEquals(new byte[] {1}, Fixtures.read(new File(root, "a/b.txt")));
        assertEquals(1, Fixtures.listCount(tmp.getRoot()));
    }

    /** What the Android app supplies with Os.lstat, built here from java.nio (test code only): links, junctions and hard links. */
    static final GuardedFolder.FileProbe LSTAT = new GuardedFolder.FileProbe() {
        @Override
        public boolean isLink(File file) throws IOException {
            java.nio.file.Path p = file.toPath();
            if (!java.nio.file.Files.exists(p, java.nio.file.LinkOption.NOFOLLOW_LINKS)) return false;
            java.nio.file.attribute.BasicFileAttributes a = java.nio.file.Files.readAttributes(p, java.nio.file.attribute.BasicFileAttributes.class, java.nio.file.LinkOption.NOFOLLOW_LINKS);
            // A Windows junction is a reparse point: "other", not a symbolic link.
            return a.isSymbolicLink() || a.isOther();
        }

        @Override
        public long linkCount(File file) {
            try {
                return ((Number) java.nio.file.Files.getAttribute(file.toPath(), "unix:nlink", java.nio.file.LinkOption.NOFOLLOW_LINKS)).longValue();
            } catch (IOException | UnsupportedOperationException | IllegalArgumentException e) {
                return 1;
            }
        }
    };

    /** A symbolic link where the machine allows one, otherwise a Windows junction (no privilege needed). */
    private static String plantLink(File link, File target) {
        try {
            java.nio.file.Files.createSymbolicLink(link.toPath(), target.toPath());
            return "symbolic link";
        } catch (IOException | UnsupportedOperationException | SecurityException e) {
            // Try a junction next.
        }
        if (File.separatorChar == '\\') {
            try {
                Process p = new ProcessBuilder("cmd", "/c", "mklink", "/J", link.getPath(), target.getPath()).redirectErrorStream(true).start();
                if (p.waitFor() == 0 && link.isDirectory()) return "junction";
            } catch (IOException e) {
                // No junction either.
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        return null;
    }

    @Test
    public void refusesToWriteThroughALink() throws Exception {
        File root = tmp.newFolder("dest-link");
        File outside = tmp.newFolder("outside");
        File evil = new File(root, "evil");
        String kind = plantLink(evil, outside);
        Assume.assumeTrue("This machine lets a test make neither a symbolic link nor a junction.", kind != null);
        for (String rel : new String[] {"evil/x.txt", "evil/deeper/x.txt"}) {
            try {
                GuardedFolder.open(root, LSTAT).createNew(rel).close();
                fail("should refuse to write through a " + kind);
            } catch (GuardedFolder.GuardException e) {
                assertEquals(kind, "LINK", e.code);
            }
        }
        try {
            GuardedFolder.open(root, LSTAT).openRead("evil/anything").close();
            fail("should refuse to read through a " + kind);
        } catch (GuardedFolder.GuardException e) {
            assertEquals(kind, "LINK", e.code);
        }
        // Where canonical paths resolve links (Linux, so Android), the java.io-only probe refuses it too.
        boolean resolves = !evil.getCanonicalFile().equals(new File(root.getCanonicalFile(), "evil"));
        if (resolves) {
            try {
                GuardedFolder.open(root).createNew("evil/x.txt").close();
                fail("the java.io probe should refuse a " + kind);
            } catch (GuardedFolder.GuardException e) {
                assertEquals("LINK", e.code);
            }
        }
        assertEquals(0, Fixtures.listCount(outside));
        // Removing the transfer's folder removes the link, never what it points to.
        Fixtures.write(new File(outside, "keep.txt"), "keep");
        GuardedFolder.removeTree(root, LSTAT);
        assertTrue(new File(outside, "keep.txt").isFile());
    }

    @Test
    public void usesTheAppsProbeForLinksAndHardLinks() throws Exception {
        File root = tmp.newFolder("probe");
        Fixtures.write(new File(root, "shared.bin"), new byte[] {1});
        Fixtures.write(new File(root, "dir/x.txt"), "x");
        GuardedFolder.FileProbe android = new GuardedFolder.FileProbe() {
            @Override
            public boolean isLink(File file) {
                return file.getName().equals("dir");
            }

            @Override
            public long linkCount(File file) {
                return file.getName().equals("shared.bin") ? 2 : 1;
            }
        };
        GuardedFolder folder = GuardedFolder.open(root, android);
        try {
            folder.openRead("shared.bin").close();
            fail("should refuse a file with another hard link");
        } catch (GuardedFolder.GuardException e) {
            assertEquals("LINK", e.code);
        }
        try {
            folder.openRead("dir/x.txt").close();
            fail("should refuse a path through a link");
        } catch (GuardedFolder.GuardException e) {
            assertEquals("LINK", e.code);
        }
    }

    @Test
    public void namesTheNewFolderSafely() {
        assertEquals("Harbour Lane", IncomingTransfer.folderName("Harbour Lane"));
        assertEquals("a-b-c", IncomingTransfer.folderName("a/b\\c"));
        assertEquals("x", IncomingTransfer.folderName("x. . "));
        assertEquals("Farbaek transfer", IncomingTransfer.folderName(".."));
        assertEquals("Farbaek transfer", IncomingTransfer.folderName("CON"));
        assertEquals("Farbaek transfer", IncomingTransfer.folderName("   "));
    }

    /** A paired Java sender offers manifests that try to escape; the Java receiver refuses each and writes nothing. */
    @Test
    public void aHostileOfferIsRefusedAndNothingIsWritten() throws Exception {
        MeshNode a = javaNode("Sender", tmp.newFolder("data-a"), null);
        MeshNode b = javaNode("Receiver", tmp.newFolder("data-b"), null);
        try {
            pairJava(a, b);
            File src = tmp.newFolder("src");
            Fixtures.sourceFolder(src, 1);
            for (String evil : new String[] {"../escaped.md", "C:/escaped.md", ".farbaek-incoming/x/0.part", "docs/aux.md", u("caf%u0065%u0301.md")}) {
                Packer.PackedFolder packed = Packer.packFolder(src);
                List<Capsule.FileEntry> files = new ArrayList<>(packed.manifest.files);
                files.set(0, files.get(0).withPath(evil));
                Capsule.Manifest m = packed.manifest.withFiles(files);
                String preparedId = a.prepareRaw(new Packer.PackedFolder(packed.root, packed.name, m, Capsule.manifestDigest(m)));
                final String outId = a.send(preparedId, b.fingerprint(), new InetSocketAddress("127.0.0.1", b.port()));
                waitFor("the refusal", 20_000, () -> a.snapshot().transfer(outId).state == TransferState.FAILED);
                assertTrue(a.snapshot().transfer(outId).message, a.snapshot().transfer(outId).message.contains("can't be accepted"));
            }
            assertEquals(0, b.snapshot().transfers.size());
            assertFalse(new File(tmp.getRoot(), "escaped.md").exists());
        } finally {
            a.close();
            b.close();
        }
    }

    /** Two Java devices, end to end: delivered and checked; a changed chunk refused and removed. */
    @Test
    public void javaToJavaDeliversAndRefusesATamperedChunk() throws Exception {
        final boolean[] tamper = {false};
        MeshNode a = javaNode("Sender", tmp.newFolder("data-a2"), new OutgoingTransfer.PieceFilter() {
            private boolean done;

            @Override
            public byte[] filter(int file, long offset, byte[] piece) {
                if (tamper[0] && !done && piece.length > 30_000) {
                    done = true;
                    piece[10] ^= (byte) 0xff;
                }
                return piece;
            }
        });
        final List<TransferView> heard = new java.util.concurrent.CopyOnWriteArrayList<>();
        final MeshNode b = Fixtures.javaNode("Receiver", tmp.newFolder("data-b2"), null, new MeshListener() {
            @Override
            public void onChanged() {}

            @Override
            public void onTransfer(TransferView transfer) {
                heard.add(transfer);
            }
        });
        try {
            pairJava(a, b);
            File src = tmp.newFolder("src2");
            byte[] big = Fixtures.sourceFolder(src, 2);
            File parent = tmp.newFolder("dest2");
            final String outId = a.send(a.prepare(src).id, b.fingerprint(), new InetSocketAddress("127.0.0.1", b.port()));
            waitFor("the offer", 20_000, () -> b.snapshot().transfers.size() == 1 && b.snapshot().transfers.get(0).state == TransferState.OFFERED);
            final String inId = b.snapshot().transfers.get(0).id;
            assertEquals(4, b.snapshot().transfers.get(0).files);
            b.accept(inId, parent, null);
            waitFor("delivery", 60_000, () -> a.snapshot().transfer(outId).state == TransferState.DONE && b.snapshot().transfer(inId).state == TransferState.DONE);
            File dest = new File(b.snapshot().transfer(inId).destination);
            assertArrayEquals(big, Fixtures.read(new File(dest, "assets/big.bin")));
            assertEquals("export const answer = 42;\n", Fixtures.readText(new File(dest, "src/app.ts")));
            assertEquals(0, new File(dest, "src/empty.txt").length());
            assertFalse(new File(dest, ".env").exists());
            assertFalse(new File(dest, "src/keys.ts").exists());
            assertFalse(new File(dest, ".farbaek-incoming").exists());
            String[] names = dest.list();
            Arrays.sort(names);
            assertArrayEquals(new String[] {"README.md", "assets", "src"}, names);
            // The listener heard progress while bytes flowed, then the verdict.
            boolean progress = false;
            for (TransferView t : heard) if (t.id.equals(inId) && t.state == TransferState.RECEIVING && t.bytesDone > 0 && t.bytesDone < t.bytes) progress = true;
            assertTrue("progress was reported", progress);
            TransferView last = null;
            for (TransferView t : heard) if (t.id.equals(inId)) last = t;
            assertEquals(TransferState.DONE, last.state);

            tamper[0] = true;
            File parent2 = tmp.newFolder("dest3");
            final String outId2 = a.send(a.prepare(src).id, b.fingerprint(), new InetSocketAddress("127.0.0.1", b.port()));
            waitFor("the second offer", 20_000, () -> b.snapshot().transfers.size() == 2);
            String inId2 = null;
            for (TransferView t : b.snapshot().transfers) if (t.state == TransferState.OFFERED) inId2 = t.id;
            final String in2 = inId2;
            b.accept(in2, parent2, null);
            waitFor("the refusal", 60_000, () -> a.snapshot().transfer(outId2).state == TransferState.FAILED && b.snapshot().transfer(in2).state == TransferState.FAILED);
            assertTrue(b.snapshot().transfer(in2).message, b.snapshot().transfer(in2).message.contains("didn't match its hash at chunk 1"));
            assertTrue(a.snapshot().transfer(outId2).message, a.snapshot().transfer(outId2).message.contains("didn't match its hash"));
            assertEquals(0, Fixtures.listCount(parent2));
        } finally {
            a.close();
            b.close();
        }
    }
}
