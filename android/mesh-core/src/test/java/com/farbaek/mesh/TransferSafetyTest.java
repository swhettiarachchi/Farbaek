package com.farbaek.mesh;

import static com.farbaek.mesh.Fixtures.pairJava;
import static com.farbaek.mesh.Fixtures.waitFor;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * What two taps, a cancel at the wrong moment, a renamed sender or an app
 * stopped mid-transfer can't do: two folders or two receives, an offer after
 * a cancel, an interrupted transfer that was cancelled, folders made again,
 * a sender's new name on an offer, or leftovers that pile up for ever.
 */
public class TransferSafetyTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private final List<MeshNode> nodes = new ArrayList<>();

    @After
    public void tearDown() {
        for (MeshNode n : nodes) n.close();
    }

    private MeshNode node(MeshNode.NameSource name, File data, OutgoingTransfer.PieceFilter filter) throws IOException {
        MeshNode.Options o = new MeshNode.Options();
        o.dataDir = data;
        o.name = name;
        o.vault = new KeyVault.Memory();
        o.listener = new MeshListener() {
            @Override
            public void onChanged() {}
        };
        o.discovery = false;
        o.listenHost = "127.0.0.1";
        o.pieceFilter = filter;
        MeshNode n = new MeshNode(o);
        n.init();
        nodes.add(n);
        return n;
    }

    private MeshNode node(final String name, OutgoingTransfer.PieceFilter filter) throws IOException {
        return node(() -> name, tmp.newFolder(), filter);
    }

    /** Sends pieces slowly enough that a test can act while bytes are flowing. */
    private static final OutgoingTransfer.PieceFilter SLOW = (file, offset, piece) -> {
        try {
            Thread.sleep(4);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return piece;
    };

    private static String offered(final MeshNode b, final int before) throws Exception {
        waitFor("the offer", 20_000, () -> {
            int n = 0;
            for (TransferView t : b.snapshot().transfers) if (t.state == TransferState.OFFERED) n++;
            return n > 0 && b.snapshot().transfers.size() > before;
        });
        for (TransferView t : b.snapshot().transfers) if (t.state == TransferState.OFFERED) return t.id;
        throw new AssertionError("no offer");
    }

    /** Runs each action on its own thread, released together, and counts the ones that threw. */
    private static int together(Runnable... actions) throws Exception {
        final CountDownLatch go = new CountDownLatch(1);
        final AtomicInteger threw = new AtomicInteger();
        List<Thread> threads = new ArrayList<>();
        for (final Runnable a : actions) {
            Thread t = new Thread(() -> {
                try {
                    go.await();
                    a.run();
                } catch (RuntimeException | InterruptedException e) {
                    threw.incrementAndGet();
                }
            });
            t.start();
            threads.add(t);
        }
        go.countDown();
        for (Thread t : threads) t.join(20_000);
        return threw.get();
    }

    private interface Action {
        void run() throws Exception;
    }

    private static Runnable unchecked(final Action a) {
        return () -> {
            try {
                a.run();
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        };
    }

    @Test
    public void anOfferShowsTheNameSavedAtPairingNotTheOneItGivesNow() throws Exception {
        final String[] name = {"Studio laptop"};
        MeshNode a = node(() -> name[0], tmp.newFolder(), null);
        MeshNode b = node("Receiver", null);
        pairJava(a, b);
        name[0] = "Totally your bank";
        File src = tmp.newFolder("src");
        Fixtures.write(new File(src, "README.md"), "# Harbour Lane\n");
        a.send(a.prepare(src).id, b.fingerprint(), new InetSocketAddress("127.0.0.1", b.port()));
        String in = offered(b, 0);
        assertEquals("Studio laptop", b.snapshot().transfer(in).peerName);
    }

    @Test
    public void twoAcceptTapsMakeOneFolderAndOneReceive() throws Exception {
        final MeshNode a = node("Sender", null);
        final MeshNode b = node("Receiver", null);
        pairJava(a, b);
        File src = tmp.newFolder("src");
        byte[] big = Fixtures.sourceFolder(src, 7);
        final File parent = tmp.newFolder("dest");
        final String out = a.send(a.prepare(src).id, b.fingerprint(), new InetSocketAddress("127.0.0.1", b.port()));
        final String in = offered(b, 0);
        together(unchecked(() -> b.accept(in, parent, null)), unchecked(() -> b.accept(in, parent, null)), unchecked(() -> b.accept(in, parent, null)));
        waitFor("delivery", 60_000, () -> a.snapshot().transfer(out).state == TransferState.DONE && b.snapshot().transfer(in).state == TransferState.DONE);
        assertEquals("one folder", 1, Fixtures.listCount(parent));
        assertTrue(Arrays.equals(big, Fixtures.read(new File(b.snapshot().transfer(in).destination, "assets/big.bin"))));
        assertTrue(b.snapshot().transfer(in).message, b.snapshot().transfer(in).message.startsWith("Every file matched its hash."));
        assertEquals("finished folders aren't kept for cleanup", 0, b.receivingFolders().size());
    }

    @Test
    public void twoResumeTapsMakeOneConnection() throws Exception {
        final MeshNode a = node("Sender", null);
        final MeshNode b = node("Receiver", null);
        pairJava(a, b);
        File src = tmp.newFolder("src");
        byte[] big = Fixtures.sourceFolder(src, 8);
        File parent = tmp.newFolder("dest");
        try (CuttingProxy proxy = new CuttingProxy(b.port(), 6_000_000)) {
            final String out = a.send(a.prepare(src).id, b.fingerprint(), new InetSocketAddress("127.0.0.1", proxy.port()));
            final String in = offered(b, 0);
            b.accept(in, parent, null);
            waitFor("both to see the drop", 60_000, () -> a.snapshot().transfer(out).state == TransferState.INTERRUPTED && b.snapshot().transfer(in).state == TransferState.INTERRUPTED);
            assertEquals("an interrupted transfer's folder is kept for cleanup", 1, b.receivingFolders().size());
            int refused = together(unchecked(() -> a.resume(out)), unchecked(() -> a.resume(out)), unchecked(() -> a.resume(out)));
            assertEquals("all but one tap refused", 2, refused);
            waitFor("delivery", 60_000, () -> a.snapshot().transfer(out).state == TransferState.DONE && b.snapshot().transfer(in).state == TransferState.DONE);
            assertEquals("the first connection and one resume", 2, proxy.carried.size());
            assertTrue(Arrays.equals(big, Fixtures.read(new File(b.snapshot().transfer(in).destination, "assets/big.bin"))));
            assertEquals(1, Fixtures.listCount(parent));
            assertEquals(0, b.receivingFolders().size());
        }
    }

    @Test
    public void cancellingWhileConnectingOffersNothing() throws Exception {
        final KeyPair phone = Noise.generateKeyPair();
        final KeyPair desk = Noise.generateKeyPair();
        final ServerSocket server = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        ExecutorService pool = Executors.newCachedThreadPool();
        try {
            final CompletableFuture<SecureChannel> deskSide = new CompletableFuture<>();
            Thread answerer = new Thread(() -> {
                try {
                    deskSide.complete(SecureChannel.respond(server.accept(), desk, new MeshProtocol.Hello("Desk", null)));
                } catch (Throwable e) {
                    deskSide.completeExceptionally(e);
                }
            });
            answerer.setDaemon(true);
            answerer.start();
            final CountDownLatch connecting = new CountDownLatch(1);
            final CountDownLatch release = new CountDownLatch(1);
            OutgoingTransfer.Connector slow = () -> {
                connecting.countDown();
                try {
                    release.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    throw new IOException("Interrupted.");
                }
                return SecureChannel.initiate(new Socket("127.0.0.1", server.getLocalPort()), phone, new MeshProtocol.Hello("Phone", "transfer"), 10_000);
            };
            File src = tmp.newFolder("src");
            Fixtures.write(new File(src, "README.md"), "# Harbour Lane\n");
            TrustStore.TrustedDevice device = new TrustStore.TrustedDevice(Noise.fingerprint(desk.publicKey()), "Desk", Text.hex(desk.publicKey()), "2026-11-12T09:30:00.000Z", "nearby");
            final OutgoingTransfer t = new OutgoingTransfer("6f0e6a52-6f0e-4a52-8f0e-6a526f0e4a52", Packer.packFolder(src), device, slow, () -> {}, pool, null);
            Thread sending = new Thread(t::start);
            sending.start();
            assertTrue(connecting.await(10, TimeUnit.SECONDS));
            t.cancel();
            assertEquals(TransferState.CANCELLED, t.state());
            release.countDown();
            sending.join(20_000);
            assertEquals(TransferState.CANCELLED, t.state());
            SecureChannel ch = deskSide.get(10, TimeUnit.SECONDS);
            try {
                MeshMessage m = ch.receive(3_000).message;
                fail("Offered after a cancel: " + m);
            } catch (FramedSocket.FrameException expected) {
                // Closed, with nothing sent.
            }
        } finally {
            pool.shutdownNow();
            server.close();
        }
    }

    @Test
    public void aCancelWhileReceivingStaysCancelledAndNothingIsMadeAgain() throws Exception {
        final MeshNode a = node("Sender", SLOW);
        final MeshNode b = node("Receiver", null);
        pairJava(a, b);
        File src = tmp.newFolder("src");
        Fixtures.sourceFolder(src, 9);
        File parent = tmp.newFolder("dest");
        final String out = a.send(a.prepare(src).id, b.fingerprint(), new InetSocketAddress("127.0.0.1", b.port()));
        final String in = offered(b, 0);
        b.accept(in, parent, null);
        waitFor("bytes arriving", 30_000, () -> {
            TransferView t = b.snapshot().transfer(in);
            return t.state == TransferState.RECEIVING && t.bytesDone > 0;
        });
        assertEquals(1, Fixtures.listCount(parent));
        assertEquals(1, b.receivingFolders().size());
        b.cancel(in);
        // Long enough for the receiving thread to see its connection close and take its dropped-connection path.
        waitFor("the sender to hear it", 20_000, () -> a.snapshot().transfer(out).state.isFinal());
        Thread.sleep(1_500);
        TransferView after = b.snapshot().transfer(in);
        assertEquals(after.message, TransferState.CANCELLED, after.state);
        assertEquals("Cancelled. Everything received was removed.", after.message);
        assertEquals("nothing made again", 0, Fixtures.listCount(parent));
        assertEquals(0, b.receivingFolders().size());
    }

    @Test
    public void startingUpRemovesWhatInterruptedTransfersLeftInTheirFoldersOnly() throws Exception {
        File data = tmp.newFolder("data");
        File inbox = tmp.newFolder("Nearby");
        File leftover = new File(inbox, "Harbour Lane");
        Fixtures.write(new File(leftover, ".farbaek-incoming/0b6e/0.part"), "partial");
        Fixtures.write(new File(leftover, ".farbaek-incoming/0b6e/checkpoint.json"), "{}");
        File partlyMoved = new File(inbox, "Second");
        Fixtures.write(new File(partlyMoved, ".farbaek-incoming/77aa/1.part"), "partial");
        Fixtures.write(new File(partlyMoved, "README.md"), "# Second\n");
        File notListed = new File(inbox, "Someone else's");
        Fixtures.write(new File(notListed, ".farbaek-incoming/x/0.part"), "not ours to judge");
        Fixtures.write(new File(data, "mesh-receiving.json"), Json.stringify(Arrays.<Object>asList(leftover.getAbsolutePath(), partlyMoved.getAbsolutePath(), "relative/ignored")));

        MeshNode n = node(() -> "Phone", data, null);
        assertFalse("a folder holding only leftovers goes", leftover.exists());
        assertFalse(new File(partlyMoved, ".farbaek-incoming").exists());
        assertTrue("files already moved into place stay", new File(partlyMoved, "README.md").isFile());
        assertTrue("folders not on the list aren't looked at", new File(notListed, ".farbaek-incoming/x/0.part").isFile());
        assertEquals(0, n.receivingFolders().size());
        assertEquals("[]", Fixtures.readText(new File(data, "mesh-receiving.json")));
    }
}
