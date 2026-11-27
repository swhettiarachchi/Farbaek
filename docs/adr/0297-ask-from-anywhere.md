# ADR 0297: Ask Farbaek from anywhere, by voice or by typing

- **Status:** accepted (stage 289, the Farbaek program, 2026-11-27)
- **Builds on:** the command palette (Ctrl or Cmd+K on every signed-in page), ADR 0228 (Home's box hands a question to Chat, where the person sends it), ADR 0296 (a question handed over as research asks for the web), ADR 0153 (an icon names the action).
- **Changes:** what the palette can do with the words typed into it, and a button that opens it listening. No migration, no new dependency, no paid service, no new provider.
- **Part of:** the briefs' universal voice assistant (A15, B8), first step, on the web: asking by voice from every page. The briefs name a floating assistant; this one is fixed in the frame, for the reason below. The phone assistants are named under "Not yet".

## Context

A question could be asked from Home and from Chat. From any other page (a project, the tasks, settings) a person had to go to one of those first. The palette already opened on every page, but it could only go to a page or plan a build, and once eight characters were typed it always led with "Plan a build", whatever was typed: a question, or the name of the Settings page.

The briefs ask for an assistant reachable from anywhere, by voice. The browser already has a speech recogniser, which Chat's box and Survey Studio use.

## Decision

**The palette is where a person asks from anywhere. A microphone button beside the sidebar's search box opens it already listening.**

- **Two new things to do with the typed words:** "Ask Farbaek AI" and "Research". Either hands the words to Chat, where they wait in the box for the person to send, as a question from Home does. Research also asks for the live web when it is sent (ADR 0296). Nothing is sent, searched or charged from the palette itself.
- **The words are kept in the browser only,** never in the address, until the person sends them in Chat.
- **What leads the list is one tested rule** (`rankCommands`, with `typedScores` and `matchScore`), and the palette only draws what it returns:
  - a page or project that was named leads, and the three things the typed words can do follow it: typing "bill" and pressing Enter opens Billing. Named means its name from the start, one of its other names from the start ("sandbox" for Test space), or words that each start one of its words. A page that only holds the letters typed is not named: "what can I do" is a question, though a page is called "Who can do what";
  - otherwise the typed words lead: the question first, then research, then a build;
  - a build leads only when the words read as one (`readsAsBuild`): they name a thing Build makes, and either open with a making word ("build", "can you make") or lead with the thing itself ("a booking site for my salon"). A question, or a request about something that exists ("my site is down", "find a coffee shop near me"), is never read as a build.
- **Speaking instead of typing.** A microphone button in the palette uses the browser's own recogniser, where it has one. The words land in the box, and the person still chooses what to do with them. When the microphone is blocked or missing, it says so and says to type instead. Where the browser has no recogniser, there is no button.
- **The Ask button** is a microphone button beside the sidebar's search box, on every page in the app's frame. It opens the palette and starts listening in the same press, and is only there where the browser can hear. On a phone the palette opens from the header's search button, and its own microphone is one press in.
- **It does not float.** A round button fixed over the page's corner was built first and looked at: it covered the end of list rows. Beside the search box it covers nothing.
- **Listening is for one question.** A short silence after words ends it. Once the box holds anything other than what was heard, the person has taken over: listening ends and leaves the box alone. Closing the palette drops what was being heard, so nothing lands in a box that has gone.
- **One microphone at a time.** Chat's box, Survey's assistant and the palette each listen with the same hook; starting in one place hands whoever else was listening their words and ends it there.
- **On a phone, a row is two lines:** the words typed keep the row's width, and what choosing it does sits under them.

## Consequences

- A question is one press, or one press and a sentence, from every page of the app.
- **Enter no longer plans a build from whatever was typed.** It plans one when the words read as a build; otherwise it asks, or opens the page that was named. "Plan a build" is still offered each time.
- **Speech goes to whoever the browser sends it to.** Chrome's recogniser uses Google's service; this is the browser's feature, as it already is in Chat's box, and no audio reaches Farbaek's server.
- The sidebar's search box reads "Ask or search", shorter than "Search or jump to", to sit beside the microphone.
- **Not yet:**
  - an answer spoken or shown in the palette itself: it hands over to Chat;
  - quick actions that do work in place ("what needs me?", "pause everything");
  - a language picked for listening (it uses the browser's own);
  - listening on the server, and Sinhala speech;
  - the assistant on the phones: Android's assistant role and shortcuts, the iPhone's Siri, Shortcuts and Action Button.

## Verified

See `docs/stages/stage-289.md`.
