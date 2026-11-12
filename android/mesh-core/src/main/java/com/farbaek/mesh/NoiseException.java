package com.farbaek.mesh;

import java.io.IOException;

/** A Noise handshake or transport message that can't be trusted, or a session that has run out of nonces. */
public class NoiseException extends IOException {
    public NoiseException(String message) {
        super(message);
    }
}
