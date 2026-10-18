/**
 * What the agent loop needs from a model provider: a conversation that takes
 * tool results and returns the model's next step. Each adapter keeps the
 * provider's own message history, including thinking or thought signatures,
 * unchanged. Tool inputs it returns are untrusted until the registry parses
 * them.
 */

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultInput {
  id: string;
  content: string;
  isError: boolean;
}

/**
 * Why the model stopped. "max_tokens" with tool calls means a call may be cut
 * off and must not run; "refusal" ends the run; "context_full" means the
 * conversation outgrew the model's context window.
 */
export type StepStop = "tool_use" | "end_turn" | "max_tokens" | "refusal" | "context_full" | "other";

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelStep {
  text: string;
  toolCalls: ModelToolCall[];
  stop: StepStop;
  usage: ModelUsage;
  model: string;
}

export interface ModelConversation {
  /** The first call sends the opening message; later calls send tool results and, optionally, a note. */
  send(input: { toolResults?: ToolResultInput[]; text?: string }, signal?: AbortSignal): Promise<ModelStep>;
}

export type ModelProvider = "anthropic" | "gemini";

export interface ToolModel {
  readonly provider: ModelProvider;
  readonly model: string;
  begin(setup: { system: string; message: string; tools: readonly ToolSpec[] }): ModelConversation;
}

export type ModelErrorKind = "auth" | "busy" | "network" | "bad_request" | "bad_output" | "cancelled";

export class ModelError extends Error {
  constructor(
    readonly kind: ModelErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ModelError";
  }
}
