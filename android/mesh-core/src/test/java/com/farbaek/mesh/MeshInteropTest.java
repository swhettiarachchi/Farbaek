package com.farbaek.mesh;

import static com.farbaek.mesh.Fixtures.waitFor;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.AfterClass;
import org.junit.Assume;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.ClassRule;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runners.MethodSorters;

/**
 * The Java core against the desktop agent's real Mesh in Node
 * (src/agent-runtime/mesh/node.ts, run by scripts/mesh/node-peer.mjs), over
 * TCP on 127.0.0.1, both directions: pairing v2 (both screens show the same
 * code only if both sides make the commit, nonce and reveal byte for byte
 * alike), files (one binary, over two chunks), a real dropped connection and
 * its resume, a changed chunk, a hostile manifest, and updating an earlier
 * copy. Skipped, not passed, when Node or the repository's node_modules
 * aren't there. FARBAEK_MESH_SOURCE points it at another checkout's
 * TypeScript (a worktree), still built with this repository's node_modules.
 */
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class MeshInteropTest {
    @ClassRule
    public static TemporaryFolder tmp = new TemporaryFolder();

    private static NodePeer node;
    private static MeshNode java;
    private static int nodePort;
    private static final AtomicBoolean tamperNext = new AtomicBoolean();
    private static File b1Source;
    private static File b1Destination;
    private static byte[] b1Big;
    private static File b2Source;
    private static String b2NodeDestination;
    private static byte[] b2Big;

    @BeforeClass
    public static void start() throws Exception {
        NodePeer.repo();
        NodePeer.node();
        node = new NodePeer("Desk (Node)", tmp.newFolder("node-data"), tmp.newFile("node-peer.log"));
        nodePort = ((Long) Json.asObject(node.call("visible", "on", true)).get("port")).intValue();
        java = Fixtures.javaNode("Phone (Java)", tmp.newFolder("java-data"), new OutgoingTransfer.PieceFilter() {
            @Override
            public byte[] filter(int file, long offset, byte[] piece) {
                if (piece.length > 30_000 && tamperNext.compareAndSet(true, false)) piece[10] ^= (byte) 0xff;
                return piece;
            }
        });
        java.setVisible(true);
    }

    @AfterClass
    public static void stop() {
        if (java != null) java.close();
        if (node != null) node.close();
    }

    @Before
    public void setUp() {
        Assume.assumeTrue("The Node peer didn't start.", node != null && java != null);
        // Not skipped: a desktop agent that can't pair with this core is a failure to see.
        assertTrue("The TypeScript Mesh at " + NodePeer.source() + " doesn't make pairing v2's messages (pair-commit) yet, so it can't pair with this core."
                + " Set FARBAEK_MESH_SOURCE to a checkout that does.", NodePeer.speaksPairingV2());
    }

    private static Map<String, Object> nodePairing() throws Exception {
        return Json.asObject(node.snapshot().get("pairing"));
    }

    private static List<String> nodeDeviceFingerprints() throws Exception {
        List<String> out = new ArrayList<>();
        for (Object d : Json.asArray(node.snapshot().get("devices"))) out.add((String) Json.asObject(d).get("fingerprint"));
        return out;
    }

    private static boolean paired() throws Exception {
        return java.devices().size() > 0 && java.devices().get(0).fingerprint.equals(node.fingerprint) && nodeDeviceFingerprints().contains(java.fingerprint());
    }

    private static void finishPairing() throws Exception {
        String javaCode = java.snapshot().pairing.code;
        String nodeCode = (String) nodePairing().get("code");
        assertTrue(javaCode.matches("[0-9]{6}"));
        assertEquals("Both screens show the same code", nodeCode, javaCode);
        java.confirmPairing(java.snapshot().pairing.id, true);
        node.call("confirm", "ok", true);
        waitFor("both paired", 15_000, () -> "paired".equals(java.snapshot().pairing.state) && "paired".equals(nodePairing().get("state")));
        assertTrue(paired());
        java.dismissPairing();
        node.call("dismissPairing");
    }

    private static TransferView javaTransfer(String id) {
        return java.snapshot().transfer(id);
    }

    private static String offeredOnJava(final int before) throws Exception {
        waitFor("the offer on the phone", 30_000, () -> java.snapshot().transfers.size() > before && newestJava(TransferState.OFFERED) != null);
        return newestJava(TransferState.OFFERED);
    }

    private static String newestJava(TransferState state) {
        for (TransferView t : java.snapshot().transfers) if (t.state == state && t.direction.equals("in")) return t.id;
        return null;
    }

    private static String offeredOnNode() throws Exception {
        final String[] id = {null};
        waitFor("the offer on the desk", 30_000, () -> {
            for (Object item : Json.asArray(node.snapshot().get("transfers"))) {
                Map<String, Object> t = Json.asObject(item);
                if ("offered".equals(t.get("state"))) {
                    id[0] = (String) t.get("id");
                    return true;
                }
            }
            return false;
        });
        return id[0];
    }

    private static String nodeSends(File root, int port) throws Exception {
        String preparedId = (String) Json.asObject(node.call("prepare", "root", root.getPath())).get("id");
        return (String) Json.asObject(node.call("send", "preparedId", preparedId, "fingerprint", java.fingerprint(), "address", "127.0.0.1", "port", port)).get("id");
    }

    private static void assertDelivered(File dest, byte[] big) throws Exception {
        assertArrayEquals(big, Fixtures.read(new File(dest, "assets/big.bin")));
        assertEquals("# Harbour Lane\n", Fixtures.readText(new File(dest, "README.md")));
        assertEquals("export const answer = 42;\n", Fixtures.readText(new File(dest, "src/app.ts")));
        assertEquals(0, new File(dest, "src/empty.txt").length());
        assertFalse(new File(dest, ".env").exists());
        assertFalse(new File(dest, "src/keys.ts").exists());
        assertFalse(new File(dest, "node_modules").exists());
        assertFalse(new File(dest, ".farbaek-incoming").exists());
        String[] names = dest.list();
        Arrays.sort(names);
        assertArrayEquals(new String[] {"README.md", "assets", "src"}, names);
    }

    // Pairing

    @Test
    public void a1_theDeskCallsThePhoneAndBothShowTheSameCode() throws Exception {
        node.call("pair", "address", "127.0.0.1", "port", java.port());
        waitFor("the code on the phone", 15_000, () -> java.snapshot().pairing != null && "confirming".equals(java.snapshot().pairing.state));
        assertEquals("answerer", java.snapshot().pairing.role);
        assertEquals(node.fingerprint, java.snapshot().pairing.peerFingerprint);
        assertEquals("Desk (Node)", java.snapshot().pairing.peerName);
        finishPairing();
    }

    @Test
    public void a2_thePhoneCallsTheDeskAndBothShowTheSameCode() throws Exception {
        java.pair("127.0.0.1", nodePort);
        waitFor("the code on the desk", 15_000, () -> nodePairing() != null && "confirming".equals(nodePairing().get("state")));
        assertEquals("caller", java.snapshot().pairing.role);
        assertEquals(java.fingerprint(), Json.asObject(nodePairing().get("peer")).get("fingerprint"));
        assertEquals("Phone (Java)", Json.asObject(nodePairing().get("peer")).get("name"));
        finishPairing();
    }

    @Test
    public void a3_noOneIsTrustedWhenTheCodesAreDeclined() throws Exception {
        final MeshNode stranger = Fixtures.javaNode("Stranger", tmp.newFolder("stranger-data"), null);
        try {
            stranger.pair("127.0.0.1", nodePort);
            waitFor("the code on the desk", 15_000, () -> nodePairing() != null && "confirming".equals(nodePairing().get("state")));
            assertEquals(stranger.snapshot().pairing.code, nodePairing().get("code"));
            node.call("confirm", "ok", false);
            waitFor("the decline", 15_000, () -> "declined".equals(stranger.snapshot().pairing.state));
            assertEquals(0, stranger.devices().size());
            assertEquals(Arrays.asList(java.fingerprint()), nodeDeviceFingerprints());
            node.call("dismissPairing");
        } finally {
            stranger.close();
        }
    }

    // Files, both directions

    @Test
    public void b1_theDeskSendsAFolderAndThePhoneChecksEveryByte() throws Exception {
        assertTrue(paired());
        b1Source = tmp.newFolder("b1-src");
        b1Big = Fixtures.sourceFolder(b1Source, 11);
        File parent = tmp.newFolder("b1-dest");
        int before = java.snapshot().transfers.size();
        final String outId = nodeSends(b1Source, java.port());
        final String inId = offeredOnJava(before);
        assertEquals("waiting", node.state(outId));
        TransferView offer = javaTransfer(inId);
        assertEquals(4, offer.files);
        assertEquals(15 + 26 + Fixtures.BIG_BYTES, offer.bytes);
        assertTrue(offer.excludedCount >= 3);
        java.accept(inId, parent, null);
        waitFor("delivery", 60_000, () -> "done".equals(node.state(outId)) && javaTransfer(inId).state == TransferState.DONE);
        b1Destination = new File(javaTransfer(inId).destination);
        assertEquals(parent.getCanonicalFile(), b1Destination.getParentFile());
        assertDelivered(b1Destination, b1Big);
        assertTrue(javaTransfer(inId).message.startsWith("Every file matched its hash."));
    }

    @Test
    public void b2_thePhoneSendsAFolderAndTheDeskChecksEveryByte() throws Exception {
        assertTrue(paired());
        b2Source = tmp.newFolder("b2-src");
        b2Big = Fixtures.sourceFolder(b2Source, 12);
        File parent = tmp.newFolder("b2-dest");
        MeshNode.PreparedView prepared = java.prepare(b2Source);
        assertEquals(4, prepared.files);
        final String outId = java.send(prepared.id, node.fingerprint, new InetSocketAddress("127.0.0.1", nodePort));
        final String inId = offeredOnNode();
        assertEquals(TransferState.WAITING, javaTransfer(outId).state);
        node.call("accept", "id", inId, "parent", parent.getPath());
        waitFor("delivery", 60_000, () -> "done".equals(node.state(inId)) && javaTransfer(outId).state == TransferState.DONE);
        b2NodeDestination = (String) node.transfer(inId).get("destination");
        assertDelivered(new File(b2NodeDestination), b2Big);
        assertTrue(javaTransfer(outId).message, javaTransfer(outId).message.contains("checked every file against its hash"));
    }

    // A real dropped connection, then resume

    @Test
    public void c1_theDeskResumesToThePhoneFromTheLastCheckedChunk() throws Exception {
        assertTrue(paired());
        File src = tmp.newFolder("c1-src");
        byte[] big = Fixtures.sourceFolder(src, 21);
        File parent = tmp.newFolder("c1-dest");
        try (CuttingProxy proxy = new CuttingProxy(java.port(), 6_000_000)) {
            int before = java.snapshot().transfers.size();
            final String outId = nodeSends(src, proxy.port());
            final String inId = offeredOnJava(before);
            java.accept(inId, parent, null);
            waitFor("both to see the drop", 60_000, () -> "interrupted".equals(node.state(outId)) && javaTransfer(inId).state == TransferState.INTERRUPTED);
            node.call("resume", "id", outId);
            waitFor("delivery after the resume", 60_000, () -> "done".equals(node.state(outId)) && javaTransfer(inId).state == TransferState.DONE);
            assertDelivered(new File(javaTransfer(inId).destination), big);
            assertEquals(2, proxy.carried.size());
            // The second connection carried what was left after the checked 4 MiB chunk, not the whole file again.
            assertTrue("resumed bytes " + proxy.carried.get(1).get(), proxy.carried.get(1).get() < big.length - 4_000_000);
        }
    }

    @Test
    public void c2_thePhoneResumesToTheDeskFromTheLastCheckedChunk() throws Exception {
        assertTrue(paired());
        File src = tmp.newFolder("c2-src");
        byte[] big = Fixtures.sourceFolder(src, 22);
        File parent = tmp.newFolder("c2-dest");
        try (CuttingProxy proxy = new CuttingProxy(nodePort, 6_000_000)) {
            final String outId = java.send(java.prepare(src).id, node.fingerprint, new InetSocketAddress("127.0.0.1", proxy.port()));
            final String inId = offeredOnNode();
            node.call("accept", "id", inId, "parent", parent.getPath());
            waitFor("both to see the drop", 60_000, () -> "interrupted".equals(node.state(inId)) && javaTransfer(outId).state == TransferState.INTERRUPTED);
            assertTrue(javaTransfer(outId).message, javaTransfer(outId).message.contains("Resume to carry on"));
            java.resume(outId);
            waitFor("delivery after the resume", 60_000, () -> "done".equals(node.state(inId)) && javaTransfer(outId).state == TransferState.DONE);
            assertDelivered(new File((String) node.transfer(inId).get("destination")), big);
            assertEquals(2, proxy.carried.size());
            assertTrue("resumed bytes " + proxy.carried.get(1).get(), proxy.carried.get(1).get() < big.length - 4_000_000);
        }
    }

    // A changed chunk

    @Test
    public void d1_thePhoneRefusesAChangedChunkFromTheDeskAndKeepsNothing() throws Exception {
        assertTrue(paired());
        File src = tmp.newFolder("d1-src");
        Fixtures.sourceFolder(src, 31);
        File parent = tmp.newFolder("d1-dest");
        node.call("tamper");
        try {
            int before = java.snapshot().transfers.size();
            final String outId = nodeSends(src, java.port());
            final String inId = offeredOnJava(before);
            java.accept(inId, parent, null);
            waitFor("the refusal", 60_000, () -> "failed".equals(node.state(outId)) && javaTransfer(inId).state == TransferState.FAILED);
            assertTrue(javaTransfer(inId).message, javaTransfer(inId).message.contains("assets/big.bin didn't match its hash at chunk 1."));
            String nodeMessage = (String) node.transfer(outId).get("message");
            assertTrue(nodeMessage, nodeMessage.contains("didn't match its hash"));
            assertEquals(0, Fixtures.listCount(parent));
        } finally {
            node.call("restore");
        }
    }

    @Test
    public void d2_theDeskRefusesAChangedChunkFromThePhoneAndKeepsNothing() throws Exception {
        assertTrue(paired());
        File src = tmp.newFolder("d2-src");
        Fixtures.sourceFolder(src, 32);
        File parent = tmp.newFolder("d2-dest");
        tamperNext.set(true);
        final String outId = java.send(java.prepare(src).id, node.fingerprint, new InetSocketAddress("127.0.0.1", nodePort));
        final String inId = offeredOnNode();
        node.call("accept", "id", inId, "parent", parent.getPath());
        waitFor("the refusal", 60_000, () -> "failed".equals(node.state(inId)) && javaTransfer(outId).state == TransferState.FAILED);
        assertFalse(tamperNext.get());
        String nodeMessage = (String) node.transfer(inId).get("message");
        assertTrue(nodeMessage, nodeMessage.contains("didn't match its hash at chunk 1"));
        assertTrue(javaTransfer(outId).message, javaTransfer(outId).message.contains("didn't match its hash"));
        assertEquals(0, Fixtures.listCount(parent));
    }

    // Hostile manifests

    @Test
    public void e1_thePhoneRefusesAManifestFromTheDeskThatWouldEscape() throws Exception {
        assertTrue(paired());
        File src = tmp.newFolder("e1-src");
        Fixtures.sourceFolder(src, 41);
        for (String evil : new String[] {"../escaped.md", "C:/escaped.md", ".farbaek-incoming/0.part", "docs/con.md"}) {
            int before = java.snapshot().transfers.size();
            String preparedId = (String) Json.asObject(node.call("prepareEvil", "root", src.getPath(), "path", evil)).get("id");
            final String outId = (String) Json.asObject(node.call("send", "preparedId", preparedId, "fingerprint", java.fingerprint(), "address", "127.0.0.1", "port", java.port())).get("id");
            waitFor("the refusal of " + evil, 30_000, () -> "failed".equals(node.state(outId)));
            String message = (String) node.transfer(outId).get("message");
            assertTrue(evil + ": " + message, message.contains("can't be accepted"));
            assertEquals(before, java.snapshot().transfers.size());
        }
        assertFalse(new File(tmp.getRoot(), "escaped.md").exists());
    }

    @Test
    public void e2_theDeskRefusesAManifestFromThePhoneThatWouldEscape() throws Exception {
        assertTrue(paired());
        File src = tmp.newFolder("e2-src");
        Fixtures.sourceFolder(src, 42);
        Packer.PackedFolder packed = Packer.packFolder(src);
        List<Capsule.FileEntry> files = new ArrayList<>(packed.manifest.files);
        files.set(0, files.get(0).withPath("../escaped.md"));
        Capsule.Manifest m = packed.manifest.withFiles(files);
        String preparedId = java.prepareRaw(new Packer.PackedFolder(packed.root, packed.name, m, Capsule.manifestDigest(m)));
        final String outId = java.send(preparedId, node.fingerprint, new InetSocketAddress("127.0.0.1", nodePort));
        waitFor("the refusal", 30_000, () -> javaTransfer(outId).state == TransferState.FAILED);
        assertTrue(javaTransfer(outId).message, javaTransfer(outId).message.contains("can't be accepted"));
        for (Object item : Json.asArray(node.snapshot().get("transfers"))) assertFalse("offered".equals(Json.asObject(item).get("state")));
    }

    // Updating an earlier copy (ADR 0138)

    @Test
    public void f1_thePhoneReusesItsEarlierCopyAndTheDeskSendsOnlyWhatChanged() throws Exception {
        assertTrue(paired());
        assertNotNull("b1 ran first", b1Destination);
        Fixtures.write(new File(b1Source, "src/app.ts"), "export const answer = 43;\n");
        Fixtures.append(new File(b1Source, "assets/big.bin"), "0123456789");
        Fixtures.write(new File(b1Source, "src/new.ts"), "export const fresh = true;\n");
        File parent = tmp.newFolder("f1-dest");
        int before = java.snapshot().transfers.size();
        final String outId = nodeSends(b1Source, java.port());
        final String inId = offeredOnJava(before);
        java.accept(inId, parent, b1Destination);
        waitFor("delivery", 60_000, () -> "done".equals(node.state(outId)) && javaTransfer(inId).state == TransferState.DONE);
        TransferView view = javaTransfer(inId);
        // README.md and empty.txt whole, and the first two 4 MiB chunks of big.bin.
        assertEquals(2, view.reusedFiles);
        assertEquals(15 + 2L * Capsule.CHUNK_BYTES, view.reusedBytes);
        assertTrue(view.message, view.message.contains("2 of them were already on this computer"));
        File dest = new File(view.destination);
        byte[] grown = Arrays.copyOf(b1Big, b1Big.length + 10);
        System.arraycopy("0123456789".getBytes("US-ASCII"), 0, grown, b1Big.length, 10);
        assertArrayEquals(grown, Fixtures.read(new File(dest, "assets/big.bin")));
        assertEquals("export const answer = 43;\n", Fixtures.readText(new File(dest, "src/app.ts")));
        assertEquals("export const fresh = true;\n", Fixtures.readText(new File(dest, "src/new.ts")));
        // The earlier copy is only read.
        assertEquals("export const answer = 42;\n", Fixtures.readText(new File(b1Destination, "src/app.ts")));
        assertArrayEquals(b1Big, Fixtures.read(new File(b1Destination, "assets/big.bin")));
    }

    @Test
    public void f2_theDeskReusesItsEarlierCopyAndThePhoneSendsOnlyWhatChanged() throws Exception {
        assertTrue(paired());
        assertNotNull("b2 ran first", b2NodeDestination);
        Fixtures.write(new File(b2Source, "src/app.ts"), "export const answer = 43;\n");
        Fixtures.append(new File(b2Source, "assets/big.bin"), "0123456789");
        Fixtures.write(new File(b2Source, "src/new.ts"), "export const fresh = true;\n");
        File parent = tmp.newFolder("f2-dest");
        final String outId = java.send(java.prepare(b2Source).id, node.fingerprint, new InetSocketAddress("127.0.0.1", nodePort));
        final String inId = offeredOnNode();
        node.call("accept", "id", inId, "parent", parent.getPath(), "earlier", b2NodeDestination);
        waitFor("delivery", 60_000, () -> "done".equals(node.state(inId)) && javaTransfer(outId).state == TransferState.DONE);
        Map<String, Object> reused = Json.asObject(node.transfer(inId).get("reused"));
        assertEquals(2L, reused.get("files"));
        assertEquals(15 + 2L * Capsule.CHUNK_BYTES, reused.get("bytes"));
        File dest = new File((String) node.transfer(inId).get("destination"));
        byte[] grown = Arrays.copyOf(b2Big, b2Big.length + 10);
        System.arraycopy("0123456789".getBytes("US-ASCII"), 0, grown, b2Big.length, 10);
        assertArrayEquals(grown, Fixtures.read(new File(dest, "assets/big.bin")));
        assertEquals("export const fresh = true;\n", Fixtures.readText(new File(dest, "src/new.ts")));
        assertEquals("export const answer = 43;\n", Fixtures.readText(new File(dest, "src/app.ts")));
        assertArrayEquals(b2Big, Fixtures.read(new File(b2NodeDestination, "assets/big.bin")));
    }

    // Declining and cancelling

    @Test
    public void h1_thePhoneDeclinesAndTheDeskHearsIt() throws Exception {
        assertTrue(paired());
        File src = tmp.newFolder("h1-src");
        Fixtures.sourceFolder(src, 51);
        int before = java.snapshot().transfers.size();
        final String outId = nodeSends(src, java.port());
        final String inId = offeredOnJava(before);
        java.decline(inId);
        waitFor("the decline", 30_000, () -> "declined".equals(node.state(outId)));
        assertEquals(TransferState.DECLINED, javaTransfer(inId).state);
        assertTrue(javaTransfer(inId).message, javaTransfer(inId).message.contains("Nothing was written"));
    }

    @Test
    public void h2_theDeskCancelsWhileThePhoneIsAskingAndThePhoneSaysSo() throws Exception {
        assertTrue(paired());
        File src = tmp.newFolder("h2-src");
        Fixtures.sourceFolder(src, 52);
        int before = java.snapshot().transfers.size();
        final String outId = nodeSends(src, java.port());
        final String inId = offeredOnJava(before);
        node.call("cancel", "id", outId);
        waitFor("the phone to notice", 30_000, () -> javaTransfer(inId).state == TransferState.CANCELLED);
        assertTrue(javaTransfer(inId).message, javaTransfer(inId).message.contains("stopped waiting"));
        assertEquals("cancelled", node.state(outId));
    }

    @Test
    public void h3_thePhoneCancelsWhileTheDeskIsAskingAndTheDeskSaysSo() throws Exception {
        assertTrue(paired());
        File src = tmp.newFolder("h3-src");
        Fixtures.sourceFolder(src, 53);
        final String outId = java.send(java.prepare(src).id, node.fingerprint, new InetSocketAddress("127.0.0.1", nodePort));
        final String inId = offeredOnNode();
        java.cancel(outId);
        waitFor("the desk to notice", 30_000, () -> "cancelled".equals(node.state(inId)));
        assertEquals(TransferState.CANCELLED, javaTransfer(outId).state);
    }

    // Discovery

    @Test
    public void g1_eachSideHearsTheOthersAnnouncement() throws Exception {
        int port = 53_377;
        final Discovery mine = new Discovery(MeshProtocol.DISCOVERY_GROUP, port, new Discovery.Self() {
            @Override
            public MeshProtocol.Announcement current() {
                return new MeshProtocol.Announcement("here", "Phone (Java)", java.fingerprint(), 40_001);
            }
        }, new Runnable() {
            @Override
            public void run() {}
        });
        try {
            mine.start();
        } catch (java.io.IOException e) {
            Assume.assumeTrue("This machine can't join a multicast group (" + e.getMessage() + ")", false);
        }
        try {
            node.call("discoveryStart", "group", MeshProtocol.DISCOVERY_GROUP, "port", port, "fingerprint", node.fingerprint, "tcpPort", 40_002);
            long end = System.currentTimeMillis() + 12_000;
            boolean javaHeard = false;
            boolean nodeHeard = false;
            while (System.currentTimeMillis() < end && !(javaHeard && nodeHeard)) {
                javaHeard = false;
                for (Discovery.NearbyDevice d : mine.devices()) if (d.fingerprint.equals(node.fingerprint) && d.port == 40_002 && d.name.equals("Desk (Node)")) javaHeard = true;
                nodeHeard = false;
                for (Object item : Json.asArray(node.call("discoveryDevices"))) {
                    Map<String, Object> d = Json.asObject(item);
                    if (java.fingerprint().equals(d.get("fingerprint")) && Long.valueOf(40_001).equals(d.get("port"))) nodeHeard = true;
                }
                Thread.sleep(200);
            }
            Assume.assumeTrue("No multicast was delivered on this machine in 12 seconds, either way, so discovery couldn't be checked here.", javaHeard || nodeHeard);
            assertTrue("The phone heard the desk", javaHeard);
            assertTrue("The desk heard the phone", nodeHeard);
        } finally {
            mine.stop();
            node.call("discoveryStop");
        }
    }
}
