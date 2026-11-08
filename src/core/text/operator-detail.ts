/**
 * Stage 171: what a person reads never names Farbaek's own setup. New messages
 * are written that way; this guards what was saved before, and signed records
 * that can't be edited, when they're shown. A line naming a setting, a command
 * for whoever runs the server, or the test space's provider is replaced.
 */
const SETTING = /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/;
const OPERATOR_COMMAND = /\b(?:pnpm (?:sandbox|films|qa|security)[:\s]|node scripts\/)/;
const PROVIDER = /\b(?:Vercel Sandbox|E2B|Hobby plan|On Hobby|Office Space)\b/;

/** Whether a line carries something only whoever runs Farbaek should read. */
export function namesOperatorDetail(text: string): boolean {
  return SETTING.test(text) || OPERATOR_COMMAND.test(text) || PROVIDER.test(text);
}

/** The line as a person may read it: unchanged, or the plain fallback when it names Farbaek's own setup. */
export function forPeople(text: string, fallback = "Farbaek's test space had a problem here, and Farbaek has been told."): string {
  return namesOperatorDetail(text) ? fallback : text;
}
