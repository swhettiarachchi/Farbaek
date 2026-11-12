package com.farbaek.mesh;

import static com.farbaek.mesh.Text.hex;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.junit.Test;

/**
 * Pairing v2's commitment and six-digit code, and the key fingerprint, against
 * values computed independently with Node's own crypto (createHash and
 * createHmac, not the Farbaek TypeScript) for the same inputs: the spec's test
 * vector, two codes whose first word is above 2^31 (a signed reading would
 * give another code), and one that needs zero padding.
 */
public class PairingCodeTest {
    /** The spec's vector: h = 0x00..0x1f, nC = 0x20..0x3f, nA = 0x40..0x5f. */
    static final byte[] H = seq(0x00);
    static final byte[] NC = seq(0x20);
    static final byte[] NA = seq(0x40);
    static final String VECTOR_COMMIT = "20be69037d35000e7c441c46ad27fa92aadba8af678f29907f6c2c433e6cc4b3";
    static final String VECTOR_CODE = "053107";

    /** nA, then Node's HMAC, its first word read unsigned (Buffer.readUInt32BE), and the code; h and nC are the vector's. */
    static final String[][] NODE_CODES = {
        {"404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f", "7660c3f3e2f79734bb7eb43be34d00318e9008a1a87f7a3b4d0b52ed7bd6fa2a", "1986053107", "053107"},
        {"0000000000000000000000000000000000000000000000000000000000000000", "f85da58266c373546563e54700c5917a532e60de7b73bd930cd3fd06a5aae7d0", "4166886786", "886786"},
        {"0101010101010101010101010101010101010101010101010101010101010101", "a75ed7f75e50a2eefb7168936b21b77ecd39507506e778b8cee2dd9e18228b8c", "2808010743", "010743"},
    };

    /** Private key, then Node's public key and fingerprint for it. */
    static final Map<String, String[]> NODE_FINGERPRINTS = new HashMap<>();

    static {
        NODE_FINGERPRINTS.put("e61ef9919cde45dd5f82166404bd08e38bceb5dfdfded0a34c8df7ed542214d1", new String[] {"6bc3822a2aa7f4e6981d6538692b3cdf3e6df9eea6ed269eb41d93c22757b75a", "b7a661f6ee2faf98"});
        NODE_FINGERPRINTS.put("4a3acbfdb163dec651dfa3194dece676d437029c62a408b4c5ea9114246e4893", new String[] {"31e0303fd6418d2f8c0e78b91f22e8caed0fbe48656dcf4767e4834f701b8f62", "9c5643f1fd1a1cad"});
        NODE_FINGERPRINTS.put("0000000000000000000000000000000000000000000000000000000000000000", new String[] {"2fe57da347cd62431528daac5fbb290730fff684afc4cfc2ed90995f58cb3b74", "233ced774423c7a7"});
        NODE_FINGERPRINTS.put("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", new String[] {"847c0d2c375234f365e660955187a3735a0f7613d1609d3a6a4d8c53aeaa5a22", "6095c95684574cd7"});
    }

    static byte[] seq(int start) {
        byte[] out = new byte[32];
        for (int i = 0; i < 32; i++) out[i] = (byte) (start + i);
        return out;
    }

    @Test
    public void matchesTheSpecVectorAsNodesCryptoComputesIt() {
        assertEquals(VECTOR_COMMIT, hex(Noise.pairingCommit(NC)));
        assertEquals(VECTOR_CODE, Noise.pairingCode(H, NC, NA));
    }

    @Test
    public void matchesNodesCodesIncludingUnsignedWordsAndPadding() {
        for (String[] row : NODE_CODES) {
            byte[] mac = Noise.hmac(H, "farbaek-pair-code/2".getBytes(java.nio.charset.StandardCharsets.US_ASCII), NC, hex(row[0]));
            assertEquals(row[0], row[1], hex(mac));
            long unsigned = ((mac[0] & 0xffL) << 24) | ((mac[1] & 0xffL) << 16) | ((mac[2] & 0xffL) << 8) | (mac[3] & 0xffL);
            assertEquals(row[0], Long.parseLong(row[2]), unsigned);
            assertEquals(row[0], row[3], Noise.pairingCode(H, NC, hex(row[0])));
        }
        // Read signed, the first word of the second row would be negative and give another code.
        assertTrue((int) Long.parseLong(NODE_CODES[1][2]) < 0);
    }

    @Test
    public void bindsTheNoncesInOrderAndTheHandshake() {
        // The caller's nonce first: swapped, it's another code (Node: 758767).
        assertEquals("758767", Noise.pairingCode(H, NA, NC));
        // The cacophony handshake's hash, as a real handshake gives it (Node: 250509).
        assertEquals("250509", Noise.pairingCode(hex(NoiseTest.HANDSHAKE_HASH), NC, NA));
        assertEquals("fd57ca5d327505e993fa4f3739766766f4b58aa0dfd66326b5f48d4d3117eb12", hex(Noise.pairingCommit(hex("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"))));
    }

    @Test
    public void refusesValuesOfTheWrongSize() {
        for (Runnable bad : new Runnable[] {
            () -> Noise.pairingCommit(new byte[31]),
            () -> Noise.pairingCommit(null),
            () -> Noise.pairingCode(new byte[31], NC, NA),
            () -> Noise.pairingCode(H, new byte[33], NA),
            () -> Noise.pairingCode(H, NC, new byte[0]),
        }) {
            try {
                bad.run();
                fail("Expected a refusal");
            } catch (IllegalArgumentException expected) {
                // Refused.
            }
        }
    }

    /**
     * What a device in the middle controls on the leg where it calls: the
     * handshake hash (through its last payload) and its own nonce, both fixed
     * before the answerer's nonce arrives. With those held still, the code is
     * spread by the answerer's nonce alone: 256 nonces give 256 codes.
     */
    @Test
    public void withTheCallersValuesFixedTheAnswerersNonceDecidesTheCode() {
        Set<String> codes = new HashSet<>();
        for (int k = 0; k < 256; k++) {
            byte[] nA = new byte[32];
            java.util.Arrays.fill(nA, (byte) k);
            codes.add(Noise.pairingCode(H, NC, nA));
        }
        assertEquals(256, codes.size());
        // And two fresh answerer nonces against the same commitment give different codes.
        assertNotEquals(Noise.pairingCode(H, NC, Noise.pairingNonce()), Noise.pairingCode(H, NC, Noise.pairingNonce()));
    }

    @Test
    public void bothSidesStepsReachTheVectorCode() throws Exception {
        PairingSteps caller = new PairingSteps(true, H, NC);
        PairingSteps answerer = new PairingSteps(false, H, NA);
        MeshMessage commit = caller.start();
        assertEquals("{\"t\":\"pair-commit\",\"commit\":\"" + VECTOR_COMMIT + "\"}", commit.toString());
        MeshMessage nonce = answerer.receive(roundTrip(commit));
        assertEquals("{\"t\":\"pair-nonce\",\"nonce\":\"" + hex(NA) + "\"}", nonce.toString());
        assertNull(answerer.code());
        MeshMessage reveal = caller.receive(roundTrip(nonce));
        assertEquals("{\"t\":\"pair-reveal\",\"nonce\":\"" + hex(NC) + "\"}", reveal.toString());
        assertEquals(VECTOR_CODE, caller.code());
        assertNull(answerer.receive(roundTrip(reveal)));
        assertEquals(VECTOR_CODE, answerer.code());
    }

    /** As the channel carries it: written, then read back by MessageSchema's checks. */
    static MeshMessage roundTrip(MeshMessage m) {
        return MeshMessage.parse(Json.parse(m.toString()));
    }

    @Test
    public void matchesNodesPublicKeysAndFingerprints() throws Exception {
        for (Map.Entry<String, String[]> e : NODE_FINGERPRINTS.entrySet()) {
            KeyPair k = Noise.keyPairFromPrivate(hex(e.getKey()));
            assertEquals(e.getValue()[0], hex(k.publicKey()));
            assertEquals(e.getValue()[1], Noise.fingerprint(k.publicKey()));
        }
    }
}
