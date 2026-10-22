import { describe, expect, it } from "vitest";
import { deploymentInfo } from "./deployment";

describe("deploymentInfo", () => {
  it("reads Farbaek's own deploy on the VPS", () => {
    expect(deploymentInfo({ FARBAEK_COMMIT: "abc123", FARBAEK_ENVIRONMENT: "production", FARBAEK_REGION: "Hostinger UK" })).toEqual({
      host: "vps",
      commit: "abc123",
      environment: "production",
      region: "Hostinger UK",
    });
  });

  it("still reads a Railway deploy", () => {
    expect(deploymentInfo({ RAILWAY_GIT_COMMIT_SHA: "def456", RAILWAY_ENVIRONMENT_NAME: "production", RAILWAY_REPLICA_REGION: "europe-west4" })).toEqual({
      host: "railway",
      commit: "def456",
      environment: "production",
      region: "europe-west4",
    });
  });

  it("prefers Farbaek's names when both are present, and ignores blank values", () => {
    const info = deploymentInfo({ FARBAEK_COMMIT: "  ", FARBAEK_ENVIRONMENT: "production", RAILWAY_GIT_COMMIT_SHA: "def456" });
    expect(info.host).toBe("vps");
    expect(info.commit).toBe("def456");
  });

  it("knows nothing locally", () => {
    expect(deploymentInfo({ NODE_ENV: "development" })).toEqual({ host: null, commit: null, environment: null, region: null });
  });
});
