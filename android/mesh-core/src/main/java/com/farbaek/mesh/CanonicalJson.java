package com.farbaek.mesh;

import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

/**
 * JSON Canonicalization Scheme (RFC 8785) for the shapes a Capsule manifest
 * uses, matching src/core/trust/canonical-json.ts byte for byte:
 *
 * - object keys sorted by UTF-16 code units (String.compareTo, the default
 *   JavaScript order), recursively;
 * - strings escaped as JSON.stringify escapes them;
 * - integers in plain decimal, as ECMAScript prints a safe integer.
 *
 * Only what a manifest can hold is accepted: maps with string keys, lists,
 * strings, Long or Integer within Number.MAX_SAFE_INTEGER, booleans and
 * null. Anything else (a fraction, NaN, an unsafe integer, a lone surrogate,
 * a cycle, another type) is refused instead of dropped, because a dropped or
 * reformatted field would change the digest. The TypeScript side refuses the
 * same things or, for fractions, the manifest schema does before hashing.
 */
public final class CanonicalJson {
    private CanonicalJson() {}

    public static final class CanonicalizationException extends IllegalArgumentException {
        public final String path;

        CanonicalizationException(String message, String path) {
            super(message + " at " + path);
            this.path = path;
        }
    }

    public static String canonicalize(Object value) {
        StringBuilder out = new StringBuilder();
        serialize(out, value, "$", Collections.newSetFromMap(new IdentityHashMap<Object, Boolean>()));
        return out.toString();
    }

    private static void serialize(StringBuilder out, Object value, String path, java.util.Set<Object> ancestors) {
        if (value == null) {
            out.append("null");
            return;
        }
        if (value instanceof Boolean) {
            out.append(((Boolean) value).booleanValue() ? "true" : "false");
            return;
        }
        if (value instanceof Long || value instanceof Integer) {
            long n = ((Number) value).longValue();
            if (Math.abs(n) > Json.MAX_SAFE_INTEGER) throw new CanonicalizationException("Number is not a safe integer", path);
            out.append(n);
            return;
        }
        if (value instanceof Number) throw new CanonicalizationException("Only integers can be canonicalized here", path);
        if (value instanceof String) {
            serializeString(out, (String) value, path);
            return;
        }
        if (!(value instanceof Map) && !(value instanceof List)) {
            throw new CanonicalizationException("Unsupported value of type " + value.getClass().getSimpleName(), path);
        }
        if (!ancestors.add(value)) throw new CanonicalizationException("Circular reference", path);
        try {
            if (value instanceof List) {
                List<?> list = (List<?>) value;
                out.append('[');
                for (int i = 0; i < list.size(); i++) {
                    if (i > 0) out.append(',');
                    serialize(out, list.get(i), path + "[" + i + "]", ancestors);
                }
                out.append(']');
                return;
            }
            Map<?, ?> map = (Map<?, ?>) value;
            List<String> keys = new ArrayList<>(map.size());
            for (Object key : map.keySet()) {
                if (!(key instanceof String)) throw new CanonicalizationException("Object keys must be strings", path);
                keys.add((String) key);
            }
            // String.compareTo orders by UTF-16 code units, as Array.prototype.sort does.
            Collections.sort(keys);
            out.append('{');
            boolean first = true;
            for (String key : keys) {
                if (!first) out.append(',');
                first = false;
                String childPath = path + "." + key;
                serializeString(out, key, childPath);
                out.append(':');
                serialize(out, map.get(key), childPath, ancestors);
            }
            out.append('}');
        } finally {
            ancestors.remove(value);
        }
    }

    private static void serializeString(StringBuilder out, String value, String path) {
        if (hasLoneSurrogate(value)) throw new CanonicalizationException("String contains a lone surrogate", path);
        Json.quote(out, value);
    }

    static boolean hasLoneSurrogate(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (Character.isHighSurrogate(c)) {
                if (i + 1 < s.length() && Character.isLowSurrogate(s.charAt(i + 1))) {
                    i++;
                } else {
                    return true;
                }
            } else if (Character.isLowSurrogate(c)) {
                return true;
            }
        }
        return false;
    }
}
