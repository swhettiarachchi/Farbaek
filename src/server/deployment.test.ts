import { describe, expect, it } from "vitest";
import { deploymentInfo, publicBuildId } from "./deployment";

describe("deploymentInfo", () => {
  it("reads Farbaek's own deploy on the VPS", () => {
    expect(deploymentInfo({ FARBAEK_COMMIT: "abc123", FARBAEK_ENVIRONMENT: "production", FARBAEK_REGION: "Hostinger UK" })).toEqual({
      host: "vps",
      commit: "abc123",
      environment: "production",
      region: "Hostinger UK",
    });
  });

  it("ignores blank values and other hosts' names", () => {
    expect(deploymentInfo({ FARBAEK_COMMIT: "  ", FARBAEK_ENVIRONMENT: "production", RAILWAY_GIT_COMMIT_SHA: "def456" })).toEqual({
      host: "vps",
      commit: null,
      environment: "production",
      region: null,
    });
  });

  it("knows nothing locally", () => {
    expect(deploymentInfo({ NODE_ENV: "development" })).toEqual({ host: null, commit: null, environment: null, region: null });
  });

  it("shows the public an id of the build, never the commit", () => {
    const commit = "0b87d6c17478a1b2c3d4e5f60718293a4b5c6d7e";
    const id = publicBuildId(commit)!;
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(commit).not.toContain(id);
    expect(publicBuildId(commit)).toBe(id);
    expect(publicBuildId(null)).toBeNull();
  });
});
