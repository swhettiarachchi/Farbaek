package com.farbaek.mesh;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/** The trusted devices file: replaced whole, never deleted first, and one bad entry doesn't lose the others. */
public class TrustStoreTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private static String entry(KeyPair k, String name) {
        return "{\"fingerprint\":\"" + Noise.fingerprint(k.publicKey()) + "\",\"name\":\"" + name + "\",\"publicKey\":\"" + Text.hex(k.publicKey())
                + "\",\"pairedAt\":\"2026-11-12T09:30:00.000Z\",\"via\":\"nearby\"}";
    }

    @Test
    public void skipsOnlyTheEntryThatIsntInTheShape() throws Exception {
        KeyPair a = Noise.generateKeyPair();
        KeyPair b = Noise.generateKeyPair();
        File file = new File(tmp.getRoot(), "mesh-devices.json");
        String bad = "{\"fingerprint\":\"not hex\",\"name\":\"Broken\",\"publicKey\":\"00\",\"pairedAt\":\"x\"}";
        Fixtures.write(file, "[" + entry(a, "Desk") + "," + bad + ",\"nonsense\",{\"via\":\"elsewhere\"}," + entry(b, "Laptop") + "]");
        TrustStore store = new TrustStore(file);
        store.load();
        assertEquals(2, store.list().size());
        assertNotNull(store.find(a.publicKey()));
        assertEquals("Laptop", store.find(b.publicKey()).name);
    }

    @Test
    public void aFileThatIsntAListHoldsNoDevices() throws Exception {
        File file = new File(tmp.getRoot(), "mesh-devices.json");
        for (String text : new String[] {"{}", "not json", ""}) {
            Fixtures.write(file, text);
            TrustStore store = new TrustStore(file);
            store.load();
            assertEquals(text, 0, store.list().size());
        }
    }

    @Test
    public void savesByRenamingANewFileOverTheOld() throws Exception {
        File file = new File(tmp.getRoot(), "data/mesh-devices.json");
        TrustStore store = new TrustStore(file);
        store.load();
        KeyPair a = Noise.generateKeyPair();
        KeyPair b = Noise.generateKeyPair();
        store.add(a.publicKey(), "Desk", "nearby");
        // The second save replaces an existing file: on Windows, through the careful fallback.
        store.add(b.publicKey(), "Laptop", "nearby");
        store.forget(Noise.fingerprint(a.publicKey()));
        TrustStore again = new TrustStore(file);
        again.load();
        assertEquals(1, again.list().size());
        assertEquals("Laptop", again.list().get(0).name);
        assertFalse(new File(file.getPath() + ".tmp").exists());
        assertFalse(new File(file.getPath() + ".bak").exists());
    }

    @Test
    public void readsTheBackupWhenASaveStoppedBetweenItsRenames() throws Exception {
        KeyPair a = Noise.generateKeyPair();
        File file = new File(tmp.getRoot(), "mesh-devices.json");
        Fixtures.write(AtomicFile.backup(file), "[" + entry(a, "Desk") + "]");
        TrustStore store = new TrustStore(file);
        store.load();
        assertEquals(1, store.list().size());
        // The next save puts the file back in place.
        store.add(Noise.generateKeyPair().publicKey(), "Laptop", "nearby");
        assertTrue(file.isFile());
        assertFalse(AtomicFile.backup(file).exists());
        TrustStore again = new TrustStore(file);
        again.load();
        assertEquals(2, again.list().size());
    }
}
