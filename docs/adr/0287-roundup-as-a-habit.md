# ADR 0287: A roundup, every morning, in one press

- **Status:** accepted (stage 280, the Farbaek program, 2026-11-26)
- **Builds on:** ADR 0278 (scheduled tasks), ADR 0280 (offering a schedule under a Chat answer), ADR 0285 (a roundup of news).
- **Changes:** when the offer under an answer is made, and how it is worded. No migration, no new dependency, no new place to learn.

## Context

The owner's rule for the whole product, 2026-11-26: "Maximum intelligence and automation behind the scenes, minimum complexity for the user", with "minimal unnecessary clicks and manual input".

Chat already offers a schedule under an answer (ADR 0280), but only when the person's own words named one: "send me the AI news every morning at 8". Someone who writes "tech news today" gets the news and nothing more. To have it every day they must know scheduled tasks exist, open that page, and fill in a form.

The ChatGPT answer the owner compared Farbaek with ended by offering the same news from tomorrow on, with the topics to pick.

## Decision

**Under a roundup that was asked for with no schedule, Farbaek offers the same request every morning. One press saves it.**

- **When.** The answer was researched and written as a roundup (ADR 0285), which is Farbaek's own finding and never the model's word; the message is the person's own short request (the bounds every offer has); and its words named no schedule. A schedule they did name is offered as before, and comes first.
- **The message must ask for a roundup by itself.** It is what will be asked again each morning. "And Apple?" under a roundup was answered as one from the conversation; alone it asks for nothing, so nothing is offered.
- **Not for news of a day the person named** ("on 12 November", "yesterday", "last week"): that is asked for once.
- **Not for a choice the person pressed.** A choice under an answer is the model's words, and a schedule is offered only for words the person typed (ADR 0280). This now holds for every offer under an answer, not only this one.
- **What.** Every day at 8:00 in the morning, in the person's own time zone, with the message as written for its instruction. "Change it" opens the Scheduled page with the request filled in, for another time or other days.
- **How it reads.** The chip says "Get this every morning". Opened, it says the schedule in a sentence, the message that will be asked in the person's own words, and has one button.
- **Nothing is scheduled until the person presses.** The server checks the plan's limits as for any task, and what is already scheduled is said, not offered twice.
- **It costs what a task costs.** Each run uses the plan's AI usage, as a message does, and the card says so.

## Consequences

- The shortest way from "this was useful" to "do it for me" is one press under the answer.
- A daily roundup runs the same research as the answer above it: several newsrooms, stories with pictures, in the person's language.
- The offer appears under more answers than before. It is one quiet chip, only under a roundup.
- **Not yet:**
  - choosing topics in the offer itself, as the answer the owner compared it with did; the request's own words are what is repeated;
  - the same offer under other answers that are worth repeating: a price, a score, a check of a page;
  - sending the roundup by email as well as writing it into Chat.

## Verified

See `docs/stages/stage-280.md`.
