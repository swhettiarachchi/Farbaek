package com.farbaek.mesh;

/**
 * Test text with non-ASCII characters, written in ASCII: "%uXXXX" is that
 * UTF-16 code unit and "%B" a backslash, so the sources stay ASCII and read
 * the same on every machine.
 */
final class Text {
    private Text() {}

    static String u(String s) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '%' && i + 5 < s.length() && s.charAt(i + 1) == 'u') {
                out.append((char) Integer.parseInt(s.substring(i + 2, i + 6), 16));
                i += 5;
            } else if (c == '%' && i + 1 < s.length() && s.charAt(i + 1) == 'B') {
                out.append((char) 92);
                i += 1;
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    static byte[] hex(String s) {
        return org.bouncycastle.util.encoders.Hex.decode(s);
    }

    static String hex(byte[] b) {
        return org.bouncycastle.util.encoders.Hex.toHexString(b);
    }
}
