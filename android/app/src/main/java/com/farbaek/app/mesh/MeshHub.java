package com.farbaek.app.mesh;

import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.farbaek.mesh.Discovery;
import com.farbaek.mesh.MeshListener;
import com.farbaek.mesh.MeshNode;
import com.farbaek.mesh.TransferState;
import com.farbaek.mesh.TransferView;

import java.io.File;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
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

    private MeshHub(final Context app) {
        this.app = app;
        dir = new File(app.getFilesDir(), "mesh");
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
        // Loading the key touches the Keystore and the disk: off the main thread.
        run(new Runnable() {
            @Override
            public void run() {
                // A key that can't be unsealed (moved to a new phone, or the Keystore was reset) would stop Nearby for
                // good: start fresh instead, with nothing trusted, and say so.
                if (!vault.canOpen()) {
                    delete(dir);
                    resetNotice = "This phone's Nearby key couldn't be opened, for example after moving to a new phone, so Nearby started fresh. Pair your computers again.";
                }
                try {
                    node.init();
                    ready = true;
                } catch (Exception e) {
                    startProblem = e.getMessage() != null ? e.getMessage() : "Nearby couldn't start on this phone.";
                }
                changed();
            }
        });
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
        boolean busy = visible || activeTransfers(s) > 0;
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
