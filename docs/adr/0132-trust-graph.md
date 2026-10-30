# ADR 0132: The trust graph

- Status: accepted (2026-10-30).
- From master spec §9 "Multi-agent coordination and trust graph":
  - "Build a searchable, permission-filtered 2D graph linking people, organizations, agents, tools, integrations, capabilities, policies, resources, tasks…";
  - "Support authorized queries such as 'Which agents can change prices?'";
  - "Label inferred or unknown edges. Never expose another tenant's nodes or edges";
  - "A delegated agent can never exceed its delegator's authority."

## Decision

**A Trust graph page** (`/app/trust`, in the navigation) built only from the workspace's own records, read as the person under row security, so no other workspace appears.

**Nodes:**
- **people:** their role, and whether approving is withheld;
- **paired agents:** their lease, or "Revoked" or "Lease expired";
- **workflows:** their status;
- **projects:** archived ones are marked;
- **connected services:** GitHub, the workspace's own AI key, and the Vercel and Netlify connections.

**Edges, each naming the record it comes from:**

| Edge | From the record |
| --- | --- |
| A person can change and approve, can propose changes, or can view | Their role and withheld permissions |
| A person paired an agent | The agent's pairing |
| An agent can propose changes, read, use AI or move folders, per project | Its lease (projects, capabilities, expiry) |
| A person approved a workflow, whose runs start as them; a workflow runs agents on a project | The workflow's approval and project |
| A project opens pull requests to a repository | The project's linked repository |
| A person connected a service | Who connected it |

**Nothing is inferred.**
- Expired leases, revoked agents and archived projects reach nothing.
- An agent whose person can only view keeps its lease edge, marked **limited** (dashed, with a warning icon and words): the server refuses its changes, because an agent always acts with its person's current role, read again on every request (ADR 0018, ADR 0117).

**Questions:**
- **"Who and what can change this project?"** People, agents (with the pairing that gives them authority) and running workflows (with their approver).
- **Selecting any node** shows what it reaches and what reaches it.
- **Search** by name or detail.

**The map:** four columns (people; agents and workflows; projects; services) with an edge per record. Selecting a node highlights its edges. It scrolls sideways inside its own frame on a phone, and the lists beside it carry every fact in words.

## Not done

- Tools, policies, tasks, incidents and deployments as nodes.
- Questions about fields, such as "which agents can change prices?". Farbaek's agents act on files, not on business records.
