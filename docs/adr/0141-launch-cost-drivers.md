# ADR 0141: What will cost money at launch

- Status: accepted (2026-10-30).
- From master spec §6: a project proposal includes "estimated infrastructure and model cost where available". From §0: never fabricate prices.

## Decision

**Drivers, not prices.** The Launch Planner gains "What will cost money". It lists the things in a project's own files that hosts and services bill for, each with the evidence it came from (`src/core/launch/costs.ts`):
- **Code that runs for every visit:** a server or server-rendered pages. Hosts bill compute, requests or an always-on server beyond what a plan includes.
- **Static files only:** bandwidth is what grows the bill.
- **Functions that run per request:** API routes under `app/**/route.*`, `pages/api`, `api/` or `netlify/functions`, counted and named.
- **Optimised images:** `next/image`, which most hosts count or bill.
- **Scheduled jobs:** `crons` in `vercel.json`, or `schedule` in `netlify.toml`. The planner now reads both files.
- **A build on every launch:** build minutes.
- **Each outside service the code uses:** database, sign-in, payments, file storage, email, AI. Each bills on its own account, and AI calls in the app aren't covered by Farbaek's usage.

**Why no dollar figures.**
- Farbaek doesn't charge for launches.
- It can't see the person's plan or traffic at the host or at any service, and prices change. A number would be a guess presented as a fact, which the rules forbid.
- The card says this in one sentence and links each host's own pricing page. That's an honest "where available": what drives the cost is available from the files; what it will be isn't.

## Consequences

- Before launching, a person sees the specific parts of their project that will cost money, and where to check the price.
- **When a provider connection can read the account's plan,** the planner can name it beside these drivers. It still gives no estimate without usage.

## Not done

- **Reading the plan from a connected Vercel or Netlify account:** the field names need checking against a real account first.
- **Model cost for the app's own AI calls:** it depends on the app's traffic. The Cost Brain (ADR 0122) covers what Farbaek's own AI used while building.
