package com.farbaek.mesh;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Where received files go on a phone, and how Nearby talks about it (stage 188, ADR 0196). Plain Java, so the rules
 * are tested without Android: one place per transfer (a folder stays whole), names that can't disguise themselves,
 * MIME types from real extensions, and which kinds may open with a tap. Nothing received runs.
 */
public final class SavePlan {
    private SavePlan() {}

    /** Where a transfer's files go: Gallery (Pictures/Farbaek) when every file is a photo or a video, otherwise Downloads. */
    public enum Place {
        GALLERY("Pictures/Farbaek/", "Gallery › Farbaek"),
        DOWNLOADS("Download/Farbaek/", "Downloads › Farbaek");

        /** The shared-storage folder, as MediaStore's RELATIVE_PATH wants it. */
        public final String root;
        /** How people see it in Gallery or Files. */
        public final String label;

        Place(String root, String label) {
            this.root = root;
            this.label = label;
        }
    }

    private static final String[][] TYPES = {
        {"jpg", "image/jpeg", "photo"}, {"jpeg", "image/jpeg", "photo"}, {"png", "image/png", "photo"}, {"gif", "image/gif", "photo"},
        {"webp", "image/webp", "photo"}, {"heic", "image/heic", "photo"}, {"heif", "image/heif", "photo"}, {"bmp", "image/bmp", "photo"},
        {"avif", "image/avif", "photo"},
        {"mp4", "video/mp4", "video"}, {"mov", "video/quicktime", "video"}, {"m4v", "video/x-m4v", "video"}, {"webm", "video/webm", "video"},
        {"mkv", "video/x-matroska", "video"}, {"3gp", "video/3gpp", "video"}, {"avi", "video/x-msvideo", "video"},
        {"mp3", "audio/mpeg", "audio"}, {"m4a", "audio/mp4", "audio"}, {"wav", "audio/wav", "audio"}, {"aac", "audio/aac", "audio"},
        {"flac", "audio/flac", "audio"}, {"ogg", "audio/ogg", "audio"}, {"opus", "audio/opus", "audio"},
        // Documents that open in a viewer and run nothing. SVG and HTML are left out: a browser runs their scripts.
        {"pdf", "application/pdf", "document"}, {"txt", "text/plain", "document"},
    };

    /** A name without characters that can disguise it (a right-to-left override, zero-width or control characters). */
    public static String display(String name) {
        if (name == null) return "Unnamed";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < name.length(); ) {
            int cp = name.codePointAt(i);
            i += Character.charCount(cp);
            int type = Character.getType(cp);
            if (type == Character.FORMAT || type == Character.CONTROL) continue;
            b.appendCodePoint(cp);
        }
        String s = b.toString().trim();
        return s.isEmpty() ? "Unnamed" : s;
    }

    /** A name that's safe as one folder or file name in shared storage: shown cleanly, nothing that reads as a path. */
    public static String clean(String name, String fallback) {
        String s = display(name);
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            b.append("/\\:*?\"<>|".indexOf(ch) >= 0 ? '_' : ch);
        }
        s = b.toString().trim();
        while (s.startsWith(".")) s = s.substring(1).trim();
        while (s.endsWith(".")) s = s.substring(0, s.length() - 1).trim();
        if (s.length() > 100) s = s.substring(0, 100).trim();
        return s.isEmpty() || s.equals("Unnamed") ? fallback : s;
    }

    /** The real extension, from the cleaned last part of the path, lower case; "" when there's none. */
    public static String extension(String path) {
        String base = display(path);
        int slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
        if (slash >= 0) base = base.substring(slash + 1);
        int dot = base.lastIndexOf('.');
        return dot > 0 ? base.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
    }

    private static String[] type(String path) {
        String ext = extension(path);
        for (String[] t : TYPES) if (t[0].equals(ext)) return t;
        return null;
    }

    /** "photo", "video", "audio", "document" or "other". */
    public static String kind(String path) {
        String[] t = type(path);
        return t == null ? "other" : t[2];
    }

    public static String mime(String path) {
        String[] t = type(path);
        return t == null ? "application/octet-stream" : t[1];
    }

    /** Whether a received file may open with a tap: only kinds that open in a viewer, never a program or a page. */
    public static boolean canOpen(String path) {
        return type(path) != null;
    }

    /** One place for the whole transfer, so a folder is never split: Gallery when every file is a photo or a video. */
    public static Place placeFor(List<String> paths) {
        if (paths.isEmpty()) return Place.DOWNLOADS;
        for (String p : paths) {
            String k = kind(p);
            if (!k.equals("photo") && !k.equals("video")) return Place.DOWNLOADS;
        }
        return Place.GALLERY;
    }

    /** The folder's name, made different from those already used: "Site photos", then "Site photos (2)". */
    public static String uniqueFolder(String wanted, Set<String> taken) {
        String base = clean(wanted, "Farbaek transfer");
        String candidate = base;
        for (int i = 2; containsIgnoringCase(taken, candidate); i++) candidate = base + " (" + i + ")";
        return candidate;
    }

    private static boolean containsIgnoringCase(Set<String> taken, String name) {
        for (String t : taken) if (t.equalsIgnoreCase(name)) return true;
        return false;
    }

    /** RELATIVE_PATH for a file: the place, the transfer's folder, then the file's own subfolders, ending in "/". */
    public static String relativeDir(Place place, String folder, String relativePath) {
        return relativeDir(place.root, folder, relativePath);
    }

    /** The same, from a given root, such as "DCIM/Farbaek/" where Android 10 wants videos. */
    public static String relativeDir(String root, String folder, String relativePath) {
        StringBuilder b = new StringBuilder(root).append(folder).append('/');
        String[] parts = relativePath.replace('\\', '/').split("/");
        for (int i = 0; i < parts.length - 1; i++) {
            if (parts[i].isEmpty() || parts[i].equals(".") || parts[i].equals("..")) continue;
            b.append(clean(parts[i], "Folder")).append('/');
        }
        return b.toString();
    }

    /** A file's own name in shared storage. */
    public static String fileName(String relativePath, int index) {
        String p = relativePath.replace('\\', '/');
        return clean(p.substring(p.lastIndexOf('/') + 1), "file-" + index);
    }

    /** Where it went, in words: "Gallery › Farbaek › Site photos". */
    public static String placeLabel(Place place, String folder) {
        return place.label + " › " + display(folder);
    }

    /** "1 photo", "3 photos", "1 photo and 1 video", "1 photo, 1 video and 2 files", "6 files". */
    public static String summary(List<String> paths, long total) {
        if (paths.isEmpty() || paths.size() < total) return count(total, "file", "files");
        int photos = 0;
        int videos = 0;
        for (String p : paths) {
            String k = kind(p);
            if (k.equals("photo")) photos++;
            else if (k.equals("video")) videos++;
        }
        int rest = paths.size() - photos - videos;
        List<String> parts = new ArrayList<>();
        if (photos > 0) parts.add(count(photos, "photo", "photos"));
        if (videos > 0) parts.add(count(videos, "video", "videos"));
        if (rest > 0) parts.add(count(rest, "file", "files"));
        if (parts.size() == 1) return parts.get(0);
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < parts.size() - 1; i++) {
            if (i > 0) b.append(", ");
            b.append(parts.get(i));
        }
        return b.append(" and ").append(parts.get(parts.size() - 1)).toString();
    }

    private static String count(long n, String one, String many) {
        return String.format(Locale.US, "%,d", n) + " " + (n == 1 ? one : many);
    }

    /** An offer's notification title: "DESKTOP-9OIQ8KS wants to send Site photos". */
    public static String offerTitle(String peer, String name) {
        return display(peer) + " wants to send " + display(name);
    }

    /** An arrival's notification title: "Photo from DESKTOP-9OIQ8KS arrived", "3 photos from … arrived". */
    public static String arrivalTitle(String peer, List<String> paths, long total) {
        String what = summary(paths, total);
        String noun = null;
        if (total == 1 && paths.size() == 1) {
            String k = kind(paths.get(0));
            noun = k.equals("photo") ? "Photo" : k.equals("video") ? "Video" : "File";
        }
        String head = noun != null ? noun : Character.toUpperCase(what.charAt(0)) + what.substring(1);
        return head + " from " + display(peer) + " arrived";
    }
}
