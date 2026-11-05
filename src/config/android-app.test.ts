import { describe, expect, it } from "vitest";
import { GET } from "@/app/.well-known/assetlinks.json/route";
import { readFileSync } from "node:fs";
import path from "node:path";
import manifest from "@/app/manifest";
import { ANDROID_APP, assetLinks } from "./android-app";

describe("the Android app's asset links", () => {
  it("claims no app until a real signing certificate is named", async () => {
    expect(assetLinks({ packageName: "com.farbaek.app", sha256CertFingerprints: [] })).toEqual([]);
    const res = GET();
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual(assetLinks());
  });

  it("names the package and its fingerprints in Google's format", () => {
    const fp = Array.from({ length: 32 }, (_, i) => i.toString(16).toUpperCase().padStart(2, "0")).join(":");
    expect(assetLinks({ packageName: "com.farbaek.app", sha256CertFingerprints: [fp] })).toEqual([
      { relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "com.farbaek.app", sha256_cert_fingerprints: [fp] } },
    ]);
  });

  it("only ever holds well-formed SHA-256 fingerprints for com.farbaek.app", () => {
    expect(ANDROID_APP.packageName).toBe("com.farbaek.app");
    for (const fp of ANDROID_APP.sha256CertFingerprints) expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });
});

describe("sharing to Farbaek from another app (ADR 0171)", () => {
  const res = path.join(process.cwd(), "android/app/src/main/res");
  const strings = readFileSync(path.join(res, "values/strings.xml"), "utf8");
  const shell = JSON.parse(strings.match(/name="share_target"[^>]*>([^<]+)</)![1]!.replaceAll('\\"', '"'));

  it("goes to the same place from the Android app and an installed web app", () => {
    const web = manifest().share_target!;
    expect(shell.action).toBe(`https://www.farbaek.com${web.action}`);
    expect(shell.method).toBe(web.method);
    expect(shell.params).toEqual(web.params);
  });

  it("declares what Chrome needs to show the splash", () => {
    const app = readFileSync(path.join(process.cwd(), "android/app/src/main/AndroidManifest.xml"), "utf8");
    expect(app).toContain("android.support.customtabs.trusted.METADATA_SHARE_TARGET");
    expect(app).toContain("android.intent.action.SEND");
    expect(app).toContain("android.support.customtabs.trusted.FILE_PROVIDER_AUTHORITY");
    expect(readFileSync(path.join(res, "xml/filepaths.xml"), "utf8")).toContain('path="twa_splash/"');
  });
});
