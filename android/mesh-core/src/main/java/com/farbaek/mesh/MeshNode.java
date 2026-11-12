package com.farbaek.mesh;

import java.io.Closeable;
import java.io.File;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * One device in Farbaek Mesh, as src/agent-runtime/mesh/node.ts runs one on
 * the desktop: its key, the devices it trusts, visibility on the local
 * network, pairing, and the transfers it sends and receives. An Android
 * foreground service owns one and drives it; every call returns quickly and
 * the work runs on Mesh's own threads, reported through {@link MeshListener}.
 *
 * Nothing listens until the person asks to be visible, and that lapses after
 * five minutes. Pairing (v2) makes its six-digit code only after the caller
 * has committed to a random value and the answerer has sent its own, so no
 * device in the middle can choose it; both people then confirm the same code
 * within two minutes. Transfers need a paired device on both ends, and every
 * incoming one waits for the person to accept it.
 *
 * Not ported: Farbaek's relay, direct links over the internet and the queue
 * that waits for an offline device (ADR 0094, 0095, 0138), which belong to
 * the app's internet side.
 */
public final class MeshNode implements Closeable {
    static final long CONNECT_TIMEOUT_MS = 10_000;
    /** How long an answering device waits for the caller's first message after the handshake. */
    static final long FIRST_MESSAGE_MS = 30_000;

    /** A person-readable reason an action can't be done now. */
    public static final class MeshException extends Exception {
        public MeshException(String message) {
            super(message);
        }
    }

    /** Supplies the device's display name each time it's needed. */
    public interface NameSource {
        String name();
    }

    public static final class Options {
        /** Where mesh-devices.json (trusted devices) and mesh-receiving.json (folders of unfinished transfers) live. */
        public File dataDir;
        public NameSource name;
        public KeyVault vault;
        public MeshListener listener;
        /** false turns discovery off (tests, or a device that only connects by address). */
        public boolean discovery = true;
        public String discoveryGroup = MeshProtocol.DISCOVERY_GROUP;
        public int discoveryPort = MeshProtocol.DISCOVERY_PORT;
        /** The address the listener binds to; null for every interface. Tests use 127.0.0.1. */
        public String listenHost;
        /** What java.io can't see (hard links, links): on Android, an lstat-based probe. */
        public GuardedFolder.FileProbe probe = GuardedFolder.CANONICAL_PROBE;
        /** Test seam only. */
        OutgoingTransfer.PieceFilter pieceFilter;
    }

    public static final class PairingView {
        /** Pass it back to confirmPairing, so a tap meant for one pairing never confirms another. */
        public final String id;
        /** "caller" or "answerer". */
        public final String role;
        public final String peerName;
        public final String peerFingerprint;
        /** The six digits to show on both screens; null when the pairing stopped before a code was made. */
        public final String code;
        /** confirming, waiting, paired, declined, expired or failed. */
        public final String state;
        public final long expiresAt;
        public final String message;

        PairingView(String id, String role, String peerName, String peerFingerprint, String code, String state, long expiresAt, String message) {
            this.id = id;
            this.role = role;
            this.peerName = peerName;
            this.peerFingerprint = peerFingerprint;
            this.code = code;
            this.state = state;
            this.expiresAt = expiresAt;
            this.message = message;
        }
    }

    public static final class PreparedView {
        public final String id;
        public final String name;
        public final String root;
        public final long files;
        public final long bytes;
        public final List<Capsule.Excluded> excluded;
        public final int excludedCount;

        PreparedView(String id, Packer.PackedFolder p) {
            this.id = id;
            this.name = p.name;
            this.root = p.root.getPath();
            this.files = p.manifest.totalFiles;
            this.bytes = p.manifest.totalBytes;
            this.excluded = Collections.unmodifiableList(new ArrayList<>(p.manifest.excluded.subList(0, Math.min(50, p.manifest.excluded.size()))));
            this.excludedCount = p.manifest.excluded.size();
        }
    }

    public static final class Snapshot {
        public final String name;
        public final String fingerprint;
        /** Until when this device is visible (ms since the epoch), or 0. */
        public final long visibleUntil;
        public final int port;
        public final List<String> addresses;
        public final boolean looking;
        public final List<Discovery.NearbyDevice> nearby;
        public final List<TrustStore.TrustedDevice> devices;
        public final PairingView pairing;
        public final List<PreparedView> prepared;
        public final List<TransferView> transfers;

        Snapshot(String name, String fingerprint, long visibleUntil, int port, List<String> addresses, boolean looking, List<Discovery.NearbyDevice> nearby,
                List<TrustStore.TrustedDevice> devices, PairingView pairing, List<PreparedView> prepared, List<TransferView> transfers) {
            this.name = name;
            this.fingerprint = fingerprint;
            this.visibleUntil = visibleUntil;
            this.port = port;
            this.addresses = addresses;
            this.looking = looking;
            this.nearby = nearby;
            this.devices = devices;
            this.pairing = pairing;
            this.prepared = prepared;
            this.transfers = transfers;
        }

        public TransferView transfer(String id) {
            for (TransferView t : transfers) {
                if (t.id.equals(id)) return t;
            }
            return null;
        }
    }

    /** Why a pairing stopped before any code was shown, in words for the screen. */
    private static final class NoCode extends Exception {
        NoCode(String message) {
            super(message);
        }
    }

    /** What this screen says when the other device is too old to pair with. */
    static String updateToPair(String peerName) {
        return "Update Farbaek on " + peerName + " to pair: pairing changed to keep it safe.";
    }

    /** What the older device is told before the connection closes, as the desktop agent words it: that device is the one to update. */
    static final String UPDATE_THIS_DEVICE = "Update Farbaek on this device to pair: pairing changed to keep it safe.";

    static String busyPairing(String peerName) {
        return peerName + " is pairing with another computer. Try again in a moment.";
    }

    private final Options options;
    private final TrustStore trust;
    private final ReceivingFolders receiving;
    private final ExecutorService executor;
    private final ScheduledExecutorService timers;
    private KeyPair key;
    private Discovery discovery;
    private ServerSocket server;
    private long visibleUntil;
    private ScheduledFuture<?> visibleTimer;
    private ScheduledFuture<?> lookingTimer;
    private boolean looking;
    /** The pairing on screen, finished or not, until the person dismisses it. */
    private volatile PairingSession pairing;
    /** A pairing is being set up (handshake, then the three v2 messages): nothing else may start one. Guarded by this. */
    private boolean pairingStarting;
    private final Map<String, Packer.PackedFolder> prepared = new ConcurrentHashMap<>();
    private final Map<String, IncomingTransfer> incoming = new ConcurrentHashMap<>();
    private final Map<String, OutgoingTransfer> outgoing = new ConcurrentHashMap<>();
    /** Where paired devices were last found, by fingerprint: only trusted devices are kept, so it's as small as the trust list. */
    private final Map<String, InetSocketAddress> addresses = new ConcurrentHashMap<>();
    /** Calls being answered at once. */
    private final java.util.concurrent.Semaphore answering = new java.util.concurrent.Semaphore(16);

    public MeshNode(Options options) {
        if (options.dataDir == null || options.name == null || options.vault == null || options.listener == null) throw new IllegalArgumentException("dataDir, name, vault and listener are needed.");
        this.options = options;
        this.trust = new TrustStore(new File(options.dataDir, "mesh-devices.json"));
        this.receiving = new ReceivingFolders(new File(options.dataDir, "mesh-receiving.json"));
        final AtomicInteger count = new AtomicInteger();
        ThreadFactory threads = new ThreadFactory() {
            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "mesh-" + count.incrementAndGet());
                t.setDaemon(true);
                return t;
            }
        };
        this.executor = Executors.newCachedThreadPool(threads);
        this.timers = Executors.newSingleThreadScheduledExecutor(threads);
    }

    /**
     * Loads the device key (made and stored on first use) and the trusted
     * devices, and removes what transfers interrupted by the app stopping
     * left in the folders they were receiving into.
     */
    public void init() throws IOException {
        byte[] stored = options.vault.load();
        if (stored != null && stored.length == 32) {
            key = Noise.keyPairFromPrivate(stored);
        } else {
            key = Noise.generateKeyPair();
            options.vault.store(key.privateKeyRef());
        }
        if (stored != null) java.util.Arrays.fill(stored, (byte) 0);
        trust.load();
        receiving.load();
        receiving.cleanUp(liveFolders(), options.probe);
    }

    /** The folders live incoming transfers are receiving into. */
    private Set<String> liveFolders() {
        Set<String> live = new HashSet<>();
        for (IncomingTransfer t : incoming.values()) {
            File dest = t.destination();
            if (dest != null) live.add(dest.getAbsolutePath());
        }
        return live;
    }

    public String fingerprint() {
        return Noise.fingerprint(key.publicKeyRef());
    }

    public byte[] publicKey() {
        return key.publicKey();
    }

    String name() {
        String raw = options.name.name();
        String trimmed = Packer.head(Json.jsTrim(raw == null ? "" : raw), 60);
        return trimmed.isEmpty() ? "Farbaek device" : trimmed;
    }

    private void update() {
        try {
            options.listener.onChanged();
        } catch (RuntimeException ignored) {
            // The app's listener failing mustn't stop a transfer.
        }
    }

    // Mesh's own threads: nothing thrown on them is lost or ends them

    private void report(Throwable error) {
        try {
            options.listener.onBackgroundError(error);
        } catch (Throwable ignored) {
            // Reporting is all that's left to do.
        }
    }

    /** The task, catching and reporting anything it throws, errors included. */
    private Runnable guarded(final Runnable task) {
        return new Runnable() {
            @Override
            public void run() {
                try {
                    task.run();
                } catch (Throwable error) {
                    report(error);
                }
            }
        };
    }

    /** Runs a task on Mesh's threads. False when it couldn't start (closed, or no thread could be made), already reported. */
    private boolean background(Runnable task) {
        try {
            executor.execute(guarded(task));
            return true;
        } catch (Throwable error) {
            report(error);
            return false;
        }
    }

    private ScheduledFuture<?> later(Runnable task, long delayMs) {
        try {
            return timers.schedule(guarded(task), delayMs, TimeUnit.MILLISECONDS);
        } catch (Throwable error) {
            report(error);
            return null;
        }
    }

    public Snapshot snapshot() {
        List<Discovery.NearbyDevice> nearby;
        synchronized (this) {
            nearby = discovery == null ? new ArrayList<Discovery.NearbyDevice>() : discovery.devices();
        }
        List<String> local = new ArrayList<>();
        boolean visible;
        synchronized (this) {
            visible = visibleUntil > 0;
        }
        // Only while visible, as the desktop does: listing interfaces isn't free on every progress update.
        if (visible) {
            for (InetAddress a : Discovery.localAddresses()) local.add(a.getHostAddress());
        }
        List<PreparedView> preparedViews = new ArrayList<>();
        for (Map.Entry<String, Packer.PackedFolder> e : prepared.entrySet()) preparedViews.add(new PreparedView(e.getKey(), e.getValue()));
        List<TransferView> transfers = new ArrayList<>();
        for (IncomingTransfer t : incoming.values()) transfers.add(t.view());
        for (OutgoingTransfer t : outgoing.values()) transfers.add(t.view());
        Collections.sort(transfers, new Comparator<TransferView>() {
            @Override
            public int compare(TransferView a, TransferView b) {
                return Long.compare(b.updatedAt, a.updatedAt);
            }
        });
        PairingSession p = pairing;
        synchronized (this) {
            return new Snapshot(name(), fingerprint(), visibleUntil, visibleUntil > 0 && server != null ? server.getLocalPort() : 0, local, looking,
                    Collections.unmodifiableList(nearby), trust.list(), p == null ? null : p.view(), Collections.unmodifiableList(preparedViews), Collections.unmodifiableList(transfers));
        }
    }

    // Visibility and discovery

    /** Starts or stops accepting calls (and announcing this device) for the next five minutes. */
    public void setVisible(boolean on) throws IOException, MeshException {
        synchronized (this) {
            if (visibleTimer != null) visibleTimer.cancel(false);
            visibleTimer = null;
            if (!on) {
                visibleUntil = 0;
                if (server != null) server.close();
                server = null;
                if (!looking) stopDiscovery();
            } else {
                if (server == null) {
                    final ServerSocket s = new ServerSocket();
                    // Every interface unless a host is given (InetAddress.getByName(null) would be loopback only).
                    s.bind(options.listenHost == null ? new InetSocketAddress(0) : new InetSocketAddress(InetAddress.getByName(options.listenHost), 0));
                    if (!background(new Runnable() {
                        @Override
                        public void run() {
                            acceptLoop(s);
                        }
                    })) {
                        s.close();
                        throw new MeshException("This device couldn't start listening just now. Try again in a moment.");
                    }
                    server = s;
                }
                visibleUntil = System.currentTimeMillis() + MeshProtocol.VISIBLE_FOR_MS;
                visibleTimer = later(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            setVisible(false);
                        } catch (IOException | MeshException ignored) {
                            // Turning off doesn't fail.
                        }
                    }
                }, MeshProtocol.VISIBLE_FOR_MS);
                startDiscovery();
                if (discovery != null) discovery.announce();
            }
        }
        update();
    }

    /** The TCP port while visible, or 0. */
    public synchronized int port() {
        return server == null ? 0 : server.getLocalPort();
    }

    /** Starts or stops looking for nearby devices for the next five minutes. */
    public void setLooking(boolean on) throws MeshException {
        synchronized (this) {
            if (lookingTimer != null) lookingTimer.cancel(false);
            lookingTimer = null;
            looking = on;
            if (on) {
                startDiscovery();
                lookingTimer = later(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            setLooking(false);
                        } catch (MeshException ignored) {
                            // Turning off doesn't fail.
                        }
                    }
                }, MeshProtocol.VISIBLE_FOR_MS);
            } else if (visibleUntil == 0) {
                stopDiscovery();
            }
        }
        update();
    }

    private synchronized void startDiscovery() throws MeshException {
        if (!options.discovery || (discovery != null && discovery.running())) return;
        final Discovery d = new Discovery(options.discoveryGroup, options.discoveryPort, new Discovery.Self() {
            @Override
            public MeshProtocol.Announcement current() {
                return new MeshProtocol.Announcement("here", name(), fingerprint(), visibleUntil > 0 ? port() : 0);
            }
        }, new Runnable() {
            @Override
            public void run() {
                Discovery current;
                synchronized (MeshNode.this) {
                    current = discovery;
                }
                if (current == null) return;
                List<Discovery.NearbyDevice> devices = current.devices();
                // Addresses are kept only for paired devices: announcements from anyone else don't grow anything here.
                for (Discovery.NearbyDevice device : devices) {
                    if (trust.byFingerprint(device.fingerprint) != null) addresses.put(device.fingerprint, new InetSocketAddress(device.address, device.port));
                }
                try {
                    options.listener.onNearby(devices);
                } catch (RuntimeException ignored) {
                    // The app's listener failing mustn't stop discovery.
                }
                update();
            }
        });
        discovery = d;
        try {
            d.start();
        } catch (IOException e) {
            discovery = null;
            throw new MeshException("This device couldn't look for others on the network. Connect by address instead.");
        }
    }

    private synchronized void stopDiscovery() {
        Discovery d = discovery;
        discovery = null;
        if (d != null) d.stop();
    }

    // Answering calls

    private void acceptLoop(ServerSocket s) {
        while (!s.isClosed()) {
            final Socket socket;
            try {
                socket = s.accept();
            } catch (IOException e) {
                return;
            }
            // Each call costs threads: past this many at once, more are turned away rather than exhausting the phone.
            if (!answering.tryAcquire()) {
                closeQuietly(socket);
                continue;
            }
            boolean started = background(new Runnable() {
                @Override
                public void run() {
                    try {
                        answer(socket);
                    } finally {
                        answering.release();
                    }
                }
            });
            if (!started) {
                answering.release();
                closeQuietly(socket);
            }
        }
    }

    private static void closeQuietly(Socket socket) {
        try {
            socket.close();
        } catch (IOException ignored) {
            // Already closed.
        }
    }

    private void answer(Socket socket) {
        SecureChannel channel;
        try {
            channel = SecureChannel.respond(socket, key, new MeshProtocol.Hello(name(), null));
        } catch (Throwable e) {
            // Includes an OutOfMemoryError from starting the connection's reader thread: the socket closes either way.
            closeQuietly(socket);
            if (e instanceof Error) report(e);
            return;
        }
        String purpose = channel.peer.hello.purpose;
        if ("pair".equals(purpose)) {
            answerPairing(channel);
            return;
        }
        if ("transfer".equals(purpose)) {
            answerTransfer(channel);
            return;
        }
        channel.close();
    }

    private void answerPairing(SecureChannel channel) {
        String peer = channel.peer.hello.name;
        String peerFingerprint = Noise.fingerprint(channel.peer.publicKey);
        // An older device is refused at once: no code, and no falling back to the code a device in the middle could choose.
        if (!channel.peer.hello.pairsSafely()) {
            String words = updateToPair(peer);
            sendQuietly(channel, MeshMessage.error("protocol", UPDATE_THIS_DEVICE));
            channel.close();
            PairingSession refused = new PairingSession("answerer", peer, peerFingerprint, words);
            synchronized (this) {
                if (pairingStarting || pairing != null) return;
                pairing = refused;
            }
            refused.announce();
            return;
        }
        synchronized (this) {
            // A pairing on screen, even a finished one, stays until the person dismisses it.
            if (pairingStarting || pairing != null) {
                sendQuietly(channel, MeshMessage.error("busy", "This computer is already pairing."));
                channel.close();
                return;
            }
            pairingStarting = true;
        }
        try {
            String code;
            try {
                code = exchangeCode(channel, false);
            } catch (NoCode e) {
                // Shown, as the desktop agent shows it: someone may be trying codes from the middle.
                PairingSession failed = new PairingSession("answerer", peer, peerFingerprint, e.getMessage());
                synchronized (this) {
                    pairing = failed;
                    pairingStarting = false;
                }
                failed.announce();
                return;
            }
            PairingSession session = new PairingSession("answerer", channel, code, null);
            synchronized (this) {
                pairing = session;
                pairingStarting = false;
            }
            session.begin();
        } finally {
            synchronized (this) {
                pairingStarting = false;
            }
        }
    }

    /**
     * Pairing v2's three messages, on a channel whose handshake has just
     * finished: commit, nonce, reveal (PairingSteps), all within the
     * handshake timeout. Returns the six digits; anything else closes the
     * channel and throws, with the other device's own words when it sent an
     * error (busy, for one), and otherwise that it didn't follow the steps.
     */
    private String exchangeCode(SecureChannel channel, boolean caller) throws NoCode {
        String peer = channel.peer.hello.name;
        PairingSteps steps = caller ? PairingSteps.caller(channel.handshakeHash()) : PairingSteps.answerer(channel.handshakeHash());
        long deadline = System.currentTimeMillis() + MeshProtocol.HANDSHAKE_TIMEOUT_MS;
        try {
            if (caller) {
                try {
                    channel.send(steps.start());
                } catch (IOException e) {
                    // The answerer may already have said no and closed: its reason is still there to read below.
                }
            }
            while (!steps.done()) {
                long remaining = deadline - System.currentTimeMillis();
                if (remaining <= 0) throw new PairingSteps.Failed();
                MeshMessage m = channel.receive(remaining).message;
                if ("error".equals(m.t)) {
                    channel.close();
                    throw new NoCode("busy".equals(m.code) ? busyPairing(peer) : m.message);
                }
                MeshMessage reply = steps.receive(m);
                if (reply != null) channel.send(reply);
            }
            return steps.code();
        } catch (PairingSteps.Failed e) {
            // Out of order, repeated, extra, a reveal that doesn't match, or too slow: the other side hears why.
            sendQuietly(channel, MeshMessage.error("protocol", PairingSteps.STEPS));
            channel.close();
            throw new NoCode(PairingSteps.STEPS);
        } catch (IOException e) {
            // Not a well-formed message (hex of the wrong length or case, a message this version doesn't know), a changed one, silence, or a closed connection.
            channel.close();
            throw new NoCode(PairingSteps.STEPS);
        }
    }

    private static void sendQuietly(SecureChannel channel, MeshMessage message) {
        try {
            channel.send(message);
        } catch (IOException ignored) {
            // Already gone.
        }
    }

    private void answerTransfer(SecureChannel channel) {
        TrustStore.TrustedDevice device = trust.find(channel.peer.publicKey);
        if (device == null) {
            sendQuietly(channel, MeshMessage.error("not_paired", "These computers aren't paired. Pair them first."));
            channel.close();
            return;
        }
        MeshMessage first;
        try {
            first = channel.receive(FIRST_MESSAGE_MS).message;
        } catch (IOException e) {
            channel.close();
            return;
        }
        if (!"offer".equals(first.t)) {
            channel.close();
            return;
        }
        IncomingTransfer existing = incoming.get(first.session);
        if (existing != null) {
            // The same sender resuming the same transfer: carry on without asking again.
            try {
                Capsule.Manifest manifest = IncomingTransfer.readOffer(channel, first);
                if (!existing.digest.equals(first.digest) || !manifest.id.equals(existing.manifest.id) || !Noise.sameKey(channel.peer.publicKey, existing.peerKey)) {
                    throw new IncomingTransfer.OfferException("That isn't the transfer it claims to resume.");
                }
                if (existing.state() == TransferState.DONE) {
                    // Finished here already; the sender only missed the verdict.
                    sendQuietly(channel, MeshMessage.verified(manifest.totalFiles, manifest.totalBytes));
                    channel.close();
                    return;
                }
                existing.reattach(channel);
            } catch (IncomingTransfer.OfferException e) {
                sendQuietly(channel, MeshMessage.error("bad_offer", e.getMessage()));
                channel.close();
            } catch (IOException e) {
                sendQuietly(channel, MeshMessage.error("bad_offer", "That transfer can't be resumed."));
                channel.close();
            }
            return;
        }
        try {
            Capsule.Manifest manifest = IncomingTransfer.readOffer(channel, first);
            // The name the person saw when pairing, not whatever the sender calls itself today.
            IncomingTransfer transfer = new IncomingTransfer(channel, first.session, first.digest, manifest, device.name, transferUpdate(first.session, true), options.probe, receiving);
            incoming.put(transfer.id, transfer);
            update();
        } catch (IncomingTransfer.OfferException e) {
            StringBuilder words = new StringBuilder(e.getMessage());
            for (int i = 0; i < Math.min(3, e.problems.size()); i++) words.append(' ').append(e.problems.get(i));
            sendQuietly(channel, MeshMessage.error("bad_offer", Packer.head(words.toString(), 300)));
            channel.close();
        } catch (IOException e) {
            sendQuietly(channel, MeshMessage.error("bad_offer", "The offer couldn't be read."));
            channel.close();
        }
    }

    /** Tells the listener about one transfer, then that something changed. */
    private Runnable transferUpdate(final String id, final boolean in) {
        return new Runnable() {
            @Override
            public void run() {
                TransferView view = null;
                if (in) {
                    IncomingTransfer t = incoming.get(id);
                    if (t != null) view = t.view();
                } else {
                    OutgoingTransfer t = outgoing.get(id);
                    if (t != null) view = t.view();
                }
                if (view != null) {
                    try {
                        options.listener.onTransfer(view);
                    } catch (RuntimeException ignored) {
                        // The app's listener failing mustn't stop a transfer.
                    }
                }
                update();
            }
        };
    }

    // Calling out

    private SecureChannel dial(InetSocketAddress at, String purpose) throws IOException {
        Socket socket = new Socket();
        try {
            socket.connect(at, (int) CONNECT_TIMEOUT_MS);
        } catch (IOException e) {
            socket.close();
            throw new IOException("The other computer didn't answer.");
        }
        try {
            return SecureChannel.initiate(socket, key, new MeshProtocol.Hello(name(), purpose), MeshProtocol.HANDSHAKE_TIMEOUT_MS);
        } catch (IOException | RuntimeException | Error e) {
            closeQuietly(socket);
            throw e;
        }
    }

    /**
     * Starts pairing with the device at this address: the handshake, then
     * pairing v2's three messages, then both people compare the code. Blocks
     * for all of that (up to about 30 s), so call it off the main thread. A
     * pairing in progress isn't replaced; a finished one on screen is.
     */
    public void pair(String address, int port) throws MeshException {
        synchronized (this) {
            if (pairingStarting || (pairing != null && pairing.active())) throw new MeshException("A pairing is already in progress. Finish or cancel it first.");
            pairingStarting = true;
        }
        try {
            InetSocketAddress at = new InetSocketAddress(address, port);
            SecureChannel channel;
            try {
                channel = dial(at, "pair");
            } catch (IOException e) {
                throw new MeshException("That computer didn't answer. Check it's visible and on the same network.");
            }
            String peer = channel.peer.hello.name;
            if (!channel.peer.hello.pairsSafely()) {
                // Refused at once, never the old code: the other device shows why too.
                String words = updateToPair(peer);
                sendQuietly(channel, MeshMessage.error("protocol", UPDATE_THIS_DEVICE));
                channel.close();
                throw new MeshException(words);
            }
            String code;
            try {
                code = exchangeCode(channel, true);
            } catch (NoCode e) {
                throw new MeshException(e.getMessage());
            }
            PairingSession session = new PairingSession("caller", channel, code, at);
            synchronized (this) {
                pairing = session;
                pairingStarting = false;
            }
            session.begin();
        } finally {
            synchronized (this) {
                pairingStarting = false;
            }
        }
    }

    /**
     * The person says whether both screens show the same code, for the
     * pairing with this id (PairingView.id). Any other id, such as a tap on a
     * screen showing an earlier pairing, is ignored.
     */
    public void confirmPairing(String pairingId, boolean ok) {
        PairingSession p = pairing;
        if (p != null && pairingId != null && p.id.equals(pairingId)) p.confirm(ok);
    }

    /** Takes the pairing off the screen, cancelling it if it's still going. A new one can start once it's gone. */
    public void dismissPairing() {
        dismissSession(null);
    }

    /** As dismissPairing(), only for the pairing with this id: a late tap never dismisses a newer pairing. */
    public void dismissPairing(String pairingId) {
        if (pairingId != null) dismissSession(pairingId);
    }

    private void dismissSession(String pairingId) {
        PairingSession p;
        synchronized (this) {
            p = pairing;
            if (p != null && pairingId != null && !p.id.equals(pairingId)) return;
            pairing = null;
        }
        if (p != null && p.active()) p.end("declined", "Pairing cancelled.");
        update();
    }

    public void forget(String fingerprint) throws IOException {
        trust.forget(fingerprint);
        addresses.remove(fingerprint);
        update();
    }

    // Transfers

    /** Packs a folder to send: blocks while every file is hashed, so call it off the main thread. */
    public PreparedView prepare(File root) throws IOException {
        Packer.PackedFolder packed = Packer.packFolder(root, null, options.probe);
        String id = UUID.randomUUID().toString();
        prepared.put(id, packed);
        update();
        return new PreparedView(id, packed);
    }

    /** Test seam: offers a folder packed (or altered) by the test itself. */
    String prepareRaw(Packer.PackedFolder packed) {
        String id = UUID.randomUUID().toString();
        prepared.put(id, packed);
        return id;
    }

    public void dropPrepared(String id) {
        prepared.remove(id);
        update();
    }

    /** Sends a prepared folder to a paired device, at the address discovery found or the one given. Returns the transfer's id. */
    public String send(String preparedId, String deviceFingerprint, InetSocketAddress at) throws MeshException {
        Packer.PackedFolder packed = prepared.get(preparedId);
        if (packed == null) throw new MeshException("Choose the folder again: it's no longer prepared.");
        final TrustStore.TrustedDevice device = trust.byFingerprint(deviceFingerprint);
        if (device == null) throw new MeshException("Pair with that computer first.");
        if ("farbaek".equals(device.via)) throw new MeshException(device.name + " is a phone or browser: phones and browsers receive over the internet.");
        if (at != null) addresses.put(device.fingerprint, at);
        if (!addresses.containsKey(device.fingerprint)) throw new MeshException(device.name + " isn't visible. On that device, open Nearby and choose Be visible.");
        String id = UUID.randomUUID().toString();
        final OutgoingTransfer transfer = new OutgoingTransfer(id, packed, device, new OutgoingTransfer.Connector() {
            @Override
            public SecureChannel connect() throws IOException {
                InetSocketAddress where = addresses.get(device.fingerprint);
                if (where == null) throw new IOException(device.name + " isn't visible yet.");
                return dial(where, "transfer");
            }
        }, transferUpdate(id, false), executor, options.pieceFilter);
        outgoing.put(id, transfer);
        prepared.remove(preparedId);
        if (!background(new Runnable() {
            @Override
            public void run() {
                transfer.start();
            }
        })) {
            outgoing.remove(id);
            prepared.put(preparedId, packed);
            throw new MeshException("This device couldn't start sending just now. Try again in a moment.");
        }
        update();
        return id;
    }

    /**
     * Accepts into a new folder inside `parent`; with `earlier`, files already
     * in that earlier copy aren't sent again. A second tap on the same offer
     * does nothing: the first one has taken it.
     */
    public void accept(String id, final File parent, final File earlier) throws MeshException {
        final IncomingTransfer transfer = incoming.get(id);
        if (transfer == null || transfer.state() != TransferState.OFFERED) throw new MeshException("That transfer isn't waiting any more.");
        if (!background(new Runnable() {
            @Override
            public void run() {
                try {
                    transfer.accept(parent, earlier);
                } catch (IOException | IncomingTransfer.OfferException | RuntimeException e) {
                    transfer.note(e.getMessage() != null ? e.getMessage() : "It couldn't be accepted.");
                }
            }
        })) {
            throw new MeshException("This device couldn't start receiving just now. Try again in a moment.");
        }
    }

    public void decline(String id) {
        IncomingTransfer t = incoming.get(id);
        if (t != null) t.decline();
    }

    public void cancel(String id) {
        IncomingTransfer in = incoming.get(id);
        if (in != null) in.cancel();
        OutgoingTransfer out = outgoing.get(id);
        if (out != null) out.cancel();
    }

    /** Resumes an interrupted outgoing transfer: the receiver says where to carry on. A second tap is refused, not run twice. */
    public void resume(String id) throws MeshException {
        final OutgoingTransfer transfer = outgoing.get(id);
        if (transfer == null || !transfer.claimResume()) throw new MeshException("Only an interrupted transfer can resume.");
        if (!background(new Runnable() {
            @Override
            public void run() {
                transfer.start();
            }
        })) {
            throw new MeshException("This device couldn't resume just now. Try again in a moment.");
        }
    }

    /** Removes a finished transfer from the list, or gives up on an interrupted incoming one. */
    public void dismiss(String id) {
        IncomingTransfer in = incoming.get(id);
        if (in != null && in.state() == TransferState.INTERRUPTED) in.discard();
        if (in != null && in.state().isFinal()) incoming.remove(id);
        OutgoingTransfer out = outgoing.get(id);
        if (out != null && (out.state().isFinal() || out.state() == TransferState.INTERRUPTED)) outgoing.remove(id);
        update();
    }

    @Override
    public void close() {
        for (IncomingTransfer t : incoming.values()) {
            TransferState s = t.state();
            if (!s.isFinal() && s != TransferState.OFFERED && s != TransferState.INTERRUPTED) t.cancel();
        }
        for (OutgoingTransfer t : outgoing.values()) {
            TransferState s = t.state();
            if (!s.isFinal() && s != TransferState.INTERRUPTED) t.cancel();
        }
        dismissPairing();
        try {
            setLooking(false);
            setVisible(false);
        } catch (IOException | MeshException ignored) {
            // Turning off doesn't fail.
        }
        timers.shutdownNow();
        executor.shutdownNow();
    }

    /** Both people confirm the same code within two minutes, or nothing is trusted. */
    private final class PairingSession {
        final String id = UUID.randomUUID().toString();
        final String role;
        /** Null for a pairing that stopped before any code was made. */
        final SecureChannel channel;
        final String peerName;
        final String peerFingerprint;
        /** The six digits, or null when it stopped before a code was made. */
        final String code;
        /** The caller's: the address it dialled, kept for sending once paired. */
        final InetSocketAddress dialled;
        final long expiresAt = System.currentTimeMillis() + MeshProtocol.PAIRING_WINDOW_MS;
        volatile String state = "confirming";
        volatile String message;
        private Boolean mine;
        private Boolean theirs;
        private ScheduledFuture<?> timer;

        PairingSession(String role, SecureChannel channel, String code, InetSocketAddress dialled) {
            this.role = role;
            this.channel = channel;
            this.peerName = channel.peer.hello.name;
            this.peerFingerprint = Noise.fingerprint(channel.peer.publicKey);
            this.code = code;
            this.dialled = dialled;
        }

        /** One that stopped before a code: shown, with why, until the person dismisses it. */
        PairingSession(String role, String peerName, String peerFingerprint, String words) {
            this.role = role;
            this.channel = null;
            this.peerName = peerName;
            this.peerFingerprint = peerFingerprint;
            this.code = null;
            this.dialled = null;
            this.state = "failed";
            this.message = words;
        }

        void begin() {
            timer = later(new Runnable() {
                @Override
                public void run() {
                    end("expired", "The code wasn't confirmed within two minutes. Start again.");
                }
            }, MeshProtocol.PAIRING_WINDOW_MS);
            if (!background(new Runnable() {
                @Override
                public void run() {
                    listen();
                }
            })) {
                end("failed", "This device couldn't carry on pairing just now. Start again.");
                return;
            }
            announce();
        }

        boolean active() {
            return "confirming".equals(state) || "waiting".equals(state);
        }

        PairingView view() {
            return new PairingView(id, role, peerName, peerFingerprint, code, state, expiresAt, message);
        }

        void announce() {
            try {
                options.listener.onPairing(view());
            } catch (RuntimeException ignored) {
                // The app's listener failing mustn't stop pairing.
            }
            update();
        }

        private void listen() {
            try {
                MeshMessage m = channel.receive(MeshProtocol.PAIRING_WINDOW_MS).message;
                if ("pair-confirm".equals(m.t)) {
                    synchronized (this) {
                        theirs = m.ok;
                    }
                    settle();
                } else if ("error".equals(m.t)) {
                    end("failed", "busy".equals(m.code) ? busyPairing(peerName) : m.message);
                } else {
                    // A repeated or extra pairing step after the code, or anything else out of order.
                    sendQuietly(channel, MeshMessage.error("protocol", PairingSteps.STEPS));
                    end("failed", PairingSteps.STEPS);
                }
            } catch (IOException e) {
                if (active()) end("failed", "The connection closed before both codes were confirmed.");
            }
        }

        void confirm(boolean ok) {
            synchronized (this) {
                if (!active() || mine != null) return;
                mine = ok;
            }
            sendQuietly(channel, MeshMessage.pairConfirm(ok));
            settle();
        }

        private void settle() {
            Boolean m;
            Boolean t;
            synchronized (this) {
                if (!active()) return;
                m = mine;
                t = theirs;
            }
            if (Boolean.FALSE.equals(m)) {
                end("declined", "You said the codes don't match, so the devices weren't paired.");
                return;
            }
            if (Boolean.FALSE.equals(t)) {
                end("declined", peerName + " said the codes don't match, so the devices weren't paired.");
                return;
            }
            if (Boolean.TRUE.equals(m) && Boolean.TRUE.equals(t)) {
                try {
                    trust.add(channel.peer.publicKey, peerName, "nearby");
                } catch (IOException e) {
                    end("failed", "This device couldn't save the pairing.");
                    return;
                }
                if (dialled != null) addresses.put(peerFingerprint, dialled);
                end("paired", "Paired with " + peerName + ".");
                return;
            }
            if (Boolean.TRUE.equals(m)) {
                synchronized (this) {
                    if (!active()) return;
                    state = "waiting";
                    message = "Waiting for " + peerName + " to confirm the same code.";
                }
                announce();
            }
        }

        void end(String next, String words) {
            synchronized (this) {
                if (!active()) return;
                state = next;
                message = words;
            }
            if (timer != null) timer.cancel(false);
            if (channel != null) {
                // Give the last confirmation a moment to reach the other side before closing.
                final SecureChannel ch = channel;
                if (later(new Runnable() {
                    @Override
                    public void run() {
                        ch.close();
                    }
                }, 250) == null) {
                    ch.close();
                }
            }
            announce();
        }
    }

    /** For callers that want a stable order: trusted devices by name. */
    public List<TrustStore.TrustedDevice> devices() {
        List<TrustStore.TrustedDevice> list = new ArrayList<>(trust.list());
        Collections.sort(list, new Comparator<TrustStore.TrustedDevice>() {
            @Override
            public int compare(TrustStore.TrustedDevice a, TrustStore.TrustedDevice b) {
                return a.name.compareTo(b.name);
            }
        });
        return list;
    }

    /** Addresses learned from discovery or given, by fingerprint. */
    Map<String, InetSocketAddress> knownAddresses() {
        return new LinkedHashMap<>(addresses);
    }

    /** Test seam: the folders recorded as being received into. */
    List<File> receivingFolders() {
        return receiving.list();
    }
}
