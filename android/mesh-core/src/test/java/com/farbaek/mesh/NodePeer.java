package com.farbaek.mesh;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.Closeable;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Assume;

/**
 * The desktop agent's own Mesh, in Node, driven from a Java test: starts
 * scripts/mesh/node-peer.mjs and exchanges one JSON line per command. Skips
 * the test (Assume, reported as skipped) when Node or the repository's
 * node_modules aren't there; never passes without running.
 */
final class NodePeer implements Closeable {
    private final Process process;
    private final BufferedWriter stdin;
    private final Map<Long, CompletableFuture<Map<String, Object>>> pending = new ConcurrentHashMap<>();
    private final CompletableFuture<Map<String, Object>> ready = new CompletableFuture<>();
    private final AtomicLong ids = new AtomicLong();
    final File log;
    final String fingerprint;

    static File repo() {
        String path = System.getProperty("farbaek.repo");
        Assume.assumeTrue("The farbaek.repo system property isn't set, so the Node interop test can't find the desktop agent's Mesh.", path != null);
        File repo = new File(path);
        Assume.assumeTrue("No node-peer script at " + repo, new File(repo, "scripts/mesh/node-peer.mjs").isFile());
        Assume.assumeTrue("No desktop agent Mesh at " + source(), new File(source(), "src/agent-runtime/mesh/node.ts").isFile());
        Assume.assumeTrue("The repository's node_modules (esbuild) aren't installed, so the TypeScript Mesh can't be bundled.", new File(repo, "node_modules/esbuild/package.json").isFile());
        return repo;
    }

    /**
     * Where the TypeScript Mesh is bundled from: the repository, or the
     * checkout FARBAEK_MESH_SOURCE names (a worktree inside it, whose imports
     * still resolve to the repository's node_modules). node-peer.mjs reads the
     * same variable, which the Node process inherits.
     */
    static File source() {
        String override = System.getenv("FARBAEK_MESH_SOURCE");
        if (override != null && !override.isEmpty()) return new File(override);
        return new File(System.getProperty("farbaek.repo", "."));
    }

    /** Whether that TypeScript makes pairing v2's messages at all, for a plain failure message when it doesn't yet. */
    static boolean speaksPairingV2() {
        File[] dirs = {new File(source(), "src/agent-runtime/mesh"), new File(source(), "src/core/mesh")};
        for (File dir : dirs) {
            File[] files = dir.listFiles();
            if (files == null) continue;
            for (File f : files) {
                if (!f.getName().endsWith(".ts") || f.getName().endsWith(".test.ts")) continue;
                try {
                    if (new String(java.nio.file.Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8).contains("pair-commit")) return true;
                } catch (IOException ignored) {
                    // Not readable: look at the next.
                }
            }
        }
        return false;
    }

    static String node() {
        String exe = System.getProperty("farbaek.node", "node");
        try {
            Process p = new ProcessBuilder(exe, "--version").redirectErrorStream(true).start();
            BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8));
            String version = r.readLine();
            boolean exited = p.waitFor(30, TimeUnit.SECONDS);
            Assume.assumeTrue("Node didn't answer --version, so the interop test can't run.", exited && p.exitValue() == 0 && version != null && version.startsWith("v"));
            return exe;
        } catch (IOException e) {
            Assume.assumeTrue("Node isn't installed (" + e.getMessage() + "), so the interop test can't run.", false);
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            Assume.assumeTrue("Interrupted while looking for Node.", false);
            return null;
        }
    }

    NodePeer(String name, File dataDir, File log) throws Exception {
        File repo = repo();
        String node = node();
        this.log = log;
        ProcessBuilder pb = new ProcessBuilder(node, new File(repo, "scripts/mesh/node-peer.mjs").getPath(), name, dataDir.getPath());
        pb.directory(repo);
        pb.redirectError(log);
        process = pb.start();
        stdin = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
        Thread reader = new Thread(new Runnable() {
            @Override
            public void run() {
                read();
            }
        }, "node-peer-stdout");
        reader.setDaemon(true);
        reader.start();
        Map<String, Object> hello;
        try {
            hello = ready.get(120, TimeUnit.SECONDS);
        } catch (Exception e) {
            process.destroyForcibly();
            throw new AssertionError("The Node peer didn't start: " + tail(), e);
        }
        fingerprint = (String) hello.get("fingerprint");
    }

    private void read() {
        try (BufferedReader r = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                Map<String, Object> o;
                try {
                    o = Json.asObject(Json.parse(line));
                } catch (Json.JsonException e) {
                    continue;
                }
                if (o == null) continue;
                if (Boolean.TRUE.equals(o.get("ready"))) {
                    ready.complete(o);
                    continue;
                }
                Object id = o.get("id");
                if (id instanceof Long) {
                    CompletableFuture<Map<String, Object>> f = pending.remove(id);
                    if (f != null) f.complete(o);
                }
            }
        } catch (IOException ignored) {
            // The process ended.
        }
        IOException gone = new IOException("The Node peer exited. " + tail());
        ready.completeExceptionally(gone);
        for (CompletableFuture<Map<String, Object>> f : pending.values()) f.completeExceptionally(gone);
    }

    /** Runs one command and returns its result; fails the test with Node's own error when it fails. */
    Object call(String cmd, Object... args) throws Exception {
        Map<String, Object> a = new LinkedHashMap<>();
        for (int i = 0; i < args.length; i += 2) {
            Object v = args[i + 1];
            a.put((String) args[i], v instanceof Integer ? Long.valueOf((Integer) v) : v);
        }
        long id = ids.incrementAndGet();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("id", id);
        request.put("cmd", cmd);
        request.put("args", a);
        CompletableFuture<Map<String, Object>> f = new CompletableFuture<>();
        pending.put(id, f);
        synchronized (stdin) {
            stdin.write(Json.stringify(request));
            stdin.write('\n');
            stdin.flush();
        }
        Map<String, Object> answer = f.get(60, TimeUnit.SECONDS);
        if (!Boolean.TRUE.equals(answer.get("ok"))) throw new AssertionError("Node's " + cmd + " failed: " + answer.get("error"));
        return answer.get("result");
    }

    Map<String, Object> snapshot() throws Exception {
        return Json.asObject(call("snapshot"));
    }

    /** The Node transfer with this id, or null. */
    Map<String, Object> transfer(String id) throws Exception {
        List<Object> list = Json.asArray(snapshot().get("transfers"));
        for (Object item : list) {
            Map<String, Object> t = Json.asObject(item);
            if (id.equals(t.get("id"))) return t;
        }
        return null;
    }

    String state(String id) throws Exception {
        Map<String, Object> t = transfer(id);
        return t == null ? null : (String) t.get("state");
    }

    /** The last lines Node wrote to stderr, for failure messages. */
    String tail() {
        try (RandomAccessFile f = new RandomAccessFile(log, "r")) {
            long start = Math.max(0, f.length() - 2000);
            byte[] b = new byte[(int) (f.length() - start)];
            f.seek(start);
            f.readFully(b);
            return "Node's log: " + new String(b, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "(no log)";
        }
    }

    @Override
    public void close() {
        try {
            call("exit");
        } catch (Exception | AssertionError ignored) {
            // It may already have gone.
        }
        try {
            if (!process.waitFor(10, TimeUnit.SECONDS)) process.destroyForcibly();
        } catch (InterruptedException e) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
        }
    }
}
