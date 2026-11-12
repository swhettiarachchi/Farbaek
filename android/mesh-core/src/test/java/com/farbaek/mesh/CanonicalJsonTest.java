package com.farbaek.mesh;

import static com.farbaek.mesh.Text.u;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/**
 * RFC 8785 canonical JSON and the manifest digest, against the output of the
 * desktop's canonicalize() (src/core/trust/canonical-json.ts) and
 * manifestDigest() (src/core/mesh/capsule.ts) for the same JSON text. In
 * these strings "%uXXXX" is that character and "%B" a backslash (see Text).
 */
public class CanonicalJsonTest {
    /** JSON text in, the TypeScript canonical form out. */
    static final String[][] TS_EXAMPLES = {
        {"{\"b\":1,\"a\":{\"d\":[3,{\"z\":0,\"y\":1}],\"c\":2}}", "{\"a\":{\"c\":2,\"d\":[3,{\"y\":1,\"z\":0}]},\"b\":1}"},
        // By UTF-16 code unit: capitals first, the euro sign before the emoji's surrogates.
        {"{\"%Bud83d%Bude00\":1,\"%Bu20ac\":2,\"a\":3,\"B\":4}", "{\"B\":4,\"a\":3,\"%u20ac\":2,\"%ud83d%ude00\":1}"},
        // U+10000 (surrogates D800 DC00) sorts before U+FFFF, as code units order it; NFC and NFD forms stay distinct.
        {"{\"%Buffff\":1,\"%Bud800%Budc00\":2,\"%Bu00e9\":3,\"e%Bu0301\":4,\"\":5,\"a%Bu0000\":6,\"aa\":7,\"A\":8}",
            "{\"\":5,\"A\":8,\"a%Bu0000\":6,\"aa\":7,\"e%u0301\":4,\"%u00e9\":3,\"%ud800%udc00\":2,\"%uffff\":1}"},
        // JSON.stringify's escaping: short escapes, lowercase \\u00xx for other controls, DEL and U+2028/9 as they are.
        {"{\"s\":\"%Bu20ac$%Bu000F%Bu000aA'%Bu0042%Bu0022%Bu005c%B%B%B\"%B/\",\"c\":\"%Bu0000%Bu0001%Bu001f%Bu007f%Bu2028%Bu2029%Bb%Bf%Bt%Br\",\"e\":\"%Bud83d%Bude00 caf%Bu00e9\"}",
            "{\"c\":\"%Bu0000%Bu0001%Bu001f%u007f%u2028%u2029%Bb%Bf%Bt%Br\",\"e\":\"%ud83d%ude00 caf%u00e9\",\"s\":\"%u20ac$%Bu000f%BnA'B%B\"%B%B%B%B%B\"/\"}"},
        {"[0,-0,1,-1,9007199254740991,-9007199254740991,100,1.0,1e2,123456789012]", "[0,0,1,-1,9007199254740991,-9007199254740991,100,1,100,123456789012]"},
        {"{\"literals\":[null,true,false],\"empty\":{},\"list\":[]}", "{\"empty\":{},\"list\":[],\"literals\":[null,true,false]}"},
    };

    @Test
    public void matchesTheTypeScriptCanonicalForm() {
        for (String[] example : TS_EXAMPLES) {
            assertEquals(u(example[0]), u(example[1]), CanonicalJson.canonicalize(Json.parse(u(example[0]))));
        }
    }

    @Test
    public void refusesALoneSurrogateAsTheTypeScriptDoes() {
        assertRefused(Json.parse(u("\"%Bud800\"")), "lone surrogate");
        assertRefused(Json.parse(u("{\"%Budc00x\":1}")), "lone surrogate");
    }

    @Test
    public void refusesAnythingButIntegersStringsAndPlainJson() {
        assertRefused(Json.parse("1.5"), "Only integers");
        assertRefused(Json.parse("[1e400]"), "Only integers");
        // 2^53 isn't a safe integer: JavaScript can't hold it exactly, so the manifest schema refuses it.
        assertRefused(Json.parse("9007199254740992"), "Only integers");
        assertRefused(9007199254740992L, "safe integer");
        assertRefused(Arrays.asList(1, new Object()), "Unsupported");
        Map<String, Object> loop = new LinkedHashMap<>();
        loop.put("self", loop);
        assertRefused(loop, "Circular");
        Map<String, Object> shared = new LinkedHashMap<>();
        shared.put("x", 1L);
        Map<String, Object> twice = new LinkedHashMap<>();
        twice.put("a", shared);
        twice.put("b", shared);
        assertEquals("{\"a\":{\"x\":1},\"b\":{\"x\":1}}", CanonicalJson.canonicalize(twice));
    }

    @Test
    public void reportsWhereTheProblemIs() {
        try {
            CanonicalJson.canonicalize(Json.parse("{\"action\":{\"fields\":[{\"price\":1.5}]}}"));
            fail("expected a refusal");
        } catch (CanonicalJson.CanonicalizationException e) {
            assertEquals("$.action.fields[0].price", e.path);
        }
    }

    @Test
    public void readsNumbersAsJavaScriptDoes() {
        assertEquals(1L, Json.parse("1.0"));
        assertEquals(100L, Json.parse("1e2"));
        assertEquals(0L, Json.parse("-0"));
        // Rounds to 1 as a double, so zod's int() takes it as 1, and so does this.
        assertEquals(1L, Json.parse("1.0000000000000001"));
        assertTrue(Json.parse("1.5") instanceof Double);
        assertTrue(Json.parse("9007199254740993") instanceof Double);
        for (String bad : new String[] {"01", "1.", ".5", "+1", "0x10", "NaN", "Infinity", "-", "1e", "\"a", "[1,]", "{\"a\":1,}", "tru", "\"%Bx\"", "\"%Bu12\"", u("%ufeff1"), "1 2"}) {
            try {
                Json.parse(u(bad));
                fail("should refuse " + bad);
            } catch (Json.JsonException expected) {
                // Refused, as JSON.parse refuses it.
            }
        }
        // A raw control character in a string isn't JSON.
        try {
            Json.parse("\"a\tb\"");
            fail("should refuse a raw tab");
        } catch (Json.JsonException expected) {
            // Refused.
        }
        // Duplicate keys: the last one wins, as JSON.parse does.
        assertEquals(2L, Json.asObject(Json.parse("{\"a\":1,\"a\":2}")).get("a"));
    }

    @Test
    public void writesStringsAsJsonStringifyDoes() {
        String input = u("\"%B") + "\b\f\n\r\t" + u("%u0000%u001f%u007f%u2028%ud83d%ude00%ud800");
        // A lone surrogate is escaped, as ES2019's well-formed JSON.stringify does.
        assertEquals(u("\"%B\"%B%B%Bb%Bf%Bn%Br%Bt%Bu0000%Bu001f%u007f%u2028%ud83d%ude00%Bud800\""), Json.stringify(input));
    }

    /** The manifest as JSON.stringify sent it, with keys the schema doesn't know (they're stripped before hashing, as zod does). */
    static final String MANIFEST = "{\"format\":\"farbaek.capsule/1\",\"id\":\"00000000-0000-4000-8000-000000000001\",\"createdAt\":\"2026-11-12T09:30:00.123Z\","
            + "\"source\":{\"projectId\":null,\"projectName\":\"Harbour Lane %u00e9t%u00e9 %ud83d%ude00\"},\"note\":\"Line one%BnLine %B\"two%B\"\","
            + "\"files\":[{\"path\":\"README.md\",\"bytes\":15,\"blake3\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\","
            + "\"chunks\":[{\"index\":0,\"bytes\":15,\"blake3\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"extra\":true}],\"extra\":\"x\"},"
            + "{\"path\":\"src/empty.txt\",\"bytes\":0,\"blake3\":\"af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262\","
            + "\"chunks\":[{\"index\":0,\"bytes\":0,\"blake3\":\"af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262\"}]}],"
            + "\"excluded\":[{\"path\":\".env\",\"reason\":\"secret_file\"},{\"path\":\"node_modules/\",\"reason\":\"ignored_folder\"}],"
            + "\"totals\":{\"files\":2,\"bytes\":15},\"unknown\":{\"nested\":[1,2]}}";

    static final String TS_CANONICAL = "{\"createdAt\":\"2026-11-12T09:30:00.123Z\",\"excluded\":[{\"path\":\".env\",\"reason\":\"secret_file\"},{\"path\":\"node_modules/\",\"reason\":\"ignored_folder\"}],"
            + "\"files\":[{\"blake3\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"bytes\":15,\"chunks\":[{\"blake3\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"bytes\":15,\"index\":0}],\"path\":\"README.md\"},"
            + "{\"blake3\":\"af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262\",\"bytes\":0,\"chunks\":[{\"blake3\":\"af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262\",\"bytes\":0,\"index\":0}],\"path\":\"src/empty.txt\"}],"
            + "\"format\":\"farbaek.capsule/1\",\"id\":\"00000000-0000-4000-8000-000000000001\",\"note\":\"Line one%BnLine %B\"two%B\"\","
            + "\"source\":{\"projectId\":null,\"projectName\":\"Harbour Lane %u00e9t%u00e9 %ud83d%ude00\"},\"totals\":{\"bytes\":15,\"files\":2}}";

    static final String TS_DIGEST = "d95c3103f4dbe656f0a57d7fdbe38aedf87bbd7ea3ffc5d68d76934336ed3934";

    @Test
    public void givesTheManifestTheSameDigestAsTheDesktop() {
        Capsule.Manifest manifest = Capsule.fromJson(Json.parse(u(MANIFEST)));
        assertNotNull(manifest);
        assertEquals(u(TS_CANONICAL), CanonicalJson.canonicalize(manifest.toJson()));
        assertEquals(TS_DIGEST, Capsule.manifestDigest(manifest));
        // Written back out and read again, it's the same manifest.
        assertEquals(TS_DIGEST, Capsule.manifestDigest(Capsule.fromJson(Json.parse(Json.stringify(manifest.toJson())))));
    }

    @Test
    public void refusesManifestsTheSchemaRefuses() {
        String good = u(MANIFEST);
        assertNotNull(Capsule.fromJson(Json.parse(good)));
        List<String> bad = new ArrayList<>();
        bad.add(good.replace("2026-11-12T09:30:00.123Z", "2026-11-12T09:30Z")); // seconds are required
        bad.add(good.replace("2026-11-12T09:30:00.123Z", "2026-11-12T09:30:00+01:00")); // only Z
        bad.add(good.replace("2026-11-12T09:30:00.123Z", "2026-02-30T09:30:00Z")); // no such day
        bad.add(good.replace("\"bytes\":15,\"blake3\":\"aaaa", "\"bytes\":15.5,\"blake3\":\"aaaa"));
        bad.add(good.replace("\"projectId\":null,", ""));
        bad.add(good.replace("\"note\":\"Line one" + u("%B") + "nLine " + u("%B") + "\"two" + u("%B") + "\"\"", "\"note\":null"));
        bad.add(good.replace("\"format\":\"farbaek.capsule/1\"", "\"format\":\"farbaek.capsule/2\""));
        bad.add(good.replace("\"id\":\"00000000-0000-4000-8000-000000000001\"", "\"id\":\"short\""));
        bad.add(good.replace("\"blake3\":\"aaaa", "\"blake3\":\"AAAA"));
        bad.add(good.replace("\"chunks\":[{\"index\":0,\"bytes\":0,", "\"chunks\":[],\"x\":[{\"index\":0,\"bytes\":0,"));
        for (String text : bad) {
            assertTrue("changed: " + text, !text.equals(good));
            assertNull(text, Capsule.fromJson(Json.parse(text)));
        }
    }

    private static void assertRefused(Object value, String why) {
        try {
            CanonicalJson.canonicalize(value);
            fail("expected a refusal: " + why);
        } catch (CanonicalJson.CanonicalizationException e) {
            assertTrue(e.getMessage(), e.getMessage().contains(why));
        }
    }
}
