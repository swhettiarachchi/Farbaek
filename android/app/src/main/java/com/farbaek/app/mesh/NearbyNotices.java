package com.farbaek.app.mesh;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.farbaek.app.R;
import com.farbaek.mesh.ReceivedLog;
import com.farbaek.mesh.SavePlan;
import com.farbaek.mesh.TransferView;

import java.util.Locale;

/**
 * Nearby's notifications for the person (stage 188, ADR 0196): something waits for them, and something arrived, with
 * where it went in the words alone. They're private on the lock screen, one per transfer, and never posted while
 * Nearby is on screen (the screen already shows it). The ongoing "Visible" notification stays on its own quiet channel.
 */
final class NearbyNotices {
    private NearbyNotices() {}

    static final String CHANNEL = "nearby_files";
    private static final int OFFER = 7311;
    private static final int ARRIVED = 7312;

    static void channel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel c = new NotificationChannel(CHANNEL, "Files from your computers", NotificationManager.IMPORTANCE_HIGH);
        c.setDescription("When a computer wants to send you files, and when they've arrived.");
        nm.createNotificationChannel(c);
    }

    /** Whether notifications can be shown at all: the permission on Android 13 and later, and not turned off. */
    static boolean allowed(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    static void offer(Context context, TransferView t) {
        if (!allowed(context)) return;
        channel(context);
        String what = String.format(Locale.US, "%,d", t.files) + (t.files == 1 ? " file, " : " files, ") + MeshActivity.bytes(t.bytes);
        Notification n = base(context, SavePlan.offerTitle(t.peerName, t.name), what + ". Open Nearby to accept or decline it.")
                .setContentIntent(openNearby(context, t.id))
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .build();
        post(context, "offer:" + t.id, OFFER, n);
    }

    static void cancelOffer(Context context, String id) {
        NotificationManagerCompat.from(context).cancel("offer:" + id, OFFER);
    }

    /** An arrival: what came, from whom, and where it is. A tap opens the one file, when there's one that opens. */
    static void arrived(Context context, ReceivedLog.Entry e) {
        if (!allowed(context)) return;
        channel(context);
        String where = e.state == ReceivedLog.State.SAVED ? "In " + e.placeLabel() + "." : "Kept in Nearby. Open Nearby to share it.";
        PendingIntent tap = openNearby(context, e.id);
        if (e.state == ReceivedLog.State.SAVED && e.files.size() == 1) {
            ReceivedLog.FileRecord f = e.files.get(0);
            if (f.published && f.uri != null && SavePlan.canOpen(f.path)) tap = openFile(context, e.id, f);
        }
        Notification n = base(context, SavePlan.arrivalTitle(e.from, e.paths(), e.files.size()), where).setContentIntent(tap).build();
        post(context, "arrived:" + e.id, ARRIVED, n);
    }

    private static NotificationCompat.Builder base(Context context, String title, String text) {
        // On a locked phone, only that something happened: no names, no file names.
        Notification hidden = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_nearby)
                .setContentTitle("Farbaek")
                .setContentText("Nearby has something for you.")
                .build();
        return new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_nearby)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(hidden)
                .setPriority(NotificationCompat.PRIORITY_HIGH);
    }

    private static void post(Context context, String tag, int id, Notification n) {
        try {
            NotificationManagerCompat.from(context).notify(tag, id, n);
        } catch (SecurityException ignored) {
            // The permission was taken back a moment ago: nothing is shown, and the screen still says it.
        }
    }

    private static PendingIntent openNearby(Context context, String key) {
        Intent i = new Intent(context, MeshActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, key.hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Opens one saved file in the app that views its kind. Only for kinds that open in a viewer: nothing received runs. */
    private static PendingIntent openFile(Context context, String key, ReceivedLog.FileRecord f) {
        Intent view = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(Uri.parse(f.uri), f.mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, ("open:" + key).hashCode(), view, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
