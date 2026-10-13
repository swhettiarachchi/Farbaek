/** True when the server has an Anthropic key. Checks presence only; the value is never logged or returned. */
export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}
