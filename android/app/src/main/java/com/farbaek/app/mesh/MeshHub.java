package com.farbaek.app.mesh;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.farbaek.mesh.Discovery;
import com.farbaek.mesh.MeshListener;
import com.farbaek.mesh.MeshNode;
import com.farbaek.mesh.ReceivedLog;
import com.farbaek.mesh.SavePlan;
import com.farbaek.mesh.TransferState;
import com.farbaek.mesh.TransferView;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * One Mesh node for the app's process (ADR 0193). The Nearby screen and the
 * transfer service both talk to it. It holds the multicast lock only while
 * this phone looks for or announces itself, and keeps the foreground service
 * running only while something needs the network with the screen off. After
 * Android's daily limit ends the service, it isn't started again until the
 * person opens Nearby.
 */
final class MeshHub implements MeshListener {
    interface Observer {
        void onMeshChanged();
    }

    private static final String TAG = "FarbaekNearby";
    private static MeshHub instance;

    static synchronized MeshHub get(Context context) {
        if (instance == null) instance = new MeshHub(context.getApplicationContext());
        return instance;
    }

    private final Context app;
    private final File dir;
    private final MeshNode node;
    private final Handler main = new Handler(Looper.getMainLooper());
    /** Long work: packing, sending, pairing's handshake, opening the Keystore. */
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    /** Short answers that must never wait behind long work: confirming a code, cancelling. */
    private final ExecutorService quick = Executors.newSingleThreadExecutor();
    /**
     * Takes the node's snapshot for the screen. The node holds its lock while it opens sockets, so the main thread
     * never takes a snapshot itself: on a slow phone that wait reached Android's five seconds ("isn't responding").
     */
    private final ExecutorService view = Executors.newSingleThreadExecutor();
    /** The latest snapshot, for the screen and the notification; null until Nearby has started. */
    private volatile MeshNode.Snapshot latest;
    private final List<Observer> observers = new CopyOnWriteArrayList<>();
    private WifiManager.MulticastLock lock;
    private volatile boolean ready;
    private volatile String startProblem;
    private volatile String resetNotice;
    private boolean updatePosted;
    private volatile boolean serviceWanted;
    /** Set when Android ended the service at its daily limit; cleared when the person is back on the screen. */
    private volatile boolean limitReached;

    /**
     * Arrivals (stage 188, ADR 0196): what came, and how far each copy into Gallery or Downloads has got. Copies run on
     * their own thread, so a large one never holds up sending or pairing, and count as busy work, so the service keeps
     * the app alive until they're done.
     */
    private final ReceivedLog received;
    private final ExecutorService saver = Executors.newSingleThreadExecutor();
    private final AtomicInteger saving = new AtomicInteger();
    private final SharedPreferences prefs;
    /** Whether Nearby is on screen: notifications aren't needed while it is. */
    private volatile boolean onScreen;
    /** Offers already announced, so progress updates don't announce them again. */
    private final Set<String> offersAnnounced = Collections.newSetFromMap(new ConcurrentHashMap<String, Boolean>());

    private final long createdAt = SystemClock.elapsedRealtime();

    private MeshHub(final Context app) {
        this.app = app;
        dir = new File(app.getFilesDir(), "mesh");
        received = new ReceivedLog(new File(app.getFilesDir(), "nearby-received.json"));
        prefs = app.getSharedPreferences("nearby", Context.MODE_PRIVATE);
        final KeystoreVault vault = new KeystoreVault(new File(dir, "identity.sealed"));
        MeshNode.Options options = new MeshNode.Options();
        options.dataDir = dir;
        options.name = new MeshNode.NameSource() {
            @Override
            public String name() {
                return deviceName(app);
            }
        };
        options.vault = vault;
        options.listener = this;
        options.discovery = true;
        options.probe = new LstatProbe();
        node = new MeshNode(options);
        // Loading the key touches the Keystore and the disk: off the main thread. Each stage's time is logged (no paths
        // or contents), so a phone whose Keystore is slow shows where the wait was.
        run(new Runnable() {
            @Override
            public void run() {
                Log.i(TAG, "Starting Nearby");
                // A key that can't be unsealed (moved to a new phone, or the Keystore was reset) would stop Nearby for
                // good: start fresh instead, with nothing trusted, and say so.
                if (!vault.canOpen()) {
                    delete(dir);
                    resetNotice = "This phone's Nearby key couldn't be opened, for example after moving to a new phone, so Nearby started fresh. Pair your computers again.";
                }
                Log.i(TAG, "Checked the sealed key after " + startingFor() + " ms");
                try {
                    node.init();
                    ready = true;
                    Log.i(TAG, "Nearby started after " + startingFor() + " ms");
                    resumeSaves();
                } catch (Exception e) {
                    startProblem = e.getMessage() != null ? e.getMessage() : "Nearby couldn't start on this phone.";
                    Log.w(TAG, "Nearby couldn't start: " + e.getClass().getSimpleName());
                }
                changed();
            }
        });
    }

    /** How long since this hub was made: while Nearby is still starting, how long it has been starting. */
    long startingFor() {
        return SystemClock.elapsedRealtime() - createdAt;
    }

    MeshNode node() {
        return node;
    }

    boolean ready() {
        return ready;
    }

    String startProblem() {
        return startProblem;
    }

    String resetNotice() {
        return resetNotice;
    }

    void dismissResetNotice() {
        resetNotice = null;
        changed();
    }

    boolean serviceWanted() {
        return serviceWanted;
    }

    /** Runs long Mesh work off the main thread. Nothing it throws can end the app. */
    void run(Runnable task) {
        work.execute(guard(task));
    }

    /** Runs a short answer (confirm a code, cancel, decline) at once, never behind long work. */
    void runQuick(Runnable task) {
        quick.execute(guard(task));
    }

    private static Runnable guard(final Runnable task) {
        return new Runnable() {
            @Override
            public void run() {
                try {
                    task.run();
                } catch (Throwable t) {
                    // Logged without paths or contents: the message names the step that failed.
                    Log.w(TAG, "A Nearby task stopped: " + t.getClass().getSimpleName());
                }
            }
        };
    }

    void post(Runnable task) {
        main.post(task);
    }

    void observe(Observer o) {
        observers.add(o);
    }

    void forget(Observer o) {
        observers.remove(o);
    }

    /** The person has Nearby on screen: the service may start again after Android's daily limit. */
    void personPresent() {
        limitReached = false;
    }

    /** Where received folders go: the app's private storage, which no other app can read on any Android version. */
    File inbox() {
        File inbox = new File(app.getFilesDir(), "Nearby");
        if (!inbox.isDirectory()) inbox.mkdirs();
        return inbox;
    }

    /** Where files picked to send are copied first, so Mesh packs a folder it owns. */
    File outbox() {
        File out = new File(app.getCacheDir(), "nearby-out");
        if (!out.isDirectory()) out.mkdirs();
        return out;
    }

    // MeshListener: every call comes from one of Mesh's threads, so the screen hears about it on the main thread.

    @Override
    public void onChanged() {
        changed();
    }

    @Override
    public void onTransfer(TransferView transfer) {
        if ("in".equals(transfer.direction)) {
            if (transfer.state == TransferState.OFFERED) {
                if (!onScreen && offersAnnounced.add(transfer.id)) NearbyNotices.offer(app, transfer);
            } else if (offersAnnounced.remove(transfer.id)) {
                NearbyNotices.cancelOffer(app, transfer.id);
            }
            if (transfer.state == TransferState.DONE && transfer.destination != null) arrived(transfer);
        }
        changed();
    }

    @Override
    public void onPairing(MeshNode.PairingView pairing) {
        changed();
    }

    @Override
    public void onNearby(List<Discovery.NearbyDevice> devices) {
        changed();
    }

    @Override
    public void onBackgroundError(Throwable error) {
        // The kind of failure only: a message could carry a path or a name.
        Log.w(TAG, "Nearby work stopped: " + error.getClass().getSimpleName());
        changed();
    }

    /** The latest snapshot of the node, or null until Nearby has started. Never waits: safe on the main thread. */
    MeshNode.Snapshot snapshot() {
        return latest;
    }

    /** Asks for a fresh snapshot, for example when the screen comes back. */
    void refresh() {
        changed();
    }

    /**
     * Many changes in a row make one snapshot: it's taken on the view thread, then the main thread gets it whole.
     * The flag is cleared before the snapshot is taken, so a change during it brings another.
     */
    private void changed() {
        synchronized (this) {
            if (updatePosted) return;
            updatePosted = true;
        }
        view.execute(guard(new Runnable() {
            @Override
            public void run() {
                synchronized (MeshHub.this) {
                    updatePosted = false;
                }
                final MeshNode.Snapshot s = ready ? node.snapshot() : null;
                if (s != null) latest = s;
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        settle(s);
                        for (Observer o : observers) o.onMeshChanged();
                    }
                });
            }
        }));
    }

    /** On the main thread: the multicast lock and the service follow what the node is doing. */
    private void settle(MeshNode.Snapshot s) {
        if (!ready || s == null) return;
        boolean visible = s.visibleUntil > System.currentTimeMillis();
        boolean network = visible || s.looking;
        if (network) acquireLock();
        else releaseLock();
        boolean busy = visible || activeTransfers(s) > 0 || saving.get() > 0;
        if (busy && !serviceWanted && !limitReached) {
            serviceWanted = true;
            try {
                ContextCompat.startForegroundService(app, new Intent(app, MeshService.class));
            } catch (RuntimeException e) {
                // Android refuses a start from the background (Android 12 and up) or past its daily limit: carry on without
                // the service, and try again when the person opens Nearby.
                serviceWanted = false;
                limitReached = true;
            }
        } else if (!busy && serviceWanted) {
            serviceWanted = false;
            app.stopService(new Intent(app, MeshService.class));
        }
    }

    static int activeTransfers(MeshNode.Snapshot s) {
        int n = 0;
        for (TransferView t : s.transfers) {
            if (!t.state.isFinal() && t.state != TransferState.OFFERED && t.state != TransferState.INTERRUPTED) n += 1;
        }
        return n;
    }

    /** Android ended the service at its daily limit for data syncs (Android 15): nothing more runs with the screen off. */
    void stoppedByLimit() {
        limitReached = true;
        serviceWanted = false;
        run(new Runnable() {
            @Override
            public void run() {
                try {
                    node.setVisible(false);
                } catch (Exception ignored) {
                    // Already hidden.
                }
            }
        });
    }

    // Arrivals

    ReceivedLog received() {
        return received;
    }

    /** Whether checked arrivals are saved into Gallery and Downloads (Android 10 and later; on by default). */
    boolean saveShared() {
        return MediaSaver.available() && prefs.getBoolean("saveShared", true);
    }

    void setSaveShared(boolean on) {
        prefs.edit().putBoolean("saveShared", on).apply();
        changed();
    }

    /** Nearby came on screen, or left it. While it's on screen, an offer's notification isn't needed. */
    void setOnScreen(boolean on) {
        onScreen = on;
        if (on) for (String id : new ArrayList<>(offersAnnounced)) NearbyNotices.cancelOffer(app, id);
    }

    /** Whether copies into shared storage are still running. */
    boolean saving() {
        return saving.get() > 0;
    }

    /**
     * A transfer was checked and is done: recorded once, then saved where people look, or kept in Nearby when the
     * switch is off or this Android is older. Called on Mesh's threads, as often as the transfer reports.
     */
    private synchronized void arrived(TransferView t) {
        if (received.get(t.id) != null) return;
        File folder = new File(t.destination);
        List<ReceivedLog.FileRecord> files = new ArrayList<>();
        List<String> paths = new ArrayList<>();
        try {
            list(folder.getCanonicalFile(), "", files, 0);
        } catch (IOException e) {
            Log.w(TAG, "An arrival couldn't be listed: " + e.getClass().getSimpleName());
        }
        for (ReceivedLog.FileRecord f : files) paths.add(f.path);
        boolean share = saveShared() && !files.isEmpty();
        SavePlan.Place place = share ? SavePlan.placeFor(paths) : null;
        String name = SavePlan.display(t.name);
        String where = share ? SavePlan.uniqueFolder(t.name, usedFolders(place)) : folder.getAbsolutePath();
        ReceivedLog.Entry e = new ReceivedLog.Entry(t.id, name, SavePlan.display(t.peerName), System.currentTimeMillis(), place, where, files,
                share ? ReceivedLog.State.SAVING : ReceivedLog.State.KEPT);
        e.source = folder.getAbsolutePath();
        if (!share) e.note = MediaSaver.available() ? "Saving to Gallery and Downloads is off, so it stays in Nearby." : "On this version of Android, files stay in Nearby. Share them from here.";
        try {
            received.put(e);
        } catch (IOException ex) {
            Log.w(TAG, "An arrival couldn't be recorded: " + ex.getClass().getSimpleName());
            return;
        }
        if (share) save(e);
        else announce(e);
    }

    /** The folder names already used in a place, so a new arrival gets its own. */
    private Set<String> usedFolders(SavePlan.Place place) {
        Set<String> used = new HashSet<>();
        for (ReceivedLog.Entry e : received.list()) if (e.place == place) used.add(e.folder);
        return used;
    }

    /** The files in a received folder, with paths inside it: no links followed, at most 10,000, 24 levels down. */
    private static void list(File dir, String prefix, List<ReceivedLog.FileRecord> into, int depth) throws IOException {
        File[] kids = dir.listFiles();
        if (kids == null || depth > 24) return;
        java.util.Arrays.sort(kids);
        String root = dir.getCanonicalPath() + File.separator;
        for (File k : kids) {
            if (into.size() >= 10_000) return;
            if (k.getName().startsWith(".farbaek-")) continue;
            File real = k.getCanonicalFile();
            if (!real.getPath().startsWith(root)) continue;
            String rel = prefix + k.getName();
            if (real.isDirectory()) list(real, rel + "/", into, depth + 1);
            else if (real.isFile()) into.add(new ReceivedLog.FileRecord(rel, real.length(), SavePlan.mime(rel)));
        }
    }

    /** Copies an arrival into shared storage on the saver's thread. If it can't, the files stay in Nearby and it says why. */
    private void save(final ReceivedLog.Entry e) {
        saving.incrementAndGet();
        changed();
        saver.execute(guard(new Runnable() {
            @Override
            public void run() {
                try {
                    if (Build.VERSION.SDK_INT < 29) throw new IOException("This version of Android keeps files in Nearby.");
                    new MediaSaver(app).save(received, e, new File(e.source));
                    e.source = null;
                    received.update(e);
                } catch (IOException | RuntimeException ex) {
                    e.state = ReceivedLog.State.KEPT;
                    String why = ex.getMessage() != null ? ex.getMessage() : "This phone stopped the copy.";
                    e.note = "Couldn't save it to " + (e.place == null ? "shared storage" : e.place.label) + ". " + why + " It's kept in Nearby, and Share still works.";
                    try {
                        received.update(e);
                    } catch (IOException ignored) {
                        // The note is on screen until the app restarts.
                    }
                } finally {
                    saving.decrementAndGet();
                    announce(e);
                    changed();
                }
            }
        }));
    }

    /** Tries saving a kept arrival again: what was already saved stays saved, and the rest is copied. */
    void retrySave(final String id) {
        run(new Runnable() {
            @Override
            public void run() {
                ReceivedLog.Entry e = received.get(id);
                if (e == null || e.state != ReceivedLog.State.KEPT || e.place == null || e.source == null || !MediaSaver.available()) return;
                e.state = ReceivedLog.State.SAVING;
                e.note = null;
                try {
                    received.update(e);
                } catch (IOException ignored) {
                    return;
                }
                save(e);
            }
        });
    }

    /** Copies that were cut short when Android stopped the app carry on where they were. */
    private void resumeSaves() {
        for (ReceivedLog.Entry e : received.list()) {
            if (e.state == ReceivedLog.State.SAVING && e.place != null && e.source != null && MediaSaver.available()) save(e);
        }
    }

    /** Tells the person once, with a notification when Nearby isn't on screen. */
    private void announce(ReceivedLog.Entry e) {
        if (e.notified) return;
        e.notified = true;
        try {
            received.update(e);
        } catch (IOException ignored) {
            // Told again after a restart at worst.
        }
        if (!onScreen) NearbyNotices.arrived(app, e);
    }

    /** Takes an arrival off the list. Files saved in Gallery or Downloads stay there. */
    void forgetReceived(final String id) {
        run(new Runnable() {
            @Override
            public void run() {
                try {
                    received.remove(id);
                } catch (IOException ignored) {
                    // Still listed; the person can try again.
                }
                changed();
            }
        });
    }

    private void acquireLock() {
        if (lock != null && lock.isHeld()) return;
        WifiManager wifi = (WifiManager) app.getSystemService(Context.WIFI_SERVICE);
        if (wifi == null) return;
        lock = wifi.createMulticastLock("farbaek-nearby");
        lock.setReferenceCounted(false);
        lock.acquire();
    }

    private void releaseLock() {
        if (lock != null && lock.isHeld()) lock.release();
    }

    static void delete(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) delete(k);
        f.delete();
    }

    private static String deviceName(Context app) {
        String name = null;
        if (Build.VERSION.SDK_INT >= 25) name = Settings.Global.getString(app.getContentResolver(), Settings.Global.DEVICE_NAME);
        if (name == null || name.trim().isEmpty()) name = Build.MODEL;
        name = name == null ? "" : name.trim();
        if (name.length() > 60) name = name.substring(0, 60).trim();
        return name.isEmpty() ? "Android phone" : name;
    }
}
