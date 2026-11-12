package com.farbaek.mesh;

import java.io.BufferedInputStream;
import java.io.DataInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.OutputStream;
import java.net.Socket;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;

/**
 * Noise messages over TCP, as src/agent-runtime/mesh/framing.ts frames them:
 * each one prefixed with its length as two bytes, big-endian, so no message
 * exceeds 65,535 bytes. A reader thread reassembles messages however TCP
 * splits or joins them, the way Node's data events do, and stops reading
 * while 64 unread messages wait, so a fast sender can't make the receiver
 * hold a large file in memory. Writes block while the socket's buffer is full.
 */
public final class FramedSocket {
    /** Unread messages held before reading pauses. */
    private static final int HIGH_WATER = 64;

    private static final ScheduledExecutorService CLOSER = Executors.newSingleThreadScheduledExecutor(new ThreadFactory() {
        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r, "mesh-socket-closer");
            t.setDaemon(true);
            return t;
        }
    });

    public static final class FrameException extends IOException {
        public FrameException(String message) {
            super(message);
        }
    }

    private final Socket socket;
    private final OutputStream out;
    private final Object lock = new Object();
    private final Object writeLock = new Object();
    private final ArrayDeque<byte[]> frames = new ArrayDeque<>();
    private final List<Runnable> closeListeners = new ArrayList<>();
    private FrameException failure;
    /** Set when this side closes: it stops reading at once, even while the other side's messages are still arriving. */
    private boolean closedHere;
    private boolean socketGone;

    public FramedSocket(Socket socket) throws IOException {
        this.socket = socket;
        socket.setTcpNoDelay(true);
        this.out = socket.getOutputStream();
        final DataInputStream in = new DataInputStream(new BufferedInputStream(socket.getInputStream(), 64 * 1024));
        Thread pump = new Thread(new Runnable() {
            @Override
            public void run() {
                pump(in);
            }
        }, "mesh-frames");
        pump.setDaemon(true);
        pump.start();
    }

    public Socket socket() {
        return socket;
    }

    public boolean isClosed() {
        synchronized (lock) {
            return closedHere || failure != null;
        }
    }

    private void pump(DataInputStream in) {
        FrameException ended;
        try {
            while (true) {
                int length = in.readUnsignedShort();
                byte[] frame = new byte[length];
                in.readFully(frame);
                synchronized (lock) {
                    while (frames.size() >= HIGH_WATER && !closedHere) lock.wait();
                    // Once closed here, what still arrives is read and dropped, so closing doesn't reset the connection.
                    if (closedHere) continue;
                    frames.add(frame);
                    lock.notifyAll();
                }
            }
        } catch (EOFException e) {
            ended = new FrameException("The connection closed.");
        } catch (IOException e) {
            ended = new FrameException(isClosed() ? "The connection closed." : "The connection failed: " + e.getMessage());
        } catch (InterruptedException e) {
            ended = new FrameException("The connection closed.");
        }
        fail(ended);
        // As Node does by default (allowHalfOpen false): once the other side has finished, so does this one.
        scheduleClose(1_000);
        List<Runnable> listeners;
        synchronized (lock) {
            socketGone = true;
            listeners = new ArrayList<>(closeListeners);
            closeListeners.clear();
        }
        for (Runnable listener : listeners) {
            try {
                listener.run();
            } catch (RuntimeException ignored) {
                // A listener's own failure doesn't concern the connection.
            }
        }
    }

    private void fail(FrameException error) {
        synchronized (lock) {
            if (failure == null) failure = error;
            lock.notifyAll();
        }
    }

    /** Called once the connection has gone, from either side. */
    public void onClose(Runnable listener) {
        synchronized (lock) {
            if (!socketGone) {
                closeListeners.add(listener);
                return;
            }
        }
        listener.run();
    }

    /** The next message, waiting at most `timeoutMs` when it's above zero. */
    public byte[] read(long timeoutMs) throws FrameException {
        synchronized (lock) {
            long deadline = timeoutMs > 0 ? System.currentTimeMillis() + timeoutMs : 0;
            while (true) {
                if (closedHere) throw new FrameException("The connection closed.");
                // After the other side closes, what it sent first can still be read.
                byte[] next = frames.poll();
                if (next != null) {
                    lock.notifyAll();
                    return next;
                }
                if (failure != null) throw failure;
                try {
                    if (deadline == 0) {
                        lock.wait();
                    } else {
                        long remaining = deadline - System.currentTimeMillis();
                        if (remaining <= 0) throw new FrameException("The other computer stopped answering.");
                        lock.wait(remaining);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new FrameException("The connection closed.");
                }
            }
        }
    }

    /** Sends one message, blocking while the socket's buffer is full. */
    public void write(byte[] frame) throws FrameException {
        if (frame.length > Noise.MAX_MESSAGE) throw new FrameException("A message was larger than 65,535 bytes.");
        synchronized (writeLock) {
            synchronized (lock) {
                if (closedHere) throw new FrameException("The connection closed.");
                if (failure != null) throw failure;
            }
            byte[] message = new byte[2 + frame.length];
            message[0] = (byte) (frame.length >>> 8);
            message[1] = (byte) frame.length;
            System.arraycopy(frame, 0, message, 2, frame.length);
            try {
                out.write(message);
                out.flush();
            } catch (IOException e) {
                FrameException error = new FrameException("The connection failed: " + e.getMessage());
                fail(error);
                throw error;
            }
        }
    }

    /** Closes after flushing what was already written (a last error or verdict), then makes sure the socket is gone. */
    public void close() {
        synchronized (lock) {
            if (!closedHere) {
                closedHere = true;
                frames.clear();
                lock.notifyAll();
            }
        }
        if (socket.isClosed()) return;
        try {
            if (!socket.isOutputShutdown()) socket.shutdownOutput();
        } catch (IOException ignored) {
            // Already gone.
        }
        scheduleClose(1_000);
    }

    private void scheduleClose(long delayMs) {
        CLOSER.schedule(new Runnable() {
            @Override
            public void run() {
                try {
                    socket.close();
                } catch (IOException ignored) {
                    // Already closed.
                }
            }
        }, delayMs, TimeUnit.MILLISECONDS);
    }

    /** Ends the connection at once, without waiting for anything to flush. */
    void destroy() {
        synchronized (lock) {
            closedHere = true;
            frames.clear();
            lock.notifyAll();
        }
        try {
            socket.close();
        } catch (IOException ignored) {
            // Already closed.
        }
    }
}
