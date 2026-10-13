import { Fragment } from "react";

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

/** Pretty-printed JSON with restrained syntax tint, rendered on the server. */
export function JsonView({ value, label }: { value: unknown; label: string }) {
  const text = JSON.stringify(value, null, 2);
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const [whole, str, colon, num, literal] = match;
    if (str && colon) {
      parts.push(
        <Fragment key={index}>
          <span className="text-ink">{str}</span>
          {colon}
        </Fragment>,
      );
    } else if (str) {
      parts.push(<span key={index} className="text-gold-ink">{str}</span>);
    } else if (num || literal) {
      parts.push(<span key={index} className="font-medium text-ink">{whole}</span>);
    }
    last = index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <pre
      tabIndex={0}
      aria-label={label}
      className="ledger max-h-[440px] overflow-auto px-4 py-3 font-mono text-[12.5px] leading-[1.6] text-ink-2"
    >
      <code>{parts}</code>
    </pre>
  );
}
