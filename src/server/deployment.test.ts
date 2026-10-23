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
});
