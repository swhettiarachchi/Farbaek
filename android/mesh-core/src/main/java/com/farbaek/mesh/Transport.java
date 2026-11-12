package com.farbaek.mesh;

/** Both directions of a finished handshake: one key and counter each. */
public final class Transport {
    public final CipherState send;
    public final CipherState receive;

    Transport(CipherState send, CipherState receive) {
        this.send = send;
        this.receive = receive;
    }
}
