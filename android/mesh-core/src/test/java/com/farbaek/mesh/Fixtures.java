package com.farbaek.mesh;

import static org.junit.Assert.assertEquals;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.Random;

/** Shared pieces for the transfer tests: Java devices, a source folder like mesh.test.ts makes, waiting. */
final class Fixtures {
    private Fixtures() {}

    /** Over two 4 MiB chunks, so a drop after the first leaves a resume point mid-file. */
    static final int BIG_BYTES = 9 * 1024 * 1024 + 123;

    interface Check {
        boolean ok() throws Exception;
    }

    static void waitFor(String what, long timeoutMs, Check check) throws Exception {
        long end = System.currentTimeMillis() + timeoutMs;
        while (!check.ok()) {
            if (System.currentTimeMillis() > end) throw new AssertionError("Timed out waiting for " + what);
            Thread.sleep(20);
        }
    }

    static MeshNode javaNode(final String name, File dataDir, OutgoingTransfer.PieceFilter filter) throws IOException {
        return javaNode(name, dataDir, filter, new MeshListener() {
            @Override
            public void onChanged() {}
        });
    }

    static MeshNode javaNode(final String name, File dataDir, OutgoingTransfer.PieceFilter filter, MeshListener listener) throws IOException {
        MeshNode.Options o = new MeshNode.Options();
        o.dataDir = dataDir;
        o.name = new MeshNode.NameSource() {
            @Override
            public String name() {
                return name;
            }
        };
        o.vault = new KeyVault.Memory();
        o.listener = listener;
        o.discovery = false;
        o.listenHost = "127.0.0.1";
        o.pieceFilter = filter;
        MeshNode node = new MeshNode(o);
        node.init();
        return node;
    }

    /** Pairs two Java devices over 127.0.0.1: a calls b, both confirm the same code, then both screens are closed. */
    static void pairJava(final MeshNode a, final MeshNode b) throws Exception {
        b.setVisible(true);
        a.pair("127.0.0.1", b.port());
        waitFor("b's code", 10_000, () -> b.snapshot().pairing != null && "confirming".equals(b.snapshot().pairing.state));
        assertEquals(a.snapshot().pairing.code, b.snapshot().pairing.code);
        a.confirmPairing(a.snapshot().pairing.id, true);
        b.confirmPairing(b.snapshot().pairing.id, true);
        waitFor("both paired", 10_000, () -> "paired".equals(a.snapshot().pairing.state) && "paired".equals(b.snapshot().pairing.state));
        a.dismissPairing();
        b.dismissPairing();
    }

    static void write(File file, byte[] bytes) throws IOException {
        File parent = file.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("Couldn't make " + parent);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
    }

    static void write(File file, String text) throws IOException {
        write(file, text.getBytes(StandardCharsets.UTF_8));
    }

    static byte[] read(File file) throws IOException {
        try (RandomAccessFile f = new RandomAccessFile(file, "r")) {
            byte[] b = new byte[(int) f.length()];
            f.readFully(b);
            return b;
        }
    }

    static String readText(File file) throws IOException {
        return new String(read(file), StandardCharsets.UTF_8);
    }

    static void append(File file, String text) throws IOException {
        try (FileOutputStream out = new FileOutputStream(file, true)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }

    /**
     * The folder mesh.test.ts sends: three text files, one empty, one binary
     * file over two chunks, and what must stay behind (.env, a dependency
     * folder, text that looks like a credential). Returns the binary file's bytes.
     */
    static byte[] sourceFolder(File root, long seed) throws IOException {
        byte[] big = new byte[BIG_BYTES];
        new Random(seed).nextBytes(big);
        write(new File(root, "README.md"), "# Harbour Lane\n");
        write(new File(root, "src/app.ts"), "export const answer = 42;\n");
        write(new File(root, "src/empty.txt"), "");
        write(new File(root, "assets/big.bin"), big);
        write(new File(root, ".env"), "TOKEN=nope\n");
        StringBuilder key = new StringBuilder("AKIA");
        for (int i = 0; i < 16; i++) key.append('Q');
        write(new File(root, "src/keys.ts"), "export const k = \"" + key + "\";\n");
        write(new File(root, "node_modules/left/index.js"), "module.exports = 1;\n");
        return big;
    }

    static int listCount(File folder) {
        String[] names = folder.list();
        return names == null ? 0 : names.length;
    }
}
