import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkTool, connectMcp, McpError, resultText, type LineTransport } from "./client";
import { checkServerConfig, connectMcpServers } from "./external";
import { mcpToolName, parseMcpToolName } from "./names";
import { spawnStdioTransport } from "./stdio";

/** A labelled in-memory MCP server: answers the way a real one does, and records what it was sent. */
function fakeServer(handlers: Record<string, (params: Record<string, unknown>) => unknown>, opts: { noise?: boolean; askBack?: boolean } = {}) {
  const sent: { method?: string; id?: unknown; params?: unknown; result?: unknown; error?: unknown }[] = [];
  let lineListener: (line: string) => void = () => undefined;
  let closeListener: (reason: string) => void = () => undefined;
  let closed = false;
  const reply = (msg: unknown) => queueMicrotask(() => lineListener(JSON.stringify(msg)));
  const transport: LineTransport = {
    send(line) {
      const msg = JSON.parse(line) as { id?: number; method?: string; params?: Record<string, unknown> };
      sent.push(msg);
      if (!msg.method || msg.id === undefined) return;
      if (opts.noise) queueMicrotask(() => lineListener("server starting..."));
      if (opts.askBack && msg.method === "tools/call") reply({ jsonrpc: "2.0", id: 99, method: "sampling/createMessage", params: {} });
      const h = handlers[msg.method];
      if (!h) return reply({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "no such method" } });
      const out = h(msg.params ?? {});
      if (out !== undefined) reply({ jsonrpc: "2.0", id: msg.id, result: out });
    },
    onLine: (l) => (lineListener = l),
    onClose: (l) => (closeListener = l),
    close() {
      if (!closed) {
        closed = true;
        closeListener("Closed.");
      }
    },
  };
  return { transport, sent, isClosed: () => closed };
}

const HANDSHAKE = { initialize: () => ({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "notes", version: "1.0.0" } }) };
const TOOLS = [
  { name: "search_notes", description: "Search the notes.", inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] } },
  { name: "bad.name", description: "x", inputSchema: { type: "object" } },
  { name: "no_schema", description: "x" },
];

describe("MCP tool names (ADR 0148)", () => {
  it("prefixes each tool with its server, and reads the name back only when it round-trips", () => {
    expect(mcpToolName("notes", "search_notes")).toBe("mcp__notes__search_notes");
    expect(parseMcpToolName("mcp__notes__search_notes")).toEqual({ server: "notes", tool: "search_notes" });
    for (const [server, tool] of [["Notes", "x"], ["notes", "bad.name"], ["notes", "a__b"], ["-x", "y"], ["notes", "x".repeat(60)]]) {
      expect(mcpToolName(server!, tool!), `${server}/${tool}`).toBeNull();
    }
    expect(parseMcpToolName("read_file")).toBeNull();
    expect(parseMcpToolName("mcp__notes")).toBeNull();
    expect(parseMcpToolName("mcp__Notes__x")).toBeNull();
  });

  it("accepts a server only as a short name, a bare program and plain arguments", () => {
    expect(checkServerConfig({ name: "notes", command: "npx", args: ["-y", "@example/notes-mcp"] })).toEqual({ name: "notes", command: "npx", args: ["-y", "@example/notes-mcp"] });
    for (const bad of [null, { name: "Notes", command: "npx", args: [] }, { name: "notes", command: "C:\\tools\\x.exe", args: [] }, { name: "notes", command: "npx && evil", args: [] }, { name: "notes", command: "npx", args: "x" }, { name: "notes", command: "npx", args: ["a\u0000"] }]) {
      expect(checkServerConfig(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("the MCP client", () => {
  it("does the handshake, lists the tools it can offer, calls one, and ignores stray output", async () => {
    const server = fakeServer({ ...HANDSHAKE, "tools/list": () => ({ tools: TOOLS }), "tools/call": (p) => ({ content: [{ type: "text", text: `found ${JSON.stringify(p.arguments)}` }, { type: "image", data: "…" }] }) }, { noise: true });
    const client = await connectMcp(server.transport, { clientVersion: "0.9.0" });
    expect(client.server).toEqual({ name: "notes", version: "1.0.0" });
    expect(server.sent[0]).toMatchObject({ method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Farbaek Agent", version: "0.9.0" } } });
    expect(server.sent[1]).toEqual({ jsonrpc: "2.0", method: "notifications/initialized" });
    const { tools, skipped } = await client.listTools();
    // "bad.name" is listed here but can't be offered under its server's prefix; one without a schema isn't kept.
    expect(tools.map((t) => t.name)).toEqual(["search_notes", "bad.name"]);
    expect(skipped).toBe(1);
    expect(await client.callTool("search_notes", { q: "launch" })).toEqual({ text: 'found {"q":"launch"}\n[an image, not shown]', isError: false });
    client.close();
    expect(server.isClosed()).toBe(true);
  });

  it("refuses what the server asks back, and passes on its refusals", async () => {
    const server = fakeServer({ ...HANDSHAKE, "tools/call": () => ({ content: [{ type: "text", text: "ok" }] }) }, { askBack: true });
    const client = await connectMcp(server.transport, { clientVersion: "0.9.0" });
    await client.callTool("x", {});
    await new Promise((r) => setTimeout(r, 0));
    expect(server.sent.find((m) => m.id === 99)).toMatchObject({ error: { code: -32601 } });
    await expect(client.listTools()).rejects.toThrow(/The MCP server refused: no such method/);
  });

  it("gives up on a server that doesn't answer, or isn't an MCP server", async () => {
    const silent = fakeServer({ initialize: () => undefined });
    await expect(connectMcp(silent.transport, { clientVersion: "0.9.0", timeoutMs: 20 })).rejects.toThrow(/didn't answer within/);
    expect(silent.isClosed()).toBe(true);
    const wrong = fakeServer({ initialize: () => ({ hello: "world" }) });
    await expect(connectMcp(wrong.transport, { clientVersion: "0.9.0" })).rejects.toThrow(McpError);
  });

  it("reads results as text only, bounded, and checks each tool's shape", () => {
    expect(resultText({ content: [], isError: true })).toEqual({ text: "(no output)", isError: true });
    expect(resultText({ content: [], structuredContent: { n: 1 } }).text).toBe('{"n":1}');
    expect(resultText({ content: [{ type: "text", text: "x".repeat(200_000) }] }).text).toMatch(/the rest of the output wasn't shown\]$/);
    expect(() => resultText("nope")).toThrow(McpError);
    expect(checkTool({ name: "t", inputSchema: { type: "object" } })).toEqual({ name: "t", description: "", inputSchema: { type: "object" } });
    expect(checkTool({ name: "t", inputSchema: { type: "string" } })).toBeNull();
    expect(checkTool({ name: "t", inputSchema: { type: "object", big: "x".repeat(20_000) } })).toBeNull();
  });
});

describe("a run's MCP servers", () => {
  it("offers each server's tools under its own prefix, names the ones left out, and closes them", async () => {
    const ok = fakeServer({ ...HANDSHAKE, "tools/list": () => ({ tools: TOOLS }), "tools/call": () => ({ content: [{ type: "text", text: "3 notes" }] }) });
    const session = await connectMcpServers(
      [
        { name: "notes", command: "npx", args: [] },
        { name: "broken", command: "npx", args: [] },
      ],
      async (s) => {
        if (s.name === "broken") throw new McpError("npx wasn't found.");
        return connectMcp(ok.transport, { clientVersion: "0.9.0" });
      },
    );
    expect(session.tools.definitions.map((d) => d.name)).toEqual(["mcp__notes__search_notes"]);
    expect(session.tools.definitions[0]!.description).toBe('From the MCP server "notes" on this computer. Search the notes.');
    expect(session.problems).toEqual(["notes: 2 of its tools weren't offered, because their names or inputs aren't in a shape Farbaek accepts.", "broken: npx wasn't found."]);
    expect(session.tools.describe("mcp__notes__search_notes")).toEqual({ server: "notes", tool: "search_notes" });
    expect(session.tools.describe("mcp__notes__bad")).toBeNull();
    expect(await session.tools.call("mcp__notes__search_notes", { q: "x" })).toEqual({ text: "3 notes", isError: false });
    await expect(session.tools.call("mcp__other__x", {})).rejects.toThrow(/There's no tool named/);
    session.close();
    expect(ok.isClosed()).toBe(true);
  });
});

describe("a real MCP server over stdio", () => {
  it("starts it with no shell, talks to it line by line, and stops it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "farbaek-mcp-"));
    const script = path.join(dir, "server.mjs");
    await fs.writeFile(
      script,
      [
        "import { createInterface } from 'node:readline';",
        "const out = (m) => process.stdout.write(JSON.stringify(m) + '\\n');",
        "createInterface({ input: process.stdin }).on('line', (line) => {",
        "  const m = JSON.parse(line);",
        "  if (m.method === 'initialize') out({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'echo', version: '1' } } });",
        "  if (m.method === 'tools/list') out({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'echo', description: 'Echoes.', inputSchema: { type: 'object' } }] } });",
        "  if (m.method === 'tools/call') out({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'echo ' + JSON.stringify(m.params.arguments) + ' secret=' + (process.env.FARBAEK_TEST_SECRET ?? 'none') }] } });",
        "});",
      ].join("\n"),
    );
    try {
      const transport = await spawnStdioTransport({ command: "node", args: [script], cwd: dir }, { parentEnv: { ...process.env, FARBAEK_TEST_SECRET: "should-not-pass" } });
      const client = await connectMcp(transport, { clientVersion: "0.9.0", timeoutMs: 10_000 });
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual(["echo"]);
      // Only a developer tool's environment reaches the server, never this app's own variables.
      expect(await client.callTool("echo", { a: 1 })).toEqual({ text: 'echo {"a":1} secret=none', isError: false });
      client.close();
    } finally {
      // Windows holds the folder until the stopped server has exited.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }, 20_000);

  it("says when the program isn't one it can start", async () => {
    await expect(spawnStdioTransport({ command: "definitely-not-a-program-farbaek", args: [], cwd: os.tmpdir() })).rejects.toThrow(McpError);
  });
});
