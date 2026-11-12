package com.farbaek.mesh;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

/**
 * A TCP proxy on 127.0.0.1 that drops a connection for real: on the first
 * connection it forwards `cutAfter` bytes from the caller, then closes both
 * sides; later connections pass through. It counts the bytes each connection
 * carried from the caller, so a test can show a resume didn't start over.
 */
final class CuttingProxy implements Closeable {
    private final ServerSocket server;
    private final int targetPort;
    private volatile long cutAfter;
    final List<AtomicLong> carried = new CopyOnWriteArrayList<>();

    CuttingProxy(int targetPort, long cutAfter) throws IOException {
        this.targetPort = targetPort;
        this.cutAfter = cutAfter;
        this.server = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                acceptLoop();
            }
        }, "cutting-proxy");
        t.setDaemon(true);
        t.start();
    }

    int port() {
        return server.getLocalPort();
    }

    private void acceptLoop() {
        while (!server.isClosed()) {
            final Socket client;
            final Socket target;
            try {
                client = server.accept();
                target = new Socket("127.0.0.1", targetPort);
            } catch (IOException e) {
                return;
            }
            final long cut = cutAfter;
            cutAfter = -1;
            final AtomicLong count = new AtomicLong();
            carried.add(count);
            pump(client, target, cut, count, "proxy-up");
            pump(target, client, -1, new AtomicLong(), "proxy-down");
        }
    }

    private static void pump(final Socket from, final Socket to, final long cut, final AtomicLong count, String name) {
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                byte[] buffer = new byte[16 * 1024];
                try {
                    InputStream in = from.getInputStream();
                    OutputStream out = to.getOutputStream();
                    int n;
                    while ((n = in.read(buffer)) > 0) {
                        int send = n;
                        if (cut >= 0 && count.get() + n >= cut) send = (int) (cut - count.get());
                        if (send > 0) out.write(buffer, 0, send);
                        out.flush();
                        count.addAndGet(send);
                        if (send < n || (cut >= 0 && count.get() >= cut)) {
                            from.close();
                            to.close();
                            return;
                        }
                    }
                    to.shutdownOutput();
                } catch (IOException e) {
                    try {
                        from.close();
                        to.close();
                    } catch (IOException ignored) {
                        // Both gone.
                    }
                }
            }
        }, name);
        t.setDaemon(true);
        t.start();
    }

    @Override
    public void close() throws IOException {
        server.close();
    }
}
