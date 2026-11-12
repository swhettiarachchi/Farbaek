package com.farbaek.mesh;

import static com.farbaek.mesh.Fixtures.javaNode;
import static com.farbaek.mesh.Fixtures.waitFor;
import static com.farbaek.mesh.Text.hex;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.After;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Pairing v2 over real connections on 127.0.0.1: a Java device against a
 * hand-driven one that follows the steps, breaks them, speaks only v1, or
 * sits in the middle of two real devices trying to make their codes match.
 */
public class PairingTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private final List<MeshNode> nodes = new ArrayList<>();
    private final List<AutoCloseableSocket> servers = new ArrayList<>();

    @After
    public void tearDown() {
        for (MeshNode n : nodes) n.close();
        for (AutoCloseableSocket s : servers) s.close();
    }

    private MeshNode node(String name) throws Exception {
        MeshNode n = javaNode(name, tmp.newFolder(), null);
        nodes.add(n);
        return n;
    }

    private MeshNode visible(String name) throws Exception {
        MeshNode n = node(name);
        n.setVisible(true);
        return n;
    }

    /** A ServerSocket on 127.0.0.1 that a hand-driven device answers on. */
    private static final class AutoCloseableSocket {
        final ServerSocket server;

        AutoCloseableSocket() throws IOException {
            server = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        }

        void close() {
            try {
                server.close();
            } catch (IOException ignored) {
                // Already closed.
            }
        }
    }

    private AutoCloseableSocket listen() throws IOException {
        AutoCloseableSocket s = new AutoCloseableSocket();
        servers.add(s);
        return s;
    }

    /** Calls a Java device as a hand-driven caller with this hello. */
    private static SecureChannel call(MeshNode answerer, KeyPair key, MeshProtocol.Hello hello) throws IOException {
        return SecureChannel.initiate(new Socket("127.0.0.1", answerer.port()), key, hello, 10_000);
    }

    /** Answers the next call on `s` as a hand-driven device, on another thread. */
    private static CompletableFuture<SecureChannel> answerNext(final AutoCloseableSocket s, final KeyPair key, final MeshProtocol.Hello hello) {
        final CompletableFuture<SecureChannel> out = new CompletableFuture<>();
        Thread t = new Thread(() -> {
            try {
                out.complete(SecureChannel.respond(s.server.accept(), key, hello));
            } catch (Throwable e) {
                out.completeExceptionally(e);
            }
        }, "hand-driven-answerer");
        t.setDaemon(true);
        t.start();
        return out;
    }

    /** Runs pair() on another thread: it blocks through the handshake and the three messages. */
    private static CompletableFuture<Void> pairLater(final MeshNode caller, final int port) {
        final CompletableFuture<Void> out = new CompletableFuture<>();
        Thread t = new Thread(() -> {
            try {
                caller.pair("127.0.0.1", port);
                out.complete(null);
            } catch (Throwable e) {
                out.completeExceptionally(e);
            }
        }, "pair-later");
        t.setDaemon(true);
        t.start();
        return out;
    }

    private static MeshMessage next(SecureChannel ch) throws IOException {
        return ch.receive(5_000).message;
    }

    /** Nothing arrives on `ch` within `ms`: the read times out with the connection still open. */
    private static void assertSilent(SecureChannel ch, long ms) throws IOException {
        try {
            MeshMessage m = ch.receive(ms).message;
            fail("Expected nothing yet, got " + m);
        } catch (FramedSocket.FrameException expected) {
            assertTrue(expected.getMessage(), expected.getMessage().contains("stopped answering"));
        }
    }

    private static MeshNode.PairingView failedView(final MeshNode n) throws Exception {
        waitFor("the failed pairing on screen", 10_000, () -> n.snapshot().pairing != null && "failed".equals(n.snapshot().pairing.state));
        MeshNode.PairingView p = n.snapshot().pairing;
        assertNull("no code was made", p.code);
        return p;
    }

    private static final MeshProtocol.Hello V2_CALLER = new MeshProtocol.Hello("Hand caller", "pair");

    // Older devices

    @Test
    public void anOlderCallerIsRefusedAtOnceWithoutACode() throws Exception {
        MeshNode desk = visible("Desk");
        SecureChannel old = call(desk, Noise.generateKeyPair(), new MeshProtocol.Hello("Old Desk", "pair", 0));
        MeshMessage first = next(old);
        assertEquals("error", first.t);
        assertEquals("protocol", first.code);
        // As the desktop agent words it: the older device reads that it's the one to update.
        assertEquals("{\"t\":\"error\",\"code\":\"protocol\",\"message\":\"Update Farbaek on this device to pair: pairing changed to keep it safe.\"}", first.toString());
        MeshNode.PairingView p = failedView(desk);
        assertEquals("Update Farbaek on Old Desk to pair: pairing changed to keep it safe.", p.message);
        assertEquals("Old Desk", p.peerName);
        assertEquals(0, desk.devices().size());
    }

    @Test
    public void anOlderAnswererIsRefusedAtOnceWithoutACode() throws Exception {
        MeshNode phone = node("Phone");
        AutoCloseableSocket s = listen();
        CompletableFuture<SecureChannel> old = answerNext(s, Noise.generateKeyPair(), new MeshProtocol.Hello("Old Laptop", null, 0));
        try {
            phone.pair("127.0.0.1", s.server.getLocalPort());
            fail("Paired with a device that doesn't speak pairing v2");
        } catch (MeshNode.MeshException e) {
            assertEquals("Update Farbaek on Old Laptop to pair: pairing changed to keep it safe.", e.getMessage());
        }
        MeshMessage told = next(old.get(10, TimeUnit.SECONDS));
        assertEquals("{\"t\":\"error\",\"code\":\"protocol\",\"message\":\"Update Farbaek on this device to pair: pairing changed to keep it safe.\"}", told.toString());
        assertNull(phone.snapshot().pairing);
        assertEquals(0, phone.devices().size());
    }

    @Test
    public void everyHelloSaysPairingTwo() throws Exception {
        assertEquals("{\"v\":1,\"name\":\"Phone\",\"purpose\":\"transfer\",\"pairing\":2}", new String(new MeshProtocol.Hello("Phone", "transfer").encode(), "UTF-8"));
        assertEquals("{\"v\":1,\"name\":\"Phone\",\"pairing\":2}", new String(new MeshProtocol.Hello("Phone", null).encode(), "UTF-8"));
        assertTrue(MeshProtocol.Hello.parse(Json.parse("{\"v\":1,\"name\":\"A\",\"pairing\":2}")).pairsSafely());
        assertTrue(MeshProtocol.Hello.parse(Json.parse("{\"v\":1,\"name\":\"A\",\"pairing\":3}")).pairsSafely());
        for (String older : new String[] {"{\"v\":1,\"name\":\"A\"}", "{\"v\":1,\"name\":\"A\",\"pairing\":1}", "{\"v\":1,\"name\":\"A\",\"pairing\":0}"}) {
            MeshProtocol.Hello h = MeshProtocol.Hello.parse(Json.parse(older));
            assertNotNull(older, h);
            assertTrue(older, !h.pairsSafely());
        }
        // As HelloSchema's z.number().int().min(0).optional(): anything else there isn't a hello at all.
        for (String broken : new String[] {"{\"v\":1,\"name\":\"A\",\"pairing\":\"2\"}", "{\"v\":1,\"name\":\"A\",\"pairing\":2.5}", "{\"v\":1,\"name\":\"A\",\"pairing\":-1}",
            "{\"v\":1,\"name\":\"A\",\"pairing\":null}"}) {
            assertNull(broken, MeshProtocol.Hello.parse(Json.parse(broken)));
        }
        // A device already paired still sends without it: transfers check the key, not the code.
        assertNotNull(MeshProtocol.Hello.parse(Json.parse("{\"v\":1,\"name\":\"A\",\"purpose\":\"transfer\"}")));
    }

    // The steps, followed and broken

    @Test
    public void theAnswererSendsItsNonceOnlyAfterACommitAndBothGetTheSameCode() throws Exception {
        MeshNode desk = visible("Desk");
        SecureChannel ch = call(desk, Noise.generateKeyPair(), V2_CALLER);
        // No commit yet: nothing comes back, and no code is on screen.
        assertSilent(ch, 1_500);
        assertNull(desk.snapshot().pairing);
        byte[] nC = Noise.pairingNonce();
        ch.send(MeshMessage.pairCommit(hex(Noise.pairingCommit(nC))));
        MeshMessage nonce = next(ch);
        assertEquals("pair-nonce", nonce.t);
        assertNull("still no code before the reveal", desk.snapshot().pairing);
        ch.send(MeshMessage.pairReveal(hex(nC)));
        waitFor("the code on the desk", 10_000, () -> desk.snapshot().pairing != null);
        MeshNode.PairingView p = desk.snapshot().pairing;
        assertEquals("confirming", p.state);
        assertEquals("answerer", p.role);
        assertEquals(Noise.pairingCode(ch.handshakeHash(), nC, hex(nonce.nonce)), p.code);
        // Then the confirm exchange, unchanged.
        ch.send(MeshMessage.pairConfirm(true));
        desk.confirmPairing(p.id, true);
        waitFor("paired", 10_000, () -> "paired".equals(desk.snapshot().pairing.state));
        assertEquals(1, desk.devices().size());
        assertTrue(next(ch).ok);
    }

    private void assertStepsBroken(MeshNode desk, SecureChannel ch, boolean toldWhy) throws Exception {
        if (toldWhy) {
            MeshMessage m = next(ch);
            assertEquals("error", m.t);
            assertEquals("protocol", m.code);
            assertEquals(PairingSteps.STEPS, m.message);
        }
        MeshNode.PairingView p = failedView(desk);
        assertEquals(PairingSteps.STEPS, p.message);
        assertEquals(0, desk.devices().size());
    }

    @Test
    public void aRevealThatDoesntMatchTheCommitFails() throws Exception {
        MeshNode desk = visible("Desk");
        SecureChannel ch = call(desk, Noise.generateKeyPair(), V2_CALLER);
        byte[] nC = Noise.pairingNonce();
        ch.send(MeshMessage.pairCommit(hex(Noise.pairingCommit(nC))));
        assertEquals("pair-nonce", next(ch).t);
        // A caller in the middle would like to pick its nonce now, having seen the answerer's.
        ch.send(MeshMessage.pairReveal(hex(Noise.pairingNonce())));
        assertStepsBroken(desk, ch, true);
    }

    @Test
    public void aRevealBeforeAnyCommitFails() throws Exception {
        MeshNode desk = visible("Desk");
        SecureChannel ch = call(desk, Noise.generateKeyPair(), V2_CALLER);
        ch.send(MeshMessage.pairReveal(hex(Noise.pairingNonce())));
        assertStepsBroken(desk, ch, true);
    }

    @Test
    public void aCallerSendingTheAnswerersMessageFails() throws Exception {
        MeshNode desk = visible("Desk");
        SecureChannel ch = call(desk, Noise.generateKeyPair(), V2_CALLER);
        ch.send(MeshMessage.pairNonce(hex(Noise.pairingNonce())));
        assertStepsBroken(desk, ch, true);
    }

    @Test
    public void aRepeatedCommitFails() throws Exception {
        MeshNode desk = visible("Desk");
        SecureChannel ch = call(desk, Noise.generateKeyPair(), V2_CALLER);
        byte[] nC = Noise.pairingNonce();
        MeshMessage commit = MeshMessage.pairCommit(hex(Noise.pairingCommit(nC)));
        ch.send(commit);
        assertEquals("pair-nonce", next(ch).t);
        ch.send(commit);
        assertStepsBroken(desk, ch, true);
    }

    @Test
    public void aConfirmBeforeTheCodeFails() throws Exception {
        MeshNode desk = visible("Desk");
        SecureChannel ch = call(desk, Noise.generateKeyPair(), V2_CALLER);
        ch.send(MeshMessage.pairConfirm(true));
        assertStepsBroken(desk, ch, true);
    }

    @Test
    public void hexOfTheWrongCaseOrLengthFails() throws Exception {
        String good = hex(Noise.pairingCommit(Noise.pairingNonce()));
        for (String bad : new String[] {good.toUpperCase(java.util.Locale.ROOT), good.substring(2), good + "00"}) {
            MeshNode desk = visible("Desk");
            SecureChannel ch = call(desk, Noise.generateKeyPair(), V2_CALLER);
            ch.send(MeshMessage.pairCommit(bad));
            // Not even a message to it: the channel closes without a word.
            assertStepsBroken(desk, ch, false);
            assertNull("the answerer's nonce never went out", MeshMessage.parse(Json.parse("{\"t\":\"pair-commit\",\"commit\":\"" + bad + "\"}")));
        }
    }

    @Test
    public void anExtraPairingMessageAfterTheCodeFails() throws Exception {
        MeshNode desk = visible("Desk");
        SecureChannel ch = call(desk, Noise.generateKeyPair(), V2_CALLER);
        byte[] nC = Noise.pairingNonce();
        ch.send(MeshMessage.pairCommit(hex(Noise.pairingCommit(nC))));
        assertEquals("pair-nonce", next(ch).t);
        MeshMessage reveal = MeshMessage.pairReveal(hex(nC));
        ch.send(reveal);
        waitFor("the code", 10_000, () -> desk.snapshot().pairing != null && "confirming".equals(desk.snapshot().pairing.state));
        ch.send(reveal);
        waitFor("the failure", 10_000, () -> "failed".equals(desk.snapshot().pairing.state));
        assertEquals(PairingSteps.STEPS, desk.snapshot().pairing.message);
        assertEquals(0, desk.devices().size());
    }

    @Test
    public void theCallerRevealsOnlyAfterANonceAndRefusesABadOne() throws Exception {
        MeshNode phone = node("Phone");
        AutoCloseableSocket s = listen();
        CompletableFuture<SecureChannel> leg = answerNext(s, Noise.generateKeyPair(), new MeshProtocol.Hello("Hand answerer", null));
        CompletableFuture<Void> pairing = pairLater(phone, s.server.getLocalPort());
        SecureChannel ch = leg.get(10, TimeUnit.SECONDS);
        assertEquals("pair-commit", next(ch).t);
        // The caller waits for a nonce: its own isn't shown before.
        assertSilent(ch, 1_500);
        ch.send(MeshMessage.pairNonce(hex(Noise.pairingNonce()).toUpperCase(java.util.Locale.ROOT)));
        try {
            pairing.get(10, TimeUnit.SECONDS);
            fail("Paired after a malformed nonce");
        } catch (java.util.concurrent.ExecutionException e) {
            assertEquals(PairingSteps.STEPS, e.getCause().getMessage());
        }
        assertNull(phone.snapshot().pairing);
    }

    // What stays on screen

    @Test
    public void aConfirmForAnotherPairingIsIgnored() throws Exception {
        MeshNode phone = node("Phone");
        MeshNode desk = visible("Desk");
        phone.pair("127.0.0.1", desk.port());
        waitFor("the desk's code", 10_000, () -> desk.snapshot().pairing != null);
        String id = phone.snapshot().pairing.id;
        phone.confirmPairing("an-earlier-pairing", true);
        phone.confirmPairing(null, true);
        Thread.sleep(200);
        assertEquals("confirming", phone.snapshot().pairing.state);
        phone.confirmPairing(id, true);
        waitFor("waiting", 5_000, () -> "waiting".equals(phone.snapshot().pairing.state));
        // A late dismiss for another pairing doesn't touch this one either.
        phone.dismissPairing("an-earlier-pairing");
        assertEquals(id, phone.snapshot().pairing.id);
    }

    @Test
    public void aFinishedPairingStaysOnScreenUntilDismissedAndPairNeverReplacesAnActiveOne() throws Exception {
        MeshNode phone = node("Phone");
        MeshNode desk = visible("Desk");
        MeshNode tablet = node("Tablet");
        phone.pair("127.0.0.1", desk.port());
        waitFor("the desk's code", 10_000, () -> desk.snapshot().pairing != null);
        String phoneId = phone.snapshot().pairing.id;

        // pair() while one is going: refused, and the one on screen is the same.
        try {
            phone.pair("127.0.0.1", desk.port());
            fail("A second pair() replaced an active pairing");
        } catch (MeshNode.MeshException e) {
            assertTrue(e.getMessage(), e.getMessage().contains("already in progress"));
        }
        assertEquals(phoneId, phone.snapshot().pairing.id);

        phone.confirmPairing(phoneId, true);
        desk.confirmPairing(desk.snapshot().pairing.id, true);
        waitFor("both paired", 10_000, () -> "paired".equals(phone.snapshot().pairing.state) && "paired".equals(desk.snapshot().pairing.state));
        String deskId = desk.snapshot().pairing.id;

        // Finished but still on the desk's screen: another caller is told it's busy, and the screen doesn't change.
        try {
            tablet.pair("127.0.0.1", desk.port());
            fail("A finished pairing on screen was replaced");
        } catch (MeshNode.MeshException e) {
            assertEquals("Desk is pairing with another computer. Try again in a moment.", e.getMessage());
        }
        assertEquals(deskId, desk.snapshot().pairing.id);
        assertEquals("paired", desk.snapshot().pairing.state);
        assertNull(tablet.snapshot().pairing);

        desk.dismissPairing(deskId);
        tablet.pair("127.0.0.1", desk.port());
        waitFor("the new code", 10_000, () -> desk.snapshot().pairing != null && "confirming".equals(desk.snapshot().pairing.state));
        assertNotEquals(deskId, desk.snapshot().pairing.id);
        assertEquals("Tablet", desk.snapshot().pairing.peerName);
        // The caller's own finished pairing is replaced by its next pair(): that's the person starting again.
        phone.dismissPairing();
    }

    // Mesh's own threads

    @Test
    public void anErrorOnAMeshThreadIsReportedAndTheDeviceCarriesOn() throws Exception {
        final List<Throwable> reported = new java.util.concurrent.CopyOnWriteArrayList<>();
        final java.util.concurrent.atomic.AtomicBoolean thrown = new java.util.concurrent.atomic.AtomicBoolean();
        MeshNode desk = javaNode("Desk", tmp.newFolder(), null, new MeshListener() {
            @Override
            public void onChanged() {}

            @Override
            public void onPairing(MeshNode.PairingView pairing) {
                // As if the phone ran out of memory on the thread answering this call.
                if (thrown.compareAndSet(false, true)) throw new OutOfMemoryError("simulated");
            }

            @Override
            public void onBackgroundError(Throwable error) {
                reported.add(error);
            }
        });
        nodes.add(desk);
        desk.setVisible(true);
        MeshNode phone = node("Phone");
        phone.pair("127.0.0.1", desk.port());
        waitFor("the report", 10_000, () -> !reported.isEmpty());
        assertEquals("simulated", reported.get(0).getMessage());
        // The pairing it was showing carries on, and the device still answers calls.
        waitFor("the desk's code", 10_000, () -> desk.snapshot().pairing != null && "confirming".equals(desk.snapshot().pairing.state));
        assertEquals(phone.snapshot().pairing.code, desk.snapshot().pairing.code);
        SecureChannel another = call(desk, Noise.generateKeyPair(), V2_CALLER);
        assertEquals("busy", next(another).code);
    }

    // The attack

    /** Mallory's side of one leg: the three messages as the caller, returning the code its answerer will show. */
    private static String asCaller(SecureChannel ch, byte[] nC) throws IOException {
        ch.send(MeshMessage.pairCommit(hex(Noise.pairingCommit(nC))));
        MeshMessage nonce = next(ch);
        assertEquals("pair-nonce", nonce.t);
        ch.send(MeshMessage.pairReveal(hex(nC)));
        return Noise.pairingCode(ch.handshakeHash(), nC, hex(nonce.nonce));
    }

    /**
     * A device in the middle of a real phone (caller) and a real desk
     * (answerer). On the phone's leg it answers; on the desk's leg it calls,
     * controls the caller's payload and its own nonce, and may finish either
     * leg first, knowing that leg's code before it commits on the other. It
     * still can't make the two codes match: on each leg the one value it
     * doesn't choose arrives only after it's bound to its own. (A match
     * would be a 1 in 1,000,000 accident; with the old code it needed about
     * 186,000 offline tries inside one handshake.)
     */
    @Test
    public void aDeviceInTheMiddleCantSteerTheCodes() throws Exception {
        for (boolean phoneLegFirst : new boolean[] {false, true}) {
            MeshNode phone = node("Phone");
            MeshNode desk = visible("Desk");
            KeyPair mallory = Noise.generateKeyPair();
            AutoCloseableSocket s = listen();
            // The phone's leg: Mallory answers, under the desk's name.
            CompletableFuture<SecureChannel> phoneLeg = answerNext(s, mallory, new MeshProtocol.Hello("Desk", null));
            CompletableFuture<Void> phonePairing = pairLater(phone, s.server.getLocalPort());
            SecureChannel left = phoneLeg.get(10, TimeUnit.SECONDS);
            MeshMessage commit = next(left);
            assertEquals("pair-commit", commit.t);
            // The phone shows its nonce only for a nonce: Mallory can't learn it first.
            assertSilent(left, 1_000);

            String deskCode;
            String phoneCode;
            if (phoneLegFirst) {
                // Finish the phone's leg, learning its code, then try to match it on the desk's leg.
                byte[] nA = Noise.pairingNonce();
                left.send(MeshMessage.pairNonce(hex(nA)));
                MeshMessage reveal = next(left);
                assertEquals("pair-reveal", reveal.t);
                assertEquals(commit.commit, hex(Noise.pairingCommit(hex(reveal.nonce))));
                phoneCode = Noise.pairingCode(left.handshakeHash(), hex(reveal.nonce), nA);
                // The caller's payload is Mallory's to choose: any name, any keys she likes.
                SecureChannel right = call(desk, Noise.generateKeyPair(), new MeshProtocol.Hello("Phone", "pair"));
                deskCode = asCaller(right, Noise.pairingNonce());
            } else {
                // Finish the desk's leg first, then answer the phone knowing the code it should show.
                SecureChannel right = call(desk, Noise.generateKeyPair(), new MeshProtocol.Hello("Phone", "pair"));
                deskCode = asCaller(right, Noise.pairingNonce());
                // Whatever nonce she sends now, the phone's code depends on the nonce it committed to before.
                byte[] nA = Noise.pairingNonce();
                left.send(MeshMessage.pairNonce(hex(nA)));
                MeshMessage reveal = next(left);
                phoneCode = Noise.pairingCode(left.handshakeHash(), hex(reveal.nonce), nA);
            }
            phonePairing.get(10, TimeUnit.SECONDS);
            waitFor("the desk's code", 10_000, () -> desk.snapshot().pairing != null && desk.snapshot().pairing.code != null);
            assertEquals(phoneCode, phone.snapshot().pairing.code);
            assertEquals(deskCode, desk.snapshot().pairing.code);
            assertNotEquals("The two screens show the same code", phone.snapshot().pairing.code, desk.snapshot().pairing.code);

            // One try per dismissal: while that code is on the desk's screen, another try is turned away.
            SecureChannel again = call(desk, Noise.generateKeyPair(), new MeshProtocol.Hello("Phone", "pair"));
            MeshMessage busy = next(again);
            assertEquals("error", busy.t);
            assertEquals("busy", busy.code);
        }
    }
}
