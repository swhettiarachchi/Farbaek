package com.farbaek.app.mesh;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

import com.farbaek.app.R;
import com.farbaek.mesh.MeshNode;
import com.farbaek.mesh.TransferView;

/**
 * Keeps Nearby working with the screen off (ADR 0193): visible to paired
 * computers, or moving files. Its notification says which, and opens Nearby.
 * Android 15 allows data syncs six hours a day; when Android ends it, Nearby
 * stops being visible and says so.
 */
public final class MeshService extends Service implements MeshHub.Observer {
    private static final String CHANNEL = "nearby";
    private static final int ONGOING = 7301;
    private static final int STOPPED = 7302;

    private MeshHub hub;

    @Override
    public void onCreate() {
        super.onCreate();
        hub = MeshHub.get(this);
        channel(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = notification();
        if (Build.VERSION.SDK_INT >= 29) startForeground(ONGOING, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(ONGOING, n);
        hub.observe(this);
        // Started again only by the Nearby screen or a transfer, never by Android on its own.
        return START_NOT_STICKY;
    }

    @Override
    public void onMeshChanged() {
        // Once the hub has let the service go, its notification is never posted again: it would outlive the service.
        if (!hub.serviceWanted()) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(ONGOING, notification());
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        // Android's daily limit for data syncs: stop at once, or Android ends the app.
        hub.forget(this);
        hub.stoppedByLimit();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(STOPPED, new NotificationCompat.Builder(this, CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_nearby)
                    .setContentTitle(getString(R.string.nearby_limit_title))
                    .setContentText(getString(R.string.nearby_limit_body))
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(getString(R.string.nearby_limit_body)))
                    .setContentIntent(open())
                    .setAutoCancel(true)
                    .build());
        }
        stopSelf();
    }

    @Override
    public void onDestroy() {
        hub.forget(this);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification notification() {
        String title = getString(R.string.nearby_title);
        String text = getString(R.string.nearby_ongoing_visible);
        int max = 0;
        int progress = 0;
        if (hub.ready()) {
            MeshNode.Snapshot s = hub.node().snapshot();
            TransferView moving = null;
            for (TransferView t : s.transfers) {
                if (!t.state.isFinal() && t.bytes > 0 && t.bytesDone < t.bytes) {
                    moving = t;
                    break;
                }
            }
            if (moving != null) {
                text = getString("in".equals(moving.direction) ? R.string.nearby_ongoing_receiving : R.string.nearby_ongoing_sending, moving.name, moving.peerName);
                max = 1000;
                progress = (int) Math.min(1000, moving.bytesDone * 1000 / Math.max(1, moving.bytes));
            }
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_nearby)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(open())
                .setCategory(NotificationCompat.CATEGORY_PROGRESS);
        if (max > 0) b.setProgress(max, progress, false);
        return b.build();
    }

    private PendingIntent open() {
        Intent i = new Intent(this, MeshActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void channel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel c = new NotificationChannel(CHANNEL, context.getString(R.string.nearby_channel), NotificationManager.IMPORTANCE_LOW);
        c.setDescription(context.getString(R.string.nearby_channel_description));
        nm.createNotificationChannel(c);
    }
}
