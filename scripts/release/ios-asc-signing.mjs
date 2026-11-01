#!/usr/bin/env node
// App Store signing for a CI run, through the App Store Connect API with the
// key the owner made for builds ("Farbaek iPhone builds", Admin). Used by
// .github/workflows/ios.yml on GitHub's macOS runner.
//
// Automatic signing archives with a development profile, which needs a
// registered device, and the team has none. An App Store profile needs no
// devices, so each run makes its own:
//
//   setup <dir>     revokes the certificates earlier runs made (named by their
//                   profiles, "Farbaek CI <certificate id>"), deletes those
//                   profiles, then makes an Apple Distribution certificate from
//                   <dir>/csr.pem and an App Store profile for the app. Writes
//                   <dir>/cert.cer, <dir>/profile.mobileprovision and
//                   <dir>/profile.json ({ name, uuid }).
//
// A run's certificate is left valid while Apple processes its upload, and is
// revoked by the next run, so the team holds at most one such certificate.
//
// Env: ASC_KEY_PATH (the .p8 file), ASC_KEY_ID, ASC_ISSUER, BUNDLE_ID.
// Nothing secret is printed: only ids, names and counts.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.appstoreconnect.apple.com/v1";
const PREFIX = "Farbaek CI ";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function token() {
  const keyId = (process.env.ASC_KEY_ID ?? "").trim();
  const issuer = (process.env.ASC_ISSUER ?? "").trim();
  const key = createPrivateKey(readFileSync(process.env.ASC_KEY_PATH ?? "", "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" }));
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(signature)}`;
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    // Apple's error titles and details name the problem; they never hold the key.
    let said = text.slice(0, 600);
    try {
      said = JSON.parse(text).errors.map((e) => `${e.title}: ${e.detail}`).join("; ");
    } catch {}
    throw new Error(`${method} ${path.split("?")[0]} answered ${res.status}: ${said}`);
  }
  return text ? JSON.parse(text) : null;
}

async function cleanEarlierRuns() {
  const profiles = (await call("GET", `/profiles?filter[profileType]=IOS_APP_STORE&limit=200`)).data ?? [];
  const ours = profiles.filter((p) => typeof p.attributes?.name === "string" && p.attributes.name.startsWith(PREFIX));
  for (const p of ours) {
    const certId = p.attributes.name.slice(PREFIX.length).trim();
    await call("DELETE", `/profiles/${p.id}`).catch((e) => console.log(`Couldn't delete profile ${p.id}: ${e.message}`));
    if (/^[A-Z0-9]{6,20}$/.test(certId)) {
      await call("DELETE", `/certificates/${certId}`).catch((e) => console.log(`Couldn't revoke certificate ${certId} (it may be gone already): ${e.message}`));
    }
  }
  console.log(`Removed ${ours.length} earlier run${ours.length === 1 ? "" : "s"}' profile and certificate.`);
}

async function setup(dir) {
  const bundle = (process.env.BUNDLE_ID ?? "").trim();
  if (!/^[A-Za-z0-9.-]+$/.test(bundle)) throw new Error("BUNDLE_ID isn't a bundle identifier.");
  await cleanEarlierRuns();

  const ids = (await call("GET", `/bundleIds?filter[identifier]=${encodeURIComponent(bundle)}&limit=20`)).data ?? [];
  const app = ids.find((b) => b.attributes?.identifier === bundle);
  if (!app) throw new Error(`The App ID ${bundle} isn't registered in this team.`);

  const csr = readFileSync(join(dir, "csr.pem"), "utf8");
  const cert = (await call("POST", "/certificates", { data: { type: "certificates", attributes: { certificateType: "DISTRIBUTION", csrContent: csr } } })).data;
  writeFileSync(join(dir, "cert.cer"), Buffer.from(cert.attributes.certificateContent, "base64"));
  console.log(`Made Apple Distribution certificate ${cert.id}, valid until ${cert.attributes.expirationDate}.`);

  const name = `${PREFIX}${cert.id}`;
  const profile = (
    await call("POST", "/profiles", {
      data: {
        type: "profiles",
        attributes: { name, profileType: "IOS_APP_STORE" },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: app.id } },
          certificates: { data: [{ type: "certificates", id: cert.id }] },
        },
      },
    })
  ).data;
  writeFileSync(join(dir, "profile.mobileprovision"), Buffer.from(profile.attributes.profileContent, "base64"));
  writeFileSync(join(dir, "profile.json"), JSON.stringify({ name, uuid: profile.attributes.uuid }));
  console.log(`Made App Store profile "${name}" (${profile.attributes.uuid}) for ${bundle}.`);
}

const [command, dir] = process.argv.slice(2);
if (command !== "setup" || !dir) {
  console.error("Usage: node ios-asc-signing.mjs setup <dir>");
  process.exit(2);
}
setup(dir).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
