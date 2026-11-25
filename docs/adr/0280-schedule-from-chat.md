# ADR 0280: Scheduling from Chat

- **Status:** accepted (stage 273, the Farbaek program, 2026-11-25)
- **Builds on:** ADR 0278 (scheduled tasks), ADR 0213 (Chat), ADR 0218 (answers that hand off), ADR 0224 (only a person's own words are acted on).
- **Changes:** a chip under Chat's newest answer; two server actions; a note a scheduled run carries to the model; the Scheduled form takes a request carried from Chat; a third sample chat in the demo. No migration, no new dependency.

## Context

Stage 271 gave Farbaek a Scheduled page. It works, but a person has to know it is there and go to it. The owner's direction for every screen is the simplicity of ChatGPT, where a person never leaves the conversation to set something up: they say what they want, and it is offered. The reference study found the same in ChatGPT and Claude: a task is asked for in a chat and confirmed there.

Farbaek already reads a schedule from a person's words with tested code (`words.ts`), for the Scheduled form.

## Decision

**When a person asks Chat for something at a time, the answer offers to do it on that schedule.**

- **A quiet chip** under the newest finished answer, beside the answer's other chips: "Do this on a schedule". Pressing it opens the schedule in a sentence ("Every day at 8:00 AM, Colombo time."), what it means, and two buttons: Schedule it, and Change it. A chip that isn't wanted costs a line; a card under every answer that mentions a time would not be forgiven.
- **Read from the person's own typed words, by code.** The same reader as the Scheduled page, in the browser's time zone, from the moment the message was sent (so "tomorrow" doesn't move when the chat is opened a week later). No model decides that a message is a schedule, and nothing a model, a page or a file says can raise the offer.
- **Only for a request, and the rule is measured.** Most messages that mention a time ask for nothing at it: "write a script that runs every day at 9", "I wake up every day at 5", "can dogs eat rice every day", a pasted email with "tomorrow at 3pm" in it. So:
  - only the person's own words are read: not code, not quoted text, not what follows "Translate this:" or "Summarise this email:", and not a message longer than a sentence or two;
  - the schedule must not sit inside a description ("a script **that** runs…", "**why** I feel tired every afternoon");
  - a repeat is offered when the message asks to be reminded or sent something, starts by asking Farbaek to check, research or do something, says "I want" or "I'd like", or starts with its schedule; and never for a question or a statement;
  - a one-time run is offered only for a reminder ("remind me tomorrow at 5pm"); "tell me the weather tomorrow" is a question about tomorrow;
  - a time already past is never offered.
  The rule is held to two lists of written messages (`eval/offer-cases.ts`): the 99 it was written against, on which it must be right every time, and 50 a reviewer wrote afterwards, on which it offered wrongly under 4 of 30 and missed 4 of 20 requests when first measured. Before it was rewritten it offered wrongly under 19 of those 30. Those numbers are floors: a change may not make them worse.
- **Nothing is scheduled until the person presses.** Schedule it saves the task through the same checks as the Scheduled page's own save: the person, their plan's limits, the schedule, and the next time worked out on the server. A refusal is said in place with its reason. A press repeated after a dropped answer, or from a second tab, makes one task: the same instruction already scheduled is said, not saved again.
- **Not offered twice.** If the person already has this instruction scheduled, the line under the answer says "This is scheduled." with its schedule. Nothing is ever offered in a scheduled task's own chat, whether the task still runs or has ended: that chat ends on the task's instruction, run after run.
- **Change it** carries the request to the Scheduled form, where its schedule is read from its words and everything can be changed before saving. The request waits in this browser's storage, never in the address, is taken once, and is dropped if it isn't picked up within ten minutes.
- **Who sees it:** people who can schedule here. A viewer, a workspace with changes off, a shared read-only chat, a question with files attached (a scheduled run reads none), and a person whose tasks can't be read see nothing. The demo workspace shows the chip on a labelled sample chat; pressing Schedule it says the demo saves nothing.

**A scheduled run tells the model what it is.** A task's instruction is the person's words as they wrote them, schedule and all: "remind me tomorrow at 5pm to call the bank", "send me the news every morning". Sent as they are at the due time, a model reads them as a new request, and answers that it will remind them, or that it can't. So every scheduled run (from Chat or from the Scheduled page) now carries a short note beside the message, for the model only: this is a task the person scheduled, it is due now, do what it asks now, and if it asks for a reminder this is the reminder. The note comes from Farbaek's own server and can't be set from a browser; the question saved in the chat is the person's instruction alone.

## Consequences

- Automation starts where people already are. The Scheduled page stays the place to see and manage tasks.
- **A task scheduled from Chat keeps its own chat,** named after it, as one made on the Scheduled page does, and the line under the answer says so. Putting its answers into the chat it was asked in was built first and taken out: an open chat doesn't re-read itself, so the answer wouldn't appear, and the person's next message from that tab would branch away from it.
- The offer is still a word rule. On messages it has never seen it will sometimes offer where none belongs, and sometimes miss a request. The chip keeps the first cheap; the Scheduled page covers the second.
- **Not yet:**
  - a scheduled task's answers arriving in the chat it was asked in, which needs Chat to re-read a conversation that changed while it was open;
  - asking for a schedule in words the reader doesn't hold ("every other Tuesday"): no offer is made;
  - offering from an answer rather than a question ("want me to check this every week?");
  - changing or stopping a task by saying so in Chat.

## Verified

See `docs/stages/stage-273.md`.
