// Makes the test records for src/server/billing/apple (ADR 0112): a stand-in certificate chain shaped like
// Apple's (a root, an intermediate with Apple's WWDR marker, a signing certificate with the App Store's
// marker), and records signed with it. The keys are made in a temporary folder and deleted at the end:
// only the public certificates and the signed records are kept, in
// src/server/billing/apple/fixtures.json. Tests pin the stand-in root, never Apple's.
// Needs OpenSSL (Git for Windows has it). Run: node scripts/apple-jws-fixtures.mjs
import { execFileSync } from "node:child_process";
import { X509Certificate, createPrivateKey, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "apple-jws-"));
const f = (name) => join(dir, name);
const ssl = (...args) => execFileSync("openssl", args, { stdio: ["ignore", "ignore", "pipe"] });
const days = "10950";

try {
  for (const k of ["root", "inter", "leaf"]) ssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", f(`${k}.key`));
  writeFileSync(f("inter.ext"), "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n1.2.840.113635.100.6.2.1=ASN1:NULL\n");
  writeFileSync(f("leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n1.2.840.113635.100.6.11.1=ASN1:NULL\n");
  ssl("req", "-new", "-x509", "-key", f("root.key"), "-days", days, "-subj", "/CN=Test Root (not Apple)", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign", "-out", f("root.pem"));
  ssl("req", "-new", "-key", f("inter.key"), "-subj", "/CN=Test Intermediate (not Apple)", "-out", f("inter.csr"));
  ssl("x509", "-req", "-in", f("inter.csr"), "-CA", f("root.pem"), "-CAkey", f("root.key"), "-CAcreateserial", "-days", days, "-extfile", f("inter.ext"), "-out", f("inter.pem"));
  ssl("req", "-new", "-key", f("leaf.key"), "-subj", "/CN=Test App Store signing (not Apple)", "-out", f("leaf.csr"));
  ssl("x509", "-req", "-in", f("leaf.csr"), "-CA", f("inter.pem"), "-CAkey", f("inter.key"), "-CAcreateserial", "-days", days, "-extfile", f("leaf.ext"), "-out", f("leaf.pem"));

  const der = (name) => new X509Certificate(readFileSync(f(name))).raw.toString("base64");
  const x5c = [der("leaf.pem"), der("inter.pem"), der("root.pem")];
  const leafKey = createPrivateKey(readFileSync(f("leaf.key")));
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const jws = (payload) => {
    const head = `${b64({ alg: "ES256", x5c })}.${b64(payload)}`;
    return `${head}.${sign("sha256", Buffer.from(head), { key: leafKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  };

  // After the certificates were made, so they were valid when these were signed.
  const signedDate = Date.now() + 1_000;
  const org = "00000000-0000-4000-8000-0000000a99e1";
  const transaction = {
    transactionId: "2000000999000002",
    originalTransactionId: "2000000999000001",
    bundleId: "com.farbaek.app",
    productId: "com.farbaek.app.starter.monthly",
    purchaseDate: signedDate - 60_000,
    originalPurchaseDate: signedDate - 60_000,
    expiresDate: signedDate + 30 * 86_400_000,
    type: "Auto-Renewable Subscription",
    appAccountToken: org,
    environment: "Sandbox",
    signedDate,
  };
  const renewal = { originalTransactionId: transaction.originalTransactionId, autoRenewProductId: transaction.productId, productId: transaction.productId, autoRenewStatus: 1, environment: "Sandbox", signedDate };
  const notification = {
    notificationType: "SUBSCRIBED",
    subtype: "INITIAL_BUY",
    notificationUUID: "9b9f6f8e-3b7e-4c47-9a36-0d1c2f3e4a5b",
    version: "2.0",
    signedDate,
    data: { bundleId: "com.farbaek.app", environment: "Sandbox", signedTransactionInfo: jws(transaction), signedRenewalInfo: jws(renewal), status: 1 },
  };

  writeFileSync(
    "src/server/billing/apple/fixtures.json",
    `${JSON.stringify(
      {
        note: "Made by scripts/apple-jws-fixtures.mjs with a stand-in chain, not Apple's. Its keys were deleted; tests pin rootSha256.",
        rootSha256: new X509Certificate(readFileSync(f("root.pem"))).fingerprint256,
        org,
        signedDate,
        transaction: jws(transaction),
        renewal: jws(renewal),
        notification: jws(notification),
        // The same transaction signed by the right key but presented with a different root: must be refused.
        foreignRoot: (() => {
          const other = [...x5c];
          other[2] = der("leaf.pem");
          const head = `${b64({ alg: "ES256", x5c: other })}.${b64(transaction)}`;
          return `${head}.${sign("sha256", Buffer.from(head), { key: leafKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
        })(),
      },
      null,
      2,
    )}\n`,
  );
  console.log("Wrote src/server/billing/apple/fixtures.json");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
