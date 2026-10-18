/**
 * The agent's tool registry: one Zod schema per tool, which is also the
 * JSON Schema the model sees. A tool call is untrusted model output until it
 * parses here; the permission engine then decides whether it may run.
 */
import { z } from "zod";

const Path = z.string().min(1).max(300).describe("A path relative to the project folder, with forward slashes.");
const Reason = z.string().max(500).describe("One sentence: why this step is needed.");

export const TOOL_INPUTS = {
  list_files: z.object({ dir: z.string().max(300).describe('A folder relative to the project folder. "" for the top.') }),
  search_files: z.object({ query: z.string().min(1).max(200).describe("Plain text to look for, case-insensitive.") }),
  read_file: z.object({ path: Path }),
  write_file: z.object({ path: Path, content: z.string().max(512 * 1024), reason: Reason }),
  edit_file: z.object({
    path: Path,
    edits: z
      .array(z.object({ find: z.string().min(1).max(20_000).describe("Exact text that occurs once in the file."), replace: z.string().max(20_000) }))
      .min(1)
      .max(20),
    reason: Reason,
  }),
  run_command: z.object({
    program: z.string().min(1).max(100).describe('The program only, such as "pnpm" or "git". No shell syntax.'),
    args: z.array(z.string().max(1_000)).max(50).describe("Arguments, one per item."),
    reason: Reason,
  }),
  finish: z.object({
    summary: z.string().min(1).max(2_000).describe("Two or three sentences: what changed and why."),
    steps: z.array(z.string().max(300)).max(20),
    risks: z.array(z.string().max(300)).max(20),
    checks: z.array(z.string().max(300)).max(20).describe("Commands a person should run to verify the change."),
  }),
} as const;

export type ToolName = keyof typeof TOOL_INPUTS;
export const TOOL_NAMES = Object.keys(TOOL_INPUTS) as ToolName[];
export type ToolInput<N extends ToolName> = z.infer<(typeof TOOL_INPUTS)[N]>;
export type ToolCall = { [N in ToolName]: { name: N; input: ToolInput<N> } }[ToolName];

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  list_files: "List the files and folders in one folder of the project.",
  search_files: "Find lines that contain some text, across the project's files. Returns at most 100 matches.",
  read_file: "Read one text file from the project.",
  write_file: "Create a file, or replace a whole file, with the given content.",
  edit_file: "Change a file with exact find-and-replace edits. Each find must occur exactly once.",
  run_command: "Run one program with arguments in the project folder. Some commands need a person's approval first.",
  finish: "End the run and hand the change to a person for review, with a summary, steps, risks and checks.",
};

/** The registry as tool definitions for a model API. */
export function toolDefinitions(names: readonly ToolName[] = TOOL_NAMES): { name: ToolName; description: string; inputSchema: Record<string, unknown> }[] {
  return names.map((name) => {
    const schema = z.toJSONSchema(TOOL_INPUTS[name]) as Record<string, unknown>;
    delete schema.$schema;
    return { name, description: TOOL_DESCRIPTIONS[name], inputSchema: schema };
  });
}

export type ParsedCall = { ok: true; call: ToolCall } | { ok: false; error: string };

/** Validates a model's tool call. Unknown tools and bad inputs are errors the model is told about, never executed. */
export function parseToolCall(name: string, input: unknown): ParsedCall {
  if (!(TOOL_NAMES as string[]).includes(name)) return { ok: false, error: `There's no tool named ${name}.` };
  const parsed = TOOL_INPUTS[name as ToolName].safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The input for ${name} isn't valid: ${issue?.path.join(".") || "input"}: ${issue?.message ?? "invalid"}.` };
  }
  return { ok: true, call: { name, input: parsed.data } as ToolCall };
}
