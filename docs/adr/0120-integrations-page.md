# ADR 0120: One Integrations page

- Status: accepted (2026-10-30).
- From the spec audit of 2026-10-30: "Integrations live inside project pages and Settings, not in their own area" (spec §12, the app's areas).

## Decision

**`/app/integrations`** lists everything a workspace connects to, each with its real state from the workspace's own records and one next step:

| Integration | State from | Next step |
| --- | --- | --- |
| Farbaek hosting | live, unblocked sites | Projects |
| Vercel, Netlify (LaunchOS) | the workspace's provider connections: account, when connected, last used | a project's Launch page |
| GitHub | always available: public repository import | Projects (import) |
| Farbaek Agent | paired agents | Agents |
| Mesh | agents reachable through Farbaek | Mesh |
| Email | whether this server sends email | Settings |
| AI models | always included, metered | Billing and usage |

**Connecting and disconnecting stay where they happen.** The page doesn't add a second way to connect anything; it links to the place that does. So there's one code path per connection and its checks.

**Reading:**
- Connections and sites are read as the person, through row security.
- What can't be read (the demo, an error) shows as "Not read" with the reason, never as "Not connected".

**Not available yet** is listed on the page in plain words:
- GitHub pull requests, status checks and private repositories;
- your own model keys, local models or a company gateway;
- streaming the activity log out.

## Consequences

- A person can see at a glance what the workspace is connected to and where to change it.
- No new data, grant or write path.
