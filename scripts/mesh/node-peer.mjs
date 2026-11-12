// A desktop-agent Mesh device for the Android interop tests (android/mesh-core, ADR 0193).
//
// It bundles the TypeScript Mesh (src/agent-runtime/mesh, src/core/mesh) with the
// repository's own esbuild, runs one MeshNode on 127.0.0.1 with discovery off, and
// answers one JSON command per line on stdin with one JSON line on stdout:
//
//   {"id":1,"cmd":"visible","args":{"on":true}}  ->  {"id":1,"ok":true,"result":{"port":51234}}
//
// The Java test (MeshInteropTest) starts it with ProcessBuilder. Nothing in the app uses it.
//
//   node scripts/mesh/node-peer.mjs <device name> <data folder>
//
// FARBAEK_MESH_SOURCE bundles the TypeScript from another checkout instead, such as a
// worktree under .claude/worktrees: its imports still find this repository's node_modules.
import { build } from "esbuild";
import { promises as fs, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = process.env.FARBAEK_MESH_SOURCE
  ? path.resolve(process.env.FARBAEK_MESH_SOURCE)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [name, dataDir] = process.argv.slice(2);
if (!name || !dataDir) {
  console.error("Usage: node scripts/mesh/node-peer.mjs <device name> <data folder>");
  process.exit(2);
}

const work = await fs.mkdtemp(path.join(os.tmpdir(), "farbaek-mesh-peer-"));
process.on("exit", () => rmSync(work, { recursive: true, force: true }));
const bundle = path.join(work, "mesh.mjs");
await build({
  stdin: {
    contents: [
      'export { MeshNode } from "@/agent-runtime/mesh/node";',
      'export { SecureChannel } from "@/agent-runtime/mesh/channel";',
      'export { Discovery } from "@/agent-runtime/mesh/discovery";',
      'export { packFolder } from "@/agent-runtime/mesh/pack";',
      'export { manifestDigest } from "@/core/mesh/capsule";',
    ].join("\n"),
    resolveDir: root,
    loader: "ts",
    sourcefile: "mesh-peer-entry.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: bundle,
  tsconfig: path.join(root, "tsconfig.json"),
  logLevel: "warning",
  banner: { js: "import { createRequire as __peerRequire } from 'node:module'; const require = __peerRequire(import.meta.url);" },
});
const mesh = await import(pathToFileURL(bundle).href);

let stored = null;
const vault = { get: async () => stored, set: async (value) => void (stored = value) };
await fs.mkdir(dataDir, { recursive: true });
const node = new mesh.MeshNode({ dataDir, name: () => name, vault, discovery: false, listenHost: "127.0.0.1", onUpdate: () => undefined });
await node.init();

// Test seams, as mesh.test.ts makes them: a changed chunk on its way out.
const realSend = mesh.SecureChannel.prototype.send;
let discovery = null;

const commands = {
  hello: () => ({ fingerprint: node.fingerprint, name }),
  visible: async ({ on }) => {
    await node.setVisible(on);
    return { port: node.snapshot().visible?.port ?? 0 };
  },
  pair: ({ address, port }) => node.pair(address, port),
  // Pairing v2 may confirm by the pairing's id, so a late tap can't confirm another pairing.
  confirm: ({ ok }) => (node.confirmPairing.length >= 2 ? node.confirmPairing(node.snapshot().pairing?.id, ok) : node.confirmPairing(ok)),
  // Dismissing may also go by id; with nothing on screen there's nothing to dismiss.
  dismissPairing: () => {
    if (node.dismissPairing.length === 0) return node.dismissPairing();
    const id = node.snapshot().pairing?.id;
    return id ? node.dismissPairing(id) : undefined;
  },
  snapshot: () => node.snapshot(),
  prepare: ({ root: folder }) => node.prepare(folder),
  // A manifest whose first file claims another path, digest recomputed, as the "escape the folder" test does.
  prepareEvil: async ({ root: folder, path: evilPath }) => {
    const packed = await mesh.packFolder(folder);
    const manifest = { ...packed.manifest, files: packed.manifest.files.map((f, i) => (i === 0 ? { ...f, path: evilPath } : f)) };
    const id = `evil-${Date.now()}`;
    node.prepared.set(id, { ...packed, manifest, digest: mesh.manifestDigest(manifest) });
    return { id };
  },
  send: ({ preparedId, fingerprint, address, port }) => ({ id: node.send(preparedId, fingerprint, { address, port }) }),
  accept: ({ id, parent, earlier }) => node.accept(id, parent, earlier ?? undefined),
  decline: ({ id }) => node.decline(id),
  cancel: ({ id }) => node.cancel(id),
  resume: ({ id }) => node.resume(id),
  dismiss: ({ id }) => node.dismiss(id),
  forget: ({ fingerprint }) => node.forget(fingerprint),
  // Flips one byte of the first large piece of file data this device sends, once.
  tamper: () => {
    let done = false;
    mesh.SecureChannel.prototype.send = function (message, body) {
      if (!done && message.t === "data" && body && body.length > 30_000) {
        done = true;
        const changed = Buffer.from(body);
        changed[10] ^= 0xff;
        return realSend.call(this, message, changed);
      }
      return realSend.call(this, message, body);
    };
  },
  restore: () => {
    mesh.SecureChannel.prototype.send = realSend;
  },
  discoveryStart: async ({ group, port, fingerprint, tcpPort }) => {
    discovery = new mesh.Discovery({ group, port, self: () => ({ name, fingerprint, port: tcpPort }), onChange: () => undefined });
    await discovery.start();
  },
  discoveryDevices: () => discovery?.devices() ?? [],
  discoveryStop: () => {
    discovery?.stop();
    discovery = null;
  },
  exit: async () => {
    discovery?.stop();
    await node.close();
    setTimeout(() => process.exit(0), 50);
  },
};

const write = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", async (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    write({ id: null, ok: false, error: "The command wasn't JSON." });
    return;
  }
  const command = commands[request.cmd];
  if (!command) {
    write({ id: request.id, ok: false, error: `Unknown command ${request.cmd}` });
    return;
  }
  try {
    const result = await command(request.args ?? {});
    write({ id: request.id, ok: true, result: result ?? null });
  } catch (error) {
    write({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
lines.on("close", () => {
  void node.close().finally(() => process.exit(0));
});
process.on("unhandledRejection", (error) => console.error("unhandled", error));

write({ ready: true, fingerprint: node.fingerprint });
