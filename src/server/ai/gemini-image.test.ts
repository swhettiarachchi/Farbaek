import { describe, expect, it } from "vitest";
import { IMAGE_OUTPUT_TOKENS, createGeminiImageGenerator, findImage, usageOf, wasBlocked } from "./gemini-image";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeFetch(...answers: Response[]) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const doFetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")), headers: init?.headers as Record<string, string> });
    return answers.shift() ?? json({}, 500);
  }) as typeof fetch;
  return { doFetch, calls };
}

describe("Gemini images (ADR 0109)", () => {
  it("asks generateContent for an image, with the key in a header, and reads the bytes and usage", async () => {
    const { doFetch, calls } = fakeFetch(json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG } }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 1120 } }));
    const gen = createGeminiImageGenerator({ apiKey: "test-key", fetch: doFetch });
    const r = await gen.generate({ prompt: "A bakery storefront at dawn", aspectRatio: "16:9" });
    expect(r).toMatchObject({ ok: true, mimeType: "image/png", usage: { model: "gemini-3.1-flash-lite-image", inputTokens: 12, outputTokens: 1120 } });
    expect(r.ok && Buffer.from(r.bytes).toString("base64")).toBe(PNG);
    expect(calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent");
    expect(calls[0]!.url).not.toContain("test-key");
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("test-key");
    expect(calls[0]!.body).toMatchObject({ generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } } });
  });

  it("asks the Interactions API once when generateContent isn't accepted for the model", async () => {
    const { doFetch, calls } = fakeFetch(json({ error: { message: "responseModalities is not supported" } }, 400), json({ id: "i1", status: "completed", steps: [{ type: "model_output", content: [{ type: "image", mime_type: "image/png", data: PNG }] }], usage: { total_input_tokens: 9, total_output_tokens: 1120 } }));
    const r = await createGeminiImageGenerator({ apiKey: "k", fetch: doFetch }).generate({ prompt: "x", aspectRatio: "1:1" });
    expect(r).toMatchObject({ ok: true, usage: { inputTokens: 9, outputTokens: 1120 } });
    expect(calls.map((c) => c.url.split("/v1beta/")[1])).toEqual(["models/gemini-3.1-flash-lite-image:generateContent", "interactions"]);
    expect(calls[1]!.body).toEqual({ model: "gemini-3.1-flash-lite-image", input: "x", response_format: { type: "image", mime_type: "image/png", aspect_ratio: "1:1", image_size: "1K" } });
  });

  it("says REFUSED for a safety block, BUSY for 429 and 5xx, and INCOMPLETE when no image came back", async () => {
    const blocked = fakeFetch(json({ promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: 5 } }));
    expect(await createGeminiImageGenerator({ apiKey: "k", fetch: blocked.doFetch }).generate({ prompt: "x", aspectRatio: "1:1" })).toMatchObject({ ok: false, failure: "REFUSED" });
    const busy = fakeFetch(json({}, 429));
    expect(await createGeminiImageGenerator({ apiKey: "k", fetch: busy.doFetch }).generate({ prompt: "x", aspectRatio: "1:1" })).toEqual({ ok: false, failure: "PROVIDER_BUSY", usage: null });
    const empty = fakeFetch(json({ candidates: [{ content: { parts: [{ text: "I can't draw that." }] }, finishReason: "STOP" }] }));
    expect(await createGeminiImageGenerator({ apiKey: "k", fetch: empty.doFetch }).generate({ prompt: "x", aspectRatio: "1:1" })).toMatchObject({ ok: false, failure: "INCOMPLETE" });
  });

  it("never meters an image below its documented price, and reads blocks in either API's words", () => {
    expect(usageOf({}, "m")).toEqual({ model: "m", inputTokens: 0, outputTokens: IMAGE_OUTPUT_TOKENS });
    expect(usageOf({ usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1290 } }, "m").outputTokens).toBe(1290);
    expect(wasBlocked({ candidates: [{ finishReason: "IMAGE_SAFETY" }] })).toBe(true);
    expect(wasBlocked({ errors: [{ code: "safety", message: "Blocked" }] })).toBe(true);
    expect(wasBlocked({ candidates: [{ finishReason: "STOP" }] })).toBe(false);
    expect(findImage({ output_image: { data: PNG, mime_type: "image/jpeg" } })).toEqual({ data: PNG, mimeType: "image/jpeg" });
    expect(findImage({ candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/webp", data: PNG } }] } }] })).toEqual({ data: PNG, mimeType: "image/webp" });
  });
});
