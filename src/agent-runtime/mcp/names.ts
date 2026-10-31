/**
 * Names for tools from MCP servers the person adds to Farbaek Agent
 * (ADR 0148). Each one is offered to the model as `mcp__<server>__<tool>`,
 * so it can never collide with Farbaek's own tools, and so the model
 * gateway's pin sees a name it doesn't know and holds it for an owner or
 * admin to review (ADR 0133).
 */

export const MCP_PREFIX = "mcp__";
/** A server's name as the person gives it: short, lowercase, no separators that could be confused. */
export const SERVER_NAME = /^[a-z0-9][a-z0-9-]{0,23}$/;
const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;
/** The longest tool name the model APIs accept. */
const MAX_NAME = 64;

/** The name the model sees, or null when the server's tool name can't be offered safely. */
export function mcpToolName(server: string, tool: string): string | null {
  if (!SERVER_NAME.test(server) || !TOOL_NAME.test(tool) || tool.includes("__")) return null;
  const name = `${MCP_PREFIX}${server}__${tool}`;
  return name.length <= MAX_NAME ? name : null;
}

/** The server and tool a model-facing name stands for, or null when it isn't an MCP tool's. */
export function parseMcpToolName(name: string): { server: string; tool: string } | null {
  if (!name.startsWith(MCP_PREFIX)) return null;
  const rest = name.slice(MCP_PREFIX.length);
  const at = rest.indexOf("__");
  if (at <= 0) return null;
  const server = rest.slice(0, at);
  const tool = rest.slice(at + 2);
  return mcpToolName(server, tool) === name ? { server, tool } : null;
}
