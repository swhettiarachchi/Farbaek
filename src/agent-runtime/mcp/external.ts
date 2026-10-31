/**
 * The MCP servers a person added, gathered into one set of tools for a run
 * (ADR 0148). Each server's tools get model-facing names that say which
 * server they come from; a server that can't start or list its tools is
 * named with the reason and left out, and the run goes on without it.
 */
import type { ToolSpec } from "../models/types";
import { McpError, type McpClient } from "./client";
import { mcpToolName, parseMcpToolName, SERVER_NAME } from "./names";

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
}

/** What the model is told about where an MCP tool comes from, before the server's own description. */
export const mcpOrigin = (server: string) => `From the MCP server "${server}" on this computer. `;

/** Tools from outside Farbaek, offered to the model next to its own (ADR 0148). */
export interface ExternalTools {
  definitions: ToolSpec[];
  /** Which server and tool a model-facing name stands for, when it's one of these. */
  describe(name: string): { server: string; tool: string } | null;
  call(name: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<{ text: string; isError: boolean }>;
}

export interface McpSession {
  tools: ExternalTools;
  /** Servers left out, with why, in words. */
  problems: string[];
  close(): void;
}

export const MAX_MCP_SERVERS = 5;

export function checkServerConfig(raw: unknown): McpServerConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name : "";
  const command = typeof r.command === "string" ? r.command.trim() : "";
  const args = Array.isArray(r.args) && r.args.every((a) => typeof a === "string") ? (r.args as string[]) : null;
  if (!SERVER_NAME.test(name) || !/^[A-Za-z0-9._-]{1,64}$/.test(command) || !args || args.length > 32 || args.some((a) => a.length > 500 || a.includes("\u0000"))) return null;
  return { name, command, args };
}

export async function connectMcpServers(servers: readonly McpServerConfig[], connect: (server: McpServerConfig) => Promise<McpClient>): Promise<McpSession> {
  const clients = new Map<string, McpClient>();
  const definitions: ToolSpec[] = [];
  const problems: string[] = [];
  for (const server of servers.slice(0, MAX_MCP_SERVERS)) {
    let client: McpClient;
    try {
      client = await connect(server);
    } catch (e) {
      problems.push(`${server.name}: ${e instanceof McpError ? e.message : "it couldn't start."}`);
      continue;
    }
    try {
      const { tools, skipped } = await client.listTools();
      let offered = 0;
      for (const t of tools) {
        const name = mcpToolName(server.name, t.name);
        if (!name) continue;
        definitions.push({ name, description: `${mcpOrigin(server.name)}${t.description}`.slice(0, 1_200), inputSchema: t.inputSchema });
        offered += 1;
      }
      const left = skipped + tools.length - offered;
      if (left === 1) problems.push(`${server.name}: 1 of its tools wasn't offered, because its name or inputs aren't in a shape Farbaek accepts.`);
      else if (left > 1) problems.push(`${server.name}: ${left} of its tools weren't offered, because their names or inputs aren't in a shape Farbaek accepts.`);
      clients.set(server.name, client);
    } catch (e) {
      client.close();
      problems.push(`${server.name}: ${e instanceof McpError ? e.message : "its tools couldn't be listed."}`);
    }
  }
  return {
    tools: {
      definitions,
      describe(name) {
        const parsed = parseMcpToolName(name);
        return parsed && clients.has(parsed.server) && definitions.some((d) => d.name === name) ? parsed : null;
      },
      async call(name, input, signal) {
        const parsed = parseMcpToolName(name);
        const client = parsed ? clients.get(parsed.server) : undefined;
        if (!parsed || !client) throw new McpError(`There's no tool named ${name}.`);
        return client.callTool(parsed.tool, input, signal);
      },
    },
    problems,
    close() {
      for (const c of clients.values()) c.close();
      clients.clear();
    },
  };
}
