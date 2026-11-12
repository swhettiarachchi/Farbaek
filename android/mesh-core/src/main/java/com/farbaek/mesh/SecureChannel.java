package com.farbaek.mesh;

import java.io.IOException;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * An encrypted, mutually authenticated channel between two devices, as
 * src/agent-runtime/mesh/channel.ts builds it: a Noise XX handshake over a
 * framed TCP socket, then typed messages. Each message is a two-byte header
 * length, the JSON header and an optional binary body, encrypted as one
 * Noise transport message. Anything malformed ends the channel.
 *
 * The hellos travel as the handshake payloads Node uses: the responder's in
 * message 2, the initiator's (with its purpose) in message 3.
 */
public final class SecureChannel {
    /** Plaintext room in one message: Noise's limit less the AES-GCM tag. */
    public static final int MAX_PLAINTEXT = Noise.MAX_MESSAGE - Noise.TAGLEN;

    public static final class ChannelException extends IOException {
        public ChannelException(String message) {
            super(message);
        }
    }

    /** The other device: its verified static key and what it said about itself. */
    public static final class Peer {
        public final byte[] publicKey;
        public final MeshProtocol.Hello hello;

        Peer(byte[] publicKey, MeshProtocol.Hello hello) {
            this.publicKey = publicKey;
            this.hello = hello;
        }
    }

    /** One message received: its header and its body (empty when there's none). */
    public static final class Received {
        public final MeshMessage message;
        public final byte[] body;

        Received(MeshMessage message, byte[] body) {
            this.message = message;
            this.body = body;
        }
    }

    private final FramedSocket framed;
    private final Transport transport;
    public final Peer peer;
    private final byte[] handshakeHash;
    private final Object sending = new Object();

    SecureChannel(FramedSocket framed, Transport transport, Peer peer, byte[] handshakeHash) {
        this.framed = framed;
        this.transport = transport;
        this.peer = peer;
        this.handshakeHash = handshakeHash;
    }

    public byte[] handshakeHash() {
        return handshakeHash.clone();
    }

    public boolean isClosed() {
        return framed.isClosed();
    }

    /** The other device's address. */
    public String remoteAddress() {
        return framed.socket().getInetAddress() == null ? null : framed.socket().getInetAddress().getHostAddress();
    }

    /** Called once the connection has closed, from either side. */
    public void onClose(Runnable listener) {
        framed.onClose(listener);
    }

    public void send(MeshMessage message) throws IOException {
        send(message, null, 0, 0);
    }

    /**
     * Sends a message. Encrypting and writing happen under one lock, so
     * messages leave in the order they were encrypted, which is the order the
     * other side decrypts.
     */
    public void send(MeshMessage message, byte[] body, int offset, int length) throws IOException {
        byte[] header = message.toString().getBytes(StandardCharsets.UTF_8);
        int bodyLength = body == null ? 0 : length;
        if (header.length > 0xffff || 2 + header.length + bodyLength > MAX_PLAINTEXT) throw new ChannelException("A message was too large to send.");
        byte[] plaintext = new byte[2 + header.length + bodyLength];
        plaintext[0] = (byte) (header.length >>> 8);
        plaintext[1] = (byte) header.length;
        System.arraycopy(header, 0, plaintext, 2, header.length);
        if (bodyLength > 0) System.arraycopy(body, offset, plaintext, 2 + header.length, bodyLength);
        synchronized (sending) {
            framed.write(transport.send.encrypt(plaintext));
        }
    }

    public Received receive(long timeoutMs) throws IOException {
        byte[] frame = framed.read(timeoutMs);
        byte[] plaintext;
        try {
            plaintext = transport.receive.decrypt(frame);
        } catch (NoiseException e) {
            close();
            throw e;
        }
        if (plaintext.length < 2) throw malformed();
        int headerLength = ((plaintext[0] & 0xff) << 8) | (plaintext[1] & 0xff);
        if (plaintext.length < 2 + headerLength) throw malformed();
        Object json;
        try {
            json = Json.parse(new String(plaintext, 2, headerLength, StandardCharsets.UTF_8));
        } catch (Json.JsonException e) {
            throw malformed();
        }
        MeshMessage message = MeshMessage.parse(json);
        if (message == null) throw malformed();
        return new Received(message, Arrays.copyOfRange(plaintext, 2 + headerLength, plaintext.length));
    }

    /** Sends JSON too large for one message: the header announces its size, `data` messages carry it. */
    public void sendBlob(MeshMessage message, byte[] json) throws IOException {
        if (json.length != message.size) throw new ChannelException("The announced size doesn't match the body.");
        send(message);
        int piece = MAX_PLAINTEXT - 64;
        for (int at = 0; at < json.length; at += piece) send(MeshMessage.data(), json, at, Math.min(piece, json.length - at));
    }

    /** Reads the body a sendBlob header announced. */
    public byte[] receiveBlob(long size, long timeoutMs) throws IOException {
        if (size < 0 || size > Integer.MAX_VALUE) throw malformed();
        byte[] out = new byte[(int) size];
        int received = 0;
        while (received < size) {
            Received r = receive(timeoutMs);
            if (!"data".equals(r.message.t) || received + r.body.length > size) throw malformed();
            System.arraycopy(r.body, 0, out, received, r.body.length);
            received += r.body.length;
        }
        return out;
    }

    public void close() {
        framed.close();
    }

    private ChannelException malformed() {
        close();
        return new ChannelException("The other computer sent something this version doesn't understand.");
    }

    private static MeshProtocol.Hello readHello(byte[] payload) throws ChannelException {
        MeshProtocol.Hello hello;
        try {
            hello = MeshProtocol.Hello.parse(Json.parse(new String(payload, StandardCharsets.UTF_8)));
        } catch (Json.JsonException e) {
            hello = null;
        }
        if (hello == null) throw new ChannelException("The other computer didn't introduce itself properly.");
        return hello;
    }

    /** Calls another device and runs the handshake as the initiator. */
    public static SecureChannel initiate(Socket socket, KeyPair staticKey, MeshProtocol.Hello hello, long timeoutMs) throws IOException {
        FramedSocket framed = new FramedSocket(socket);
        try {
            XXHandshake hs = new XXHandshake(true, MeshProtocol.prologue(), staticKey);
            framed.write(hs.writeMessage());
            MeshProtocol.Hello theirs = readHello(hs.readMessage(framed.read(timeoutMs)));
            framed.write(hs.writeMessage(hello.encode()));
            return new SecureChannel(framed, hs.result(), new Peer(hs.remoteStatic(), theirs), hs.handshakeHash());
        } catch (IOException | RuntimeException e) {
            framed.close();
            throw e;
        }
    }

    /** Answers a call: the handshake as the responder. The caller's purpose arrives in its last message. */
    public static SecureChannel respond(Socket socket, KeyPair staticKey, MeshProtocol.Hello hello) throws IOException {
        FramedSocket framed = new FramedSocket(socket);
        try {
            XXHandshake hs = new XXHandshake(false, MeshProtocol.prologue(), staticKey);
            hs.readMessage(framed.read(MeshProtocol.HANDSHAKE_TIMEOUT_MS));
            framed.write(hs.writeMessage(hello.encode()));
            MeshProtocol.Hello theirs = readHello(hs.readMessage(framed.read(MeshProtocol.HANDSHAKE_TIMEOUT_MS)));
            return new SecureChannel(framed, hs.result(), new Peer(hs.remoteStatic(), theirs), hs.handshakeHash());
        } catch (IOException | RuntimeException e) {
            framed.close();
            throw e;
        }
    }
}
