package com.farbaek.mesh;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.bouncycastle.util.encoders.Hex;

/**
 * Which devices this one trusts, by public key, with the name they gave when
 * the person paired them, in a plain JSON file in the same shape as the
 * desktop agent's mesh-devices.json (src/agent-runtime/mesh/identity.ts).
 * Nothing in it is secret.
 */
public final class TrustStore {
    private static final Pattern HEX64 = Pattern.compile("[0-9a-f]{64}");

    public static final class TrustedDevice {
        public final String fingerprint;
        public final String name;
        public final String publicKey;
        public final String pairedAt;
        /** "nearby", "farbaek", or null for older entries (nearby). */
        public final String via;

        public TrustedDevice(String fingerprint, String name, String publicKey, String pairedAt, String via) {
            this.fingerprint = fingerprint;
            this.name = name;
            this.publicKey = publicKey;
            this.pairedAt = pairedAt;
            this.via = via;
        }

        public byte[] publicKeyBytes() {
            return Hex.decode(publicKey);
        }

        Map<String, Object> toJson() {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("fingerprint", fingerprint);
            o.put("name", name);
            o.put("publicKey", publicKey);
            o.put("pairedAt", pairedAt);
            if (via != null) o.put("via", via);
            return o;
        }

        static TrustedDevice parse(Object json) {
            Map<String, Object> o = Json.asObject(json);
            if (o == null) return null;
            String fp = Json.asString(o.get("fingerprint"));
            String name = Json.asString(o.get("name"));
            String key = Json.asString(o.get("publicKey"));
            String pairedAt = Json.asString(o.get("pairedAt"));
            Object via = o.get("via");
            if (fp == null || !MeshProtocol.HEX16.matcher(fp).matches() || name == null || name.isEmpty() || name.length() > 60) return null;
            if (key == null || !HEX64.matcher(key).matches() || pairedAt == null) return null;
            if (o.containsKey("via") && !"nearby".equals(via) && !"farbaek".equals(via)) return null;
            return new TrustedDevice(fp, name, key, pairedAt, (String) via);
        }
    }

    private final File file;
    private List<TrustedDevice> devices = new ArrayList<>();

    public TrustStore(File file) {
        this.file = file;
    }

    /**
     * Reads the file. An entry not in the shape is skipped on its own, so one
     * bad entry doesn't forget every device; a file that isn't a JSON list at
     * all counts as no devices.
     */
    public synchronized void load() {
        List<TrustedDevice> loaded = new ArrayList<>();
        try {
            byte[] bytes = AtomicFile.read(file);
            List<Object> list = bytes == null ? null : Json.asArray(Json.parse(new String(bytes, StandardCharsets.UTF_8)));
            if (list != null) {
                for (Object item : list) {
                    TrustedDevice d = TrustedDevice.parse(item);
                    if (d != null) loaded.add(d);
                }
            }
        } catch (IOException | IllegalArgumentException e) {
            loaded.clear();
        }
        devices = loaded;
    }

    public synchronized List<TrustedDevice> list() {
        return Collections.unmodifiableList(new ArrayList<>(devices));
    }

    /** The trusted device with this public key, if any. */
    public synchronized TrustedDevice find(byte[] publicKey) {
        for (TrustedDevice d : devices) {
            if (Noise.sameKey(d.publicKeyBytes(), publicKey)) return d;
        }
        return null;
    }

    public synchronized TrustedDevice byFingerprint(String value) {
        for (TrustedDevice d : devices) {
            if (d.fingerprint.equals(value)) return d;
        }
        return null;
    }

    public synchronized TrustedDevice add(byte[] publicKey, String name, String via) throws IOException {
        TrustedDevice device = new TrustedDevice(Noise.fingerprint(publicKey), Packer.head(name, 60), Hex.toHexString(publicKey), Packer.isoNow(), via);
        List<TrustedDevice> next = new ArrayList<>();
        for (TrustedDevice d : devices) {
            if (!d.fingerprint.equals(device.fingerprint)) next.add(d);
        }
        next.add(device);
        devices = next;
        save();
        return device;
    }

    /** Forgets a device: it can no longer send to or receive from this one until paired again. */
    public synchronized boolean forget(String value) throws IOException {
        List<TrustedDevice> next = new ArrayList<>();
        for (TrustedDevice d : devices) {
            if (!d.fingerprint.equals(value)) next.add(d);
        }
        if (next.size() == devices.size()) return false;
        devices = next;
        save();
        return true;
    }

    /** Written to a temporary file and renamed over the old one, so a crash leaves the old list or the new, never none. */
    private void save() throws IOException {
        List<Object> list = new ArrayList<>();
        for (TrustedDevice d : devices) list.add(d.toJson());
        AtomicFile.write(file, Json.stringify(list).getBytes(StandardCharsets.UTF_8));
    }
}
