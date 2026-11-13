package com.farbaek.mesh;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What arrived on this phone, and how far each copy into shared storage has got (stage 188, ADR 0196). Each file's
 * place in Gallery or Downloads is written here before any byte is copied, and marked published only after the copy
 * was read back and matched, so a copy cut short when Android stops the app is carried on, never doubled. The file is
 * replaced whole (written beside it, then renamed), and a damaged one reads as empty.
 */
public final class ReceivedLog {
    /** Arrivals kept in the list; ones still saving are never dropped. */
    public static final int MAX = 50;

    /** Saving into shared storage; saved there; kept inside Nearby (the switch was off, an older Android, or saving failed). */
    public enum State {
        SAVING, SAVED, KEPT
    }

    public static final class FileRecord {
        /** The path inside the transfer's folder, as the sender gave it. */
        public final String path;
        public final long bytes;
        public final String mime;
        // Written by the thread that saves, read by the screen: volatile, so the screen sees each change whole.
        /** The MediaStore item, once one was made for it; null before. */
        public volatile String uri;
        /** Copied, read back, matched and visible in Gallery or Files. */
        public volatile boolean published;
        /** The name shared storage gave it, which may differ from the sender's (Android renames a clash). */
        public volatile String shown;

        public FileRecord(String path, long bytes, String mime) {
            this.path = path;
            this.bytes = bytes;
            this.mime = mime;
        }
    }

    public static final class Entry {
        /** The transfer's id. */
        public final String id;
        public final String name;
        public final String from;
        public final long at;
        /** GALLERY or DOWNLOADS, or null when the files stay inside Nearby. */
        public final SavePlan.Place place;
        /** The folder's name in shared storage, made unique; or the private folder's full path when kept in Nearby. */
        public final String folder;
        public final List<FileRecord> files;
        public volatile State state;
        /** Why it was kept inside Nearby, when saving didn't happen or failed; null otherwise. */
        public volatile String note;
        /** The private folder the files arrived in, while any are still there; null once they've all been saved. */
        public volatile String source;
        public volatile boolean notified;

        public Entry(String id, String name, String from, long at, SavePlan.Place place, String folder, List<FileRecord> files, State state) {
            this.id = id;
            this.name = name;
            this.from = from;
            this.at = at;
            this.place = place;
            this.folder = folder;
            this.files = files;
            this.state = state;
        }

        public long bytes() {
            long n = 0;
            for (FileRecord f : files) n += f.bytes;
            return n;
        }

        public List<String> paths() {
            List<String> out = new ArrayList<>();
            for (FileRecord f : files) out.add(f.path);
            return out;
        }

        /** "Gallery › Farbaek › Site photos", or "Nearby" when the files stayed in the app. */
        public String placeLabel() {
            return place == null ? "Nearby" : SavePlan.placeLabel(place, folder);
        }
    }

    private final File file;
    private final List<Entry> entries = new ArrayList<>();
    private boolean loaded;

    public ReceivedLog(File file) {
        this.file = file;
    }

    public synchronized List<Entry> list() {
        load();
        return Collections.unmodifiableList(new ArrayList<>(entries));
    }

    public synchronized Entry get(String id) {
        load();
        for (Entry e : entries) if (e.id.equals(id)) return e;
        return null;
    }

    /** Adds or replaces an entry (by id) at the top, and writes the log. */
    public synchronized void put(Entry entry) throws IOException {
        load();
        for (int i = 0; i < entries.size(); i++) {
            if (entries.get(i).id.equals(entry.id)) {
                entries.set(i, entry);
                save();
                return;
            }
        }
        entries.add(0, entry);
        // The oldest finished arrivals drop off; one still saving stays until it's done.
        for (int i = entries.size() - 1; entries.size() > MAX && i >= 0; i--) {
            if (entries.get(i).state != State.SAVING) entries.remove(i);
        }
        save();
    }

    /**
     * Writes the log after an entry it holds was changed in place. An entry taken off the list in the meantime stays
     * off: it isn't put back.
     */
    public synchronized boolean update(Entry entry) throws IOException {
        load();
        for (int i = 0; i < entries.size(); i++) {
            if (entries.get(i).id.equals(entry.id)) {
                entries.set(i, entry);
                save();
                return true;
            }
        }
        return false;
    }

    public synchronized void remove(String id) throws IOException {
        load();
        boolean removed = false;
        for (int i = entries.size() - 1; i >= 0; i--) {
            if (entries.get(i).id.equals(id)) {
                entries.remove(i);
                removed = true;
            }
        }
        if (removed) save();
    }

    private void load() {
        if (loaded) return;
        loaded = true;
        entries.clear();
        try {
            if (!file.isFile()) return;
            Object parsed = Json.parse(new String(AtomicFile.read(file), StandardCharsets.UTF_8));
            for (Object raw : Json.asArray(parsed)) {
                try {
                    Entry e = fromJson(Json.asObject(raw));
                    if (get(e.id, entries) == null) entries.add(e);
                } catch (RuntimeException skipped) {
                    // One entry that doesn't check out is left out; the rest are kept.
                }
            }
        } catch (IOException | RuntimeException damaged) {
            entries.clear();
        }
    }

    private static Entry get(String id, List<Entry> in) {
        for (Entry e : in) if (e.id.equals(id)) return e;
        return null;
    }

    private void save() throws IOException {
        List<Object> out = new ArrayList<>();
        for (Entry e : entries) out.add(toJson(e));
        AtomicFile.write(file, Json.stringify(out).getBytes(StandardCharsets.UTF_8));
    }

    private static Map<String, Object> toJson(Entry e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.id);
        m.put("name", e.name);
        m.put("from", e.from);
        m.put("at", e.at);
        m.put("place", e.place == null ? null : e.place.name());
        m.put("folder", e.folder);
        m.put("state", e.state.name());
        m.put("note", e.note);
        m.put("source", e.source);
        m.put("notified", e.notified);
        List<Object> files = new ArrayList<>();
        for (FileRecord f : e.files) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("path", f.path);
            r.put("bytes", f.bytes);
            r.put("mime", f.mime);
            r.put("uri", f.uri);
            r.put("published", f.published);
            r.put("shown", f.shown);
            files.add(r);
        }
        m.put("files", files);
        return m;
    }

    private static Entry fromJson(Map<String, Object> m) {
        String id = required(m.get("id"), 64);
        String name = required(m.get("name"), 200);
        String from = required(m.get("from"), 200);
        Long at = Json.asInt(m.get("at"), 0, Json.MAX_SAFE_INTEGER);
        Object placeRaw = m.get("place");
        SavePlan.Place place = placeRaw == null ? null : SavePlan.Place.valueOf(required(placeRaw, 20));
        String folder = required(m.get("folder"), 4096);
        State state = State.valueOf(required(m.get("state"), 20));
        List<FileRecord> files = new ArrayList<>();
        for (Object raw : Json.asArray(m.get("files"))) {
            Map<String, Object> r = Json.asObject(raw);
            String path = required(r.get("path"), 1024);
            Long bytes = Json.asInt(r.get("bytes"), 0, Json.MAX_SAFE_INTEGER);
            if (bytes == null) throw new IllegalArgumentException("bytes");
            FileRecord f = new FileRecord(path, bytes, required(r.get("mime"), 200));
            f.uri = optional(r.get("uri"), 2048);
            f.published = Boolean.TRUE.equals(r.get("published"));
            f.shown = optional(r.get("shown"), 300);
            files.add(f);
        }
        if (at == null) throw new IllegalArgumentException("at");
        Entry e = new Entry(id, name, from, at, place, folder, files, state);
        e.note = optional(m.get("note"), 500);
        e.source = optional(m.get("source"), 4096);
        e.notified = Boolean.TRUE.equals(m.get("notified"));
        return e;
    }

    private static String required(Object value, int max) {
        String s = Json.asString(value);
        if (s == null || s.isEmpty() || s.length() > max) throw new IllegalArgumentException("text");
        return s;
    }

    private static String optional(Object value, int max) {
        if (value == null) return null;
        String s = Json.asString(value);
        if (s == null || s.length() > max) throw new IllegalArgumentException("text");
        return s;
    }
}
