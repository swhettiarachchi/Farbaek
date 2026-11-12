package com.farbaek.mesh;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The path rules of src/core/workspace/files.ts (checkPath, screenPath) and
 * src/core/agent/paths.ts (checkAgentPath), ported rule for rule. Paths are
 * relative POSIX paths: no leading slash, no "." or ".." segments, no empty
 * segments, no backslashes or control characters, and on top of that the
 * names a real disk would misread (drive letters and streams, device names,
 * trailing dots and spaces, 8.3 short names).
 *
 * JavaScript's "." doesn't match line terminators and its \b is an ASCII
 * word boundary; the patterns below spell both out so Java (and Android's
 * ICU regex) behave the same.
 */
public final class AgentPaths {
    private AgentPaths() {}

    public static final int MAX_PATH_LENGTH = 300;
    public static final int MAX_PATH_DEPTH = 24;
    private static final int MAX_SEGMENT_LENGTH = 120;

    /** Any character but a JavaScript line terminator: what "." matches in a JS regex. */
    private static final String DOT = "[^\\n\\r\\u2028\\u2029]";
    /** JavaScript's \b (ASCII word characters). */
    private static final String B = "(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))";

    /** Dependency, VCS and build-output folders. Their contents are never sent. */
    public static final Set<String> IGNORED_FOLDERS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "node_modules", ".git", ".hg", ".svn", ".next", ".turbo", ".vercel", ".cache", ".parcel-cache", ".pnpm-store",
            ".yarn", "dist", "build", "out", "coverage", "__pycache__", ".venv", "venv", ".idea")));

    private static final Set<String> IGNORED_FILES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(".DS_Store", "Thumbs.db")));

    /** The outcome of a path check: ok with the path, or a reason in words. */
    public static final class PathCheck {
        public final boolean ok;
        public final String path;
        public final String reason;

        private PathCheck(boolean ok, String path, String reason) {
            this.ok = ok;
            this.path = path;
            this.reason = reason;
        }

        static PathCheck ok(String path) {
            return new PathCheck(true, path, null);
        }

        static PathCheck fail(String reason) {
            return new PathCheck(false, null, reason);
        }
    }

    /** A screening outcome: ok, or one of invalid_path, ignored_folder, secret_file. */
    public static final class Screen {
        public final boolean ok;
        public final String path;
        public final String reason;

        Screen(boolean ok, String path, String reason) {
            this.ok = ok;
            this.path = path;
            this.reason = reason;
        }
    }

    private static final Pattern CONTROL_OR_BACKSLASH = Pattern.compile("[\\x00-\\x1f\\x7f\\\\]");

    /** Validates a relative path. Leading "./" is removed; nothing else is rewritten. */
    public static PathCheck checkPath(String raw) {
        String path = raw.startsWith("./") ? raw.substring(2) : raw;
        if (path.isEmpty()) return PathCheck.fail("The path is empty.");
        if (path.length() > MAX_PATH_LENGTH) return PathCheck.fail("The path is longer than " + MAX_PATH_LENGTH + " characters.");
        if (CONTROL_OR_BACKSLASH.matcher(path).find()) return PathCheck.fail("The path has a backslash or a control character.");
        if (path.startsWith("/")) return PathCheck.fail("The path must be relative to the project root.");
        String[] segments = path.split("/", -1);
        if (segments.length > MAX_PATH_DEPTH) return PathCheck.fail("The path is more than " + MAX_PATH_DEPTH + " folders deep.");
        for (String s : segments) {
            if (s.isEmpty()) return PathCheck.fail("The path has an empty folder name.");
            if (s.equals(".") || s.equals("..")) return PathCheck.fail("The path can't contain \".\" or \"..\" folders.");
            if (s.length() > MAX_SEGMENT_LENGTH) return PathCheck.fail("A name in the path is longer than " + MAX_SEGMENT_LENGTH + " characters.");
        }
        return PathCheck.ok(path);
    }

    private static final Pattern WINDOWS_CHARS = Pattern.compile("[:*?\"<>|]");
    private static final Pattern WINDOWS_DEVICE = Pattern.compile("^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3]|conin\\$|conout\\$)(\\." + DOT + "*)?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SHORT_NAME = Pattern.compile("~[0-9]");

    /** checkPath plus the rules that matter once a path reaches a real disk. */
    public static PathCheck checkAgentPath(String raw) {
        PathCheck base = checkPath(raw);
        if (!base.ok) return base;
        for (String segment : base.path.split("/", -1)) {
            if (WINDOWS_CHARS.matcher(segment).find()) return PathCheck.fail("The path has a character Windows doesn't allow in names (: * ? \" < > |).");
            if (segment.endsWith(".") || segment.endsWith(" ")) return PathCheck.fail("A name in the path ends with a dot or a space.");
            if (matchesWhole(WINDOWS_DEVICE, segment)) return PathCheck.fail("\"" + segment + "\" is a reserved device name on Windows.");
            if (SHORT_NAME.matcher(segment).find()) return PathCheck.fail("A name in the path looks like a short 8.3 name (\"~1\"), which can alias another file.");
        }
        return base;
    }

    /** A JS ^...$ match without the m flag: the whole string, with no final-line-break allowance. */
    private static boolean matchesWhole(Pattern p, String s) {
        return p.matcher(s).matches();
    }

    /** On Windows and macOS ".GIT" is the real ".git", so case can't get a folder past this. */
    public static boolean isIgnoredFolder(String name) {
        return IGNORED_FOLDERS.contains(name) || IGNORED_FOLDERS.contains(name.toLowerCase(Locale.ROOT));
    }

    private static final Pattern ENV = Pattern.compile("\\.env(\\." + DOT + "+)?");
    private static final Pattern ENV_EXAMPLE = Pattern.compile("\\.env\\.(example|sample|template)");
    // JavaScript's $ (no m flag) is the very end of the input: \z in Java, whose $ also matches before a final line break.
    private static final Pattern KEY_EXTENSION = Pattern.compile("\\.(pem|key|p12|pfx|jks|keystore|ppk)\\z");
    private static final Pattern SSH_KEY = Pattern.compile("^id_(rsa|dsa|ecdsa|ed25519)(?!" + DOT + "*\\.pub\\z)");
    private static final List<String> CREDENTIAL_FILES = Arrays.asList(".npmrc", ".pypirc", ".netrc", ".git-credentials", "credentials.json");

    /** Files that hold credentials by convention. Example and template env files are fine. */
    static boolean isSecretFileName(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (ENV.matcher(lower).matches()) return !ENV_EXAMPLE.matcher(lower).matches();
        if (KEY_EXTENSION.matcher(lower).find()) return true;
        if (SSH_KEY.matcher(lower).find()) return true;
        return CREDENTIAL_FILES.contains(lower);
    }

    /** Recognisable credential formats. A match keeps the file from being sent; the value is never echoed. */
    private static final Pattern[] SECRET_PATTERNS = {
        Pattern.compile(B + "AIza[0-9A-Za-z_-]{35}" + B),
        Pattern.compile(B + "whsec_[A-Za-z0-9+/=_-]{20,}"),
        Pattern.compile(B + "glpat-[A-Za-z0-9_-]{20,}"),
        Pattern.compile(B + "npm_[A-Za-z0-9]{36}" + B),
        Pattern.compile(B + "fa_[A-Za-z0-9_-]{32,}"),
        Pattern.compile(B + "fbk_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])"),
        Pattern.compile("-----BEGIN [A-Z ]*PRIVATE KEY-----"),
        Pattern.compile(B + "AKIA[0-9A-Z]{16}" + B),
        Pattern.compile(B + "sk-ant-[A-Za-z0-9_-]{20,}"),
        Pattern.compile(B + "sk-(proj-)?[A-Za-z0-9_-]{40,}"),
        Pattern.compile(B + "gh[pousr]_[A-Za-z0-9]{36,}"),
        Pattern.compile(B + "github_pat_[A-Za-z0-9_]{50,}"),
        Pattern.compile(B + "xox[abprs]-[A-Za-z0-9-]{10,}"),
        Pattern.compile(B + "sb_secret_[A-Za-z0-9_-]{10,}"),
        Pattern.compile(B + "[rs]k_live_[A-Za-z0-9]{16,}"),
    };

    public static boolean containsSecret(String content) {
        for (Pattern p : SECRET_PATTERNS) {
            if (p.matcher(content).find()) return true;
        }
        return false;
    }

    /** Decides whether a path alone may travel, before its content is read. */
    public static Screen screenPath(String raw) {
        PathCheck checked = checkPath(raw);
        if (!checked.ok) return new Screen(false, null, "invalid_path");
        String[] segments = checked.path.split("/", -1);
        String name = segments[segments.length - 1];
        for (int i = 0; i < segments.length - 1; i++) {
            if (isIgnoredFolder(segments[i])) return new Screen(false, null, "ignored_folder");
        }
        if (IGNORED_FILES.contains(name)) return new Screen(false, null, "ignored_folder");
        if (isSecretFileName(name)) return new Screen(false, null, "secret_file");
        return new Screen(true, checked.path, null);
    }
}
