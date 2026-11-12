package com.farbaek.mesh;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;

/**
 * Finding Farbaek devices on the local network, as
 * src/agent-runtime/mesh/discovery.ts does: small UDP multicast
 * announcements on 239.255.70.66:53366, only while the person has asked to
 * be visible or to look. An announcement says the protocol, a display name,
 * a key fingerprint and the TCP port; nothing in it is secret or grants
 * anything. Trust comes only from pairing.
 *
 * On Android the app holds a WifiManager.MulticastLock while this runs, or
 * the Wi-Fi driver drops multicast it receives.
 */
public final class Discovery {
    /** How often a visible device announces itself, and how long a device stays listed after its last announcement. */
    static final long ANNOUNCE_EVERY_MS = 2_000;
    static final long FORGET_AFTER_MS = 10_000;
    static final int MAX_DATAGRAM = 512;
    /** The most devices listed at once; past it, the one heard from longest ago makes room for a newcomer. */
    static final int MAX_FOUND = 64;
    /** The most devices listed from one address (a computer running a few copies is fine; a flood isn't). */
    static final int MAX_PER_ADDRESS = 4;
    /**
     * Per source address: at most this many valid announcements are read in
     * each window (an honest device sends one every two seconds, plus a reply
     * to a "who"), and a "who" from it is answered at most once a second. The
     * table of sources is bounded too; announcements from more addresses are
     * dropped.
     */
    static final long SOURCE_WINDOW_MS = 2_000;
    static final int PACKETS_PER_WINDOW = 8;
    static final long REPLY_EVERY_MS = 1_000;
    /** However many devices ask, this device answers "who" at most this often: its reply is multicast, so one serves them all. */
    static final long ANY_REPLY_EVERY_MS = 250;
    static final int MAX_SOURCES = 256;

    /** A device another announcement told us about. */
    public static final class NearbyDevice {
        public final String name;
        public final String fingerprint;
        public final String address;
        public final int port;
        public final long seenAt;

        NearbyDevice(String name, String fingerprint, String address, int port, long seenAt) {
            this.name = name;
            this.fingerprint = fingerprint;
            this.address = address;
            this.port = port;
            this.seenAt = seenAt;
        }
    }

    /** What this device announces: its name, fingerprint and port (0 while it's only looking). */
    public interface Self {
        MeshProtocol.Announcement current();
    }

    private final String group;
    private final int port;
    private final Self self;
    private final Runnable onChange;
    private final Map<String, NearbyDevice> found = new LinkedHashMap<>();
    /** Per source address: when its window started, packets read in it, and when its last "who" was answered. */
    private final Map<String, long[]> sources = new HashMap<>();
    private long lastReply;
    /** found's fingerprints sorted by name, kept until a device comes, goes or changes its name. */
    private List<String> order;
    private final Collator collator = Collator.getInstance(Locale.ROOT);
    /** Test seam: "who" queries answered, sorts of the list, and whether packets are taken with no socket. */
    int replies;
    int sorts;
    private boolean testing;
    private MulticastSocket socket;
    private ScheduledExecutorService timer;
    private Thread receiver;

    public Discovery(String group, int port, Self self, Runnable onChange) {
        this.group = group == null ? MeshProtocol.DISCOVERY_GROUP : group;
        this.port = port <= 0 ? MeshProtocol.DISCOVERY_PORT : port;
        this.self = self;
        this.onChange = onChange;
    }

    public synchronized boolean running() {
        return socket != null;
    }

    /** This device's IPv4 addresses on its local networks. */
    public static List<Inet4Address> localAddresses() {
        List<Inet4Address> out = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            if (interfaces == null) return out;
            for (NetworkInterface ni : Collections.list(interfaces)) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address) out.add((Inet4Address) a);
                }
            }
        } catch (SocketException e) {
            // No interfaces to report.
        }
        return out;
    }

    @SuppressWarnings("deprecation")
    public synchronized void start() throws IOException {
        if (socket != null) return;
        final MulticastSocket s = new MulticastSocket(null);
        try {
            s.setReuseAddress(true);
            s.bind(new InetSocketAddress(port));
            InetAddress groupAddress = InetAddress.getByName(group);
            boolean joined = false;
            try {
                s.joinGroup(groupAddress);
                joined = true;
            } catch (IOException e) {
                // Joined per interface below.
            }
            for (Inet4Address address : localAddresses()) {
                try {
                    NetworkInterface ni = NetworkInterface.getByInetAddress(address);
                    if (ni != null) {
                        s.joinGroup(new InetSocketAddress(groupAddress, port), ni);
                        joined = true;
                    }
                } catch (IOException e) {
                    // Already joined through the default interface, or the interface can't do multicast.
                }
            }
            if (!joined) throw new IOException("This device couldn't join the local network's multicast group.");
            s.setTimeToLive(1);
            // false turns loopback on: devices on this same machine hear each other, as Node's setMulticastLoopback(true).
            s.setLoopbackMode(false);
        } catch (IOException | RuntimeException e) {
            s.close();
            throw e;
        }
        socket = s;
        receiver = new Thread(new Runnable() {
            @Override
            public void run() {
                receive(s);
            }
        }, "mesh-discovery");
        receiver.setDaemon(true);
        receiver.start();
        timer = Executors.newSingleThreadScheduledExecutor(new ThreadFactory() {
            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "mesh-discovery-timer");
                t.setDaemon(true);
                return t;
            }
        });
        send("who");
        timer.scheduleAtFixedRate(new Runnable() {
            @Override
            public void run() {
                // A task that throws is never run again: one bad tick mustn't end announcing.
                try {
                    send("here");
                    expire();
                } catch (Throwable ignored) {
                    // Next tick.
                }
            }
        }, ANNOUNCE_EVERY_MS, ANNOUNCE_EVERY_MS, TimeUnit.MILLISECONDS);
    }

    public void stop() {
        synchronized (this) {
            if (timer != null) timer.shutdownNow();
            timer = null;
            if (socket != null) socket.close();
            socket = null;
            found.clear();
            sources.clear();
            order = null;
        }
        onChange.run();
    }

    /** The devices listed now, by name. Sorted only when the list itself changed, not on every call or packet. */
    public synchronized List<NearbyDevice> devices() {
        if (order == null) {
            sorts += 1;
            List<String> fingerprints = new ArrayList<>(found.keySet());
            Collections.sort(fingerprints, new Comparator<String>() {
                @Override
                public int compare(String a, String b) {
                    return collator.compare(found.get(a).name, found.get(b).name);
                }
            });
            order = fingerprints;
        }
        List<NearbyDevice> list = new ArrayList<>(order.size());
        for (String fp : order) list.add(found.get(fp));
        return list;
    }

    /** How many devices are listed. */
    synchronized int size() {
        return found.size();
    }

    /** Announces now, for example right after becoming visible. */
    public void announce() {
        send("here");
    }

    @SuppressWarnings("deprecation")
    private void send(String kind) {
        MulticastSocket s;
        synchronized (this) {
            s = socket;
        }
        if (s == null) return;
        MeshProtocol.Announcement me = self.current();
        // A device that's only looking asks who's there but doesn't advertise a port.
        if ("here".equals(kind) && me.port == 0) return;
        // A "who" still carries the name and fingerprint: the desktop agent's AnnouncementSchema
        // (src/core/mesh/protocol.ts) refuses an announcement without them, so it wouldn't answer.
        byte[] data = new MeshProtocol.Announcement(kind, me.name, me.fingerprint, me.port).encode();
        try {
            InetAddress groupAddress = InetAddress.getByName(group);
            List<Inet4Address> interfaces = localAddresses();
            if (interfaces.isEmpty()) {
                s.send(new DatagramPacket(data, data.length, groupAddress, port));
                return;
            }
            for (Inet4Address address : interfaces) {
                try {
                    synchronized (s) {
                        s.setInterface(address);
                        s.send(new DatagramPacket(data, data.length, groupAddress, port));
                    }
                } catch (IOException e) {
                    // That interface can't send multicast; the others still do.
                }
            }
        } catch (IOException e) {
            // Nothing to send on.
        }
    }

    private void receive(MulticastSocket s) {
        byte[] buffer = new byte[MAX_DATAGRAM + 1];
        while (true) {
            DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
            try {
                s.receive(packet);
            } catch (IOException e) {
                return;
            }
            if (packet.getLength() > MAX_DATAGRAM) continue;
            try {
                onMessage(new String(packet.getData(), packet.getOffset(), packet.getLength(), StandardCharsets.UTF_8), packet.getAddress().getHostAddress(), System.currentTimeMillis());
            } catch (Throwable ignored) {
                // One packet, or the listener it woke, failing mustn't stop discovery hearing the next.
            }
        }
    }

    /** Whether a packet from this address is read now: false past its share, or when too many addresses are already counted. */
    private synchronized boolean admit(String address, long now) {
        long[] s = sources.get(address);
        if (s == null) {
            if (sources.size() >= MAX_SOURCES) return false;
            s = new long[] {now, 0, 0};
            sources.put(address, s);
        }
        if (now - s[0] >= SOURCE_WINDOW_MS) {
            s[0] = now;
            s[1] = 0;
        }
        s[1] += 1;
        return s[1] <= PACKETS_PER_WINDOW;
    }

    /** Whether to answer a "who" from this address now: once a second per address, and four times a second at most in all. */
    private synchronized boolean replyTo(String address, long now) {
        long[] s = sources.get(address);
        if (s == null || now - s[2] < REPLY_EVERY_MS || now - lastReply < ANY_REPLY_EVERY_MS) return false;
        s[2] = now;
        lastReply = now;
        return true;
    }

    void onMessage(String text, String address, long now) {
        MeshProtocol.Announcement a;
        try {
            a = MeshProtocol.Announcement.parse(Json.parse(text));
        } catch (Json.JsonException e) {
            return;
        }
        if (a == null) return;
        if (a.fingerprint.equals(self.current().fingerprint)) return;
        // Only announcements count against an address's share: noise it sends can't use up anyone's.
        if (!admit(address, now)) return;
        if ("who".equals(a.kind)) {
            if (replyTo(address, now)) {
                synchronized (this) {
                    replies += 1;
                }
                send("here");
            }
            return;
        }
        if (a.port == 0) return;
        boolean changed;
        synchronized (this) {
            if (socket == null && !testing) return;
            NearbyDevice before = found.get(a.fingerprint);
            // One address speaks for at most a few devices, so it can't fill the list with made-up fingerprints.
            if ((before == null || !before.address.equals(address)) && listedFrom(address) >= MAX_PER_ADDRESS) return;
            boolean evicted = false;
            if (before == null && found.size() >= MAX_FOUND) {
                // Full: the device heard from longest ago makes room, so newcomers are never locked out.
                String oldest = null;
                long oldestAt = Long.MAX_VALUE;
                for (NearbyDevice d : found.values()) {
                    if (d.seenAt < oldestAt) {
                        oldestAt = d.seenAt;
                        oldest = d.fingerprint;
                    }
                }
                found.remove(oldest);
                evicted = true;
            }
            found.put(a.fingerprint, new NearbyDevice(a.name, a.fingerprint, address, a.port, now));
            boolean listed = before == null || evicted || !before.name.equals(a.name);
            if (listed) order = null;
            changed = listed || !before.address.equals(address) || before.port != a.port;
        }
        if (changed) onChange.run();
    }

    /** How many listed devices were last heard from this address. Call while holding this. */
    private int listedFrom(String address) {
        int n = 0;
        for (NearbyDevice d : found.values()) {
            if (d.address.equals(address)) n++;
        }
        return n;
    }

    void expire() {
        long now = System.currentTimeMillis();
        long cutoff = now - FORGET_AFTER_MS;
        boolean changed = false;
        synchronized (this) {
            for (Iterator<NearbyDevice> it = found.values().iterator(); it.hasNext(); ) {
                if (it.next().seenAt < cutoff) {
                    it.remove();
                    changed = true;
                }
            }
            if (changed) order = null;
            // Sources are forgotten once nothing about them limits anything any more.
            for (Iterator<long[]> it = sources.values().iterator(); it.hasNext(); ) {
                long[] s = it.next();
                if (now - s[0] >= SOURCE_WINDOW_MS && now - s[2] >= REPLY_EVERY_MS) it.remove();
            }
        }
        if (changed) onChange.run();
    }

    /** Test seam: lists what onMessage is fed, with no socket, so nothing is sent. */
    synchronized void startForTest() {
        testing = true;
    }

    /** Test seam: how many source addresses are being counted. */
    synchronized int sourcesCounted() {
        return sources.size();
    }
}
