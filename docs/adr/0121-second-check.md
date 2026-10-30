# ADR 0121: The second check on a change

- Status: accepted (2026-10-30).
- Implements master spec §9: "For selected high-impact tasks, a second-checker model may review intent alignment, constraints, tools, evidence and uncertainty. Agreement between models is not proof. Deterministic assertions and real tests take precedence, and mandatory gates can never be bypassed by model confidence." The spec audit of 2026-10-30 found it missing.
- Builds on ADR 0044 (AI suggestions kept with a proposal), ADR 0021 (routing) and ADR 0020 (metering).

## Decision

**On request, a second model reads a pending change against its approved contract.** The **Second check** card sits on the change's review, beside **What this change reaches**. It's recommended (not run on its own) when the policy sent the change to an owner or admin.

**What the second model reads** (`secondCheckRequest`, `src/core/trust/second-check.ts`):
- the contract: outcome, allowed files and operations, forbidden operations, protected invariants, acceptance criteria and required checks;
- the plan and the policy's decision;
- a unified diff of each file, within 60,000 characters. A file that doesn't fit goes by name, and the result says which.

**What it answers** (a strict schema):
- a verdict: no concerns, concerns, or couldn't tell;
- a summary;
- up to 12 findings, each with a topic (outcome, scope, invariant, risk, checks), a severity (note, concern, serious) and, when it's about one file, the path;
- what it couldn't check.

**The answer is untrusted:**
- It's validated against the schema.
- Over-long text is cut to the limits rather than thrown away after it was paid for.
- A finding may name only a file that was sent; any other path is dropped.

**Who checks.** The checker is a model from another company than the one that wrote the change, when there is one:
- **OpenAI** (`gpt-6.1-terra`) when the server has `OPENAI_API_KEY`. It's called over the Responses API with a strict JSON schema and `store: false`, using `fetch`, so no new dependency.
- **Otherwise a different Claude model:** the one review would use, or the strongest other model the plan includes.
- **If the plan has only the model that wrote it** (Free, Haiku), the result says so: "a second read, not an independent one".

**Advisory only:**
- The verdict never changes the policy's outcome, what the change needs to be approved, or who may approve it.
- The card says so in plain words.

**Metering:**
- A new operation, `second_check`, reserved before the call and settled at the model's real token cost.
- Refunded if it fails or is refused.
- OpenAI's prices are in the rate card from OpenAI's own pricing page (2026-10-30): $1 input, $0.05 cached input, $5 output per million tokens. Above 272K prompt tokens the whole call is metered at 2x, never under.

**Storage (migration v75):**
- `proposal_second_checks` holds one check per proposal; asking again replaces it.
- Members read it under row security.
- Only `app_record_second_check` (server key) writes it, and only for a pending proposal and a contributor of its workspace.
- Each check is one `proposal.second_checked` audit event, with the model, verdict, independence and number of findings.

**Privacy.** OpenAI is listed as a processor, with exactly what it receives. The Privacy Policy states its API terms as published:
- no training on what's sent;
- inputs and outputs kept up to 30 days for abuse monitoring, longer only when the law requires or to prevent harm;
- the answers aren't stored, because Farbaek sends `store: false`.

## Not done

- **Running it automatically** on every escalated change; that would spend usage without asking.
- **Gemini as a third checker.**
- **Feeding the verdict into Trust or the policy.** That's deliberately never done.
