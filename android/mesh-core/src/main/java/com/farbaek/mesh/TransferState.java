package com.farbaek.mesh;

import java.util.Locale;

/** Where a transfer is, with the same names as TransferState in protocol.ts. */
public enum TransferState {
    PACKING, CONNECTING, WAITING, OFFERED, SENDING, RECEIVING, FINISHING, DONE, DECLINED, CANCELLED, INTERRUPTED, FAILED;

    /** The name the desktop agent uses, such as "interrupted". */
    public String wireName() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** States a transfer doesn't leave. */
    public boolean isFinal() {
        return this == DONE || this == DECLINED || this == CANCELLED || this == FAILED;
    }
}
