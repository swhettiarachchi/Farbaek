package com.farbaek.mesh;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Every message after the handshake (MessageSchema in protocol.ts). `offer`
 * and `accept` announce a JSON body that follows in `data` messages. Written
 * with the same key order JSON.stringify gives the TypeScript objects, and
 * read with the same checks; unknown keys are ignored, as zod strips them.
 */
public final class MeshMessage {
    public final String t;
    public final boolean ok;
    public final String session;
    public final String digest;
    public final long size;
    public final int f;
    public final int from;
    public final long files;
    public final long bytes;
    public final String code;
    public final String message;
    /** pair-commit: hex of SHA-256("farbaek-pair-commit/2" || the caller's nonce). */
    public final String commit;
    /** pair-nonce and pair-reveal: 32 random bytes in hex. */
    public final String nonce;

    private MeshMessage(String t, boolean ok, String session, String digest, long size, int f, int from, long files, long bytes, String code, String message) {
        this(t, ok, session, digest, size, f, from, files, bytes, code, message, null, null);
    }

    private MeshMessage(String t, boolean ok, String session, String digest, long size, int f, int from, long files, long bytes, String code, String message, String commit, String nonce) {
        this.t = t;
        this.ok = ok;
        this.session = session;
        this.digest = digest;
        this.size = size;
        this.f = f;
        this.from = from;
        this.files = files;
        this.bytes = bytes;
        this.code = code;
        this.message = message;
        this.commit = commit;
        this.nonce = nonce;
    }

    private static MeshMessage of(String t) {
        return new MeshMessage(t, false, null, null, 0, 0, 0, 0, 0, null, null);
    }

    public static MeshMessage pairConfirm(boolean ok) {
        return new MeshMessage("pair-confirm", ok, null, null, 0, 0, 0, 0, 0, null, null);
    }

    /** Pairing v2, the caller's first message: its commitment to a nonce it doesn't show yet. */
    public static MeshMessage pairCommit(String commit) {
        return new MeshMessage("pair-commit", false, null, null, 0, 0, 0, 0, 0, null, null, commit, null);
    }

    /** Pairing v2, the answerer's nonce, sent only once a commitment has arrived. */
    public static MeshMessage pairNonce(String nonce) {
        return new MeshMessage("pair-nonce", false, null, null, 0, 0, 0, 0, 0, null, null, null, nonce);
    }

    /** Pairing v2, the caller's nonce, shown only once the answerer's has arrived. */
    public static MeshMessage pairReveal(String nonce) {
        return new MeshMessage("pair-reveal", false, null, null, 0, 0, 0, 0, 0, null, null, null, nonce);
    }

    public static MeshMessage offer(String session, String digest, long size) {
        return new MeshMessage("offer", false, session, digest, size, 0, 0, 0, 0, null, null);
    }

    public static MeshMessage accept(long size) {
        return new MeshMessage("accept", false, null, null, size, 0, 0, 0, 0, null, null);
    }

    public static MeshMessage decline() {
        return of("decline");
    }

    public static MeshMessage file(int f, int from) {
        return new MeshMessage("file", false, null, null, 0, f, from, 0, 0, null, null);
    }

    public static MeshMessage data() {
        return of("data");
    }

    public static MeshMessage verified(long files, long bytes) {
        return new MeshMessage("verified", false, null, null, 0, 0, 0, files, bytes, null, null);
    }

    public static MeshMessage cancel() {
        return of("cancel");
    }

    public static MeshMessage error(String code, String message) {
        if (!MeshProtocol.ERROR_CODES.contains(code)) throw new IllegalArgumentException("Unknown error code " + code);
        String m = message.length() > 300 ? message.substring(0, 300) : message;
        return new MeshMessage("error", false, null, null, 0, 0, 0, 0, 0, code, m);
    }

    /** The object JSON.stringify would write for the TypeScript message. */
    public Map<String, Object> toJson() {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("t", t);
        switch (t) {
            case "pair-confirm":
                o.put("ok", ok);
                break;
            case "pair-commit":
                o.put("commit", commit);
                break;
            case "pair-nonce":
            case "pair-reveal":
                o.put("nonce", nonce);
                break;
            case "offer":
                o.put("session", session);
                o.put("digest", digest);
                o.put("size", size);
                break;
            case "accept":
                o.put("size", size);
                break;
            case "file":
                o.put("f", (long) f);
                o.put("from", (long) from);
                break;
            case "verified":
                o.put("files", files);
                o.put("bytes", bytes);
                break;
            case "error":
                o.put("code", code);
                o.put("message", message);
                break;
            default:
                break;
        }
        return o;
    }

    /** MessageSchema, or null for anything it would refuse. */
    public static MeshMessage parse(Object json) {
        Map<String, Object> o = Json.asObject(json);
        if (o == null) return null;
        Object t = o.get("t");
        if (!(t instanceof String)) return null;
        switch ((String) t) {
            case "pair-confirm": {
                Object ok = o.get("ok");
                return ok instanceof Boolean ? pairConfirm((Boolean) ok) : null;
            }
            // Exactly 64 lowercase hex characters, or it isn't the message.
            case "pair-commit": {
                String commit = Json.asString(o.get("commit"));
                return commit != null && MeshProtocol.HEX64.matcher(commit).matches() ? pairCommit(commit) : null;
            }
            case "pair-nonce":
            case "pair-reveal": {
                String nonce = Json.asString(o.get("nonce"));
                if (nonce == null || !MeshProtocol.HEX64.matcher(nonce).matches()) return null;
                return "pair-nonce".equals(t) ? pairNonce(nonce) : pairReveal(nonce);
            }
            case "offer": {
                String session = Json.asString(o.get("session"));
                String digest = Json.asString(o.get("digest"));
                Long size = Json.asInt(o.get("size"), 2, MeshProtocol.MAX_MANIFEST_BYTES);
                if (session == null || !MeshProtocol.UUID.matcher(session).matches() || digest == null || !MeshProtocol.HEX64.matcher(digest).matches() || size == null) return null;
                return offer(session, digest, size);
            }
            case "accept": {
                Long size = Json.asInt(o.get("size"), 2, 1024 * 1024);
                return size == null ? null : accept(size);
            }
            case "decline":
                return decline();
            case "file": {
                Long f = Json.asInt(o.get("f"), 0, MeshProtocol.TRANSFER_LIMITS.maxFiles - 1);
                Long from = Json.asInt(o.get("from"), 0, 1024);
                return f == null || from == null ? null : file(f.intValue(), from.intValue());
            }
            case "data":
                return data();
            case "verified": {
                Long files = Json.asInt(o.get("files"), 0, Json.MAX_SAFE_INTEGER);
                Long bytes = Json.asInt(o.get("bytes"), 0, Json.MAX_SAFE_INTEGER);
                return files == null || bytes == null ? null : verified(files, bytes);
            }
            case "cancel":
                return cancel();
            case "error": {
                String code = Json.asString(o.get("code"));
                String message = Json.asString(o.get("message"));
                if (code == null || !MeshProtocol.ERROR_CODES.contains(code) || message == null || message.length() > 300) return null;
                return error(code, message);
            }
            default:
                return null;
        }
    }

    @Override
    public String toString() {
        return Json.stringify(toJson());
    }
}
