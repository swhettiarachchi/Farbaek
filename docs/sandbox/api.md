# Sandbox API (v1) and SDK

Base path `/api/v1`. JSON in and out; every response has `x-farbaek-api-version` and `x-request-id`.

## Authentication

- **API key** (scripts, CI, the SDK; ADR 0187): `Authorization: Bearer fbk_…`, made by an owner or admin in Settings, Developer API. A key acts as the person who made it, in its own workspace only, while they're still an owner or admin there. It works for 30, 90 or 365 days and can be revoked at any time. A revoked or expired key gets 401 `INVALID_KEY`; another workspace in `X-Farbaek-Workspace` gets 403 `WRONG_WORKSPACE`.
- **Bearer token**: `Authorization: Bearer <Supabase access token>` of a signed-in person. It lasts about an hour. The API can do exactly what that person can do.
- **Session cookie** (Farbaek's own pages): changes must come from the app's own origin (checked with the `Origin` header).
- Workspace: `X-Farbaek-Workspace: <organization id>`; defaults to the person's first workspace. Not a member: 404.
- There are no administrative endpoints in the public API. The sweeper (`/api/internal/sandbox/sweep`) takes a separate server secret and isn't part of the SDK.

## Errors

```json
{ "error": { "code": "QUOTA_EXCEEDED", "message": "Your workspace already has as many sessions as your plan allows. Stop one first.", "category": "quota_exceeded" } }
```

| Status | Codes |
| --- | --- |
| 400 | `INVALID_REQUEST`, `INVALID_JSON` |
| 401 | `UNAUTHENTICATED` |
| 403 | `BLOCKED` (Guard), `FORBIDDEN`, `CROSS_SITE`, `NO_WORKSPACE` |
| 404 | `NOT_FOUND` (also for other workspaces' records) |
| 409 | `QUOTA_EXCEEDED`, `SESSION_NOT_RUNNING`, `SESSION_BUSY`, `VERSION_CONFLICT`, `PREVIEW_UNAVAILABLE`, `PROJECT_ARCHIVED` |
| 413 / 415 | `TOO_LARGE`, `PROJECT_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` |
| 429 | `RATE_LIMITED` (`retry-after: 60`) |
| 502 / 503 | `RUNTIME_FAILED` / `NOT_CONNECTED`, `NOT_CONFIGURED` |

`category` separates a failed command, a timeout, a resource limit, a runtime outage, a refusal and a quota (`src/core/sandbox/failures.ts`).

## Idempotency

`POST /sandboxes`, `POST …/executions` and `POST …/checks` accept `Idempotency-Key` (8 to 100 of `A-Z a-z 0-9 _ . : -`). Repeating a request with the same key returns the first result; it never starts a second sandbox or runs a command again.

## Endpoints

| Method and path | Does |
| --- | --- |
| `GET /sandbox/health` | Execution mode, live runtime reachability, capabilities, limits, period usage |
| `GET /sandboxes?state=ready,paused&q=&sort=newest\|oldest\|name\|expiring&page=1&pageSize=20` | List sessions (max 50 per page) |
| `POST /sandboxes` | Start: `{ name, template: "node-ts"\|"python", size: "small"\|"standard", network: "none"\|"package_registries", minutes, projectId?, taskId?, include?: string[] }` → 201 |
| `GET /sandboxes/{id}` | One session |
| `DELETE /sandboxes/{id}` | Stop and destroy (safe to repeat) |
| `POST /sandboxes/{id}/pause`, `/resume` | When the runtime supports it |
| `GET /sandboxes/{id}/executions?limit=30` | Command history with real outcomes |
| `POST /sandboxes/{id}/executions` | Run `{ command, timeoutSeconds? }`. With `Accept: text/event-stream`, streams `start`, `stdout`, `stderr`, then `end` (the recorded execution) or `error` |
| `GET /sandboxes/{id}/executions/{executionId}` | One command |
| `DELETE /sandboxes/{id}/executions/{executionId}` | Cancel a running command |
| `GET /sandboxes/{id}/files?path=src` | List a folder |
| `GET /sandboxes/{id}/files?path=src/a.ts&read=1` | Read a text file |
| `PUT /sandboxes/{id}/files` | Write `{ path, content }` (text, 512 KB max) |
| `GET /sandboxes/{id}/previews` | Previews and their state |
| `POST /sandboxes/{id}/previews` | `{ port }` → `{ url, previewId, expiresAt }`; the URL works once, within 60 s, for you only |
| `DELETE /sandboxes/{id}/previews/{previewId}` | Close a preview |
| `POST /sandboxes/{id}/checks` | Run the linked task's required checks; records a receipt; moves a VERIFYING task only as far as the exit codes allow |
| `GET /sandboxes/{id}/receipts` | Receipts (in-toto statements with digests) |
| `GET /sandboxes/{id}/metrics` | Latest runtime resource sample, or `null` |

## SDK

`src/sdk/sandbox-client.ts` (framework-free; Node 20+, browsers, Deno, Bun):

```ts
import { FarbaekApiError, FarbaekSandboxClient } from "./sandbox-client";

const fb = new FarbaekSandboxClient({ baseUrl: "https://app.example", accessToken, workspaceId });
const session = await fb.create({ name: "CI check", template: "node-ts", size: "small", network: "package_registries", minutes: 20 });
const key = fb.newIdempotencyKey(); // reuse it if you retry this run
try {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const run = await fb.run(session.id, "npm ci && npm test", { idempotencyKey: key });
      console.log(run.state, run.exitCode);
      break;
    } catch (e) {
      // Same key on retry: if the first attempt reached the server, you get its result back.
      if (!(e instanceof FarbaekApiError && e.retryable)) throw e;
    }
  }
  for await (const event of fb.runStream(session.id, "node --version")) {
    if (event.type === "stdout") process.stdout.write(event.data);
  }
} finally {
  await fb.stop(session.id);
}
```

Calls that start something (`create`, `run`, `runStream`, `runChecks`) send an `Idempotency-Key`: a new one per call unless you pass `idempotencyKey`, so pass the same key when retrying. `FarbaekApiError` carries `status`, `code`, `category`, `requestId` and `retryable`.
