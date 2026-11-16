import { describe, expect, it } from "vitest";
import { trialPlan } from "@/core/billing/trial";
import { checkChatFile, cleanName, fileSizeLabel, imageSize } from "./files";
import { highlight, languageLabel } from "./highlight";
import { chatModelOptions, chooseChatModel } from "./models";
import { cleanTitle, titleFrom, turnRequestSchema } from "./protocol";
import { SseReader, encodeEvent } from "./sse";
import { texToMath, type MathNode } from "./tex";

const flat = (n: MathNode): string => (n.text ?? "") + (n.children ?? []).map(flat).join("");
const tags = (n: MathNode): string[] => [n.tag, ...(n.children ?? []).flatMap(tags)];

describe("texToMath", () => {
  it("draws fractions, roots and scripts", () => {
    const m = texToMath("\\frac{a}{b} + \\sqrt{x^2}", false);
    expect(tags(m)).toEqual(expect.arrayContaining(["mfrac", "msqrt", "msup"]));
    expect(flat(m)).toBe("ab+x2");
  });

  it("puts limits under a sum in display maths only", () => {
    expect(tags(texToMath("\\sum_{i=1}^{n} i", true))).toContain("munderover");
    expect(tags(texToMath("\\sum_{i=1}^{n} i", false))).toContain("msubsup");
  });

  it("reads Greek letters, text, matrices and growing brackets", () => {
    expect(flat(texToMath("\\alpha + \\text{area}", false))).toBe("α+area");
    const matrix = texToMath("\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}", true);
    expect(tags(matrix).filter((t) => t === "mtr")).toHaveLength(2);
    expect(flat(texToMath("\\left( x \\right)", false))).toBe("(x)");
  });

  it("shows an unknown command as written and never throws", () => {
    expect(flat(texToMath("\\unknowncmd{x}", false))).toContain("\\unknowncmd");
    expect(() => texToMath("}}{{\\frac{", true)).not.toThrow();
  });
});

describe("highlight", () => {
  it("tints keywords, strings, comments and numbers", () => {
    const kinds = highlight("const x = 'a'; // note\nreturn 42", "ts").map((t) => t.k);
    expect(kinds).toEqual(expect.arrayContaining(["keyword", "string", "comment", "number"]));
    expect(highlight("def f():\n    return None  # done", "python").find((t) => t.v === "None")?.k).toBe("keyword");
  });

  it("joins back to the same code, and leaves unknown languages plain", () => {
    const code = "SELECT id FROM users WHERE name = 'x' -- why\n";
    expect(highlight(code, "sql").map((t) => t.v).join("")).toBe(code);
    expect(highlight("anything", "brainfork")).toEqual([{ k: "plain", v: "anything" }]);
    expect(languageLabel("py")).toBe("Python");
  });
});

describe("SseReader", () => {
  it("reads events split across chunks", () => {
    const reader = new SseReader();
    const bytes = new TextDecoder().decode(encodeEvent("text", { v: "Hello" })) + ": keep-alive\n\n" + new TextDecoder().decode(encodeEvent("done", { ok: true }));
    const events = [...reader.push(bytes.slice(0, 7)), ...reader.push(bytes.slice(7, 30)), ...reader.push(bytes.slice(30)), ...reader.flush()];
    expect(events).toEqual([
      { event: "text", data: '{"v":"Hello"}' },
      { event: "done", data: '{"ok":true}' },
    ]);
  });

  it("reads provider streams with CRLF and unnamed events", () => {
    const reader = new SseReader();
    expect(reader.push('data: {"a":1}\r\n\r\nevent: x\r\ndata: 2\r\n\r\n')).toEqual([
      { event: "message", data: '{"a":1}' },
      { event: "x", data: "2" },
    ]);
  });
});

describe("chat files", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2, 0, 0, 0, 1, 0x80, 8, 6, 0, 0, 0]);
  it("knows pictures, PDFs and text by their bytes", () => {
    expect(checkChatFile("photo.png", png)).toMatchObject({ ok: true, kind: "image", mime: "image/png" });
    expect(imageSize(png)).toEqual({ width: 512, height: 384 });
    expect(checkChatFile("report.pdf", new TextEncoder().encode("%PDF-1.7\n..."))).toMatchObject({ ok: true, kind: "pdf" });
    expect(checkChatFile("notes.md", new TextEncoder().encode("# Notes"))).toMatchObject({ ok: true, kind: "text", mime: "text/markdown" });
  });

  it("refuses what the AI can't read, saying what to do", () => {
    expect(checkChatFile("plan.docx", new Uint8Array([0x50, 0x4b, 3, 4, 1]))).toMatchObject({ ok: false, reason: expect.stringContaining("PDF") });
    expect(checkChatFile("fake.txt", new Uint8Array([0, 1, 2]))).toMatchObject({ ok: false });
    expect(checkChatFile("empty.txt", new Uint8Array())).toMatchObject({ ok: false, reason: "empty.txt is empty." });
  });

  it("cleans names and sizes", () => {
    expect(cleanName("../../etc/pass<wd>.txt")).toBe("passwd.txt");
    expect(fileSizeLabel(2_500_000)).toBe("2.4 MB");
    expect(fileSizeLabel(640 * 1024)).toBe("640 KB");
  });
});

describe("chat models", () => {
  const trial = trialPlan();
  it("lists Auto first and names models by product", () => {
    const options = chatModelOptions({ plan: trial, claude: true, openai: false });
    expect(options[0]).toMatchObject({ id: "auto", name: "Auto", unavailable: null });
    expect(options.find((o) => o.id === "claude-sonnet-5-5")).toMatchObject({ name: "Claude Sonnet 5.5", unavailable: null });
    expect(options.find((o) => o.id === "gpt-6.1-terra")?.unavailable).toBe("OpenAI isn't connected on this server yet.");
  });

  it("honours a chosen model the plan includes, and says so when it can't", () => {
    expect(chooseChatModel({ plan: trial, claude: true, openai: false }, "claude-haiku-5-5", "balanced")).toMatchObject({ model: "claude-haiku-5-5", provider: "anthropic", note: null });
    const fallback = chooseChatModel({ plan: trial, claude: true, openai: false }, "gpt-6.1-terra", "quick");
    expect(fallback).toMatchObject({ provider: "anthropic", thinking: "low" });
    expect(fallback!.note).toMatch(/chose one for you/);
    expect(chooseChatModel({ plan: trial, claude: false, openai: false }, "auto", "quick")).toBeNull();
  });
});

describe("protocol", () => {
  it("names a conversation from its first question until the AI names it", () => {
    expect(titleFrom("  How do I bake   sourdough? ")).toBe("How do I bake sourdough?");
    expect(titleFrom("x".repeat(80))).toHaveLength(61);
    expect(cleanTitle('"Sourdough basics."')).toBe("Sourdough basics");
    expect(cleanTitle("Title: Bread")).toBe("Bread");
  });

  it("checks a turn request", () => {
    expect(turnRequestSchema.safeParse({ action: "send", conversationId: null, parentId: null, text: "Hi", files: [], model: "auto", effort: "balanced", mode: "text", aspect: "1:1", projectId: null }).success).toBe(true);
    expect(turnRequestSchema.safeParse({ action: "send", conversationId: null, parentId: null, text: "Hi", files: [], model: "Robert'); drop", effort: "balanced", mode: "text", aspect: "1:1", projectId: null }).success).toBe(false);
  });
});
