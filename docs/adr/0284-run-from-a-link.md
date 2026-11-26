# ADR 0284: A link that starts a task or an agent from another app

- **Status:** accepted (stage 277, the Farbaek program, 2026-11-25)
- **Builds on:** ADR 0278 (scheduled tasks), ADR 0282 (agents), ADR 0280 (a run is told what it is), ADR 0223 (what a page says is data, not instructions).
- **Changes:** migration v109 (`scheduled_task_links`, two columns on `scheduled_tasks`, two columns on `scheduled_task_runs`, four functions); one public address, `POST /api/v1/hooks/<link id>`; the runner; a fold on each task's and agent's card. No new dependency.

## Context

The briefs ask for triggers other than time: an event, a webhook in. Until now a task or an agent ran at its times, or when its owner pressed Run now. Nothing outside Farbaek could start one, so "when an order comes in, summarise it" could only be said as "every hour, look".

A trigger from outside is the first thing in this part of Farbaek that takes a call with no person signed in. So the question is less how to start a run, which Run now already does, than how to let a stranger's request do it safely.

## Decision

**A task or an agent can have one secret link. A call to it queues one run, as Run now does, and may carry a little text for that run.**

- **The call.** `POST /api/v1/hooks/<link id>` with `Authorization: Bearer fbl_...` and, if the caller likes, up to 2,000 characters of text in the body. The answer is 202 when a run is queued. Only POST: opening the address does nothing.
- **The secret is the whole of the caller's right, and Farbaek keeps no copy.** It is 32 random bytes, made on the server, shown once to the person who made the link, and stored only as its SHA-256. It is taken only from the header, never from the address, which ends up in logs. Neither it nor what was sent is ever logged or sent back.
- **A wrong secret, a stopped link and no link are answered alike,** so a caller learns nothing about which links exist.
- **One link for each task.** Making a new one stops the old, and the card asks before it does; turning it off refuses every later call and drops anything waiting.
- **Turning a link off is never held back.** Making a link needs everything that using the AI needs. Stopping one needs only the signed-in owner: not a contributor's role, not a workspace that takes changes, not a plan that could be read. Those are the moments a person most needs to close a way in.
- **It queues a run through Run now itself,** as the task's owner. So every check Run now makes holds: the task must be the owner's and active, the owner must still be allowed to use AI in the workspace, and a run under way isn't doubled. The run is then claimed, leased, retried and recorded like any other (ADR 0278), under the plan's limits, an agent's own limit and the workspace's pause.
- **Limits against a leaked link.**
  - A link starts a run at most once every 15 minutes on a plan that runs tasks every hour, and once a day on a plan that runs a task once a day. The wait is the plan's when the link is made, kept on the link, and counted in the database; no link waits less than 15 minutes.
  - One address makes at most 30 calls a minute to all links together, and is limited before anything is compared. That count is kept in the server's memory, in bounded room: a call without the right secret costs the database a read and never a write, so a flood from made-up addresses can't fill a table. It is a guard against a flood, not what keeps a link safe: the secret and the link's own wait do that.
  - A body over 8 KB is refused unread, and text over 2,000 characters is refused, not cut: a caller is never told a run was queued with text the run won't be given whole.
  - Each run spends the plan's AI usage as any run does, so the plan's own limit is the last one.
- **What was sent is data for the run, and the run is told so.** It can't be made an instruction by the way it is written:
  - It travels as a part of its own beside the task's instruction, never joined to the server's note.
  - It sits between two lines carrying a mark of 12 random bytes made for that run alone. The server's note names the mark and says that everything between the two lines came from another app, "as a page read from the web would be", and is to be followed in nothing.
  - A caller can write anything, a line that looks like the end of its text and a paragraph in Farbaek's voice after it included. It can't know the mark, so it can't end its text early. A copy of the mark inside the text is taken out.
  - The task's instruction stays the owner's words, and what is saved in the chat as the question is the instruction alone. A run started from a link has no more power than any scheduled run: it answers in the owner's chat.
  - This lowers the chance that a model follows what a caller wrote. It does not make it impossible, which is why the run can do nothing but answer.
- **It is given to the run the call queued, and to no other.** The database remembers which run a call queued (`link_due`). That run is given the text and marked as started from its link, whether its first try or a later one makes the answer; text left for a run that never came is dropped when a later run asks. The card says "started from its link" on such a run.
- **It reaches the model whole.** The server's note may be 6,000 characters and the outside text 2,200; tests hold an agent's longest note and the most a call may send under them.
- **Where it is made.** A fold on each task's and agent's card, "Start it from another app": the address, the secret and a ready command, each with a copy button, shown once. The secret stays on screen until the page shows for certain that the link is gone. Afterwards the card says when the link was made and how often it has been used.
- **Only the owner sees a link,** and never its hash: the column isn't readable from a browser at all.

## Consequences

- Farbaek has a trigger besides time. Anything that can make a web request can start a task or an agent and hand it something to work on.
- **A database without v109 behaves as before.** The cards offer no link until the table is there, a run is told nothing extra, and the list of runs is read without the new column.
- **Locks are taken in one order,** the task's row before the link's and before the run's, in every function that takes more than one.
- **Not yet:**
  - triggers from inside Farbaek (a file added, a message received, a build finishing), and from connected apps without a request being written by hand;
  - a signed body (an HMAC over what was sent), for callers that can't keep a header secret;
  - an answer sent back to the caller: a call only queues the run, and the answer is in Chat;
  - more than one link for a task, and a list of each call that was made;
  - conditions on what was sent ("only when it says paid").

## Verified

See `docs/stages/stage-277.md`.
