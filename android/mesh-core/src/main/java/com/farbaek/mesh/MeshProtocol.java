package com.farbaek.mesh;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Farbaek Mesh nearby transfer, farbaek-mesh/1: the constants and limits of
 * src/core/mesh/protocol.ts, and the checks its zod schemas make, so the
 * phone accepts exactly what the desktop agent accepts.
 */
public final class MeshProtocol {
    private MeshProtocol() {}

    public static final String MESH_PROTOCOL = "farbaek-mesh/1";

    /** The Noise prologue: binds every handshake to this protocol and version. */
    public static byte[] prologue() {
        return MESH_PROTOCOL.getBytes(StandardCharsets.UTF_8);
    }

    /** Where devices announce themselves on the local network (an administratively scoped multicast group). */
    public static final String DISCOVERY_GROUP = "239.255.70.66";
    public static final int DISCOVERY_PORT = 53_366;

    /** How long a device stays visible after the person asks, and how long a pairing code is good for. */
    public static final long VISIBLE_FOR_MS = 5 * 60_000L;
    public static final long PAIRING_WINDOW_MS = 2 * 60_000L;
    public static final long HANDSHAKE_TIMEOUT_MS = 10_000L;
    /** How long a sender waits for the person on the other device to accept. */
    public static final long OFFER_TIMEOUT_MS = 5 * 60_000L;

    /** Between two devices: binary files are fine. */
    public static final CapsuleLimits TRANSFER_LIMITS = new CapsuleLimits(10_000, 2L * 1024 * 1024 * 1024, 4L * 1024 * 1024 * 1024);
    /** A manifest larger than this isn't accepted. */
    public static final int MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
    /** File bytes per encrypted message, comfortably inside Noise's 65,535-byte limit with the header and tag. */
    public static final int DATA_PIECE_BYTES = 60 * 1024;

    public static final List<String> ERROR_CODES = Collections.unmodifiableList(Arrays.asList(
            "not_paired", "busy", "bad_offer", "no_space", "chunk_mismatch", "file_mismatch", "source_changed", "protocol", "internal"));

    static final Pattern HEX64 = Pattern.compile("[0-9a-f]{64}");
    static final Pattern HEX16 = Pattern.compile("[0-9a-f]{16}");
    /** zod 4's z.uuid(): RFC 9562 variants, versions 1 to 8, plus the nil and max UUIDs. */
    static final Pattern UUID = Pattern.compile(
            "([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)");

    /** A display name as the Name schema reads it: trimmed, 1 to 60 UTF-16 units. Null when it isn't one. */
    static String name(Object value) {
        String s = Json.asString(value);
        if (s == null) return null;
        String trimmed = Json.jsTrim(s);
        return trimmed.length() >= 1 && trimmed.length() <= 60 ? trimmed : null;
    }

    /**
     * The pairing version this device speaks, sent in every hello (pairing v2:
     * commit, then reveal, then the code). A peer whose hello doesn't carry at
     * least this isn't paired with at all.
     */
    public static final int PAIRING_VERSION = 2;

    /** Carried inside the handshake, encrypted: who the device says it is and why it called. */
    public static final class Hello {
        public final String name;
        /** "pair", "transfer", or null. */
        public final String purpose;
        /** The pairing version the device speaks; 0 when its hello doesn't say (pairing v1, which isn't trusted). */
        public final int pairing;

        /** This device's own hello: always says it speaks pairing v2. */
        public Hello(String name, String purpose) {
            this(name, purpose, PAIRING_VERSION);
        }

        Hello(String name, String purpose, int pairing) {
            this.name = name;
            this.purpose = purpose;
            this.pairing = pairing;
        }

        /** JSON.stringify of { v: 1, name, purpose?, pairing }. A pairing of 0 (tests standing in for an older device) leaves it out. */
        public byte[] encode() {
            Map<String, Object> json = new LinkedHashMap<>();
            json.put("v", 1L);
            json.put("name", name);
            if (purpose != null) json.put("purpose", purpose);
            if (pairing > 0) json.put("pairing", (long) pairing);
            return Json.stringify(json).getBytes(StandardCharsets.UTF_8);
        }

        /** Whether the device can pair safely: its hello carries pairing 2 or later. */
        public boolean pairsSafely() {
            return pairing >= PAIRING_VERSION;
        }

        /** HelloSchema, or null. `pairing`, when present, is a whole number of 0 or more (z.number().int().min(0)); missing is 0. */
        public static Hello parse(Object json) {
            Map<String, Object> o = Json.asObject(json);
            if (o == null || !Long.valueOf(1).equals(o.get("v"))) return null;
            String name = name(o.get("name"));
            if (name == null) return null;
            Object purpose = o.get("purpose");
            if (o.containsKey("purpose") && !"pair".equals(purpose) && !"transfer".equals(purpose)) return null;
            int pairing = 0;
            if (o.containsKey("pairing")) {
                Long p = Json.asInt(o.get("pairing"), 0, Json.MAX_SAFE_INTEGER);
                if (p == null) return null;
                pairing = (int) Math.min(p, Integer.MAX_VALUE);
            }
            return new Hello(name, (String) purpose, pairing);
        }
    }

    /** What an announcement on the local network may say. Nothing in it is secret. */
    public static final class Announcement {
        /** "here" or "who". */
        public final String kind;
        public final String name;
        /** The first 16 hex digits of SHA-256 of the device's public key. */
        public final String fingerprint;
        /** The TCP port it accepts connections on; 0 when it's only looking. */
        public final int port;

        public Announcement(String kind, String name, String fingerprint, int port) {
            this.kind = kind;
            this.name = name;
            this.fingerprint = fingerprint;
            this.port = port;
        }

        /** JSON.stringify of { p, kind, name, fingerprint, port }. */
        public byte[] encode() {
            Map<String, Object> json = new LinkedHashMap<>();
            json.put("p", MESH_PROTOCOL);
            json.put("kind", kind);
            json.put("name", name);
            json.put("fingerprint", fingerprint);
            json.put("port", (long) port);
            return Json.stringify(json).getBytes(StandardCharsets.UTF_8);
        }

        /** AnnouncementSchema, or null. */
        public static Announcement parse(Object json) {
            Map<String, Object> o = Json.asObject(json);
            if (o == null || !MESH_PROTOCOL.equals(o.get("p"))) return null;
            Object kind = o.get("kind");
            if (!"here".equals(kind) && !"who".equals(kind)) return null;
            String name = name(o.get("name"));
            String fp = Json.asString(o.get("fingerprint"));
            Long port = Json.asInt(o.get("port"), 0, 65_535);
            if (name == null || fp == null || !HEX16.matcher(fp).matches() || port == null) return null;
            return new Announcement((String) kind, name, fp, port.intValue());
        }
    }

    /** The receiver's answer to an offer: for each file, how many chunks it already holds, checked. */
    public static final class ResumePoints {
        private ResumePoints() {}

        /** JSON.stringify of { resume: [[file, chunks], ...] }. */
        public static byte[] encode(List<long[]> points) {
            List<Object> list = new ArrayList<>();
            for (long[] p : points) list.add(Arrays.asList((Object) p[0], (Object) p[1]));
            Map<String, Object> json = new LinkedHashMap<>();
            json.put("resume", list);
            return Json.stringify(json).getBytes(StandardCharsets.UTF_8);
        }

        /** ResumeSchema as a map from file index to verified chunks (a later entry wins, as new Map() does), or null. */
        public static Map<Integer, Integer> parse(Object json) {
            Map<String, Object> o = Json.asObject(json);
            List<Object> list = o == null ? null : Json.asArray(o.get("resume"));
            if (list == null || list.size() > TRANSFER_LIMITS.maxFiles) return null;
            Map<Integer, Integer> out = new LinkedHashMap<>();
            for (Object item : list) {
                List<Object> pair = Json.asArray(item);
                if (pair == null || pair.size() != 2) return null;
                Long f = Json.asInt(pair.get(0), 0, TRANSFER_LIMITS.maxFiles - 1);
                Long chunks = Json.asInt(pair.get(1), 1, 1024);
                if (f == null || chunks == null) return null;
                out.put(f.intValue(), chunks.intValue());
            }
            return out;
        }
    }

    static final Set<String> FINAL_STATES = new HashSet<>(Arrays.asList("done", "declined", "cancelled", "failed"));
}
