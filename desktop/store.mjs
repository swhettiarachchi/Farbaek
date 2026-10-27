// Builds Farbaek Agent's Microsoft Store package (ADR 0098): an unsigned
// .appx with the identity Partner Center reserved; the Store signs it when
// it's published, so people install it with no warning. Run: pnpm agent:store
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("node", ["desktop/build.mjs", "--production"]);
run("pnpm", [
  "exec", "electron-builder", "--win", "appx", "--x64",
  "--config", "desktop/electron-builder.yml", "--publish", "never",
  `-c.appx.identityName=${id.identityName}`,
  `-c.appx.publisher=${id.publisher}`,
  `-c.appx.publisherDisplayName=${id.publisherDisplayName}`,
]);
