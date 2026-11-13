package com.farbaek.app.mesh;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.farbaek.app.R;
import com.farbaek.mesh.Discovery;
import com.farbaek.mesh.MeshNode;
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
 */
public final class MeshActivity extends Activity implements MeshHub.Observer {
    private static final int PICK_FILES = 41;
    private static final int ASK_NOTIFY = 42;
    private static final int MAX_SHARED = 200;

    private MeshHub hub;
    private float dp;
    private LinearLayout dynamic;
    private TextView notice;
    private EditText address;
    private String sendTo;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        dp = getResources().getDisplayMetrics().density;
        hub = MeshHub.get(this);
        MeshService.channel(this);
        if (state != null) sendTo = state.getString("sendTo");

        LinearLayout page = column();
        page.setPadding(px(20), px(24), px(20), px(40));
        page.addView(text(getString(R.string.nearby_title), 28, true, R.color.ink));
        TextView intro = text("Send files between this phone and your computers on the same Wi-Fi, with no internet. Encrypted end to end, and every piece is checked when it arrives.", 15, false, R.color.ink_2);
        margin(intro, 8);
        page.addView(intro);

        notice = text("", 14, false, R.color.ink);
        notice.setVisibility(View.GONE);
        notice.setBackground(rounded(R.color.surface_raised, 12, R.color.line));
        notice.setPadding(px(16), px(12), px(16), px(12));
        margin(notice, 16);
        page.addView(notice);

        dynamic = column();
        page.addView(dynamic);
        page.addView(addressCard());

        TextView foot = text("Received folders stay in this app's private storage until you share or delete them. Nearby only works with computers you paired, and the computer checks every file against what was sent.", 13, false, R.color.ink_3);
        margin(foot, 24);
        page.addView(foot);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(page);
        setContentView(scroll);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putString("sendTo", sendTo);
    }

    @Override
    protected void onStart() {
        super.onStart();
        hub.personPresent();
        hub.observe(this);
        looking(true);
        render();
        hub.refresh();
    }

    @Override
    protected void onStop() {
        // Listening for computers only while the screen is open; being visible is its own switch.
        looking(false);
        hub.forget(this);
        dynamic.removeCallbacks(whileStarting);
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
        dynamic.removeAllViews();
        dynamic.removeCallbacks(whileStarting);
        MeshNode.Snapshot s = hub.ready() ? hub.snapshot() : null;
        if (s == null) {
            String problem = hub.startProblem();
            String words = problem != null ? problem
                    : hub.startingFor() > 15_000
                    ? "Still starting. Opening this phone's Nearby key is taking longer than usual, and Nearby opens as soon as it's ready. You can leave this screen and come back."
                    : "Starting Nearby…";
            dynamic.addView(card(text(words, 15, false, problem != null ? R.color.failed : R.color.ink_2)));
            if (problem == null) dynamic.postDelayed(whileStarting, 5_000);
            return;
        }
        String reset = hub.resetNotice();
        if (reset != null) {
            LinearLayout c = cardColumn();
            c.addView(text(reset, 15, false, R.color.ink));
            LinearLayout actions = buttons();
            Button ok = button("OK", false);
            ok.setOnClickListener(v -> hub.dismissResetNotice());
            actions.addView(ok);
            c.addView(actions);
            dynamic.addView(c);
        }
        if (s.pairing != null) dynamic.addView(pairingCard(s.pairing));
        if (!s.transfers.isEmpty()) dynamic.addView(transfersCard(s.transfers));
        dynamic.addView(phoneCard(s));
        dynamic.addView(computersCard(s));
        View nearby = nearbyCard(s);
        if (nearby != null) dynamic.addView(nearby);
        View received = receivedCard(s);
        if (received != null) dynamic.addView(received);
    }

    /** Every folder received here, still on this phone after the transfer is gone from the list or the app was closed. */
    private View receivedCard(MeshNode.Snapshot s) {
        Set<String> live = new HashSet<>();
        for (TransferView t : s.transfers) if (t.destination != null && !t.state.isFinal()) live.add(new File(t.destination).getName());
        File[] folders = hub.inbox().listFiles();
        List<File> shown = new ArrayList<>();
        if (folders != null) for (File f : folders) if (f.isDirectory() && !f.getName().startsWith(".farbaek-") && !live.contains(f.getName())) shown.add(f);
        if (shown.isEmpty()) return null;
        java.util.Collections.sort(shown, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        LinearLayout c = cardColumn();
        c.addView(heading("Received"));
        int listed = 0;
        for (final File folder : shown) {
            if (++listed > 30) {
                c.addView(text("The oldest " + (shown.size() - 30) + " aren't listed. Delete some to see them.", 13, false, R.color.ink_3));
                break;
            }
            long[] size = new long[2];
            measure(folder, size, 0);
            LinearLayout item = column();
            margin(item, 12);
            item.addView(text(folder.getName(), 16, true, R.color.ink));
            item.addView(text(size[0] + (size[0] == 1 ? " file, " : " files, ") + bytes(size[1]) + ". Received " + DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(new Date(folder.lastModified())) + ".", 13, false, R.color.ink_3));
            LinearLayout actions = buttons();
            Button share = button("Share", true);
            share.setOnClickListener(v -> share(folder, folder.getName()));
            actions.addView(share);
            Button remove = button("Delete", false);
            remove.setOnClickListener(v -> confirmDelete(folder));
            actions.addView(remove);
            item.addView(actions);
            c.addView(item);
        }
        return c;
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

    private void confirmDelete(final File folder) {
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

    private View phoneCard(MeshNode.Snapshot s) {
        LinearLayout c = cardColumn();
        c.addView(heading("This phone"));
        TextView name = text(s.name, 16, true, R.color.ink);
        margin(name, 8);
        c.addView(name);
        TextView key = mono("Key " + groups(s.fingerprint), 13, R.color.ink_3);
        margin(key, 2);
        c.addView(key);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(px(48));
        TextView label = text("Visible to your computers", 15, false, R.color.ink);
        row.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        final Switch visible = new Switch(this);
        final boolean on = s.visibleUntil > System.currentTimeMillis();
        visible.setChecked(on);
        visible.setContentDescription("Visible to your computers");
        visible.setOnCheckedChangeListener((button, checked) -> beVisible(checked));
        row.addView(visible);
        margin(row, 12);
        c.addView(row);
        String caption = on
                ? "Your paired computers can find this phone until " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(s.visibleUntil)) + "."
                : "Turn this on so a paired computer can find this phone and send to it. It turns itself off after five minutes.";
        c.addView(text(caption, 13, false, R.color.ink_3));
        return c;
    }

    private View computersCard(MeshNode.Snapshot s) {
        LinearLayout c = cardColumn();
        c.addView(heading("Your computers"));
        List<TrustStore.TrustedDevice> computers = new ArrayList<>();
        for (TrustStore.TrustedDevice d : s.devices) if (!"farbaek".equals(d.via)) computers.add(d);
        if (computers.isEmpty()) {
            TextView none = text("None paired yet. On your computer, open Farbaek's desktop app, go to Nearby and choose Be visible. It appears below, ready to pair. Or pair by its address.", 14, false, R.color.ink_2);
            margin(none, 8);
            c.addView(none);
            return c;
        }
        for (final TrustStore.TrustedDevice d : computers) {
            Discovery.NearbyDevice seen = find(s.nearby, d.fingerprint);
            LinearLayout item = column();
            margin(item, 12);
            item.addView(text(d.name, 16, true, R.color.ink));
            item.addView(text(seen != null ? "On this Wi-Fi now." : "Not seen on this Wi-Fi. On the computer, choose Be visible in Nearby.", 13, false, seen != null ? R.color.verified : R.color.ink_3));
            LinearLayout actions = buttons();
            Button send = button("Send files", true);
            send.setEnabled(seen != null);
            send.setOnClickListener(v -> pickFiles(d.fingerprint));
            actions.addView(send);
            Button forget = button("Forget", false);
            forget.setOnClickListener(v -> confirmForget(d));
            actions.addView(forget);
            item.addView(actions);
            c.addView(item);
        }
        return c;
    }

    private View nearbyCard(MeshNode.Snapshot s) {
        Set<String> paired = new HashSet<>();
        for (TrustStore.TrustedDevice d : s.devices) paired.add(d.fingerprint);
        List<Discovery.NearbyDevice> fresh = new ArrayList<>();
        for (Discovery.NearbyDevice n : s.nearby) if (!paired.contains(n.fingerprint)) fresh.add(n);
        if (fresh.isEmpty()) return null;
        LinearLayout c = cardColumn();
        c.addView(heading("On this Wi-Fi, not paired"));
        for (final Discovery.NearbyDevice n : fresh) {
            LinearLayout item = column();
            margin(item, 12);
            item.addView(text(n.name, 16, true, R.color.ink));
            item.addView(mono("Key " + groups(n.fingerprint), 13, R.color.ink_3));
            LinearLayout actions = buttons();
            Button pair = button("Pair", true);
            pair.setOnClickListener(v -> pair(n.address, n.port));
            actions.addView(pair);
            item.addView(actions);
            c.addView(item);
        }
        return c;
    }

    private View pairingCard(MeshNode.PairingView p) {
        LinearLayout c = cardColumn();
        c.setBackground(rounded(R.color.surface, 20, R.color.accent));
        String peer = p.peerName != null ? p.peerName : "that computer";
        switch (p.state) {
            case "confirming": {
                c.addView(heading("Pair with " + peer + "?"));
                c.addView(code(p.code));
                c.addView(text("Check that " + peer + " shows the same six digits. Pair only if they match.", 14, false, R.color.ink_2));
                LinearLayout actions = buttons();
                Button yes = button("They match", true);
                yes.setOnClickListener(v -> {
                    v.setEnabled(false);
                    hub.runQuick(() -> hub.node().confirmPairing(p.id, true));
                });
                actions.addView(yes);
                Button no = button("They don't match", false);
                no.setOnClickListener(v -> {
                    v.setEnabled(false);
                    hub.runQuick(() -> hub.node().confirmPairing(p.id, false));
                });
                actions.addView(no);
                c.addView(actions);
                break;
            }
            case "waiting": {
                c.addView(heading("Waiting for " + peer));
                c.addView(code(p.code));
                c.addView(text("Confirm the code on " + peer + " too.", 14, false, R.color.ink_2));
                LinearLayout actions = buttons();
                Button cancel = button("Cancel", false);
                cancel.setOnClickListener(v -> hub.runQuick(() -> hub.node().dismissPairing(p.id)));
                actions.addView(cancel);
                c.addView(actions);
                break;
            }
            default: {
                boolean paired = "paired".equals(p.state);
                c.addView(heading(paired ? "Paired with " + peer : "Not paired"));
                String why = p.message != null ? p.message : paired ? "You can send files to it now." : "Nothing was paired. Try again when both screens are open.";
                c.addView(text(why, 14, false, paired ? R.color.verified : R.color.ink_2));
                LinearLayout actions = buttons();
                Button done = button(paired ? "Done" : "Close", !paired);
                done.setOnClickListener(v -> hub.runQuick(() -> hub.node().dismissPairing(p.id)));
                actions.addView(done);
                c.addView(actions);
            }
        }
        return c;
    }

    private View transfersCard(List<TransferView> transfers) {
        LinearLayout c = cardColumn();
        c.addView(heading("Transfers"));
        for (final TransferView t : transfers) {
            boolean in = "in".equals(t.direction);
            LinearLayout item = column();
            margin(item, 12);
            item.addView(text(t.name, 16, true, R.color.ink));
            String who = (in ? "From " : "To ") + t.peerName + ". " + t.files + (t.files == 1 ? " file, " : " files, ") + bytes(t.bytes) + ".";
            item.addView(text(who, 13, false, R.color.ink_3));
            item.addView(text(label(t), 14, true, tone(t)));
            if (!t.state.isFinal() && t.bytes > 0 && (t.state == TransferState.SENDING || t.state == TransferState.RECEIVING || t.state == TransferState.FINISHING)) {
                ProgressBar bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
                bar.setMax(1000);
                bar.setProgress((int) Math.min(1000, t.bytesDone * 1000 / Math.max(1, t.bytes)));
                bar.setProgressTintList(ColorStateList.valueOf(color(R.color.accent)));
                bar.setContentDescription(bytes(t.bytesDone) + " of " + bytes(t.bytes));
                margin(bar, 6);
                item.addView(bar);
                item.addView(text(bytes(t.bytesDone) + " of " + bytes(t.bytes), 13, false, R.color.ink_3));
            }
            if (in && t.reusedFiles > 0) item.addView(text(t.reusedFiles + (t.reusedFiles == 1 ? " file" : " files") + " came from the earlier copy, so they weren't sent again.", 13, false, R.color.ink_3));
            if (t.excludedCount > 0) item.addView(text(t.excludedCount + (t.excludedCount == 1 ? " file was" : " files were") + " left out.", 13, false, R.color.ink_3));
            if (t.message != null && !t.message.isEmpty()) item.addView(text(t.message, 13, false, t.state == TransferState.FAILED ? R.color.failed : R.color.ink_2));
            LinearLayout actions = buttons();
            if (in && t.state == TransferState.OFFERED) {
                actions.addView(action("Accept", true, () -> hub.node().accept(t.id, hub.inbox(), null)));
                actions.addView(action("Decline", false, () -> hub.node().decline(t.id)));
            } else if (!t.state.isFinal() && t.state != TransferState.INTERRUPTED) {
                actions.addView(action("Cancel", false, () -> hub.node().cancel(t.id)));
            } else if (!in && t.state == TransferState.INTERRUPTED) {
                actions.addView(action("Resume", true, () -> hub.node().resume(t.id)));
                actions.addView(action("Dismiss", false, () -> hub.node().dismiss(t.id)));
            } else {
                if (in && t.state == TransferState.DONE && t.destination != null) {
                    Button share = button("Share", true);
                    share.setOnClickListener(v -> share(new File(t.destination), t.name));
                    actions.addView(share);
                }
                actions.addView(action(in && t.state == TransferState.INTERRUPTED ? "Give up" : "Dismiss", false, () -> hub.node().dismiss(t.id)));
            }
            item.addView(actions);
            c.addView(item);
        }
        return c;
    }

    private View addressCard() {
        LinearLayout c = cardColumn();
        c.addView(heading("Pair by address"));
        TextView how = text("If the computer doesn't appear, type the address its Nearby page shows, such as 192.168.1.20:53367.", 14, false, R.color.ink_2);
        margin(how, 6);
        c.addView(how);
        address = new EditText(this);
        address.setSingleLine(true);
        address.setHint("Address and port");
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        address.setTypeface(Typeface.MONOSPACE);
        address.setTextColor(color(R.color.ink));
        address.setBackground(rounded(R.color.surface, 12, R.color.line));
        address.setPadding(px(14), px(12), px(14), px(12));
        address.setMinHeight(px(48));
        margin(address, 12);
        c.addView(address);
        LinearLayout actions = buttons();
        Button pair = button("Pair", false);
        pair.setOnClickListener(v -> pairTyped());
        address.setOnEditorActionListener((v, id, e) -> {
            pairTyped();
            return true;
        });
        actions.addView(pair);
        c.addView(actions);
        return c;
    }

    // Actions

    private void beVisible(final boolean on) {
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
        say("Calling " + host + "…");
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
        if (request != PICK_FILES || result != RESULT_OK || data == null || sendTo == null) return;
        final List<Uri> picked = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) for (int i = 0; i < clip.getItemCount(); i++) picked.add(clip.getItemAt(i).getUri());
        else if (data.getData() != null) picked.add(data.getData());
        if (picked.isEmpty()) return;
        final String to = sendTo;
        say("Checking " + picked.size() + (picked.size() == 1 ? " file…" : " files…"));
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

    private Button action(String label, boolean primary, final MeshCall call) {
        Button b = button(label, primary);
        b.setOnClickListener(v -> {
            v.setEnabled(false);
            hub.runQuick(() -> {
            try {
                call.run();
            } catch (Exception e) {
                say(e.getMessage() != null ? e.getMessage() : "That didn't work. Try again.");
                hub.post(this::render);
            }
            });
        });
        return b;
    }

    /** Shows a line at the top of the screen, from any thread; null clears it. */
    private void say(final String message) {
        hub.post(() -> {
            notice.setText(message == null ? "" : message);
            notice.setVisibility(message == null || message.isEmpty() ? View.GONE : View.VISIBLE);
        });
    }

    // Words

    private static String label(TransferView t) {
        boolean in = "in".equals(t.direction);
        switch (t.state) {
            case PACKING: return "Checking files";
            case CONNECTING: return "Connecting";
            case WAITING: return in ? "Waiting" : "Waiting for them to accept";
            case OFFERED: return "Waiting for you";
            case SENDING: return "Sending";
            case RECEIVING: return "Receiving";
            case FINISHING: return "Checking";
            case DONE: return in ? "Received and checked" : "Delivered";
            case DECLINED: return "Declined";
            case CANCELLED: return "Cancelled";
            case INTERRUPTED: return in ? "Stopped. The computer can resume it." : "Stopped. You can resume it.";
            default: return "Stopped";
        }
    }

    private static int tone(TransferView t) {
        switch (t.state) {
            case OFFERED: return R.color.accent;
            case DONE: return R.color.verified;
            case FAILED: return R.color.failed;
            case INTERRUPTED: return R.color.caution;
            case DECLINED:
            case CANCELLED: return R.color.ink_3;
            default: return R.color.info;
        }
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

    // Views, in the web app's tokens: pills for buttons, 20dp cards, 12dp inputs.

    private LinearLayout column() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private LinearLayout cardColumn() {
        LinearLayout c = column();
        c.setBackground(rounded(R.color.surface, 20, R.color.line));
        c.setPadding(px(20), px(18), px(20), px(20));
        margin(c, 16);
        return c;
    }

    private View card(View inside) {
        LinearLayout c = cardColumn();
        c.addView(inside);
        return c;
    }

    private LinearLayout buttons() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        margin(row, 12);
        return row;
    }

    private TextView heading(String s) {
        TextView t = text(s, 18, true, R.color.ink);
        if (Build.VERSION.SDK_INT >= 28) t.setAccessibilityHeading(true);
        return t;
    }

    private TextView code(String digits) {
        String shown = digits != null && digits.length() == 6 ? digits.substring(0, 3) + " " + digits.substring(3) : String.valueOf(digits);
        TextView t = mono(shown, 34, R.color.ink);
        t.setLetterSpacing(0.08f);
        t.setContentDescription("Code " + (digits == null ? "" : digits.replace("", " ").trim()));
        margin(t, 12);
        return t;
    }

    private TextView text(String s, int sp, boolean medium, int colorRes) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color(colorRes));
        t.setLineSpacing(0, sp >= 24 ? 1.1f : 1.35f);
        if (medium) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        if (sp >= 24) t.setLetterSpacing(-0.02f);
        return t;
    }

    private TextView mono(String s, int sp, int colorRes) {
        TextView t = text(s, sp, false, colorRes);
        t.setTypeface(Typeface.MONOSPACE);
        return t;
    }

    private Button button(String label, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        b.setTextColor(color(primary ? R.color.on_primary : R.color.ink));
        b.setStateListAnimator(null);
        b.setMinHeight(px(48));
        b.setMinimumHeight(px(48));
        b.setPadding(px(20), 0, px(20), 0);
        GradientDrawable shape = rounded(primary ? R.color.primary : R.color.surface, 999, primary ? R.color.primary : R.color.line);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(color(R.color.line)), shape, null));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.rightMargin = px(10);
        b.setLayoutParams(lp);
        return b;
    }

    private GradientDrawable rounded(int fillRes, int radiusDp, int strokeRes) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color(fillRes));
        g.setCornerRadius(px(radiusDp));
        g.setStroke(Math.max(1, px(1)), color(strokeRes));
        return g;
    }

    private void margin(View v, int topDp) {
        LinearLayout.LayoutParams lp = v.getLayoutParams() instanceof LinearLayout.LayoutParams
                ? (LinearLayout.LayoutParams) v.getLayoutParams()
                : new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = px(topDp);
        v.setLayoutParams(lp);
    }

    private int color(int res) {
        return getColor(res);
    }

    private int px(int dps) {
        return Math.round(dps * dp);
    }
}
