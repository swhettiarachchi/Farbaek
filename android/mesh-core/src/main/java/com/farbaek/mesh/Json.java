package com.farbaek.mesh;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The JSON that Mesh puts on the wire, read and written the way Node's
 * JSON.parse and JSON.stringify do, for the shapes the protocol uses:
 * objects (insertion-ordered maps), arrays, strings, numbers, booleans and
 * null.
 *
 * Numbers are read as JavaScript reads them, as a double: an integral value
 * within Number.MAX_SAFE_INTEGER becomes a Long (so "1.0" and "1e2" are the
 * integers 1 and 100, as zod's int() sees them), anything else a Double,
 * which every schema here refuses. Duplicate keys keep the last value, as
 * JSON.parse does.
 */
public final class Json {
    /** Number.MAX_SAFE_INTEGER. */
    public static final long MAX_SAFE_INTEGER = 9007199254740991L;
    private static final int MAX_DEPTH = 256;

    private Json() {}

    public static final class JsonException extends IllegalArgumentException {
        JsonException(String message) {
            super(message);
        }
    }

    /** Parses one JSON text. Throws JsonException when it isn't JSON. */
    public static Object parse(String text) {
        Parser p = new Parser(text);
        p.skipSpace();
        Object value = p.value(0);
        p.skipSpace();
        if (p.at != text.length()) throw new JsonException("Unexpected text after the JSON value.");
        return value;
    }

    /** JSON.stringify for maps, lists, strings, Long/Integer, Boolean and null. */
    public static String stringify(Object value) {
        StringBuilder out = new StringBuilder();
        write(out, value);
        return out.toString();
    }

    private static void write(StringBuilder out, Object value) {
        if (value == null) {
            out.append("null");
        } else if (value instanceof String) {
            quote(out, (String) value);
        } else if (value instanceof Boolean) {
            out.append(((Boolean) value).booleanValue() ? "true" : "false");
        } else if (value instanceof Long || value instanceof Integer) {
            out.append(((Number) value).longValue());
        } else if (value instanceof Map) {
            out.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) value).entrySet()) {
                if (!first) out.append(',');
                first = false;
                quote(out, (String) e.getKey());
                out.append(':');
                write(out, e.getValue());
            }
            out.append('}');
        } else if (value instanceof List) {
            out.append('[');
            boolean first = true;
            for (Object item : (List<?>) value) {
                if (!first) out.append(',');
                first = false;
                write(out, item);
            }
            out.append(']');
        } else {
            throw new IllegalArgumentException("Can't write a " + value.getClass().getSimpleName() + " as Mesh JSON.");
        }
    }

    /** A string as JSON.stringify writes it, lone surrogates escaped (ES2019 well-formed stringify). */
    static void quote(StringBuilder out, String s) {
        out.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\b': out.append("\\b"); break;
                case '\f': out.append("\\f"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        unicodeEscape(out, c);
                    } else if (Character.isHighSurrogate(c)) {
                        if (i + 1 < s.length() && Character.isLowSurrogate(s.charAt(i + 1))) {
                            out.append(c).append(s.charAt(i + 1));
                            i++;
                        } else {
                            unicodeEscape(out, c);
                        }
                    } else if (Character.isLowSurrogate(c)) {
                        unicodeEscape(out, c);
                    } else {
                        out.append(c);
                    }
            }
        }
        out.append('"');
    }

    private static void unicodeEscape(StringBuilder out, char c) {
        String hex = Integer.toHexString(c);
        out.append("\\u");
        for (int k = hex.length(); k < 4; k++) out.append('0');
        out.append(hex);
    }

    /** JavaScript's String.prototype.trim: WhiteSpace and LineTerminator code points at both ends. */
    public static String jsTrim(String s) {
        int start = 0;
        int end = s.length();
        while (start < end && isJsSpace(s.charAt(start))) start++;
        while (end > start && isJsSpace(s.charAt(end - 1))) end--;
        return s.substring(start, end);
    }

    static boolean isJsSpace(char c) {
        switch (c) {
            case '\t': case '\n': case 0x0B: case '\f': case '\r': case ' ':
            case 0x00A0: case 0x1680: case 0x2028: case 0x2029: case 0x202F: case 0x205F: case 0x3000: case 0xFEFF:
                return true;
            default:
                return c >= 0x2000 && c <= 0x200A;
        }
    }

    // Typed reads for the schemas, each null when the value isn't that type.

    @SuppressWarnings("unchecked")
    static Map<String, Object> asObject(Object value) {
        return value instanceof Map ? (Map<String, Object>) value : null;
    }

    @SuppressWarnings("unchecked")
    static List<Object> asArray(Object value) {
        return value instanceof List ? (List<Object>) value : null;
    }

    static String asString(Object value) {
        return value instanceof String ? (String) value : null;
    }

    /** A safe integer within [min, max], or null. */
    static Long asInt(Object value, long min, long max) {
        if (!(value instanceof Long)) return null;
        long v = (Long) value;
        return v >= min && v <= max ? v : null;
    }

    private static final class Parser {
        final String s;
        int at;

        Parser(String s) {
            this.s = s;
        }

        void skipSpace() {
            while (at < s.length()) {
                char c = s.charAt(at);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') at++;
                else break;
            }
        }

        JsonException error(String what) {
            return new JsonException(what + " at position " + at + ".");
        }

        Object value(int depth) {
            if (depth > MAX_DEPTH) throw error("Nested too deeply");
            if (at >= s.length()) throw error("Unexpected end of JSON");
            char c = s.charAt(at);
            switch (c) {
                case '{': return object(depth);
                case '[': return array(depth);
                case '"': return string();
                case 't': return literal("true", Boolean.TRUE);
                case 'f': return literal("false", Boolean.FALSE);
                case 'n': return literal("null", null);
                default:
                    if (c == '-' || (c >= '0' && c <= '9')) return number();
                    throw error("Unexpected character");
            }
        }

        Object literal(String word, Object value) {
            if (!s.startsWith(word, at)) throw error("Unexpected token");
            at += word.length();
            return value;
        }

        Map<String, Object> object(int depth) {
            at++;
            Map<String, Object> out = new LinkedHashMap<>();
            skipSpace();
            if (at < s.length() && s.charAt(at) == '}') {
                at++;
                return out;
            }
            while (true) {
                skipSpace();
                if (at >= s.length() || s.charAt(at) != '"') throw error("Expected a property name");
                String key = string();
                skipSpace();
                if (at >= s.length() || s.charAt(at) != ':') throw error("Expected ':'");
                at++;
                skipSpace();
                Object v = value(depth + 1);
                out.remove(key);
                out.put(key, v);
                skipSpace();
                if (at >= s.length()) throw error("Unexpected end of JSON");
                char c = s.charAt(at++);
                if (c == '}') return out;
                if (c != ',') throw error("Expected ',' or '}'");
            }
        }

        List<Object> array(int depth) {
            at++;
            List<Object> out = new ArrayList<>();
            skipSpace();
            if (at < s.length() && s.charAt(at) == ']') {
                at++;
                return out;
            }
            while (true) {
                skipSpace();
                out.add(value(depth + 1));
                skipSpace();
                if (at >= s.length()) throw error("Unexpected end of JSON");
                char c = s.charAt(at++);
                if (c == ']') return out;
                if (c != ',') throw error("Expected ',' or ']'");
            }
        }

        String string() {
            at++;
            StringBuilder out = new StringBuilder();
            while (true) {
                if (at >= s.length()) throw error("Unterminated string");
                char c = s.charAt(at++);
                if (c == '"') return out.toString();
                if (c < 0x20) throw error("Control character in a string");
                if (c != '\\') {
                    out.append(c);
                    continue;
                }
                if (at >= s.length()) throw error("Unterminated string");
                char e = s.charAt(at++);
                switch (e) {
                    case '"': out.append('"'); break;
                    case '\\': out.append('\\'); break;
                    case '/': out.append('/'); break;
                    case 'b': out.append('\b'); break;
                    case 'f': out.append('\f'); break;
                    case 'n': out.append('\n'); break;
                    case 'r': out.append('\r'); break;
                    case 't': out.append('\t'); break;
                    case 'u': {
                        if (at + 4 > s.length()) throw error("Bad unicode escape");
                        int v = 0;
                        for (int k = 0; k < 4; k++) {
                            int d = Character.digit(s.charAt(at + k), 16);
                            if (d < 0 || s.charAt(at + k) > 'f') throw error("Bad unicode escape");
                            v = v * 16 + d;
                        }
                        at += 4;
                        out.append((char) v);
                        break;
                    }
                    default:
                        throw error("Bad escape");
                }
            }
        }

        Object number() {
            int start = at;
            if (s.charAt(at) == '-') at++;
            if (at >= s.length()) throw error("Bad number");
            if (s.charAt(at) == '0') {
                at++;
            } else if (s.charAt(at) >= '1' && s.charAt(at) <= '9') {
                while (at < s.length() && isDigit(s.charAt(at))) at++;
            } else {
                throw error("Bad number");
            }
            if (at < s.length() && s.charAt(at) == '.') {
                at++;
                if (at >= s.length() || !isDigit(s.charAt(at))) throw error("Bad number");
                while (at < s.length() && isDigit(s.charAt(at))) at++;
            }
            if (at < s.length() && (s.charAt(at) == 'e' || s.charAt(at) == 'E')) {
                at++;
                if (at < s.length() && (s.charAt(at) == '+' || s.charAt(at) == '-')) at++;
                if (at >= s.length() || !isDigit(s.charAt(at))) throw error("Bad number");
                while (at < s.length() && isDigit(s.charAt(at))) at++;
            }
            // As JavaScript does: the nearest double, then integral and safe values become integers.
            double d = Double.parseDouble(s.substring(start, at));
            if (!Double.isInfinite(d) && d == Math.floor(d) && Math.abs(d) <= MAX_SAFE_INTEGER) return Long.valueOf((long) d);
            return Double.valueOf(d);
        }

        static boolean isDigit(char c) {
            return c >= '0' && c <= '9';
        }
    }
}
