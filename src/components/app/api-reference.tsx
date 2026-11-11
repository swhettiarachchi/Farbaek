/**
 * How to call the developer API with a key (ADR 0187): the address, the header, two working examples and every
 * endpoint, so a key never comes without a way to use it. Commands and paths are in Geist Mono; the words aren't.
 */
const ENDPOINTS: { method: string; path: string; does: string }[] = [
  { method: "GET", path: "/api/v1/sandboxes", does: "Your test spaces, newest first." },
  { method: "POST", path: "/api/v1/sandboxes", does: "Start one: name, template (node-ts or python), size (small or standard), network (none or package_registries), minutes, and a projectId to copy a project's files in." },
  { method: "GET", path: "/api/v1/sandboxes/{id}", does: "One test space and its state." },
  { method: "DELETE", path: "/api/v1/sandboxes/{id}", does: "Stop it and remove its machine. Safe to repeat." },
  { method: "POST", path: "/api/v1/sandboxes/{id}/executions", does: "Run a command (command, timeoutSeconds). Send Accept: text/event-stream to stream its output." },
  { method: "GET", path: "/api/v1/sandboxes/{id}/executions", does: "Recent commands and how each ended." },
  { method: "GET", path: "/api/v1/sandboxes/{id}/executions/{executionId}", does: "One command's result. DELETE cancels it while it runs." },
  { method: "GET", path: "/api/v1/sandboxes/{id}/files", does: "List a folder (path), or read a text file (path and read=1). PUT writes one." },
  { method: "POST", path: "/api/v1/sandboxes/{id}/checks", does: "Run the linked task's checks, with a signed receipt." },
  { method: "GET", path: "/api/v1/sandboxes/{id}/receipts", does: "Receipts for what ran." },
  { method: "POST", path: "/api/v1/sandboxes/{id}/previews", does: "A private preview link for a port. GET lists them; DELETE …/previews/{previewId} closes one." },
  { method: "POST", path: "/api/v1/sandboxes/{id}/pause", does: "Pause it. …/resume starts it again." },
  { method: "GET", path: "/api/v1/sandboxes/{id}/metrics", does: "What it used." },
];

export function ApiReference({ origin }: { origin: string }) {
  const start = `curl -X POST ${origin}/api/v1/sandboxes \\
  -H "Authorization: Bearer $FARBAEK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"CI check","template":"node-ts","size":"small","network":"package_registries","minutes":20}'`;
  const run = `curl -X POST ${origin}/api/v1/sandboxes/SESSION_ID/executions \\
  -H "Authorization: Bearer $FARBAEK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"command":"npm test","timeoutSeconds":300}'`;
  return (
    <div className="grid gap-4 text-sm leading-relaxed text-ink-2">
      <p>
        Send the key as a bearer token to <span className="font-mono break-all text-ink">{origin}/api/v1</span>. Every call acts as the person who made the key, in its workspace, with their role and this
        plan&apos;s limits. Answers are JSON; an error says what went wrong in <span className="font-mono">error.message</span>.
      </p>
      <div className="grid gap-2">
        <p className="font-medium text-ink">Start a test space</p>
        <pre className="overflow-x-auto rounded-sm border border-line bg-surface-sunken px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">{start}</pre>
      </div>
      <div className="grid gap-2">
        <p className="font-medium text-ink">Run a command in it</p>
        <pre className="overflow-x-auto rounded-sm border border-line bg-surface-sunken px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">{run}</pre>
      </div>
      <div className="grid gap-2">
        <p className="font-medium text-ink">Every call</p>
        <ul className="divide-y divide-line overflow-hidden rounded-sm border border-line">
          {ENDPOINTS.map((e) => (
            <li key={`${e.method} ${e.path}`} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] sm:gap-4">
              <span className="font-mono text-xs break-all text-ink">
                {e.method} {e.path}
              </span>
              <span className="text-sm text-ink-2">{e.does}</span>
            </li>
          ))}
        </ul>
      </div>
      <p>
        A key works only in its own workspace. Calls are limited per person each minute; when there are too many, the answer is 429 with a Retry-After header. A revoked or expired key gets 401 at
        once.
      </p>
    </div>
  );
}
