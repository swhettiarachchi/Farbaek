// Builds Farbaek Agent's Microsoft Store package (ADR 0098): an unsigned
// .appx with the identity Partner Center reserved; the Store signs it when
// it's published, so people install it with no warning. Run: pnpm agent:store
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = JSON.parse(readFileSync(path.join(root, "desktop", "store-identity.json"), "utf8"));

const problems = [];
if (!/^[A-Za-z0-9][A-Za-z0-9.-]{2,49}$/.test(id.identityName ?? "")) problems.push("identityName (Package/Identity/Name)");
if (!/^CN=[0-9A-Fa-f-]{36}$/.test(id.publisher ?? "")) problems.push("publisher (Package/Identity/Publisher, CN=…)");
if (!(typeof id.publisherDisplayName === "string" && id.publisherDisplayName.trim())) problems.push("publisherDisplayName (Package/Properties/PublisherDisplayName)");
if (problems.length > 0) {
  console.error(`The Store package needs Farbaek Agent's identity from Partner Center first. In desktop/store-identity.json, set: ${problems.join("; ")}. They're under the app's Product management > Product identity.`);
  process.exit(1);
}

// On Windows, makeappx.exe won't start from anywhere under AppData, where electron-builder caches it
// ("side-by-side configuration is incorrect": its helper manifests aren't found), but does from the home
// folder. So the cached Windows SDK tools are copied to %USERPROFILE%.farbaek-buildappxkit, and
// electron-builder is pointed at that.
const env = { ...process.env };
if (process.platform === "win32" && !env.ELECTRON_BUILDER_WINDOWS_KITS_PATH && env.LOCALAPPDATA && env.USERPROFILE) {
  const cache = path.join(env.LOCALAPPDATA, "electron-builder", "Cache", "win-codesign@1.1.0");
  const bundle = existsSync(cache) ? readdirSync(cache).find((d) => d.startsWith("windows-kits-bundle-") && statSync(path.join(cache, d)).isDirectory()) : undefined;
  if (bundle) {
    const plain = path.join(env.USERPROFILE, ".farbaek-build", "appxkit");
    cpSync(path.join(cache, bundle, "x64"), plain, { recursive: true });
    env.ELECTRON_BUILDER_WINDOWS_KITS_PATH = plain;
  } else {
    console.log("The Windows SDK tools aren't downloaded yet. If packaging fails with 'spawn UNKNOWN', run pnpm agent:store again: the tools are then in place.");
  }
}

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("node", ["desktop/build.mjs", "--production"]);
run("pnpm", [
  "exec", "electron-builder", "--win", "appx", "--x64",
  "--config", "desktop/electron-builder.yml", "--publish", "never",
  `-c.appx.identityName=${id.identityName}`,
  `-c.appx.publisher=${id.publisher}`,
  `-c.appx.publisherDisplayName=${id.publisherDisplayName}`,
  // The Windows 10.0.26100 SDK tools (checksums pinned by electron-builder): the 2019 bundle's
  // makeappx.exe won't start on current Windows ("side-by-side configuration is incorrect").
  "-c.toolsets.winCodeSign=1.1.0",
]);
