package com.farbaek.app.mesh;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.farbaek.app.R;
import com.farbaek.mesh.Discovery;
import com.farbaek.mesh.MeshNode;
import com.farbaek.mesh.NearbySamples;
import com.farbaek.mesh.TransferState;
import com.farbaek.mesh.TransferView;
import com.farbaek.mesh.TrustStore;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Nearby (ADR 0193): this phone and the person's computers on the same Wi-Fi,
 * talking farbaek-mesh/1 directly, with no internet and no Farbaek server in
 * between. The Mesh page opens it with an intent link; the screen takes no
 * action from that link. Pairing needs the same six digits on both screens,
 * and nothing is received until the person accepts it.
 *
 * The screen leads with what people come for: sending to a paired computer.
 * What needs them (a code to check, a file to accept) rises in above it, and
 * pairing by address waits behind a disclosure until it's needed.
 */
public final class MeshActivity extends Activity implements MeshHub.Observer {
    private static final int PICK_FILES = 41;
    private static final int ASK_NOTIFY = 42;
    private static final int MAX_SHARED = 200;
    private static final int TOP_BAR_DP = 56;

    /** A folder received on this phone, as the Received card lists it. */
    public static final class Received {
        public final String name;
        public final long files;
        public final long bytes;
        public final long when;
        public final File folder;

        public Received(String name, long files, long bytes, long when, File folder) {
            this.name = name;
            this.files = files;
            this.bytes = bytes;
            this.when = when;
            this.folder = folder;
        }
    }

    private MeshHub hub;
    private NearbyUi ui;
    /** In debug builds only, a named sample to draw instead of the real node, for screenshots of every state. */
    private String sample;
    private LinearLayout page;
    private LinearLayout dynamic;
    private TextView largeTitle;
    private TextView barTitle;
    private View barLine;
    private TextView toast;
    private EditText address;
    private String sendTo;
    private boolean addressOpen;
    /** Cards already shown, by what they're about, so only something new rises in. */
    private final Set<String> shown = new HashSet<>();
    /** Pairings and transfers whose success was already marked with the check and a tap. */
    private final Set<String> celebrated = new HashSet<>();
    private boolean firstRender = true;
    /**
     * What the screen last drew, as text. A transfer reports progress five times a second; when only progress
     * changed, the bars move in place, and the cards (with their buttons, spinners and TalkBack's focus) stay put.
     */
    private String drawn;
    /** Each moving transfer's bar and amount, by transfer, for those in-place updates. */
    private final java.util.Map<String, android.widget.ProgressBar> bars = new java.util.HashMap<>();
    private final java.util.Map<String, TextView> amounts = new java.util.HashMap<>();
    /** Received folders' sizes, by path and time, so a folder is walked once, not on every drawing. */
    private final java.util.Map<String, long[]> sizes = new java.util.HashMap<>();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        ui = new NearbyUi(this);
        sample = NearbySamples.available() ? getIntent().getStringExtra("sample") : null;
        if (sample == null) {
            hub = MeshHub.get(this);
            MeshService.channel(this);
        }
        if (state != null) {
            sendTo = state.getString("sendTo");
            addressOpen = state.getBoolean("addressOpen");
        }

        // Edge to edge on every version, as Android 15 does by itself: the screen draws behind the bars, and the
        // insets below keep every word and button clear of them and of the keyboard.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Build.VERSION.SDK_INT >= 26 ? Color.TRANSPARENT : Color.argb(128, 27, 27, 27));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(ui.color(R.color.canvas));

        page = ui.column();
        largeTitle = ui.text(getString(R.string.nearby_title), 30, true, R.color.ink);
        if (Build.VERSION.SDK_INT >= 28) largeTitle.setAccessibilityHeading(true);
        page.addView(largeTitle);
        TextView intro = ui.text("Send photos and files between this phone and your computers on the same Wi-Fi, even with no internet. Encrypted end to end, and checked when they arrive.", 15, false, R.color.ink_2);
        NearbyUi.top(intro, 10);
        page.addView(intro);
        dynamic = ui.column();
        page.addView(dynamic);
        page.addView(addressCard());
        TextView foot = ui.caption("Received folders stay in this app's private storage until you share or delete them. Nearby only works with computers you paired, and every file is checked against what was sent.");
        NearbyUi.top(foot, 24);
        page.addView(foot);

        final ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.addView(page);
        final FrameLayout.LayoutParams scrollAt = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        root.addView(scroll, scrollAt);

        final LinearLayout bar = topBar();
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        // Once the large title has scrolled under the bar, the bar says where you are, with a hairline under it.
        scroll.setOnScrollChangeListener((v, x, y, oldX, oldY) -> {
            boolean under = y > largeTitle.getBottom() - ui.px(8);
            barTitle.animate().alpha(under ? 1f : 0f).setDuration(160).start();
            barLine.animate().alpha(y > 0 ? 1f : 0f).setDuration(160).start();
        });

        toast = ui.text("", 14, false, R.color.on_primary);
        toast.setBackground(ui.rounded(R.color.primary, 16, 0, 0));
        toast.setPadding(ui.px(18), ui.px(14), ui.px(18), ui.px(14));
        toast.setElevation(ui.px(6));
        toast.setVisibility(View.GONE);
        toast.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        toast.setOnClickListener(v -> say(null));
        FrameLayout.LayoutParams toastAt = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(toast, toastAt);

        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            int bottom = Math.max(bars.bottom, keyboard);
            bar.setPadding(bars.left, bars.top, bars.right, 0);
            // With the keyboard up, the scroll area stops above it (so ScrollView keeps the focused field in view);
            // without it, the page runs under the navigation bar and its last line stops clear of it.
            scrollAt.bottomMargin = keyboard > bars.bottom ? keyboard : 0;
            scroll.setLayoutParams(scrollAt);
            int pageBottom = keyboard > bars.bottom ? ui.px(24) : bars.bottom + ui.px(40);
            page.setPadding(bars.left + ui.px(20), bars.top + ui.px(TOP_BAR_DP + 8), bars.right + ui.px(20), pageBottom);
            toastAt.setMargins(bars.left + ui.px(16), 0, bars.right + ui.px(16), bottom + ui.px(16));
            toast.setLayoutParams(toastAt);
            return WindowInsetsCompat.CONSUMED;
        });
        setContentView(root);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), root);
        bars.setAppearanceLightStatusBars(true);
        bars.setAppearanceLightNavigationBars(true);
    }

    /** The bar at the top: back to Farbaek, and the screen's name once the large title has scrolled away. */
    private LinearLayout topBar() {
        LinearLayout bar = ui.row();
        bar.setBackgroundColor(ui.color(R.color.canvas));
        bar.setMinimumHeight(ui.px(TOP_BAR_DP));
        LinearLayout inner = ui.row();
        inner.setPadding(ui.px(4), 0, ui.px(16), 0);
        ImageView back = ui.icon(R.drawable.ph_arrow_left_regular, 24, R.color.ink);
        back.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        back.setPadding(ui.px(12), ui.px(12), ui.px(12), ui.px(12));
        back.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        back.setContentDescription("Back to Farbaek");
        back.setBackground(new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(Color.argb(24, 18, 19, 23)), null, ui.rounded(R.color.ink, 999, 0, 0)));
        back.setClickable(true);
        back.setFocusable(true);
        back.setOnClickListener(v -> finish());
        inner.addView(back, new LinearLayout.LayoutParams(ui.px(48), ui.px(48)));
        barTitle = ui.text(getString(R.string.nearby_title), 17, true, R.color.ink);
        barTitle.setAlpha(0f);
        barTitle.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tl.leftMargin = ui.px(4);
        inner.addView(barTitle, tl);

        LinearLayout column = ui.column();
        column.addView(inner, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ui.px(TOP_BAR_DP)));
        barLine = new View(this);
        barLine.setBackgroundColor(ui.color(R.color.line));
        barLine.setAlpha(0f);
        column.addView(barLine, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, ui.px(1))));
        bar.addView(column, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return bar;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putString("sendTo", sendTo);
        out.putBoolean("addressOpen", addressOpen);
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (hub != null) {
            hub.personPresent();
            hub.observe(this);
            looking(true);
        }
        render();
        if (hub != null) hub.refresh();
    }

    @Override
    protected void onStop() {
        // Listening for computers only while the screen is open; being visible is its own switch.
        if (hub != null) {
            looking(false);
            hub.forget(this);
        }
        dynamic.removeCallbacks(whileStarting);
        dynamic.removeAllViews();
        bars.clear();
        amounts.clear();
        drawn = null;
        super.onStop();
    }

    @Override
    public void onMeshChanged() {
        render();
    }

    private void looking(final boolean on) {
        hub.run(new Runnable() {
            @Override
            public void run() {
                if (!hub.ready()) return;
                try {
                    hub.node().setLooking(on);
                } catch (MeshNode.MeshException e) {
                    say(e.getMessage());
                }
            }
        });
    }

    // The screen, drawn again from the node's latest snapshot whenever something changes. The snapshot is taken on the
    // hub's view thread: the main thread never waits for the node.

    /** While Nearby is starting, the screen is drawn again every few seconds, so a slow start is said in words. */
    private final Runnable whileStarting = this::render;

    private void render() {
        dynamic.removeCallbacks(whileStarting);
        MeshNode.Snapshot s = sample != null ? NearbySamples.snapshot(sample) : hub.ready() ? hub.snapshot() : null;
        String reset = s != null && hub != null ? hub.resetNotice() : null;
        List<Received> received = s == null ? null : sample != null ? NearbySamples.received(sample) : receivedFolders(s);
        String now = s == null ? null : signature(s, reset, received);
        if (now != null && now.equals(drawn)) {
            moveBars(s);
            return;
        }
        drawn = now;
        dynamic.removeAllViews();
        bars.clear();
        amounts.clear();
        if (s == null) {
            String problem = hub != null ? hub.startProblem() : "There's no sample called " + sample + ".";
            LinearLayout c = ui.card();
            if (problem != null) {
                c.addView(ui.badge(NearbyUi.Kind.FAILED, "Couldn't start"));
                TextView t = ui.body(problem);
                NearbyUi.top(t, 12);
                c.addView(t);
            } else {
                c.addView(ui.badge(NearbyUi.Kind.WORKING, "Starting Nearby"));
                String words = hub.startingFor() > 15_000
                        ? "Still starting. Opening this phone's Nearby key is taking longer than usual, and Nearby opens as soon as it's ready. You can leave this screen and come back."
                        : "Opening this phone's Nearby key. It takes a moment the first time.";
                TextView t = ui.body(words);
                NearbyUi.top(t, 12);
                c.addView(t);
                dynamic.postDelayed(whileStarting, 5_000);
            }
            dynamic.addView(c);
            return;
        }
        if (reset != null) {
            LinearLayout c = ui.card();
            c.addView(ui.badge(NearbyUi.Kind.INFO, "Nearby was reset"));
            TextView t = ui.body(reset);
            NearbyUi.top(t, 12);
            c.addView(t);
            LinearLayout ok = ui.button("OK", 0, NearbyUi.SECONDARY);
            ok.setOnClickListener(v -> hub.dismissResetNotice());
            c.addView(ui.stack(ok));
            dynamic.addView(c);
        }
        List<TrustStore.TrustedDevice> computers = new ArrayList<>();
        for (TrustStore.TrustedDevice d : s.devices) if (!"farbaek".equals(d.via)) computers.add(d);

        if (s.pairing != null) show(pairingCard(s.pairing), "pairing:" + s.pairing.id + ":" + s.pairing.state);
        if (!s.transfers.isEmpty()) show(transfersCard(s.transfers), "transfers");
        show(computersCard(s, computers), null);
        View nearby = nearbyCard(s, computers.isEmpty());
        if (nearby != null) show(nearby, "nearby");
        show(phoneCard(s), null);
        View receivedCard = receivedCard(received);
        if (receivedCard != null) show(receivedCard, "received");
        firstRender = false;
    }

    /** Everything the cards show, except how far each transfer has got. */
    private static String signature(MeshNode.Snapshot s, String reset, List<Received> received) {
        StringBuilder b = new StringBuilder();
        b.append(s.name).append('|').append(s.fingerprint).append('|').append(s.visibleUntil).append('|').append(s.visibleUntil > System.currentTimeMillis()).append('|').append(reset);
        for (TrustStore.TrustedDevice d : s.devices) b.append("|d:").append(d.fingerprint).append(',').append(d.name).append(',').append(d.via);
        for (Discovery.NearbyDevice n : s.nearby) b.append("|n:").append(n.fingerprint).append(',').append(n.name).append(',').append(n.address).append(':').append(n.port);
        MeshNode.PairingView p = s.pairing;
        if (p != null) b.append("|p:").append(p.id).append(',').append(p.state).append(',').append(p.code).append(',').append(p.peerName).append(',').append(p.peerFingerprint).append(',').append(p.message);
        for (TransferView t : s.transfers) {
            b.append("|t:").append(t.id).append(',').append(t.direction).append(',').append(t.state).append(',').append(t.peerName).append(',').append(t.name).append(',').append(t.files).append(',').append(t.bytes)
                    .append(',').append(t.excludedCount).append(',').append(t.reusedFiles).append(',').append(t.destination).append(',').append(t.message).append(',').append(moving(t));
        }
        for (Received r : received) b.append("|r:").append(r.name).append(',').append(r.files).append(',').append(r.bytes).append(',').append(r.when);
        return b.toString();
    }

    /** Only progress changed: each bar slides to its new place, and its amount follows. */
    private void moveBars(MeshNode.Snapshot s) {
        for (TransferView t : s.transfers) {
            android.widget.ProgressBar bar = bars.get(t.id);
            TextView amount = amounts.get(t.id);
            if (bar == null || amount == null) continue;
            int value = (int) Math.min(1000, t.bytesDone * 1000 / Math.max(1, t.bytes));
            bar.setProgress(value, NearbyUi.motion());
            String words = bytes(t.bytesDone) + " of " + bytes(t.bytes);
            bar.setContentDescription(words);
            amount.setText(words);
        }
    }

    private static boolean moving(TransferView t) {
        return t.bytes > 0 && (t.state == TransferState.SENDING || t.state == TransferState.RECEIVING || t.state == TransferState.FINISHING);
    }

    /** Adds a card; one that wasn't there before rises in, except on the screen's first drawing. */
    private void show(View card, String key) {
        dynamic.addView(card);
        if (key != null && shown.add(key) && !firstRender) NearbyUi.riseIn(card, getResources().getDisplayMetrics().density);
    }

    // Cards

    private View computersCard(MeshNode.Snapshot s, List<TrustStore.TrustedDevice> computers) {
        LinearLayout c = ui.card();
        c.addView(ui.title(R.drawable.ph_desktop_regular, computers.size() == 1 ? "Your computer" : "Your computers"));
        if (computers.isEmpty()) {
            TextView intro = ui.body("Pair a computer once, then send it photos and files from here.");
            NearbyUi.top(intro, 8);
            c.addView(intro);
            String[] steps = {
                "On your computer, open the Farbaek desktop app and go to Nearby.",
                "Choose Be visible. Your computer appears on this screen.",
                "Tap Pair, and check both screens show the same six digits.",
            };
            for (int i = 0; i < steps.length; i++) c.addView(step(i + 1, steps[i]));
            return c;
        }
        boolean first = true;
        for (final TrustStore.TrustedDevice d : computers) {
            if (!first) c.addView(ui.divider());
            first = false;
            Discovery.NearbyDevice seen = find(s.nearby, d.fingerprint);
            LinearLayout item = ui.column();
            NearbyUi.top(item, 16);
            TextView name = ui.text(d.name, 16, true, R.color.ink);
            item.addView(name);
            View badge = seen != null ? ui.badge(NearbyUi.Kind.VERIFIED, "On this Wi-Fi") : ui.badge(NearbyUi.Kind.OFF, "Not on this Wi-Fi");
            NearbyUi.top(badge, 8);
            ((LinearLayout.LayoutParams) badge.getLayoutParams()).width = ViewGroup.LayoutParams.WRAP_CONTENT;
            item.addView(badge);
            if (seen == null) {
                TextView how = ui.caption("To send to it, open Nearby on " + d.name + " and choose Be visible, on the same Wi-Fi as this phone.");
                NearbyUi.top(how, 8);
                item.addView(how);
            }
            LinearLayout send = ui.button("Send photos and files", R.drawable.ph_paper_plane_tilt_bold, NearbyUi.PRIMARY);
            NearbyUi.enable(send, seen != null);
            send.setOnClickListener(v -> pickFiles(d.fingerprint));
            LinearLayout forget = ui.button("Forget this computer", 0, NearbyUi.QUIET);
            forget.setOnClickListener(v -> confirmForget(d));
            item.addView(ui.stack(send, forget));
            c.addView(item);
        }
        return c;
    }

    /** One step of how to pair, with its number on a small quiet tile. */
    private View step(int n, String words) {
        LinearLayout row = ui.row();
        row.setGravity(Gravity.TOP);
        TextView number = ui.text(String.valueOf(n), 13, true, R.color.ink_2);
        number.setGravity(Gravity.CENTER);
        number.setBackground(ui.rounded(R.color.surface_raised, 999, R.color.line, 1));
        number.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        row.addView(number, new LinearLayout.LayoutParams(ui.px(26), ui.px(26)));
        TextView t = ui.text(words, 15, false, R.color.ink);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        lp.leftMargin = ui.px(12);
        lp.topMargin = ui.px(2);
        row.addView(t, lp);
        t.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        row.setContentDescription("Step " + n + ". " + words);
        row.setFocusable(true);
        NearbyUi.top(row, 14);
        return row;
    }

    private View nearbyCard(MeshNode.Snapshot s, boolean noneYet) {
        Set<String> paired = new HashSet<>();
        for (TrustStore.TrustedDevice d : s.devices) paired.add(d.fingerprint);
        List<Discovery.NearbyDevice> fresh = new ArrayList<>();
        for (Discovery.NearbyDevice n : s.nearby) if (!paired.contains(n.fingerprint)) fresh.add(n);
        if (fresh.isEmpty()) return null;
        LinearLayout c = ui.card();
        c.addView(ui.title(R.drawable.ph_wifi_high_regular, "On this Wi-Fi, not paired"));
        boolean first = true;
        for (final Discovery.NearbyDevice n : fresh) {
            if (!first) c.addView(ui.divider());
            first = false;
            LinearLayout item = ui.column();
            NearbyUi.top(item, 16);
            item.addView(ui.text(n.name, 16, true, R.color.ink));
            View key = ui.key(groups(n.fingerprint));
            NearbyUi.top(key, 4);
            item.addView(key);
            LinearLayout pair = ui.button("Pair with " + n.name, R.drawable.ph_link_simple_bold, noneYet ? NearbyUi.PRIMARY : NearbyUi.SECONDARY);
            pair.setOnClickListener(v -> pair(n.address, n.port));
            item.addView(ui.stack(pair));
            c.addView(item);
        }
        return c;
    }

    private View pairingCard(final MeshNode.PairingView p) {
        String peer = p.peerName != null ? p.peerName : "that computer";
        switch (p.state) {
            case "confirming": {
                LinearLayout c = ui.turnCard();
                c.addView(ui.badge(NearbyUi.Kind.APPROVAL, "Your turn"));
                TextView h = ui.text("Pair with " + peer + "?", 18, true, R.color.ink);
                NearbyUi.top(h, 12);
                c.addView(h);
                c.addView(ui.code(p.code));
                TextView how = ui.body("Check that " + peer + " shows the same six digits. Pair only if they match.");
                NearbyUi.top(how, 14);
                c.addView(how);
                LinearLayout yes = ui.button("They match", R.drawable.ph_check_bold, NearbyUi.PRIMARY);
                LinearLayout no = ui.button("They don't match", R.drawable.ph_x_bold, NearbyUi.SECONDARY);
                yes.setOnClickListener(v -> {
                    NearbyUi.enable(yes, false);
                    NearbyUi.enable(no, false);
                    act(() -> hub.node().confirmPairing(p.id, true));
                });
                no.setOnClickListener(v -> {
                    NearbyUi.enable(yes, false);
                    NearbyUi.enable(no, false);
                    act(() -> hub.node().confirmPairing(p.id, false));
                });
                c.addView(ui.stack(yes, no));
                return c;
            }
            case "waiting": {
                LinearLayout c = ui.turnCard();
                c.addView(ui.badge(NearbyUi.Kind.PENDING, "Waiting for " + shortName(peer)));
                TextView h = ui.text("Confirm on " + peer, 18, true, R.color.ink);
                NearbyUi.top(h, 12);
                c.addView(h);
                c.addView(ui.code(p.code));
                TextView how = ui.body("You confirmed these digits. Now confirm the same six on " + peer + ".");
                NearbyUi.top(how, 14);
                c.addView(how);
                LinearLayout cancel = ui.button("Cancel pairing", 0, NearbyUi.QUIET);
                cancel.setOnClickListener(v -> act(() -> hub.node().dismissPairing(p.id)));
                c.addView(ui.inline(cancel));
                return c;
            }
            default: {
                boolean paired = "paired".equals(p.state);
                LinearLayout c = ui.card();
                if (paired) {
                    ImageView check = ui.icon(R.drawable.ph_check_circle_fill, 44, R.color.verified);
                    c.addView(check, new LinearLayout.LayoutParams(ui.px(44), ui.px(44)));
                    if (celebrated.add("pairing:" + p.id) && !firstRender) {
                        NearbyUi.pop(check);
                        tap();
                    }
                    TextView h = ui.text("Paired with " + peer, 18, true, R.color.ink);
                    NearbyUi.top(h, 14);
                    c.addView(h);
                    TextView how = ui.body("To try it, tap Send photos and files below and pick a photo. The computer asks to accept it, then shows Open folder.");
                    NearbyUi.top(how, 8);
                    c.addView(how);
                    LinearLayout done = ui.button("Done", 0, NearbyUi.SECONDARY);
                    done.setOnClickListener(v -> act(() -> hub.node().dismissPairing(p.id)));
                    c.addView(ui.stack(done));
                } else {
                    c.addView(ui.badge(NearbyUi.Kind.OFF, "Not paired"));
                    TextView why = ui.body(p.message != null ? p.message : "Nothing was paired. Try again when both screens are open.");
                    NearbyUi.top(why, 12);
                    c.addView(why);
                    LinearLayout close = ui.button("Close", 0, NearbyUi.SECONDARY);
                    close.setOnClickListener(v -> act(() -> hub.node().dismissPairing(p.id)));
                    c.addView(ui.stack(close));
                }
                return c;
            }
        }
    }

    private View transfersCard(List<TransferView> transfers) {
        LinearLayout c = ui.card();
        c.addView(ui.title(R.drawable.ph_arrows_down_up_regular, "Transfers"));
        boolean first = true;
        for (final TransferView t : transfers) {
            if (!first) c.addView(ui.divider());
            first = false;
            boolean in = "in".equals(t.direction);
            LinearLayout item = ui.column();
            NearbyUi.top(item, 16);
            View badge = ui.badge(kind(t), label(t));
            item.addView(badge);
            if (t.state == TransferState.DONE && celebrated.add("transfer:" + t.id)) {
                if (!firstRender) {
                    NearbyUi.pop(badge);
                    tap();
                }
            }
            TextView name = ui.text(t.name, 16, true, R.color.ink);
            NearbyUi.top(name, 10);
            item.addView(name);
            String who = (in ? "From " : "To ") + t.peerName + ". " + t.files + (t.files == 1 ? " file, " : " files, ") + bytes(t.bytes) + ".";
            TextView whoText = ui.caption(who);
            NearbyUi.top(whoText, 4);
            item.addView(whoText);
            if (moving(t)) {
                android.widget.ProgressBar bar = ui.progress(t.bytesDone, t.bytes, bytes(t.bytesDone) + " of " + bytes(t.bytes));
                item.addView(bar);
                TextView amount = ui.caption(bytes(t.bytesDone) + " of " + bytes(t.bytes));
                NearbyUi.top(amount, 6);
                item.addView(amount);
                bars.put(t.id, bar);
                amounts.put(t.id, amount);
            }
            String next = next(t);
            if (next != null) {
                TextView n = ui.text(next, 14, false, R.color.ink_2);
                NearbyUi.top(n, 8);
                item.addView(n);
            }
            if (in && t.reusedFiles > 0) item.addView(spaced(ui.caption(t.reusedFiles + (t.reusedFiles == 1 ? " file" : " files") + " came from the earlier copy, so they weren't sent again.")));
            if (t.excludedCount > 0) item.addView(spaced(ui.caption(t.excludedCount + (t.excludedCount == 1 ? " file was" : " files were") + " left out.")));
            if (t.message != null && !t.message.isEmpty() && t.state != TransferState.DONE) {
                item.addView(spaced(ui.text(t.message, 13, false, t.state == TransferState.FAILED ? R.color.failed : R.color.ink_2)));
            }
            if (in && t.state == TransferState.OFFERED) {
                item.addView(ui.pair(action("Accept", R.drawable.ph_check_bold, NearbyUi.PRIMARY, () -> hub.node().accept(t.id, hub.inbox(), null)),
                        action("Decline", R.drawable.ph_x_bold, NearbyUi.SECONDARY, () -> hub.node().decline(t.id))));
            } else if (!t.state.isFinal() && t.state != TransferState.INTERRUPTED) {
                item.addView(ui.inline(action("Cancel", 0, NearbyUi.QUIET, () -> hub.node().cancel(t.id))));
            } else if (!in && t.state == TransferState.INTERRUPTED) {
                item.addView(ui.stack(action("Resume", R.drawable.ph_arrow_counter_clockwise_bold, NearbyUi.PRIMARY, () -> hub.node().resume(t.id)),
                        action("Dismiss", 0, NearbyUi.QUIET, () -> hub.node().dismiss(t.id))));
            } else if (in && t.state == TransferState.DONE && t.destination != null) {
                LinearLayout share = ui.button("Share", R.drawable.ph_share_network_bold, NearbyUi.SECONDARY);
                share.setOnClickListener(v -> share(new File(t.destination), t.name));
                item.addView(ui.pair(share, action("Dismiss", 0, NearbyUi.QUIET, () -> hub.node().dismiss(t.id))));
            } else {
                item.addView(ui.inline(action(in && t.state == TransferState.INTERRUPTED ? "Give up" : "Dismiss", 0, NearbyUi.QUIET, () -> hub.node().dismiss(t.id))));
            }
            c.addView(item);
        }
        return c;
    }

    private View spaced(TextView t) {
        NearbyUi.top(t, 6);
        return t;
    }

    private View phoneCard(MeshNode.Snapshot s) {
        LinearLayout c = ui.card();
        c.addView(ui.title(R.drawable.ph_device_mobile_regular, "Receive on this phone"));
        LinearLayout row = ui.row();
        row.setMinimumHeight(ui.px(56));
        NearbyUi.top(row, 12);
        final boolean on = s.visibleUntil > System.currentTimeMillis();
        LinearLayout words = ui.column();
        words.addView(ui.text("Visible to your computers", 16, true, R.color.ink));
        TextView caption = ui.caption(on
                ? "Until " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(s.visibleUntil)) + ". Your paired computers can find this phone and send to it."
                : "Off. Turn it on so a paired computer can send to this phone. It turns itself off after five minutes.");
        NearbyUi.top(caption, 4);
        words.addView(caption);
        row.addView(words, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        final Switch visible = new Switch(this);
        visible.setChecked(on);
        visible.setContentDescription("Visible to your computers");
        ui.styleSwitch(visible);
        visible.setOnCheckedChangeListener((button, checked) -> beVisible(checked));
        visible.setMinimumHeight(ui.px(48));
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sl.leftMargin = ui.px(12);
        row.addView(visible, sl);
        c.addView(row);
        c.addView(ui.divider());
        TextView name = ui.text("This phone is " + s.name, 15, false, R.color.ink_2);
        NearbyUi.top(name, 14);
        c.addView(name);
        View key = ui.key(groups(s.fingerprint));
        NearbyUi.top(key, 4);
        c.addView(key);
        return c;
    }

    /** Every folder received here, still on this phone after the transfer is gone from the list or the app was closed. */
    private View receivedCard(List<Received> shownFolders) {
        if (shownFolders.isEmpty()) return null;
        LinearLayout c = ui.card();
        c.addView(ui.title(R.drawable.ph_tray_arrow_down_regular, "Received"));
        int listed = 0;
        for (final Received r : shownFolders) {
            if (++listed > 30) {
                c.addView(spaced(ui.caption("The oldest " + (shownFolders.size() - 30) + " aren't listed. Delete some to see them.")));
                break;
            }
            if (listed > 1) c.addView(ui.divider());
            LinearLayout item = ui.column();
            NearbyUi.top(item, 16);
            item.addView(ui.text(r.name, 16, true, R.color.ink));
            TextView about = ui.caption(r.files + (r.files == 1 ? " file, " : " files, ") + bytes(r.bytes) + ". Received " + DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(new Date(r.when)) + ".");
            NearbyUi.top(about, 4);
            item.addView(about);
            LinearLayout share = ui.button("Share", R.drawable.ph_share_network_bold, NearbyUi.SECONDARY);
            share.setOnClickListener(v -> share(r.folder, r.name));
            LinearLayout remove = ui.button("Delete", R.drawable.ph_trash_bold, NearbyUi.QUIET);
            remove.setOnClickListener(v -> confirmDelete(r.folder));
            item.addView(ui.pair(share, remove));
            c.addView(item);
        }
        return c;
    }

    private List<Received> receivedFolders(MeshNode.Snapshot s) {
        Set<String> live = new HashSet<>();
        for (TransferView t : s.transfers) if (t.destination != null && !t.state.isFinal()) live.add(new File(t.destination).getName());
        File[] folders = hub.inbox().listFiles();
        List<File> kept = new ArrayList<>();
        if (folders != null) {
            for (File f : folders) if (f.isDirectory() && !f.getName().startsWith(".farbaek-") && !live.contains(f.getName())) kept.add(f);
        }
        final java.util.Map<File, Long> times = new java.util.HashMap<>();
        for (File f : kept) times.put(f, f.lastModified());
        java.util.Collections.sort(kept, (a, b) -> Long.compare(times.get(b), times.get(a)));
        List<Received> found = new ArrayList<>();
        for (int i = 0; i < kept.size(); i++) {
            File f = kept.get(i);
            long when = times.get(f);
            long[] size = new long[] {-1, -1};
            if (i < 30) {
                String key = f.getPath() + "@" + when;
                size = sizes.get(key);
                if (size == null) {
                    size = new long[2];
                    measure(f, size, 0);
                    sizes.put(key, size);
                }
            }
            found.add(new Received(f.getName(), size[0], size[1], when, f));
        }
        return found;
    }

    /** Files and bytes in a folder, without following links, stopping early in a very large one. */
    private static void measure(File dir, long[] into, int depth) {
        File[] kids = dir.listFiles();
        if (kids == null || depth > 24 || into[0] > 10_000) return;
        for (File k : kids) {
            if (k.isDirectory()) measure(k, into, depth + 1);
            else if (k.isFile()) {
                into[0] += 1;
                into[1] += k.length();
            }
        }
    }

    /** Pairing by address, folded away until someone needs it: most computers appear on their own. */
    private View addressCard() {
        final LinearLayout c = ui.card();
        LinearLayout head = ui.row();
        head.setMinimumHeight(ui.px(48));
        head.setClickable(true);
        head.setFocusable(true);
        head.setBackground(new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(Color.argb(16, 18, 19, 23)), null, ui.rounded(R.color.ink, 12, 0, 0)));
        LinearLayout title = ui.title(R.drawable.ph_link_simple_regular, "Pair by address");
        head.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        final ImageView caret = ui.icon(R.drawable.ph_caret_down_regular, 20, R.color.ink_3);
        head.addView(caret);
        c.addView(head);
        TextView hint = ui.caption("If your computer doesn't appear on its own.");
        NearbyUi.top(hint, 2);
        c.addView(hint);

        final LinearLayout body = ui.column();
        TextView how = ui.body("Type the address its Nearby page shows, such as 192.168.1.20:53367.");
        NearbyUi.top(how, 12);
        body.addView(how);
        address = new EditText(this);
        address.setSingleLine(true);
        address.setHint("Address and port");
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        address.setTypeface(ui.monoTypeface());
        address.setTextColor(ui.color(R.color.ink));
        address.setHintTextColor(ui.color(R.color.ink_3));
        address.setBackground(ui.rounded(R.color.surface, 12, R.color.line_2, 1));
        address.setOnFocusChangeListener((v, focused) -> v.setBackground(ui.rounded(R.color.surface, 12, focused ? R.color.accent : R.color.line_2, focused ? 1.5f : 1)));
        address.setPadding(ui.px(14), ui.px(12), ui.px(14), ui.px(12));
        address.setMinHeight(ui.px(52));
        NearbyUi.top(address, 12);
        body.addView(address);
        LinearLayout pair = ui.button("Pair", R.drawable.ph_link_simple_bold, NearbyUi.SECONDARY);
        pair.setOnClickListener(v -> pairTyped());
        address.setOnEditorActionListener((v, id, e) -> {
            pairTyped();
            return true;
        });
        body.addView(ui.stack(pair));
        body.setVisibility(addressOpen ? View.VISIBLE : View.GONE);
        caret.setRotation(addressOpen ? 180f : 0f);
        c.addView(body);
        head.setContentDescription("Pair by address. " + (addressOpen ? "Open" : "Closed"));
        head.setOnClickListener(v -> {
            addressOpen = !addressOpen;
            body.setVisibility(addressOpen ? View.VISIBLE : View.GONE);
            caret.animate().rotation(addressOpen ? 180f : 0f).setDuration(200).start();
            head.setContentDescription("Pair by address. " + (addressOpen ? "Open" : "Closed"));
            if (addressOpen) NearbyUi.riseIn(body, getResources().getDisplayMetrics().density);
        });
        return c;
    }

    // Actions

    private void confirmDelete(final File folder) {
        if (sample != null) {
            say("A sample screen: nothing is deleted.");
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Delete " + folder.getName() + "?")
                .setMessage("It's removed from this phone. The computer that sent it still has its copy.")
                .setPositiveButton("Delete", (dialog, which) -> hub.run(() -> {
                    MeshHub.delete(folder);
                    hub.post(this::render);
                }))
                .setNegativeButton("Keep it", null)
                .show();
    }

    private void beVisible(final boolean on) {
        if (sample != null) return;
        if (on) askToNotify();
        hub.run(() -> {
            try {
                hub.node().setVisible(on);
            } catch (IOException | MeshNode.MeshException e) {
                say(e.getMessage());
            }
        });
    }

    private void pairTyped() {
        String raw = address.getText().toString().trim();
        int colon = raw.lastIndexOf(':');
        String host = colon > 0 ? raw.substring(0, colon) : raw;
        int port;
        try {
            port = colon > 0 ? Integer.parseInt(raw.substring(colon + 1)) : -1;
        } catch (NumberFormatException e) {
            port = -1;
        }
        if (host.isEmpty() || port < 1 || port > 65535) {
            say("Type the address and port together, such as 192.168.1.20:53367.");
            return;
        }
        pair(host, port);
    }

    private void pair(final String host, final int port) {
        if (sample != null) {
            say("A sample screen: nothing is paired.");
            return;
        }
        say("Calling " + host + "…", true);
        hub.run(() -> {
            try {
                hub.node().pair(host, port);
                say(null);
            } catch (MeshNode.MeshException e) {
                say(e.getMessage());
            }
        });
    }

    private void confirmForget(final TrustStore.TrustedDevice d) {
        if (sample != null) {
            say("A sample screen: nothing is forgotten.");
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Forget " + d.name + "?")
                .setMessage("It can't send to this phone, or receive from it, until you pair again.")
                .setPositiveButton("Forget", (dialog, which) -> hub.run(() -> {
                    try {
                        hub.node().forget(d.fingerprint);
                    } catch (IOException e) {
                        say(e.getMessage());
                    }
                }))
                .setNegativeButton("Keep it", null)
                .show();
    }

    private void pickFiles(String fingerprint) {
        if (sample != null) {
            say("A sample screen: nothing is sent.");
            return;
        }
        sendTo = fingerprint;
        askToNotify();
        Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("*/*")
                .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(pick, PICK_FILES);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (hub == null || request != PICK_FILES || result != RESULT_OK || data == null || sendTo == null) return;
        final List<Uri> picked = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) for (int i = 0; i < clip.getItemCount(); i++) picked.add(clip.getItemAt(i).getUri());
        else if (data.getData() != null) picked.add(data.getData());
        if (picked.isEmpty()) return;
        final String to = sendTo;
        say("Getting " + picked.size() + (picked.size() == 1 ? " file" : " files") + " ready to send…", true);
        hub.run(() -> {
            try {
                File folder = copyPicked(picked);
                MeshNode.PreparedView prepared = hub.node().prepare(folder);
                hub.node().send(prepared.id, to, null);
                say(null);
            } catch (IOException | MeshNode.MeshException | RuntimeException e) {
                say(e.getMessage() != null ? e.getMessage() : "Those files couldn't be sent.");
            }
        });
    }

    /** The picked files, copied into a folder Mesh owns, named for this phone, so the computer sees where they came from. */
    private File copyPicked(List<Uri> uris) throws IOException {
        File outbox = hub.outbox();
        long day = 24L * 60 * 60 * 1000;
        File[] old = outbox.listFiles();
        if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > day) delete(f);
        String stamp = new java.text.SimpleDateFormat("d MMM HH.mm", Locale.getDefault()).format(new Date());
        File folder = new File(new File(outbox, String.valueOf(System.nanoTime())), safeName("From " + hub.node().snapshot().name + " " + stamp, "From this phone"));
        if (!folder.mkdirs()) throw new IOException("This phone has no room to prepare those files.");
        Set<String> used = new HashSet<>();
        int n = 0;
        for (Uri uri : uris) {
            n += 1;
            String name = unique(safeName(displayName(uri), "file-" + n), used);
            try (InputStream in = getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(new File(folder, name))) {
                if (in == null) throw new IOException(name + " couldn't be read.");
                byte[] buf = new byte[64 * 1024];
                int r;
                while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
            }
        }
        return folder;
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (RuntimeException ignored) {
            // A provider that won't say: a plain name instead.
        }
        return null;
    }

    /** A file or folder name with nothing that reads as a path or a control character. */
    static String safeName(String raw, String fallback) {
        if (raw == null) return fallback;
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < raw.length(); i++) {
            char ch = raw.charAt(i);
            b.append(ch < 0x20 || ch == 0x7f || "/\\:*?\"<>|".indexOf(ch) >= 0 ? '_' : ch);
        }
        String s = b.toString().trim();
        while (s.startsWith(".")) s = s.substring(1);
        if (s.length() > 120) s = s.substring(0, 120).trim();
        return s.isEmpty() ? fallback : s;
    }

    private static String unique(String name, Set<String> used) {
        String candidate = name;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 2; used.contains(candidate.toLowerCase(Locale.ROOT)); i++) candidate = base + " (" + i + ")" + ext;
        used.add(candidate.toLowerCase(Locale.ROOT));
        return candidate;
    }

    private void share(File folder, String name) {
        if (sample != null) {
            say("A sample screen: nothing is shared.");
            return;
        }
        ArrayList<Uri> uris = new ArrayList<>();
        collect(folder, uris);
        if (uris.isEmpty()) {
            say("That folder is empty on this phone.");
            return;
        }
        Intent send = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE).setType("*/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (uris.size() == 1) send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
        else send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
        if (uris.size() >= MAX_SHARED) say("Only the first " + MAX_SHARED + " files can be shared at once.");
        startActivity(Intent.createChooser(send, "Share " + name));
    }

    private void collect(File dir, ArrayList<Uri> into) {
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (into.size() >= MAX_SHARED) return;
            if (f.isDirectory()) collect(f, into);
            else if (f.isFile()) into.add(FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f));
        }
    }

    private void askToNotify() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, ASK_NOTIFY);
        }
    }

    private interface MeshCall {
        void run() throws Exception;
    }

    /** Runs a call on the node off the main thread; if it fails, says why and draws the screen again. */
    private void act(final MeshCall call) {
        if (sample != null) {
            say("A sample screen: nothing happens.");
            return;
        }
        hub.runQuick(() -> {
            try {
                call.run();
            } catch (Exception e) {
                say(e.getMessage() != null ? e.getMessage() : "That didn't work. Try again.");
                hub.post(this::render);
            }
        });
    }

    private LinearLayout action(String label, int icon, int style, final MeshCall call) {
        LinearLayout b = ui.button(label, icon, style);
        b.setOnClickListener(v -> {
            NearbyUi.enable(v, false);
            act(call);
        });
        return b;
    }

    /** The phone's own short confirmation, for the moments it worked. */
    private void tap() {
        page.performHapticFeedback(Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY);
    }

    private final Runnable hideToast = () -> toast.animate().alpha(0f).translationY(ui.px(8)).setDuration(160).withEndAction(() -> toast.setVisibility(View.GONE)).start();

    /** Shows a message at the bottom of the screen, above the bars and the keyboard, from any thread; null clears it. */
    private void say(final String message) {
        say(message, false);
    }

    /**
     * A message at the bottom of the screen. One that says work is under way ({@code stays}) stays until the work says
     * how it went, which can take half a minute for a pairing or longer to ready a large pick; any other goes after
     * long enough to read it. A tap puts either away.
     */
    private void say(final String message, final boolean stays) {
        Runnable show = () -> {
            toast.removeCallbacks(hideToast);
            toast.animate().cancel();
            if (message == null || message.isEmpty()) {
                if (toast.getVisibility() == View.VISIBLE) hideToast.run();
                return;
            }
            toast.setText(message);
            if (toast.getVisibility() != View.VISIBLE) {
                toast.setVisibility(View.VISIBLE);
                toast.setAlpha(0f);
                toast.setTranslationY(ui.px(8));
            }
            toast.animate().alpha(1f).translationY(0f).setDuration(200).start();
            if (!stays) toast.postDelayed(hideToast, Math.max(6_000, Math.min(12_000, message.length() * 80L)));
        };
        if (hub != null) hub.post(show);
        else toast.post(show);
    }

    // Words

    private static String label(TransferView t) {
        boolean in = "in".equals(t.direction);
        switch (t.state) {
            case PACKING: return "Getting ready";
            case CONNECTING: return "Connecting";
            case WAITING: return in ? "Waiting" : "Waiting to be accepted";
            case OFFERED: return "Waiting for you";
            case SENDING: return "Sending";
            case RECEIVING: return "Receiving";
            case FINISHING: return "Checking";
            case DONE: return in ? "Received and checked" : "Delivered";
            case DECLINED: return "Declined";
            case CANCELLED: return "Cancelled";
            case INTERRUPTED: return "Stopped";
            default: return "Failed";
        }
    }

    private static NearbyUi.Kind kind(TransferView t) {
        switch (t.state) {
            case OFFERED: return NearbyUi.Kind.APPROVAL;
            case WAITING: return NearbyUi.Kind.PENDING;
            case DONE: return NearbyUi.Kind.VERIFIED;
            case FAILED: return NearbyUi.Kind.FAILED;
            case INTERRUPTED: return NearbyUi.Kind.ATTENTION;
            case DECLINED:
            case CANCELLED: return NearbyUi.Kind.OFF;
            default: return NearbyUi.Kind.WORKING;
        }
    }

    /** What happens next, in a sentence, where the badge alone doesn't say it. */
    private static String next(TransferView t) {
        boolean in = "in".equals(t.direction);
        switch (t.state) {
            case WAITING: return in ? null : "Accept it on " + t.peerName + ", in Nearby.";
            case OFFERED: return "Accept to save it on this phone. Nothing in it runs.";
            case DONE: return in ? "Every file matched what was sent." : "Every file was checked when it arrived. On the computer, Open folder shows it.";
            case INTERRUPTED: return in ? "The computer can resume it." : "You can resume it from where it stopped.";
            default: return null;
        }
    }

    /** A long computer name, cut for a badge. */
    private static String shortName(String name) {
        return name.length() > 18 ? name.substring(0, 17) + "…" : name;
    }

    private static Discovery.NearbyDevice find(List<Discovery.NearbyDevice> nearby, String fingerprint) {
        for (Discovery.NearbyDevice n : nearby) if (n.fingerprint.equals(fingerprint)) return n;
        return null;
    }

    private static String groups(String fingerprint) {
        if (fingerprint == null) return "";
        String head = fingerprint.length() > 16 ? fingerprint.substring(0, 16) : fingerprint;
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < head.length(); i += 4) {
            if (b.length() > 0) b.append(' ');
            b.append(head, i, Math.min(head.length(), i + 4));
        }
        return b.toString();
    }

    static String bytes(long n) {
        if (n < 1024) return n + " B";
        if (n < 1024 * 1024) return String.format(Locale.US, "%.0f KB", n / 1024.0);
        if (n < 1024L * 1024 * 1024) return String.format(Locale.US, "%.1f MB", n / (1024.0 * 1024));
        return String.format(Locale.US, "%.2f GB", n / (1024.0 * 1024 * 1024));
    }

    private static void delete(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) delete(k);
        f.delete();
    }
}
