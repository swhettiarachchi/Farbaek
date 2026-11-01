import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logProviderError } from "./anthropic";

afterEach(() => vi.restoreAllMocks());

describe("logging a failed Claude call", () => {
  it("records the status, Anthropic's error type and the request id, and never a key", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Anthropic.BadRequestError(
      400,
      { type: "error", error: { type: "invalid_request_error", message: "bad model sk-ant-api03-SECRETSECRETSECRET" } },
      "400 bad model sk-ant-api03-SECRETSECRETSECRET",
      new Headers({ "request-id": "req_123" }),
    );
    logProviderError("contract_draft", "claude-sonnet-5-5", error);
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(line).toMatchObject({ level: "error", event: "anthropic.call_failed", call: "contract_draft", model: "claude-sonnet-5-5", status: 400, type: "invalid_request_error", requestId: "req_123" });
    expect(JSON.stringify(line)).not.toContain("SECRETSECRET");
  });

  it("names errors that aren't from the API", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logProviderError("change_proposal", "claude-opus-5-5", new TypeError("fetch failed"));
    expect(JSON.parse(String(spy.mock.calls[0]?.[0]))).toMatchObject({ status: null, type: "TypeError", requestId: null, message: null });
  });
});
