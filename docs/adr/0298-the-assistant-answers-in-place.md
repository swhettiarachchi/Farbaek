# ADR 0298: The assistant answers in place

- **Status:** accepted (stage 290, the Farbaek program, 2026-11-27)
- **Builds on:** ADR 0297 (the palette is where a person asks from anywhere, by voice or by typing), ADR 0283 (All work: one board, sorted by tested code, with the workspace's one pause), ADR 0083 (the pause), ADR 0181 (a press that cuts something off asks first).
- **Changes:** what the palette does with a few whole requests, and a read-only route that says a person's work short. No migration, no new dependency, no paid service, no new provider, no model call.
- **Part of:** the briefs' universal voice assistant (A15, B8): answers in place and quick actions, on the web. The command center (A7): its board reachable from every page.

## Context

After stage 289 a question asked from any page went to Chat. That is right for a question a model answers. It is the long way round for a question about their own work: what is waiting for me? That answer was already worked out, by tested code, on the All work page. A person had to go there to read it.

## Decision

**A few whole requests are answered or done in the palette itself, by fixed rules and the person's own records. No model is asked.**

- **Four requests, recognised whole** (`quickAction` in `src/core/assistant/quick.ts`):
  - "what needs me?" and its other wordings;
  - "what is in progress?";
  - "pause everything";
  - "resume agents".
  The whole phrase must be the request. "how do I pause a video", "what needs to change in my essay" and "continue my work" stay questions for Chat. English only for now.
- **The answer is the All work board, said short.** The route `GET /app/work/status` builds the same board the page builds (`loadWork`, `buildBoard`), as the signed-in person, and cuts it to a sentence and a few rows (`workStatus`). The page and the answer cannot disagree, because they are one board.
- **A row opens the page that owns it,** as on All work. Nothing is approved, answered or changed from a row.
- **With nothing typed, "What needs me?" is the first row,** so Ctrl or Cmd+K and Enter answers it from any page.
- **Spoken in, spoken back.** A question that was spoken is answered aloud with the browser's own voice: the sentence, the first three by name, and how many more. A typed question is answered on the screen only. A spoken question that only reads is answered as soon as it has been said, with no further press.
- **Pausing still takes a press.** "Pause everything" and "resume agents", typed or spoken, show the workspace's real pause control in the palette: the same component, the same server action, the same roles. Words alone never pause or resume anything, because a recogniser mishears.
- **The route takes no parameter.** It answers for the workspace the person is in, read as them, so Row Level Security decides what they see. It changes nothing and is never cached.
- **What couldn't be read is said as that.** A board with a part missing answers that it is incomplete rather than summing up what it has. The demo workspace's answer says it is sample work.

## Consequences

- What needs a person is two keys away from every page, or one press and a sentence.
- All work's reads moved from the page into `src/server/command/load-work.ts`, shared by the page and the route. A new kind of work still goes into `buildBoard` with its tests, and then appears in both.
- The palette now carries the pause control's code on every signed-in page.
- **A spoken answer goes where the browser's voice goes.** It is the browser's own voice, as in Chat. On some phones that is a network voice, so the names said aloud reach whoever provides it, as the spoken question reached the recogniser. Nothing is said aloud to someone who typed.
- **Not yet:**
  - acting from a row (approve, answer, run now) without opening its page;
  - a question about one named thing ("how is the storefront build going?");
  - requests in Sinhala or any language but English;
  - the same answers in Chat, on Home, and on the phones' own assistants;
  - what each piece of work has cost.

## Verified

See `docs/stages/stage-290.md`.
